# Builds the web version and publishes it to Firebase Hosting (set-visualizer-app, see .firebaserc).
#   pwsh scripts/deploy.ps1              the site only
#   pwsh scripts/deploy.ps1 -Functions   the site and the Cloud Functions (YouTube search)
param([switch]$Functions)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  throw 'The Firebase CLI is not installed: npm install -g firebase-tools, then firebase login'
}

$only = if ($Functions) { 'hosting,functions' } else { 'hosting' }
# firebase.json's predeploy steps build the site (npm run build:web) and the functions first.
firebase deploy --only $only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nLive at https://set-visualizer-app.web.app"
