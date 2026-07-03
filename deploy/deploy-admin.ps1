<#
.SYNOPSIS
  Build admin-web (Vite) and upload dist/ to VPS for admin-admin.govmocktest.com

.USAGE
  cd C:\Users\DELL\Desktop\MockTestApp\admin-web
  "VITE_API_BASE_URL=https://admin-admin.govmocktest.com/v1" | Out-File -Encoding utf8 .env.production
  ..\deploy\deploy-admin.ps1 -ServerUser root -ServerHost YOUR_VPS_IP

  First time on VPS (SSH in once):
    sudo mkdir -p /var/www/admin-admin.govmocktest.com/site/admin
    sudo chown -R $USER:www-data /var/www/admin-admin.govmocktest.com
  Install nginx from deploy/nginx-site.govmocktest.conf.example — see deploy/DEPLOY.txt
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $ServerUser,
    [Parameter(Mandatory = $true)]
    [string] $ServerHost,
    [string] $RemotePath = "/var/www/admin-admin.govmocktest.com/site/admin",
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
        if (-not (Test-Path ".env.production")) {
            "VITE_API_BASE_URL=https://admin-admin.govmocktest.com/v1" | Out-File -Encoding utf8 .env.production
        }
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
scp.exe -r "$dist\*" $remoteTarget
if ($LASTEXITCODE -ne 0) {
    throw "scp failed (exit $LASTEXITCODE). Check SSH key, path, and permissions on VPS."
}
Write-Host "Done. On VPS: sudo systemctl reload nginx"
