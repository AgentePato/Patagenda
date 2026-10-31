#!/bin/sh
# Ejecuta los tests con Node si está instalado o, si no, con el motor
# JavaScriptCore que trae macOS.
cd "$(dirname "$0")/.." || exit 1
if command -v node >/dev/null 2>&1; then
  exec node tests/logic.test.mjs
fi
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
if [ -x "$JSC" ]; then
  exec "$JSC" -m tests/logic.test.mjs
fi
echo "Necesitas Node.js (https://nodejs.org) para ejecutar los tests." >&2
exit 1
