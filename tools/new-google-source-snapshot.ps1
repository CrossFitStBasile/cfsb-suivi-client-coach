param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$OutputDirectory = (Join-Path $env:TEMP 'cfsb-dashboard-google-source')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$snapshotId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$stageRoot = Join-Path $OutputDirectory "stage-$snapshotId"
$archivePath = Join-Path $OutputDirectory "cfsb-dashboard-$snapshotId.source-snapshot.tar.gz"

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$rootFiles = @(
  '.firebaserc',
  '.gitignore',
  'cloudbuild.google-only.yaml',
  'cloudbuild.google-only-preview.yaml',
  'cloudbuild.google-only-live.yaml',
  'coaches.json',
  'firebase.json',
  'firestore.indexes.json',
  'firestore.rules',
  'storage.rules',
  'PROJECT_HANDOFF.md',
  'README.md',
  'requirements-dev.txt',
  'deploy-dashboard-complet.cmd',
  'deploy-hosting-api.cmd',
  'deploy-hosting-dashboard.cmd',
  'publier-dashboard-mvp.cmd',
  'valider-dashboard-equipe.cmd',
  'verify-dashboard-before-deploy.cmd',
  'verify-dashboard-live-stable.cmd',
  'verify-dashboard-live.cmd',
  'audit-live-coach-access.cmd',
  'audit-live-firestore.cmd'
)

$rootDirectories = @(
  'firebase-dashboard',
  'functions',
  'tests',
  'tools'
)

$excludedDirectoryNames = @(
  '.firebase', '.git', '.github', '.tools', '.venv', 'node_modules',
  'playwright-report', 'test-results', 'work', '__pycache__'
)

foreach ($relativePath in $rootFiles) {
  $source = Join-Path $RepositoryRoot $relativePath
  if (Test-Path -LiteralPath $source) {
    $destination = Join-Path $stageRoot $relativePath
    $destinationDirectory = Split-Path -Parent $destination
    if ($destinationDirectory) {
      New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

foreach ($relativePath in $rootDirectories) {
  $sourceRoot = Join-Path $RepositoryRoot $relativePath
  if (Test-Path -LiteralPath $sourceRoot) {
    Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force |
      Where-Object {
        $sourceRelativePath = $_.FullName.Substring($RepositoryRoot.Length + 1)
        $segments = $sourceRelativePath -split '[\\/]'
        -not ($segments | Where-Object { $excludedDirectoryNames -contains $_ })
      } |
      ForEach-Object {
        $sourceRelativePath = $_.FullName.Substring($RepositoryRoot.Length + 1)
        $destination = Join-Path $stageRoot $sourceRelativePath
        $destinationDirectory = Split-Path -Parent $destination
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
      }
  }
}

Get-ChildItem -LiteralPath $stageRoot -Directory -Recurse -Force |
  Where-Object { $excludedDirectoryNames -contains $_.Name } |
  Sort-Object FullName -Descending |
  Remove-Item -Recurse -Force

$excludedFilePatterns = @(
  '*.log', '*.tmp', '*.pyc', 'firebase-debug*.txt', 'ff-*.txt',
  'functions.yaml', '.runtimeconfig.json', '.env', '.env.*',
  '*service-account*.json', '*credentials*.json', '*private-key*',
  'firebase-login-*.cmd'
)

foreach ($pattern in $excludedFilePatterns) {
  Get-ChildItem -LiteralPath $stageRoot -File -Recurse -Force -Filter $pattern |
    Remove-Item -Force
}

$textExtensions = @(
  '.cjs', '.cmd', '.css', '.html', '.js', '.json', '.md', '.mjs',
  '.ps1', '.py', '.rules', '.txt', '.webmanifest', '.yaml', '.yml'
)

$secretPatterns = @(
  'github_pat_[A-Za-z0-9_]{20,}',
  'ghp_[A-Za-z0-9]{30,}',
  'ya29\.[A-Za-z0-9._-]{20,}',
  '-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----',
  '"private_key"\s*:\s*"-----BEGIN',
  '(?i)(ghl|highlevel)[_-]?(token|secret)\s*[:=]\s*["''][^"'']{16,}["'']'
)

$secretFiles = New-Object System.Collections.Generic.HashSet[string]
$textFiles = Get-ChildItem -LiteralPath $stageRoot -File -Recurse -Force |
  Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() }

foreach ($file in $textFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
  foreach ($pattern in $secretPatterns) {
    if ($content -match $pattern) {
      [void]$secretFiles.Add($file.FullName.Substring($stageRoot.Length + 1))
      break
    }
  }
}

if ($secretFiles.Count -gt 0) {
  $secretFiles | Sort-Object | ForEach-Object { Write-Error "Secret potentiel detecte dans: $_" }
  throw 'Snapshot refuse: un ou plusieurs secrets potentiels ont ete detectes.'
}

$gitHead = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw 'Impossible de lire le commit Git courant.'
}

$gitStatus = @(& git -C $RepositoryRoot status --short)
$files = Get-ChildItem -LiteralPath $stageRoot -File -Recurse -Force |
  Sort-Object FullName |
  ForEach-Object {
    [ordered]@{
      path = $_.FullName.Substring($stageRoot.Length + 1).Replace('\', '/')
      bytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

$manifest = [ordered]@{
  schemaVersion = 1
  snapshotId = $snapshotId
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
  projectId = 'cfsb-dashboard-coach-aa9a4'
  gitHead = $gitHead
  workingTreeDirty = $gitStatus.Count -gt 0
  workingTreeChangeCount = $gitStatus.Count
  fileCount = @($files).Count
  files = @($files)
}

$manifestPath = Join-Path $stageRoot 'SOURCE_SNAPSHOT_MANIFEST.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

& tar.exe -czf $archivePath -C $stageRoot .
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
  throw 'La creation de l archive source a echoue.'
}

$archive = Get-Item -LiteralPath $archivePath
$result = [ordered]@{
  ok = $true
  snapshotId = $snapshotId
  archivePath = $archive.FullName
  archiveBytes = $archive.Length
  archiveSha256 = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  fileCount = @($files).Count + 1
  gitHead = $gitHead
  workingTreeDirty = $gitStatus.Count -gt 0
  workingTreeChangeCount = $gitStatus.Count
}

$result | ConvertTo-Json -Depth 4

Remove-Item -LiteralPath $stageRoot -Recurse -Force
