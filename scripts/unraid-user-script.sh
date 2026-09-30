#!/bin/bash
# Pack 361 database backup for Unraid (User Scripts plugin). Self-contained: paste this whole file
# into Settings -> User Scripts -> Add New Script -> Edit Script, and schedule it
# ("Custom": 15 3 * * *  = every night at 3:15 AM).
#
# One-time setup in the Unraid terminal:
#   mkdir -p /mnt/user/appdata/pack361-backup
#   nano /mnt/user/appdata/pack361-backup/backup.env
#     PACK361_DB_URL='postgresql://postgres.<project>:<password>@<host>.pooler.supabase.com:5432/postgres'
#   chmod 600 /mnt/user/appdata/pack361-backup/backup.env
# (Supabase dashboard -> Connect -> Session pooler; put your database password in the URI.)
#
# Backups contain family contact info and scouts' advancement: keep the share private
# (SMB export "No" or private to your user), not public/guest.

BACKUP_DIR="/mnt/user/backups/pack361"
ENV_FILE="/mnt/user/appdata/pack361-backup/backup.env"
KEEP_DAYS=60
IMAGE="postgres:17-alpine"

set -euo pipefail
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (see the top of this script)"
  exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${PACK361_DB_URL:?PACK361_DB_URL is not set in $ENV_FILE}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
NAME="pack361-$(date +%Y-%m-%d_%H%M).dump"

docker run --rm \
  -e DB_URL="$PACK361_DB_URL" \
  -v "$BACKUP_DIR:/backup" \
  "$IMAGE" \
  sh -c "pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=private \
         --dbname=\"\$DB_URL\" --file=/backup/$NAME.part \
         && pg_restore --list /backup/$NAME.part | grep -q 'TABLE DATA public scouts' \
         && mv /backup/$NAME.part /backup/$NAME"

chmod 600 "$BACKUP_DIR/$NAME"
find "$BACKUP_DIR" -maxdepth 1 -name 'pack361-*.dump*' -type f -mtime +"$KEEP_DAYS" -delete
echo "Backed up to $BACKUP_DIR/$NAME ($(du -h "$BACKUP_DIR/$NAME" | cut -f1))"
echo "Backups kept: $(find "$BACKUP_DIR" -maxdepth 1 -name 'pack361-*.dump' | wc -l)"
