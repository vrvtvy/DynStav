[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSCommandPath

switch ($args[0]) {
  'dev'     { & "electron-vite" dev }
  'build'   { & "electron-vite" build }
  'preview' { & "electron-vite" preview }
  default   { & "electron-vite" @args }
}
