#!/usr/bin/env bash
# Back up the Pack 361 database to a local file (Postgres custom format, restorable with pg_restore).
#
# Setup (once):
#   1. Supabase dashboard -> Connect -> "Session pooler" -> copy the URI and put your database
#      password in place of [YOUR-PASSWORD].
#   2. Save it in a private file:
#        mkdir -p ~/.config/pack361 && chmod 700 ~/.config/pack361
#        echo "PACK361_DB_URL='postgresql://...'" > ~/.config/pack361/backup.env
#        chmod 600 ~/.config/pack361/backup.env
#
# Run:          scripts/backup-db.sh [backup-folder]        (default ~/pack361-backups)
# Every night:  crontab -e  ->  15 3 * * * /path/to/pack361-app/scripts/backup-db.sh /path/to/backups
#
# Options (environment):
#   KEEP_DAYS=60        delete backups older than this many days
#   ENCRYPT_TO=<gpg id> encrypt each backup to this GPG key (recommended if the folder syncs anywhere)
#
# The file holds family names, emails, phone numbers and scouts' advancement. Keep it on your own
# encrypted disk; don't put it in a shared or public folder, and never commit it to the repo.
# Photos live in Supabase Storage, not the database, so they're not in this file.
set -euo pipefail

ENV_FILE="${PACK361_BACKUP_ENV:-$HOME/.config/pack361/backup.env}"
# shellcheck disable=SC1090
[ -z "${PACK361_DB_URL:-}" ] && [ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${PACK361_DB_URL:?Set PACK361_DB_URL or create $ENV_FILE (see the top of this script)}"

DIR="${1:-$HOME/pack361-backups}"
KEEP_DAYS="${KEEP_DAYS:-60}"
mkdir -p "$DIR"
chmod 700 "$DIR"
umask 077

STAMP="$(date +%Y-%m-%d_%H%M)"
OUT="$DIR/pack361-$STAMP.dump"
# public = the app's data; private = its access-check functions. Logins (auth) aren't needed:
# adults re-link to their roster row by email the next time they sign in.
ARGS=(--format=custom --no-owner --no-privileges --schema=public --schema=private)

dump() {
  if command -v pg_dump >/dev/null 2>&1 && pg_dump --version | grep -Eq ' (1[7-9]|[2-9][0-9])(\.|$)'; then
    pg_dump "${ARGS[@]}" --dbname="$PACK361_DB_URL"
  elif command -v docker >/dev/null 2>&1; then
    # No local pg_dump 17+: use the official image (nothing is installed on this machine).
    docker run --rm -e DB_URL="$PACK361_DB_URL" postgres:17-alpine \
      sh -c 'pg_dump '"${ARGS[*]}"' --dbname="$DB_URL"'
  else
    echo "Need pg_dump 17+ (PostgreSQL client tools) or Docker." >&2
    exit 1
  fi
}

dump > "$OUT.part"
mv "$OUT.part" "$OUT"

if [ -n "${ENCRYPT_TO:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$ENCRYPT_TO" --output "$OUT.gpg" "$OUT"
  rm -f "$OUT"
  OUT="$OUT.gpg"
fi

# Quick check that the backup is readable and has the main tables.
if [[ "$OUT" == *.dump ]] && command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$OUT" | grep -q "TABLE DATA public scouts" || { echo "Backup looks incomplete: $OUT" >&2; exit 1; }
fi

find "$DIR" -maxdepth 1 -name 'pack361-*.dump*' -type f -mtime +"$KEEP_DAYS" -delete
echo "Backed up to $OUT ($(du -h "$OUT" | cut -f1))"
