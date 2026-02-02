# <p align="center"><img src="public/icon.png" width="180" alt="Vkomic" /></p>

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
- Linux (archive) : décompressez puis lancez le binaire fourni.
- Android : téléchargez le `.apk`, ouvrez-le et autorisez l'installation depuis les sources inconnues.

## Mises à jour automatiques

L'application utilise le système de mise à jour intégré de Tauri pour vérifier automatiquement les nouvelles versions disponibles sur GitHub Releases.

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

5. **Build Android :**
   ```bash
   npm run mobile:android
   ```

## Architecture

- **Frontend :** React + TypeScript + Vite + TailwindCSS
- **Backend :** Rust + Tauri
- **Fonctionnalités :**
  - API VK intégrée (lecture de topics, téléchargement de documents)
  - Gestionnaire de téléchargements avec reprise
  - Interface réactive et performante
  - Support multi-plateforme (Windows, macOS, Linux, Android)

## Licence

MIT
