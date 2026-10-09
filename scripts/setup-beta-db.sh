#!/usr/bin/env bash
# Build the BETA database: a separate Supabase project with made-up families, so the beta site
# (beta.pack361.org) never touches real family data. Run once, from the repo folder, on a computer
# with Docker (the NAS or a laptop):
#
#   scripts/setup-beta-db.sh
#
# It asks for the beta project's connection string (Supabase -> the BETA project -> Connect ->
# Session pooler, with that project's database password filled in), then:
#   1. refuses if the string is the live project's, or if the database already has the app in it;
#   2. runs every migration in supabase/migrations, then supabase/seed.sql (dens, first events)
#      and supabase/demo-data.sql (five made-up families);
#   3. asks for the testers' names and emails and adds them as admins, so they can sign in and
#      use "See the app as..." to try the parent and den leader views.
# Nothing is saved to disk; the connection string stays in this terminal only.
set -euo pipefail
cd "$(dirname "$0")/.."

LIVE_REF="bvnywjvqjxbwwfnbtdzk"

read -rsp "Beta database connection string (Session pooler, password filled in): " BETA_DB_URL; echo
[ -n "$BETA_DB_URL" ] || { echo "No connection string; nothing changed."; exit 1; }
case "$BETA_DB_URL" in
  *"$LIVE_REF"*) echo "That's the LIVE database's string. Use the beta project's. Nothing changed."; exit 1 ;;
esac
export BETA_DB_URL

# psql from the official image; the repo is mounted read-only at /repo.
psqlx() {
  docker run --rm -i -e BETA_DB_URL -v "$PWD:/repo:ro" -w /repo postgres:17-alpine \
    sh -c 'psql "$BETA_DB_URL" -v ON_ERROR_STOP=1 -q "$@"' psql "$@"
}

has_app="$(psqlx -Atc "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'families'")"
if [ "$has_app" != "0" ]; then
  echo "This database already has the app's tables. To start over, make a fresh beta project. Nothing changed."
  exit 1
fi

echo "Running migrations..."
for f in supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  psqlx -f "/repo/$f"
done
echo "Adding dens, events and the made-up families..."
psqlx -f /repo/supabase/seed.sql -f /repo/supabase/demo-data.sql

echo
echo "Beta testers (admins in the beta database). Press Enter on an empty first name to finish."
while true; do
  read -rp "  First name: " FN
  [ -z "$FN" ] && break
  read -rp "  Last name: " LN
  read -rp "  Email they sign in with: " EM
  printf '%s\n' "insert into public.adults (first_name, last_name, email, role) values (:'fn', :'ln', lower(trim(:'em')), 'admin');" \
    | psqlx -v fn="$FN" -v ln="$LN" -v em="$EM"
  echo "  Added $FN $LN."
done

echo
echo "Done. Next: in Vercel, point the beta branch's Preview settings at this project (docs/RELEASES.md)."
