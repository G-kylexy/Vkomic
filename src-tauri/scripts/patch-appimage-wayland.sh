#!/usr/bin/env bash
# Patch post-build de l'AppImage vkomic (Linux uniquement).
# Usage CI : bash src-tauri/scripts/patch-appimage-wayland.sh "<dossier bundle>" "<version>"
#  - <dossier bundle> : src-tauri/target/<triplet>/release/bundle (contient appimage/*.AppImage)
#  - <version> : ex. 1.4.3
#
# Ce que fait le script :
#   1. trouve l'AppImage Tauri,
#   2. l'extrait (squashfs-root),
#   3. injecte src-tauri/appimage/apprun-wayland-compat.sh dans squashfs-root/usr/share/vkomic/,
#   4. patch squashfs-root/AppRun pour sourcer le hook AVANT de poser LD_LIBRARY_PATH,
#   5. repack avec appimagetool en réutilisant l'UUID/update-info d'origine si présent.
# Idempotent et no-op si appimagetool indisponible (warning, build non bloqué).
set -euo pipefail

BUNDLE_ROOT="${1:-src-tauri/target/x86_64-unknown-linux-gnu/release/bundle}"
VERSION="${2:-0.0.0}"
HOOK_SRC="src-tauri/appimage/apprun-wayland-compat.sh"

APPIMAGE="$(find "$BUNDLE_ROOT/appimage" -maxdepth 1 -type f -name '*.AppImage' | head -n 1 || true)"
if [ -z "${APPIMAGE:-}" ]; then
  echo "[patch-appimage] no AppImage found in $BUNDLE_ROOT/appimage, skipping" >&2
  exit 0
fi
if [ ! -f "$HOOK_SRC" ]; then
  echo "[patch-appimage] hook $HOOK_SRC missing, skipping" >&2
  exit 0
fi

# appimagetool : binaire officiel, sinon no-op (on garde l'AppImage d'origine).
APPIMAGETOOL="${APPIMAGETOOL:-}"
if [ -z "$APPIMAGETOOL" ]; then
  if command -v appimagetool >/dev/null 2>&1; then
    APPIMAGETOOL="$(command -v appimagetool)"
  else
    TMP_TOOL="$(mktemp -d)/appimagetool"
    if curl -fsSL -o "$TMP_TOOL" "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage" 2>/dev/null; then
      chmod +x "$TMP_TOOL"
      APPIMAGETOOL="$TMP_TOOL"
    else
      echo "[patch-appimage] appimagetool unavailable, keeping original AppImage (hook documented in docs/linux-graphics.md)" >&2
      exit 0
    fi
  fi
fi

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "[patch-appimage] extracting $APPIMAGE"
(cd "$WORKDIR" && bash "$OLDPWD/$APPIMAGE" --appimage-extract >/dev/null)
APPDIR="$WORKDIR/squashfs-root"

mkdir -p "$APPDIR/usr/share/vkomic"
cp "$HOOK_SRC" "$APPDIR/usr/share/vkomic/apprun-wayland-compat.sh"
chmod 644 "$APPDIR/usr/share/vkomic/apprun-wayland-compat.sh"

# Patch AppRun : sourcer le hook juste après le shebang.
# AppRun Tauri/linuxdeploy typique : #!/bin/sh puis exports APPDIR/LD_LIBRARY_PATH.
if head -n 1 "$APPDIR/AppRun" | grep -q '^#!'; then
  SHEBANG="$(head -n 1 "$APPDIR/AppRun")"
  TAIL="$(tail -n +2 "$APPDIR/AppRun")"
  {
    printf '%s\n' "$SHEBANG"
    printf '# vkomic Wayland/Mesa compat (issue #43) — safe to remove on rebuild\n'
    printf 'if [ -f "$APPDIR/usr/share/vkomic/apprun-wayland-compat.sh" ]; then . "$APPDIR/usr/share/vkomic/apprun-wayland-compat.sh"; fi\n'
    printf 'if [ -f "$(dirname "$0")/usr/share/vkomic/apprun-wayland-compat.sh" ]; then . "$(dirname "$0")/usr/share/vkomic/apprun-wayland-compat.sh"; fi\n'
    printf '%s\n' "$TAIL"
  } > "$APPDIR/AppRun.patched"
  mv "$APPDIR/AppRun.patched" "$APPDIR/AppRun"
  chmod +x "$APPDIR/AppRun"
  echo "[patch-appimage] AppRun patched"
else
  echo "[patch-appimage] AppRun has no shebang, skipping AppRun patch (hook still shipped)" >&2
fi

# Repack en conservant le nom d'origine (le staging CI renomme ensuite en vkomic-<ver>-linux-x64.AppImage).
PATCHED="${APPIMAGE%.AppImage}-patched.AppImage"
echo "[patch-appimage] repacking -> $PATCHED"
ARCH=x86_64 "$APPIMAGETOOL" "$APPDIR" "$PATCHED" >/dev/null
chmod +x "$PATCHED"
mv -f "$PATCHED" "$APPIMAGE"
echo "[patch-appimage] done: $APPIMAGE"
