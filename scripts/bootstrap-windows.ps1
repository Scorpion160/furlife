$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Keep the executable script ASCII-only for Windows PowerShell 5.1 compatibility.
try {
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch { }

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectRoot

Write-Host '=== Furlife bootstrap Windows v0.3.10 ==='
Write-Host "Project: $ProjectRoot"

$NodeVersion = (Get-Content '.node-version' -Raw).Trim()
$PnpmVersion = '9.15.4'
$FlutterVersion = (Get-Content '.flutter-version' -Raw).Trim()
$ToolsDir = Join-Path $ProjectRoot '.tools'
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][string[]]$ArgumentList,
    [Parameter(Mandatory=$true)][string]$Label
  )
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit code $LASTEXITCODE)."
  }
}

function Import-DotEnvFile {
  param([Parameter(Mandatory=$true)][string]$Path)
  foreach ($rawLine in Get-Content $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $separator = $line.IndexOf('=')
    if ($separator -le 0) { continue }
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1)
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
      throw "Invalid variable name in ${Path}: $name"
    }
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Test-CompatibleNode {
  param([string]$NodeExe)
  try {
    $version = (& $NodeExe -p "process.versions.node").Trim()
    $parts = $version.Split('.')
    return ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 16)
  } catch { return $false }
}

function Install-PortableNode {
  param([string]$Version)
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' } else { $arch = 'x64' }
  $dirName = "node-v$Version-win-$arch"
  $nodeHome = Join-Path $ToolsDir $dirName
  $nodeExe = Join-Path $nodeHome 'node.exe'
  if (Test-Path $nodeExe) { return $nodeHome }

  Write-Host "Installing local Node.js $Version ($arch) without admin rights..."
  $base = "https://nodejs.org/dist/v$Version"
  $archive = "$dirName.zip"
  $zipPath = Join-Path $ToolsDir $archive
  $sumPath = Join-Path $ToolsDir "node-v$Version-SHASUMS256.txt"

  Invoke-WebRequest -UseBasicParsing -Uri "$base/$archive" -OutFile $zipPath
  Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -OutFile $sumPath
  $line = Get-Content $sumPath | Where-Object { $_.Trim().EndsWith($archive) } | Select-Object -First 1
  if (-not $line) { throw "Official checksum not found for $archive." }
  $expected = ($line.Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw 'Invalid Node.js checksum.' }

  Expand-Archive -Path $zipPath -DestinationPath $ToolsDir -Force
  Remove-Item $zipPath -Force
  if (-not (Test-Path $nodeExe)) { throw 'Local Node.js installation is incomplete.' }
  return $nodeHome
}

$systemNode = Get-Command node -ErrorAction SilentlyContinue
if ($systemNode -and (Test-CompatibleNode $systemNode.Source)) {
  $NodeHome = Split-Path $systemNode.Source -Parent
  Write-Host "Compatible Node detected: $(& $systemNode.Source --version)"
} else {
  if ($systemNode) { Write-Host "System Node $(& $systemNode.Source --version) not used; Furlife requires Node 22.16.x+." }
  $NodeHome = Install-PortableNode $NodeVersion
}
$env:Path = "$NodeHome;$env:Path"
$NodeExe = (Get-Command node).Source
$CorepackExe = (Get-Command corepack.cmd -ErrorAction Stop).Source
Write-Host "Furlife Node: $(& $NodeExe --version)"

# Do not run corepack enable on Windows: it writes shims under Program Files.
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('prepare', "pnpm@$PnpmVersion", '--activate') -Label 'Corepack pnpm prepare'
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', '--version') -Label 'pnpm version check'

if (-not (Test-Path '.env.local')) {
  Invoke-Checked -FilePath $NodeExe -ArgumentList @('scripts/generate-dev-env.mjs') -Label 'Generate .env.local'
}
Invoke-Checked -FilePath $NodeExe -ArgumentList @('scripts/upgrade-dev-env.mjs') -Label 'Upgrade .env.local'
if (Select-String -Path '.env.local' -Pattern 'CHANGE_ME' -Quiet) {
  throw '.env.local still contains CHANGE_ME placeholders.'
}
Import-DotEnvFile -Path '.env.local'
# NODE_ENV is framework-owned. Next.js must choose production during next build.
[Environment]::SetEnvironmentVariable('NODE_ENV', $null, 'Process')
Write-Host '.env.local variables loaded; NODE_ENV left framework-managed.'

Invoke-Checked -FilePath $NodeExe -ArgumentList @('scripts/verify-baseline.mjs') -Label 'Structural baseline verification'

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) { throw 'Docker Desktop is required and docker must be available in PATH.' }
Invoke-Checked -FilePath $docker.Source -ArgumentList @('compose', '--project-name', 'furlife-dev', '--env-file', '.env.local', '-f', 'infra/docker-compose.dev.yml', 'up', '-d') -Label 'Docker Compose startup'

