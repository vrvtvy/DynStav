[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

switch ($args[0]) {
  'dev' {
    Write-Host "正在构建..."
    & "electron-vite" build
    Write-Host "正在启动应用..."
    & "electron" .
  }
  'build' { & "electron-vite" build }
  'start' {
    Write-Host "正在构建..."
    & "electron-vite" build
    Write-Host "正在启动应用..."
    & "electron" .
  }
  default { & "electron-vite" @args }
}
