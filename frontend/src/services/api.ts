// Thin typed fetch wrapper with JWT storage, automatic refresh and friendly
// error messages. The browser only ever calls relative URLs.

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

const ACCESS_KEY = 'ff_access_token';
const REFRESH_KEY = 'ff_refresh_token';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, QueryValue>;
  formData?: FormData;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          const record = item as { msg?: string; loc?: unknown[] };
          const field = Array.isArray(record.loc) ? record.loc.slice(-1)[0] : '';
          return field ? `${String(field)}: ${record.msg ?? 'Invalid value'}` : record.msg ?? 'Invalid value';
        }
        return String(item);
      })
      .join('. ');
  }
  return fallback;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
          tokenStorage.clear();
          return false;
        }
        const data = (await response.json()) as { access_token: string; refresh_token: string };
        tokenStorage.set(data.access_token, data.refresh_token);
        return true;
      } catch {
        tokenStorage.clear();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await response.json()) as T;
  return (await response.text()) as unknown as T;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    params,
    formData,
    auth = true,
    retryOnUnauthorized = true,
  } = options;

  const headers: Record<string, string> = {};
  if (auth) {
    const token = tokenStorage.getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your network connection.', 0);
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return request<T>(path, { ...options, retryOnUnauthorized: false });
    }
    tokenStorage.clear();
    window.dispatchEvent(new CustomEvent('ff:session-expired'));
  }

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
    const message = extractMessage(payload, `Request failed (${response.status})`);
    throw new ApiError(message, response.status, payload);
  }

  return parseResponse<T>(response);
}

export async function downloadFile(
  path: string,
  params: Record<string, QueryValue>,
  filename: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  const token = tokenStorage.getAccess();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(buildUrl(path, params), { headers });
  if (!response.ok) {
    throw new ApiError('Export failed. Please try again.', response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { API_BASE };
