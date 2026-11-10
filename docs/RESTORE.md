# Restoring a database backup

The backups (`scripts/unraid-user-script.sh` every hour, `scripts/backup-db.sh` nightly) are Postgres
custom-format dumps of the app's data: the `public` and `private` schemas, tables and rows. This
guide covers three situations, from most to least likely. The steps were tested on a copy of the
schema (dump, fresh database, migrations, data-only load, row counts match).

**What a backup does not contain:**
- **Logins** (Supabase `auth.users`). Nobody needs them: when a parent signs in again, the app
  links them to their roster row by email.
- **Photos, pack documents and receipts.** The files live in Supabase Storage (`pack-photos`,
  `pack-docs`, `receipts`). Their rows are in the backup, but the files are not. Keep a copy of
  important pack documents somewhere else too (pack leadership's shared drive), and the treasurer
  should keep receipts with the pack's records as well (Money → Reports → Every transaction is a
  good index).
- **Files families saved on their phones** ("Saved on this phone"). These never reach the server,
  so there is nothing to back up or restore.
- **Settings outside the database**: Vercel environment variables, Supabase Auth settings (site
  URL, redirect URLs, email templates, SMTP, rate limits). These are listed in the README.
- **Database permissions and security rules.** Backups use `--no-privileges`. Grants, RLS policies
  and storage policies come from `supabase/migrations/`, so a full restore always runs those first.

## Backup key (encryption)