Write-Host 'Waiting for Furlife PostgreSQL...'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  & $docker.Source compose --project-name furlife-dev --env-file .env.local -f infra/docker-compose.dev.yml exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Furlife PostgreSQL did not become ready.' }
Write-Host 'Furlife PostgreSQL: READY'

Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', 'install') -Label 'pnpm install'
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', '--filter', '@furlife/backend', 'prisma:generate') -Label 'Prisma generate'
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', '--filter', '@furlife/backend', 'prisma:validate') -Label 'Prisma validate'

if (-not (Test-Path 'apps/backend/prisma/migrations')) {
  Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', '--filter', '@furlife/backend', 'exec', 'prisma', 'migrate', 'dev', '--name', 'initial', '--create-only') -Label 'Create initial Prisma migration'
}
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', '--filter', '@furlife/backend', 'prisma:migrate:deploy') -Label 'Apply Prisma migrations'
Invoke-Checked -FilePath $CorepackExe -ArgumentList @('pnpm', 'verify') -Label 'Node and TypeScript verification'

function Download-LargeFile {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][string]$Destination
  )

  if (Test-Path $Destination) { Remove-Item $Destination -Force }
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    Write-Host 'Downloading large archive with curl.exe (retries enabled)...'
    & $curl.Source --location --fail --retry 5 --retry-delay 5 --output $Destination $Uri
    if ($LASTEXITCODE -ne 0) {
      throw "curl.exe download failed (exit code $LASTEXITCODE)."
    }
  } else {
    Write-Host 'curl.exe unavailable; falling back to Invoke-WebRequest...'
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
  }

  if (-not (Test-Path $Destination)) { throw 'Download did not create the destination file.' }
  if ((Get-Item $Destination).Length -le 0) { throw 'Downloaded archive is empty.' }
}

function Get-FreeSpaceBytes {
  param([Parameter(Mandatory=$true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $driveRoot = [System.IO.Path]::GetPathRoot($fullPath)
  $drive = New-Object System.IO.DriveInfo($driveRoot)
  return [int64]$drive.AvailableFreeSpace
}

function Install-PortableFlutter {
  param([string]$Version)
  $flutterHome = Join-Path $ToolsDir "flutter-$Version"
  $flutterExe = Join-Path $flutterHome 'bin\flutter.bat'
  if (Test-Path $flutterExe) { return $flutterHome }
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'Automatic Flutter bootstrap is currently validated for Windows x64 only.'
  }

  Write-Host "Installing local Flutter $Version stable x64 without changing system PATH..."
  $indexUrl = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json'
  $index = (Invoke-WebRequest -UseBasicParsing -Uri $indexUrl).Content | ConvertFrom-Json
  $archiveName = "flutter_windows_$Version-stable.zip"
  $release = $index.releases | Where-Object { $_.version -eq $Version -and $_.channel -eq 'stable' -and $_.archive.EndsWith($archiveName) } | Select-Object -First 1
  if (-not $release) { throw "Official Flutter stable release $Version not found." }

  $zipPath = Join-Path $ToolsDir $archiveName
  $url = "$($index.base_url)/$($release.archive)"
  $expected = ([string]$release.sha256).ToLowerInvariant()
  $reuseArchive = $false

  if (Test-Path $zipPath) {
    $existingLength = (Get-Item $zipPath).Length
    if ($existingLength -gt 0) {
      Write-Host 'Existing Flutter archive found; verifying checksum before reuse...'
      $existingHash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()
      if ($existingHash -eq $expected) {
        Write-Host 'Existing Flutter archive checksum: OK. Reusing download.'
        $reuseArchive = $true
      } else {
        Write-Host 'Existing Flutter archive checksum is invalid; downloading a clean copy.'
        Remove-Item $zipPath -Force
      }
    } else {
      Remove-Item $zipPath -Force
    }
  }

  if (-not $reuseArchive) {
    Download-LargeFile -Uri $url -Destination $zipPath
  }

  $actual = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw 'Invalid Flutter checksum.' }

  $extractDir = Join-Path $ToolsDir "flutter-extract-$Version"
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
  if ((Test-Path $flutterHome) -and -not (Test-Path $flutterExe)) { Remove-Item $flutterHome -Recurse -Force }

  $zipBytes = [int64](Get-Item $zipPath).Length
  $minimumFreeBytes = [int64](10 * 1GB)
  $archiveBasedFreeBytes = [int64]($zipBytes * 4)
  if ($archiveBasedFreeBytes -gt $minimumFreeBytes) { $minimumFreeBytes = $archiveBasedFreeBytes }
  $freeBytes = Get-FreeSpaceBytes -Path $ToolsDir
  $freeGB = [Math]::Round($freeBytes / 1GB, 2)
  $requiredGB = [Math]::Round($minimumFreeBytes / 1GB, 2)
  Write-Host "Disk preflight for Flutter extraction: $freeGB GB free; $requiredGB GB required."
  if ($freeBytes -lt $minimumFreeBytes) {
    throw "Insufficient disk space for Flutter extraction. Free at least $requiredGB GB on the project drive, then rerun; the verified ZIP will be reused."
  }

  New-Item -ItemType Directory -Path $extractDir | Out-Null
  $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tar) {
    Write-Host 'Extracting Flutter with tar.exe...'
    & $tar.Source -xf $zipPath -C $extractDir
    if ($LASTEXITCODE -ne 0) {
      throw "Flutter extraction with tar.exe failed (exit code $LASTEXITCODE). The verified ZIP was kept for retry."
    }
  } else {
    Write-Host 'tar.exe unavailable; falling back to Expand-Archive...'
    try {
      Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force -ErrorAction Stop
    } catch {
      throw "Flutter extraction failed: $($_.Exception.Message). The verified ZIP was kept for retry."
    }
  }

  $extractedFlutter = Join-Path $extractDir 'flutter'
  $extractedFlutterExe = Join-Path $extractedFlutter 'bin\flutter.bat'
  if (-not (Test-Path $extractedFlutterExe)) {
    throw 'Flutter extraction is incomplete. The verified ZIP was kept for retry.'
  }

  Move-Item $extractedFlutter $flutterHome
  Remove-Item $extractDir -Recurse -Force
  Remove-Item $zipPath -Force
  if (-not (Test-Path $flutterExe)) { throw 'Local Flutter installation is incomplete.' }
  return $flutterHome
}

