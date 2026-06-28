#!/usr/bin/env bash
# Empaqueta la extensión y la instala localmente en VSCode.
# Uso: pnpm run install:local
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Empaquetando extensión (vsce package)..."
npx @vscode/vsce package --no-dependencies --allow-missing-repository --skip-license

VSIX_FILE=$(ls -t ./*.vsix | head -n1)
echo "==> Instalando $VSIX_FILE..."
code --install-extension "$VSIX_FILE" --force

echo "==> Listo. Recarga o reinicia VSCode (Cmd+Shift+P > Reload Window) para ver los cambios."