Backups are encrypted with [age](https://age-encryption.org) before they're written anywhere. The
NAS (and the pack's Google Drive copy) only ever hold encrypted files and the pack's **public**
key; the **private** key that opens them is kept in the pack's password vault, not on the NAS.

- **Make the key (once):** on any computer with Docker,
  `docker run --rm alpine sh -c "apk add -q age && age-keygen"`. It prints a public key
  (`age1…`) and a secret key (`AGE-SECRET-KEY-1…`). Save the whole output as a secure note named
  "Pack 361 backup key" in the pack password vault, shared with the Committee Chair. Put only the
  public key in `backup.env` as `AGE_RECIPIENT`.
- **Lose the secret key and every backup is unreadable**, so check the vault entry exists before
  relying on the backups. Changing keys: make a new pair, update `AGE_RECIPIENT`, keep the old
  secret key until its backups age out (60 days).
- **Decrypt a backup to use the steps below** (on the NAS, in the backup folder, after the setup
  below). Paste the secret key when asked; it isn't saved anywhere:
  ```bash
  read -rs AGE_KEY && export AGE_KEY
  docker run --rm -i -e AGE_KEY -v "$PWD:/backup" -w /backup alpine sh -c \
    'apk add -q age && printf "%s\n" "$AGE_KEY" > /tmp/k && age -d -i /tmp/k -o /tmp/x pack361-2026-10-01_0315.dump.age && cat /tmp/x' \
    > pack361-2026-10-01_0315.dump
  unset AGE_KEY
  ```
  Delete the decrypted `.dump` when you're done (`rm pack361-2026-10-01_0315.dump`).

## Before you start
- Use the newest backup from before the problem happened. Files are named
  `pack361-YYYY-MM-DD_HHMM.dump.age` on the NAS (`/mnt/user/backups/pack361`), and in the pack
  Google Drive folder "Pack361 backups" if the off-site copy is set up. Decrypt it first (above).
- You need the database connection string: Supabase → **Connect** → **Session pooler**, with the
  database password filled in. It's already in `/mnt/user/appdata/pack361-backup/backup.env` on the
  NAS. Don't paste it into chat, email or the repo.
- Every command below runs `psql` and `pg_restore` from the `postgres:17-alpine` Docker image, so
  nothing needs installing. On the NAS, open a terminal and load the connection string first:
  ```bash
  . /mnt/user/appdata/pack361-backup/backup.env      # sets PACK361_DB_URL
  export DB_URL="$PACK361_DB_URL"
  cd /mnt/user/backups/pack361
  pg() { docker run --rm -i -e DB_URL -v "$PWD:/backup" -w /backup postgres:17-alpine "$@"; }
  ```
  After that, `pg psql "$DB_URL"` opens the live database and `pg pg_restore …` reads a backup.

## 1. Get back a few rows (most common)
Someone deleted a family, an event or a den meeting, or a sync changed something it shouldn't have.
Don't restore the whole database for this: copy the rows back instead.

1. See what a backup holds for that table (`events` here). This reads only the backup file:
   ```bash
   pg pg_restore --data-only --table=events -f - pack361-2026-10-01_0315.dump | less
   ```
2. Start a throwaway database with the backup in it, to search it with SQL:
   ```bash
   docker run -d --name pack361-scratch -e POSTGRES_PASSWORD=scratch -v "$PWD:/backup" postgres:17-alpine
   sleep 5
   docker exec pack361-scratch pg_restore -U postgres -d postgres --no-owner --no-privileges /backup/pack361-2026-10-01_0315.dump
   docker exec -it pack361-scratch psql -U postgres
   ```
   The restore prints a few warnings about Supabase roles and `auth.users`. That's expected in a
   plain Postgres; the tables and rows load anyway.
3. Find the rows, and have Postgres write an `insert` statement for each one:
   ```sql
   select id, title, starts_at from public.events where title ilike '%campout%';

   select format('insert into public.events select * from json_populate_record(null::public.events, %L);', row_to_json(t))
     from public.events t where id = '…';
   ```
   Copy the output lines into the Supabase **SQL Editor** and run them. Swap `events` for the
   table you need (both places). Deleting a row takes some related rows with it, so bring those
   back the same way, parents first:
   - **An event** also deletes its `itinerary_items`, `packing_items`, `volunteer_slots` (and their
     sign-ups) and `event_rsvps`. Restore `events`, then those.
   - **A family** also deletes its `scouts` and `event_rsvps`, but not its adults: their `family_id`
     is cleared (set to null), so set it back after restoring `families` and `scouts`. A family with any
     charges (paid or not) can't be deleted at all; turn its people off instead.
   - **A den meeting** also deletes its `den_meeting_attendance` and `den_meeting_rsvps`; advancement
     reports that pointed at it keep the report but lose the link (`meeting_id`).
4. Remove the scratch database: `docker rm -f pack361-scratch`.

## 2. Put the whole database back to a backup (same Supabase project)
The data is badly wrong everywhere, but the Supabase project is fine. This replaces every row in the
app with the backup's rows. Anything entered since that backup is lost, so warn the leaders first.

1. **Take a fresh backup** of the current state (run the User Script now), in case you need
   something from it later.
2. Make sure the live database has every migration (Supabase → SQL Editor, compare with
   `supabase/migrations/`). The backup must come from the same schema version. If a migration was
   added after the backup, the load in step 4 stops with a "column does not exist" error and nothing
   changes.
3. Turn the backup into a data-only SQL file:
   ```bash
   pg pg_restore --data-only --no-owner --no-privileges -f data.sql pack361-2026-10-01_0315.dump
   ```
4. Empty the app's tables and load the backup, all in one transaction. If anything fails, the
   whole thing rolls back and the database is unchanged:
   ```bash
   cat > empty.sql <<'SQL'
   do $$ begin
     execute (select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade'
                from pg_tables where schemaname in ('public', 'private'));
   end $$;
   set session_replication_role = replica;   -- load rows without firing triggers
   SQL
   cat empty.sql data.sql > restore.sql
   pg psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f restore.sql
   ```
5. Re-link logins, then check the counts:
   ```sql
   update public.adults set user_id = null
    where user_id is not null and user_id not in (select id from auth.users);
   select (select count(*) from public.adults) adults, (select count(*) from public.scouts) scouts,
          (select count(*) from public.events) events;
   ```
6. Open the app and check a family page, the calendar and a campout page. Photos whose files were
   deleted after the backup show as broken images. A leader can remove those in Photo review.

## 3. Start over in a new Supabase project
The Supabase project is gone or unusable.

1. Create a new project (region US East, Postgres 17) and save its database password in the
   pack's password manager.
2. In its SQL Editor, run every file in `supabase/migrations/` **in name order**. This creates the
   tables, security rules, storage buckets and the sign-in trigger. Skip `supabase/seed.sql`.
3. Load the data as in section 2, steps 3 to 5, using the new project's Session pooler connection
   string. The truncate step also clears the starter rows the migrations add.
4. Supabase dashboard setup (copy from the old project if you can still see it):
   - **Authentication → URL Configuration**: Site URL `https://app.pack361.org`; redirect URLs
     `https://app.pack361.org/**` and `https://pack361-app.vercel.app/**`.
   - **Authentication → Emails → SMTP**: Resend (`smtp.resend.com`, port 465, user `resend`,
     password = a Resend API key), sender `noreply@pack361.org`.
   - **Authentication → Emails → Templates → Magic link**: link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` and include `{{ .Token }}`.
   - **Authentication → Rate Limits**: emails per hour 20.
5. Vercel → pack361-app → Settings → Environment Variables: update
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`
   from the new project's API settings, then **Redeploy**.
6. Update `backup.env` on the NAS with the new connection string, and run the User Script once
   to confirm backups work.
7. Everyone signs in again with their email. Their roster rows, scouts and advancement are all
   there. Photo and document files are gone, so remove the photo rows from Photo review (or run
   `delete from public.photos;` in the SQL Editor), and re-upload the documents the pack still
   needs before deleting the old document rows.
8. Payments recorded in the app (`charges`, `payments`) come back with the rest of the data.
   Pack dues paid on Givebutter between the backup and the restore are matched again
   automatically on the next Givebutter sync (or tap "Sync now" in Leaders → Money → Settings).
   Only PayPal and check or cash payments from those days need a manual look: compare PayPal's
   activity and the treasurer's records with Leaders → Money and mark those charges paid.

## 4. Photos, documents and receipts

Every Sunday the NAS script also saves every file in Supabase Storage as
`pack361-files-YYYY-MM-DD_HHMM.tar.age` (only when the four `STORAGE_S3_` settings are in
`backup.env`; see the top of `scripts/unraid-user-script.sh`). To get files back:

1. Decrypt it as above, with `tar.age` in place of `dump.age`, into `pack361-files.tar`.
2. Unpack it in an empty folder: `mkdir files && tar -C files -xf pack361-files.tar`. There's one
   folder per storage area (`pack-photos`, `pack-docs`, and so on), laid out exactly as in Supabase.
3. Put back what's missing, with the same S3 settings, from that folder:
   ```bash
   docker run --rm -it -v "$PWD/files:/files:ro" \
     -e RCLONE_CONFIG_SUPA_TYPE=s3 -e RCLONE_CONFIG_SUPA_PROVIDER=Other \
     -e RCLONE_CONFIG_SUPA_ENDPOINT -e RCLONE_CONFIG_SUPA_REGION \
     -e RCLONE_CONFIG_SUPA_ACCESS_KEY_ID -e RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY \
     rclone/rclone:1.68.2 copy /files supa: --s3-force-path-style --ignore-existing
   ```
   (Set those four `RCLONE_CONFIG_SUPA_` values in the terminal first, from `backup.env`.)
   `--ignore-existing` only adds files that are missing; it never overwrites.
4. Delete the decrypted `.tar` and the `files` folder when you're done.

## Practice once a year
Do section 1 with last night's backup (it touches nothing live). It takes about ten minutes and
confirms the backups actually open.
