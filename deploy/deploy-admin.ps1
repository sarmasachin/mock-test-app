<#
.SYNOPSIS
  Build admin-web (Vite) and upload dist/ to your VPS for nginx alias path.

.USAGE
  cd C:\Users\DELL\Desktop\mocktestapp\admin-web
  ..\deploy\deploy-admin.ps1 -ServerUser root -ServerHost YOUR_VPS_IP

  Optional:
    -RemotePath "/var/www/indiaapk-admin/dist"
    -SkipBuild

  First time on VPS (SSH in once):
    sudo mkdir -p /var/www/indiaapk-admin/dist
    sudo chown -R $USER:www-data /var/www/indiaapk-admin
  Install nginx site from deploy/nginx-site.indiaapk.conf.example, then nginx -t && reload.
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $ServerUser,
    [Parameter(Mandatory = $true)]
    [string] $ServerHost,
    [string] $RemotePath = "/var/www/indiaapk-admin/dist",
    [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$adminRoot = Join-Path $repoRoot "admin-web"
if (-not (Test-Path $adminRoot)) {
    throw "admin-web folder not found next to deploy/: $adminRoot"
}

Push-Location $adminRoot
try {
    if (-not $SkipBuild) {
        npm install
        npm run build
    }
    $dist = Join-Path $adminRoot "dist"
    if (-not (Test-Path $dist)) {
        throw "dist/ missing. Run without -SkipBuild or run: npm run build"
    }
}
finally {
    Pop-Location
}

$remoteTarget = "${ServerUser}@${ServerHost}:${RemotePath}"
Write-Host "Uploading $dist -> $remoteTarget"
# scp is available on Windows 10+ (OpenSSH Client). Uploads contents into dist/.
scp.exe -r "$dist\*" $remoteTarget
if ($LASTEXITCODE -ne 0) {
    throw "scp failed (exit $LASTEXITCODE). Check SSH key, path, and permissions on VPS."
}
Write-Host "Done. On VPS: sudo systemctl reload nginx (if needed)."
