# ---------------------------------------------------------------------------
# Backup worker image: PostgreSQL client tools (pg_dump) + openssl for
# encrypting dumps. Based on the official Postgres image so the client version
# always matches the server.
# ---------------------------------------------------------------------------
FROM postgres:16-alpine

RUN apk add --no-cache openssl

COPY backup-loop.sh /backup-loop.sh
RUN chmod +x /backup-loop.sh

ENTRYPOINT ["/bin/sh", "/backup-loop.sh"]
