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
$expectedHash = "8DCD90C3B1CCC2872430B0B60B2BFE7D60C6E4A3ED8A21CA9857FD2BF0008D30"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)

if (-not (Test-Path -LiteralPath $sourceRoot)) {
  throw "Source directory not found: $sourceRoot"
}
if (Test-Path -LiteralPath $resolvedOutput) {
  throw "Refusing to overwrite existing output: $resolvedOutput"
}

$outputParent = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputParent)) {
  New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("coachrx-0.6.9-build-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
  Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $stage -Recurse

  $timestamps = [ordered]@{
    "icons\icon-128.png" = "2026-05-13 11:52:24"
    "icons\icon-16.png" = "2026-05-13 11:52:24"
    "icons\icon-32.png" = "2026-05-13 11:52:24"
    "icons\icon-48.png" = "2026-05-13 11:52:24"
    "coachrx-identity.js" = "2026-07-17 16:45:10"
    "manifest.json" = "2026-07-19 13:44:16"
    "popup.css" = "2026-05-26 19:50:00"
    "popup.html" = "2026-07-17 23:13:20"
    "popup.js" = "2026-07-19 13:49:04"
    "README.md" = "2026-07-19 13:49:04"
  }

  foreach ($entry in $timestamps.GetEnumerator()) {
    $file = Join-Path $stage $entry.Key
    if (-not (Test-Path -LiteralPath $file)) {
      throw "Expected release file missing: $($entry.Key)"
    }
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
