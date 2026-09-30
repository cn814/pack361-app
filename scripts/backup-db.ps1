# Back up the Pack 361 database on Windows (needs Docker Desktop, or PostgreSQL 17+ client tools).
#
# Setup (once): Supabase dashboard -> Connect -> "Session pooler" -> copy the URI, put your database
# password in place of [YOUR-PASSWORD], and save it as a user environment variable:
#   [Environment]::SetEnvironmentVariable("PACK361_DB_URL", "postgresql://...", "User")
# (then open a new PowerShell window).
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 [-Dir C:\path\to\backups]
# Nightly: Task Scheduler -> Create Basic Task -> Daily -> Start a program:
#   powershell.exe  -ExecutionPolicy Bypass -File C:\path\to\pack361-app\scripts\backup-db.ps1
#
# The file holds family contact info and scouts' advancement: keep it on your own encrypted disk,
# not in a shared folder, and never commit it. Photos aren't in the database.
param(
  [string]$Dir = "$HOME\pack361-backups",
  [int]$KeepDays = 60
)
$ErrorActionPreference = "Stop"
$url = $env:PACK361_DB_URL
if (-not $url) { throw "Set the PACK361_DB_URL environment variable first (see the top of this script)." }

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$out = Join-Path $Dir ("pack361-" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".dump")
$dumpArgs = @("--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=private")
$part = "$out.part"
$name = Split-Path $part -Leaf

$local = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($local -and ((& pg_dump --version) -match ' (1[7-9]|[2-9][0-9])(\.|$)')) {
  & pg_dump @dumpArgs "--dbname=$url" "--file=$part"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
  $list = & pg_restore --list $part
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  # "-e DB_URL" with no value passes it from this environment, so the password isn't on the command line.
  $env:DB_URL = $url
  try {
    docker run --rm -e DB_URL -v "${Dir}:/backup" postgres:17-alpine `
      sh -c "pg_dump $($dumpArgs -join ' ') --dbname=`"`$DB_URL`" --file=/backup/$name"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
    $list = docker run --rm -v "${Dir}:/backup" postgres:17-alpine pg_restore --list "/backup/$name"
  } finally {
    Remove-Item Env:DB_URL -ErrorAction SilentlyContinue
  }
} else {
  throw "Need Docker Desktop or PostgreSQL 17+ client tools (pg_dump)."
}
# Only keep it if it's a complete, readable backup (a failed run leaves just the .part file).
if (-not ($list -match "TABLE DATA public scouts")) { throw "Backup looks incomplete; kept as $part for a look." }
Move-Item $part $out

Get-ChildItem $Dir -Filter "pack361-*.dump*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item
"Backed up to $out ({0:N1} MB)" -f ((Get-Item $out).Length / 1MB)
