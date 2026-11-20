param(
    [string]$GoExe = $env:CPA_DOWNSHIFT_GO,
    [string]$Compiler = $env:CC
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw '插件版本必须是标准三段版本号。' }
if (!$GoExe) { $GoExe = (Get-Command go -ErrorAction SilentlyContinue).Source }
if (!$Compiler) { $Compiler = (Get-Command gcc -ErrorAction SilentlyContinue).Source }
if (!$GoExe -or !(Test-Path -LiteralPath $GoExe -PathType Leaf)) { throw '找不到 Go，请通过 -GoExe 指定已有工具。' }
if (!$Compiler -or !(Test-Path -LiteralPath $Compiler -PathType Leaf)) { throw '找不到 CGO 编译器，请通过 -Compiler 指定已有编译器。' }
$taskPlatform = if ($IsLinux) { 'linux' } elseif ($env:OS -eq 'Windows_NT') { 'windows' } else { throw '当前仅支持 Windows 和 Linux amd64 构建。' }
$taskExtension = if ($IsLinux) { '.so' } else { '.dll' }
$taskDirectory = Join-Path $taskRoot "build/$taskPlatform/amd64"
$taskOldLocation = Get-Location
$taskPreviousEnv = @{}
foreach ($taskName in @('CC','CGO_ENABLED','GOOS','GOARCH')) { $taskPreviousEnv[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process') }
try {
    Set-Location -LiteralPath $taskRoot
    if (!(Test-Path -LiteralPath 'node_modules')) { throw '缺少前端依赖，请先运行 pnpm install --frozen-lockfile。' }
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
    $taskEmbedded = [IO.Path]::GetFullPath((Join-Path $taskRoot 'web/dist'))
    $taskAllowed = [IO.Path]::GetFullPath((Join-Path $taskRoot 'web')) + [IO.Path]::DirectorySeparatorChar
    if (!$taskEmbedded.StartsWith($taskAllowed, [StringComparison]::OrdinalIgnoreCase)) { throw '嵌入资源目录超出项目边界。' }
    if (Test-Path -LiteralPath $taskEmbedded) { Remove-Item -LiteralPath $taskEmbedded -Recurse -Force }
    New-Item -ItemType Directory -Path $taskEmbedded -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $taskRoot 'dist') -Force | Copy-Item -Destination $taskEmbedded -Recurse -Force
    $env:CC = $Compiler; $env:CGO_ENABLED = '1'; $env:GOOS = $taskPlatform; $env:GOARCH = 'amd64'
    & $GoExe vet ./...
    if ($LASTEXITCODE -ne 0) { throw 'Go 静态检查失败。' }
    New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
    $taskArtifact = Join-Path $taskDirectory ('cpa-codex-downshift-classifier-v' + $taskVersion + $taskExtension)
    & $GoExe build -trimpath -buildmode=c-shared -ldflags='-s -w' -o $taskArtifact ./cmd/downshift
    if ($LASTEXITCODE -ne 0) { throw 'Go 原生插件构建失败。' }
    $taskHash = Get-FileHash -LiteralPath $taskArtifact -Algorithm SHA256
    ($taskHash.Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($taskArtifact)) | Set-Content -LiteralPath ($taskArtifact + '.sha256') -Encoding utf8
    Write-Output ('插件已构建：' + $taskArtifact)
    Write-Output ('SHA-256：' + $taskHash.Hash)
} finally {
    foreach ($taskName in $taskPreviousEnv.Keys) { [Environment]::SetEnvironmentVariable($taskName, $taskPreviousEnv[$taskName], 'Process') }
    Set-Location -LiteralPath $taskOldLocation.Path
}
