$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$deployDir = Join-Path $root ".deploy-pages"
$publicDir = Join-Path $root "public"

if (Test-Path $deployDir) {
    Remove-Item -LiteralPath $deployDir -Recurse -Force
}

New-Item -ItemType Directory -Path $deployDir | Out-Null

Copy-Item -Path (Join-Path $publicDir "*") -Destination $deployDir -Recurse

Push-Location $root
try {
    npx wrangler pages deploy . --cwd .deploy-pages --project-name link-web --branch main --commit-dirty=true
}
finally {
    Pop-Location
}
