#!/bin/bash
# Pack 361 database backup for Unraid (User Scripts plugin). Self-contained: paste this whole file
# into Settings -> User Scripts -> Add New Script -> Edit Script, and schedule it
# ("Custom": 15 3 * * *  = every night at 3:15 AM).
#
# Every backup is ENCRYPTED before it touches the disk (age, a public-key tool): this server only
# ever holds the pack's public key, so the files here can't be read even if the server is. The
# matching private key lives in the pack's password vault, not on this server (docs/RESTORE.md).
#
# One-time setup in the Unraid terminal:
#   mkdir -p /mnt/user/appdata/pack361-backup && chmod 700 /mnt/user/appdata/pack361-backup
#   nano /mnt/user/appdata/pack361-backup/backup.env
#     PACK361_DB_URL='postgresql://postgres.<project>:<password>@<host>.pooler.supabase.com:5432/postgres'
#     AGE_RECIPIENT='age1...'            # the pack's PUBLIC key (docs/RESTORE.md, "Backup key")
#     RCLONE_REMOTE='packdrive:Pack361 backups'   # optional: also copy to the pack's Google Drive
#     STORAGE_S3_ENDPOINT='https://<project>.supabase.co/storage/v1/s3'   # optional: photos and
#     STORAGE_S3_REGION='us-east-1'                                      # documents too (weekly);
#     STORAGE_S3_KEY_ID='...'                                            # Supabase -> Storage ->
#     STORAGE_S3_SECRET='...'                                            # S3 Connection -> New access key
#   chmod 600 /mnt/user/appdata/pack361-backup/backup.env
# (Supabase dashboard -> Connect -> Session pooler; put your database password in the URI.)
#
# Optional off-site copy to the pack's own Google Drive (so the backups don't depend on this
# server). Run once and follow the prompts: new remote "packdrive", storage "drive", scope
# "drive.file"; when asked to use a web browser, answer n and run the `rclone authorize "drive"`
# line it prints on a laptop, signed in as the PACK's Google account:
#   docker run --rm -it -v /mnt/user/appdata/pack361-backup/rclone:/config/rclone rclone/rclone:1.68.2 config
# Then add RCLONE_REMOTE above. Only the encrypted files are copied.
#
# Photos, documents and receipts (Supabase Storage) are backed up every Sunday when the four
# STORAGE_S3_ settings are there: every file is downloaded inside a container, packed into one
# archive and encrypted with the same key, as pack361-files-<date>.tar.age. Supabase's S3 keys can
# read and change all files, so the key stays only in backup.env (chmod 600) and the pack vault.

BACKUP_DIR="/mnt/user/backups/pack361"
APP_DIR="/mnt/user/appdata/pack361-backup"
ENV_FILE="$APP_DIR/backup.env"
KEEP_DAYS=60
IMAGE="postgres:17-alpine"
RCLONE_IMAGE="rclone/rclone:1.68.2"

set -euo pipefail
umask 077
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (see the top of this script)"
  exit 1
fi
# shellcheck disable=SC1090
. "$ENV_FILE"
: "${PACK361_DB_URL:?PACK361_DB_URL is not set in $ENV_FILE}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT (the pack public backup key, age1...) is not set in $ENV_FILE}"
case "$AGE_RECIPIENT" in age1*) ;; *) echo "AGE_RECIPIENT should start with age1 (the PUBLIC key, never the secret one)"; exit 1 ;; esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
NAME="pack361-$(date +%Y-%m-%d_%H%M).dump.age"

# The dump is made and checked inside the container, then encrypted there; only the encrypted
# file is written to the share. "-e DB_URL" with no value passes it from this script's
# environment, so the password never shows up in the process list.
DB_URL="$PACK361_DB_URL" AGE_RECIPIENT="$AGE_RECIPIENT" docker run --rm \
  -e DB_URL -e AGE_RECIPIENT \
  -v "$BACKUP_DIR:/backup" \
  "$IMAGE" \
  sh -c "apk add --no-cache -q age >/dev/null \
         && umask 077 \
         && pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=private \
              --dbname=\"\$DB_URL\" --file=/tmp/db.dump \
         && pg_restore --list /tmp/db.dump | grep -q 'TABLE DATA public scouts' \
         && age -r \"\$AGE_RECIPIENT\" -o /backup/$NAME.part /tmp/db.dump \
         && rm -f /tmp/db.dump \
         && mv /backup/$NAME.part /backup/$NAME"

