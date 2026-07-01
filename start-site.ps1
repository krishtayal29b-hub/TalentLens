$ErrorActionPreference = "Stop"

$siteRoot = $PSScriptRoot
$port = 4188

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $python) {
  Write-Host "Python was not found on PATH. Open index.html directly, or install Python to use the local server."
  exit 1
}

$arguments = if ($python.Name -eq "py.exe") {
  @("-m", "http.server", $port, "--bind", "127.0.0.1", "--directory", $siteRoot)
} else {
  @("-m", "http.server", $port, "--bind", "127.0.0.1", "--directory", $siteRoot)
}

Start-Process -FilePath $python.Source -ArgumentList $arguments -WindowStyle Hidden
Start-Sleep -Seconds 1
Start-Process "http://127.0.0.1:$port/index.html"
