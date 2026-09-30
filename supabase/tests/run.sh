#!/usr/bin/env bash
# Run the permission tests on an EMPTY Postgres 15+ database (they create tables and a test schema).
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/packtest supabase/tests/run.sh
# Every check prints PASS; the run stops at the first FAIL.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/packtest}"
args=(-f tests/00_supabase_mock.sql)
for f in migrations/*.sql; do args+=(-f "$f"); done
args+=(-f tests/01_rls_tests.sql -f tests/02_advancement_tests.sql -f tests/03_features_tests.sql -f tests/04_tools_tests.sql)
out=$(psql "$URL" -q -v ON_ERROR_STOP=1 "${args[@]}" 2>&1) || { echo "$out" | grep -E "FAIL|ERROR" | head -20; exit 1; }
echo "$out" | grep -c "PASS:" | xargs -I{} echo "{} checks passed"
