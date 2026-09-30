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
$args = @("--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=private")

$local = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($local -and ((& pg_dump --version) -match ' (1[7-9]|[2-9][0-9])(\.|$)')) {
  & pg_dump @args "--dbname=$url" "--file=$out"
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  $name = Split-Path $out -Leaf
  docker run --rm -e "DB_URL=$url" -v "${Dir}:/backup" postgres:17-alpine `
    sh -c "pg_dump $($args -join ' ') --dbname=`"`$DB_URL`" --file=/backup/$name"
} else {
  throw "Need Docker Desktop or PostgreSQL 17+ client tools (pg_dump)."
}
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

Get-ChildItem $Dir -Filter "pack361-*.dump*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item
"Backed up to $out ({0:N1} MB)" -f ((Get-Item $out).Length / 1MB)
