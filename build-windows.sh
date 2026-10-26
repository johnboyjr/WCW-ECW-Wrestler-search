#!/usr/bin/env bash
# Builds the Windows release zip from a prebuilt Electron runtime (no npm needed).
# Usage: ./build-windows.sh [electron-version] [database.wmdb to build in]
# On Windows use build-windows.ps1 instead.
set -euo pipefail
cd "$(dirname "$0")"
ELECTRON_VERSION="${1:-44.9.3}"
VERSION="$(node -p "require('./package.json').version")"
NAME="WCW-Match-Search-Engine-Windows-${VERSION}"
OUT="dist/${NAME}"
ZIP="electron-v${ELECTRON_VERSION}-win32-x64.zip"
mkdir -p dist cache
if [ ! -f "cache/${ZIP}" ]; then
  curl -fL -o "cache/${ZIP}" "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${ZIP}"
fi
rm -rf "${OUT}" "dist/${NAME}.zip"
mkdir -p "${OUT}"
unzip -q "cache/${ZIP}" -d "${OUT}"
mv "${OUT}/electron.exe" "${OUT}/WCW Match Search Engine.exe"
rm -f "${OUT}/resources/default_app.asar"
APPDIR="${OUT}/resources/app"
mkdir -p "${APPDIR}"
cp main.js preload.js package.json LICENSE "${APPDIR}/"
cp -r app "${APPDIR}/"
DB="${2:-}"
if [ -n "${DB}" ]; then
  cp "${DB}" "${APPDIR}/app/data/2-wiki-database.wmdb"
  echo "Bundled database from ${DB}"
fi
cp build/icon.ico "${OUT}/icon.ico"
cp windows/Install.cmd windows/install.ps1 windows/uninstall.ps1 "${OUT}/"
sed 's/$/\r/' windows/README.txt > "${OUT}/README.txt"
sed -i 's/\r*$/\r/' "${OUT}/Install.cmd" "${OUT}/install.ps1" "${OUT}/uninstall.ps1"
(cd dist && zip -qr9 "${NAME}.zip" "${NAME}")
echo "Built dist/${NAME}.zip"
