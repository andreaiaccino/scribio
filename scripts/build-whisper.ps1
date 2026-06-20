# Build di whisper.cpp con backend Vulkan (cross-vendor: AMD/NVIDIA/Intel) e copia
# di whisper-server.exe + DLL in sidecar/whisper-bin (bundlato poi via electron-builder).
#
# Prerequisiti (una tantum): Vulkan SDK, CMake, VS 2022 Build Tools (workload C++).
# Uso:  pwsh -File scripts/build-whisper.ps1  [-Src <path whisper.cpp>]
param(
  [string]$Src = "C:\Users\andre\Documents\DEV\whisper.cpp"
)
$ErrorActionPreference = "Stop"

$vk = Get-ChildItem "C:\VulkanSDK" -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $vk) { throw "Vulkan SDK non trovato in C:\VulkanSDK" }
$env:VULKAN_SDK = $vk.FullName
Write-Host "VULKAN_SDK = $($env:VULKAN_SDK)"

$cmake = "C:\Program Files\CMake\bin\cmake.exe"
if (-not (Test-Path $cmake)) { $cmake = "cmake" }
$build = Join-Path $Src "build"

& $cmake -S $Src -B $build -G "Visual Studio 17 2022" -A x64 `
  -DGGML_VULKAN=ON -DWHISPER_BUILD_EXAMPLES=ON `
  -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0) { throw "cmake configure fallito" }

& $cmake --build $build --config Release --target whisper-server
if ($LASTEXITCODE -ne 0) { throw "build fallita" }

$binDir = Join-Path $build "bin\Release"
if (-not (Test-Path $binDir)) { $binDir = Join-Path $build "bin" }
$out = "C:\Users\andre\Documents\DEV\Scribio\sidecar\whisper-bin"
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $binDir -Include "whisper-server.exe", "*.dll" -Recurse |
  Copy-Item -Destination $out -Force
Write-Host "`nCopiato in $out :"
Get-ChildItem $out | Select-Object Name, @{n="MB";e={[math]::Round($_.Length/1MB,1)}}
