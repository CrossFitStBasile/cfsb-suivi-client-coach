[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSEdition -ne "Core" -or $PSVersionTable.PSVersion.Major -lt 7) {
  throw "This exact-byte build requires PowerShell 7 (pwsh). Windows PowerShell 5.1 uses a different ZIP implementation."
}

$releaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceRoot = Join-Path $releaseRoot "source"
$expectedHash = "84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$expectedFiles = @(
  "coachrx-identity.js",
  "icons\icon-128.png",
  "icons\icon-16.png",
  "icons\icon-32.png",
  "icons\icon-48.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
  "README.md"
)

if (-not (Test-Path -LiteralPath $sourceRoot)) {
  throw "Source directory not found: $sourceRoot"
}
if (Test-Path -LiteralPath $resolvedOutput) {
  throw "Refusing to overwrite existing output: $resolvedOutput"
}

$actualFiles = Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | ForEach-Object {
  [System.IO.Path]::GetRelativePath($sourceRoot, $_.FullName).Replace("/", "\")
}
$sourceDelta = Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles
if ($sourceDelta) {
  throw "Release source must contain exactly the 10 approved root entries. Delta: $($sourceDelta | ConvertTo-Json -Compress)"
}

$outputParent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputParent)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("coachrx-0.6.10-build-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
  foreach ($relativePath in $expectedFiles) {
    $sourceFile = Join-Path $sourceRoot $relativePath
    $stagedFile = Join-Path $stage $relativePath
    $stagedParent = Split-Path -Parent $stagedFile
    if (-not (Test-Path -LiteralPath $stagedParent)) {
      New-Item -ItemType Directory -Path $stagedParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourceFile -Destination $stagedFile
  }

  $timestamps = [ordered]@{
    "icons\icon-128.png" = "2026-05-13 11:52:24"
    "icons\icon-16.png" = "2026-05-13 11:52:24"
    "icons\icon-32.png" = "2026-05-13 11:52:24"
    "icons\icon-48.png" = "2026-05-13 11:52:24"
    "coachrx-identity.js" = "2026-07-17 16:45:10"
    "manifest.json" = "2026-07-19 22:55:00"
    "popup.css" = "2026-05-26 19:50:00"
    "popup.html" = "2026-07-17 23:13:20"
    "popup.js" = "2026-07-19 22:55:00"
    "README.md" = "2026-07-19 22:55:00"
  }

  foreach ($entry in $timestamps.GetEnumerator()) {
    $file = Join-Path $stage $entry.Key
    $localTimestamp = [datetime]::ParseExact(
      $entry.Value,
      "yyyy-MM-dd HH:mm:ss",
      [Globalization.CultureInfo]::InvariantCulture
    )
    (Get-Item -LiteralPath $file).LastWriteTime = $localTimestamp
  }

  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $resolvedOutput -CompressionLevel Optimal
  $actualHash = (Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) {
    Remove-Item -LiteralPath $resolvedOutput -Force
    throw "Rebuilt artifact hash mismatch. Expected $expectedHash, got $actualHash"
  }

  [pscustomobject]@{
    ok = $true
    artifact = $resolvedOutput
    sha256 = $actualHash
    entries = $expectedFiles.Count
  } | ConvertTo-Json
}
finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedStage = [System.IO.Path]::GetFullPath($stage)
  if ($resolvedStage.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedStage)) {
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
}
