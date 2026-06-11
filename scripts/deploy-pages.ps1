$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$deployDir = Join-Path $root ".deploy-pages"

if (Test-Path $deployDir) {
    Remove-Item -LiteralPath $deployDir -Recurse -Force
}

New-Item -ItemType Directory -Path $deployDir | Out-Null

$files = @(
    "index.html",
    "app.js",
    "store.js",
    "styles.css",
    "theme.js",
    "ui.js",
    "utils.js"
)

foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination $deployDir
}

Copy-Item -LiteralPath (Join-Path $root "assets") -Destination $deployDir -Recurse

Push-Location $root
try {
    npx wrangler pages deploy .deploy-pages --project-name link-web --branch main --commit-dirty=true
}
finally {
    Pop-Location
}
