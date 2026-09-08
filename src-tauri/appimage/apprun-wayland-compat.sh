#!/bin/sh
# vkomic AppRun compat hook — Wayland / Mesa / WebKit (issue #43).
# Sourcé par AppRun avant l'exec. Ne casse jamais le démarrage : que des exports conditionnels.
#
# Problème : l'AppImage (build Ubuntu 22.04) embarque libwebkit2gtk + libwayland-client
# de 2022. Sur Arch rolling + Mesa 26 + Hyprland, le WebKitGPUProcess système hérite du
# LD_LIBRARY_PATH bundlé -> EGL_BAD_ALLOC / EGL_BAD_PARAMETER.
# Fix éprouvé (cf. lithographer, GitButler, kunkun) :
#   1. précharger le libwayland-client SYSTÈME (LD_PRELOAD) pour que Mesa/EGL hôte parle Wayland,
#   2. désactiver le renderer DMABUF de WebKit par défaut (garde l'accel partielle),
#   3. laisser XWayland possible via DESKTOPINTEGRATION.

# 1. DMABUF off par défaut (l'utilisateur peut override en exportant 0 avant le lancement).
if [ -z "${WEBKIT_DISABLE_DMABUF_RENDERER:-}" ]; then
  export WEBKIT_DISABLE_DMABUF_RENDERER=1
fi

# 2. Intégration desktop linuxdeploy.
if [ -z "${DESKTOPINTEGRATION:-}" ]; then
  export DESKTOPINTEGRATION=1
fi

# 3. Précharge le libwayland-client système si on ne précharge rien d'autre.
#    Sans ça, le libwayland bundlé (vieux symboles) fait échouer eglGetPlatformDisplay
#    même en mode surfaceless qui n'utilise pas Wayland.
if [ -z "${LD_PRELOAD:-}" ]; then
  for _lib in \
    /usr/lib/libwayland-client.so.0 \
    /usr/lib/libwayland-client.so \
    /usr/lib64/libwayland-client.so.0 \
    /usr/lib64/libwayland-client.so \
    /usr/lib/x86_64-linux-gnu/libwayland-client.so.0 \
    /usr/lib/x86_64-linux-gnu/libwayland-client.so \
    /usr/lib/aarch64-linux-gnu/libwayland-client.so.0 ; do
    if [ -f "$_lib" ]; then
      export LD_PRELOAD="$_lib"
      break
    fi
  done
  unset _lib
fi
