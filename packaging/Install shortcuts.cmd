@echo off
rem Adds Morgue File shortcuts to your Desktop and Start menu. No admin rights needed.
rem The shortcuts start Morgue File in a minimized window.
set "MORGUE_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$shell = New-Object -ComObject WScript.Shell; foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { $link = $shell.CreateShortcut((Join-Path $folder 'Morgue File.lnk')); $link.TargetPath = Join-Path $env:MORGUE_DIR 'Morgue File.cmd'; $link.WorkingDirectory = $env:MORGUE_DIR; $link.WindowStyle = 7; $link.Description = 'Open Morgue File'; $link.Save() }"
if errorlevel 1 (
  echo Morgue File could not add the shortcuts.
) else (
  echo Added Morgue File to your Desktop and Start menu.
)
pause
