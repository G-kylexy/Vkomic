# <p align="center"><img src="public/icon.png" width="180" alt="Vkomic" /></p>

# Vkomic

Une application qui se branche sur https://vk.com/board203785966 et permet de telecharger les BD, mangas et comics disponibles.

## Telechargements

- Windows installeur : `.exe`
- Windows portable : archive `.zip`
- macOS : `.dmg` (installation) ou `.zip` (auto-update)
- Linux : binaire `.AppImage` (ou archive `.tar.gz` selon la release)
- Android : `.apk` (installation manuelle)

Rendez-vous sur la derniere release : https://github.com/G-kylexy/vkomic/releases/latest

### Lancer

- Windows : telechargez l'`.exe` ou decompressez le `.zip` et lancez Vkomic.
- macOS : ouvrez le `.dmg` puis glissez `Vkomic.app` dans `Applications` (ou utilisez le `.zip`).
- Linux (AppImage) : `chmod +x Vkomic-*.AppImage && ./Vkomic-*.AppImage`.
- Linux (archive) : decompressez puis lancez le binaire fourni.
- Android : telechargez le `.apk`, ouvrez-le et autorisez l'installation depuis les sources inconnues.

## Construire depuis les sources (optionnel)

Prerequis : Node.js, npm

1. Installer les dependances : `npm install`
2. Lancer en dev : `npm run dev`
3. Build (vite) : `npm run build`
4. Build desktop (electron-builder) : `npm run dist`



