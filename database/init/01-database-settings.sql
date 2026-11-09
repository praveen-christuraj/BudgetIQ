-- Applied automatically the first time the PostgreSQL data volume is created.
-- Keep this file idempotent; it is only executed on an empty database.
SET timezone TO 'Asia/Kolkata';

-- Ensure financial amounts always round to two decimals.
-- (Column-level NUMERIC(18,2) already guarantees precision; this documents the
-- household default timezone used by reports.)
CREATE TABLE IF NOT EXISTS app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO app_meta (key, value)
VALUES ('timezone', 'Asia/Kolkata'), ('currency', 'INR'), ('schema_version', '1.0.0')
ON CONFLICT (key) DO NOTHING;