$systemFlutter = Get-Command flutter -ErrorAction SilentlyContinue
$useSystemFlutter = $false
if ($systemFlutter) {
  try {
    $flutterMachine = (& $systemFlutter.Source --version --machine | ConvertFrom-Json)
    if ($flutterMachine.frameworkVersion -eq $FlutterVersion -and $flutterMachine.channel -eq 'stable') {
      $useSystemFlutter = $true
    }
  } catch { $useSystemFlutter = $false }
}
if ($useSystemFlutter) {
  $FlutterHome = Split-Path (Split-Path $systemFlutter.Source -Parent) -Parent
  Write-Host "Compatible system Flutter detected: $FlutterVersion stable at $FlutterHome"
} else {
  if ($systemFlutter) { Write-Host "System Flutter is not exactly $FlutterVersion stable; using local Furlife SDK." }
  $FlutterHome = Install-PortableFlutter $FlutterVersion
}
$env:Path = "$(Join-Path $FlutterHome 'bin');$env:Path"
$env:PUB_CACHE = Join-Path $ToolsDir 'pub-cache'
$FlutterExe = Get-Command flutter.bat -ErrorAction SilentlyContinue
if (-not $FlutterExe) { $FlutterExe = Get-Command flutter -ErrorAction Stop }
$DartExe = Get-Command dart.bat -ErrorAction SilentlyContinue
if (-not $DartExe) { $DartExe = Get-Command dart -ErrorAction Stop }
Invoke-Checked -FilePath $FlutterExe.Source -ArgumentList @('--version') -Label 'Flutter version check'
& $FlutterExe.Source config --no-analytics *> $null

foreach ($app in @('client_flutter', 'partner_flutter')) {
  Push-Location "apps/$app"
  try {
    Invoke-Checked -FilePath $FlutterExe.Source -ArgumentList @('pub', 'get') -Label "flutter pub get ($app)"
    Invoke-Checked -FilePath $FlutterExe.Source -ArgumentList @('gen-l10n') -Label "flutter gen-l10n ($app)"
    $formatTargets = @('lib')
    if (Test-Path 'test') { $formatTargets += 'test' }
    Invoke-Checked -FilePath $DartExe.Source -ArgumentList (@('format', '--output=none', '--set-exit-if-changed') + $formatTargets) -Label "dart format ($app)"
    Invoke-Checked -FilePath $FlutterExe.Source -ArgumentList @('analyze') -Label "flutter analyze ($app)"
    Invoke-Checked -FilePath $FlutterExe.Source -ArgumentList @('test') -Label "flutter test ($app)"
  } finally {
    Pop-Location
  }
}

Invoke-Checked -FilePath $NodeExe -ArgumentList @('scripts/dev-doctor.mjs') -Label 'Final doctor'
Invoke-Checked -FilePath $NodeExe -ArgumentList @('scripts/verify-baseline.mjs') -Label 'Final baseline verification'

Write-Host '=== Furlife bootstrap Windows v0.3.10: PASS ===' -ForegroundColor Green
