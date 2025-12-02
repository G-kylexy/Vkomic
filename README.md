# <p align="center"><img src="public/icon.png" width="180" alt="Vkomic" /></p>

# Vkomic
Une application qui se branche sur https://vk.com/board203785966 et permet de telecharger les BD, mangas et comics disponibles.

## Telechargements
- Windows installeur : `.exe`
- Windows portable : archive `.zip`
- Linux : binaire `.AppImage` (ou archive `.tar.gz` selon la release)

Rendez-vous sur la derniere release : https://github.com/G-kylexy/Vkomic/releases/latest

### Lancer
- Windows : telechargez l'`.exe` ou decompressez le `.zip` et lancez Vkomic.
- Linux (AppImage) : `chmod +x Vkomic-*.AppImage && ./Vkomic-*.AppImage`.
- Linux (archive) : decompressez puis lancez le binaire fourni.

## Construire depuis les sources (optionnel)
Prerequis : Node.js, npm

1. Installer les dependances : `npm install`
2. Lancer en dev : `npm run dev`
3. Build (electron-builder) : `npm run build`
