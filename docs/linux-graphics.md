# Vkomic sur Linux — WebKit / Mesa / Wayland (AppImage)

> Concerne l'issue `#43` : `Could not create surfaceless EGL display: EGL_BAD_ALLOC` sur Arch / Omarchy + Hyprland + Mesa récent.

## Pourquoi ça plante ?

L'AppImage est construit sur Ubuntu 22.04 et embarque `libwebkit2gtk-4.1` Ubuntu.
Sur Arch rolling, le pilote EGL vient de Mesa Arch (ex. `26.x`), beaucoup plus récent.
Le `WebKitGPUProcess` système hérite du `LD_LIBRARY_PATH` de l'AppImage, charge le
WebKit Ubuntu, et `eglGetPlatformDisplay(EGL_MESA_PLATFORM_SURFACELESS)` échoue avec
`EGL_BAD_ALLOC`. C'est la même classe de bug que beaucoup d'AppImages Tauri
(`GitButler#5282`, `kunkun#107`, `tauri#11988`).

Un second conflit existe avec GStreamer bundlé (`undefined symbol: gst_debug_log_id`)
quand on mélange WebKit système + GStreamer AppImage. D'où `bundleMediaFramework: false`
dans `tauri.conf.json`.

## Solution recommandée

1. **Utilisez le paquet natif plutôt que l'AppImage si possible :**
   - Debian/Ubuntu : `.deb` de la release (dépend de `libwebkit2gtk-4.1-0` système).
   - Fedora : `.rpm` de la release.
   - Arch : construisez depuis les sources (voir ci-dessous) ou utilisez le `PKGBUILD` dans `packaging/`.

2. **AppImage (builds patchés >= 1.4.3) :**
   Le `AppRun` injecte automatiquement :
   ```sh
   WEBKIT_DISABLE_DMABUF_RENDERER=1
   DESKTOPINTEGRATION=1
   LD_PRELOAD=<libwayland-client système si trouvé>
   ```
   Vous n'avez rien à faire. Si ça plante encore, forcez le fallback logiciel :
   ```bash
   WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Vkomic-*.AppImage
   LIBGL_ALWAYS_SOFTWARE=1 ./Vkomic-*.AppImage
   ```

3. **Contournement manuel (vieux AppImage 1.4.2) :**
   ```bash
   ./Vkomic*.AppImage --appimage-extract
   APPDIR=$PWD/squashfs-root
   LD_LIBRARY_PATH=/usr/lib:/usr/lib/webkit2gtk-4.1 \
   WEBKIT_DISABLE_DMABUF_RENDERER=1 \
   ./squashfs-root/usr/bin/app
   ```
   Prérequis Arch : `sudo pacman -S webkit2gtk-4.1 mesa`

## Build Arch depuis les sources (recommandé rolling-release)

```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl gtk3 libappindicator-gtk3 librsvg patchelf nodejs npm rustup
npm ci
npm run tauri:build
# binaire natif : src-tauri/target/release/app (utilise WebKit/Mesa système, pas de conflit)
./src-tauri/target/release/app
```

## Variables testées

| Variable | Effet ici |
|---|---|
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | aide, garde l'accélération partielle. Activé par défaut dans le code + AppRun. |
| `WEBKIT_DISABLE_COMPOSITING_MODE=1` | dernier recours, désactive la compositing accélérée. Non activé par défaut. |
| `GDK_BACKEND=x11 / wayland` | forcé à `x11` par `linuxdeploy-plugin-gtk`, fragile sous Hyprland pur. Ne pas forcer sauf test. |
| `LIBGL_ALWAYS_SOFTWARE=1` | fallback CPU, lent mais débloque. |
