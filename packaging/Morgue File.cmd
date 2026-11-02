@echo off
rem Starts Morgue File. If it is already running, this just opens a new browser tab.
rem Keep this window open (it can stay minimized) while you use Morgue File; closing it stops it.
title Morgue File server
set "MORGUE_HOME=%~dp0."
"%~dp0node\node.exe" "%~dp0app\dist\server\launcher.js"
if errorlevel 1 pause