chmod 600 "$BACKUP_DIR/$NAME"

# Older backups made before encryption: encrypt them too, then remove the readable copies.
for old in "$BACKUP_DIR"/pack361-*.dump; do
  [ -e "$old" ] || continue
  base="$(basename "$old")"
  AGE_RECIPIENT="$AGE_RECIPIENT" docker run --rm -e AGE_RECIPIENT -v "$BACKUP_DIR:/backup" "$IMAGE" \
    sh -c "apk add --no-cache -q age >/dev/null && umask 077 && age -r \"\$AGE_RECIPIENT\" -o /backup/$base.age /backup/$base" \
    && touch -r "$old" "$old.age" && chmod 600 "$old.age" && rm -f "$old" \
    && echo "Encrypted an older backup: $base.age"
done

echo "Backed up to $BACKUP_DIR/$NAME ($(du -h "$BACKUP_DIR/$NAME" | cut -f1))"

# Photos, documents and receipts: Sundays (or FILES_NOW=1), when the storage settings are there.
if [ -n "${STORAGE_S3_KEY_ID:-}" ] && { [ "$(date +%u)" = 7 ] || [ "${FILES_NOW:-}" = 1 ]; }; then
  : "${STORAGE_S3_ENDPOINT:?STORAGE_S3_ENDPOINT is not set in $ENV_FILE}"
  : "${STORAGE_S3_SECRET:?STORAGE_S3_SECRET is not set in $ENV_FILE}"
  FILES="pack361-files-$(date +%Y-%m-%d_%H%M).tar.age"
  RCLONE_CONFIG_SUPA_TYPE=s3 RCLONE_CONFIG_SUPA_PROVIDER=Other \
  RCLONE_CONFIG_SUPA_ENDPOINT="$STORAGE_S3_ENDPOINT" RCLONE_CONFIG_SUPA_REGION="${STORAGE_S3_REGION:-us-east-1}" \
  RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="$STORAGE_S3_KEY_ID" RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="$STORAGE_S3_SECRET" \
  AGE_RECIPIENT="$AGE_RECIPIENT" docker run --rm \
    -e RCLONE_CONFIG_SUPA_TYPE -e RCLONE_CONFIG_SUPA_PROVIDER -e RCLONE_CONFIG_SUPA_ENDPOINT -e RCLONE_CONFIG_SUPA_REGION \
    -e RCLONE_CONFIG_SUPA_ACCESS_KEY_ID -e RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY -e AGE_RECIPIENT \
    -v "$BACKUP_DIR:/backup" --entrypoint sh "$RCLONE_IMAGE" -c \
    "apk add --no-cache -q age tar >/dev/null \
     && umask 077 \
     && rclone copy supa: /tmp/files --s3-force-path-style --transfers 4 \
     && test -n \"\$(ls -A /tmp/files)\" \
     && tar -C /tmp/files -cf - . | age -r \"\$AGE_RECIPIENT\" -o /backup/$FILES.part \
     && mv /backup/$FILES.part /backup/$FILES"
  chmod 600 "$BACKUP_DIR/$FILES"
  echo "Photos and documents backed up to $BACKUP_DIR/$FILES ($(du -h "$BACKUP_DIR/$FILES" | cut -f1))"
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'pack361-*' -type f -mtime +"$KEEP_DAYS" -delete
echo "Backups kept here: $(find "$BACKUP_DIR" -maxdepth 1 -name 'pack361-*.age' | wc -l)"

# Off-site copy (encrypted files only) to the pack's Google Drive, keeping the same 60 days.
if [ -n "${RCLONE_REMOTE:-}" ]; then
  docker run --rm -v "$APP_DIR/rclone:/config/rclone" -v "$BACKUP_DIR:/backup:ro" "$RCLONE_IMAGE" \
    copy /backup "$RCLONE_REMOTE" --include 'pack361-*.age' --no-traverse
  docker run --rm -v "$APP_DIR/rclone:/config/rclone" "$RCLONE_IMAGE" \
    delete "$RCLONE_REMOTE" --include 'pack361-*.age' --min-age "${KEEP_DAYS}d"
  echo "Copied to $RCLONE_REMOTE"
fi
