import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver, which Recharts' ResponsiveContainer
// needs. A no-op implementation is enough for rendering tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
