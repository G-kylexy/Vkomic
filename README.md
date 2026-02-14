# <p align="center"><img src="src-tauri/icons/icon.png" width="180" alt="Vkomic" /></p>

# Vkomic

Une application **Rust + Tauri** qui se branche sur https://vk.com/board203785966 et permet de télécharger les BD, mangas et comics disponibles.

## Téléchargements

- Windows installeur : `.exe`
- Windows portable : archive `.zip`
- macOS : `.dmg` (installation) ou `.zip` (auto-update)
- Linux : binaire `.AppImage` (ou archive `.tar.gz` selon la release)
- Android : `.apk` (installation manuelle)

Rendez-vous sur la dernière release : https://github.com/G-kylexy/vkomic/releases/latest

### Lancer

- Windows : téléchargez l'`.exe` ou décompressez le `.zip` et lancez Vkomic.
- macOS : ouvrez le `.dmg` puis glissez `Vkomic.app` dans `Applications` (ou utilisez le `.zip`).
- Linux (AppImage) : `chmod +x Vkomic-*.AppImage && ./Vkomic-*.AppImage`.
- Android : téléchargez le `.apk`, ouvrez-le et autorisez l'installation depuis les sources inconnues.


## Construire depuis les sources (optionnel)

**Prérequis :** Node.js, npm, Rust

1. **Installer les dépendances :**
   ```bash
   npm install
   ```

2. **Lancer en mode développement :**
   ```bash
   npm run tauri:dev
   ```

3. **Build production (frontend) :**
   ```bash
   npm run build
   ```

4. **Build desktop (Tauri) :**
   ```bash
   npm run tauri:build
   ```
