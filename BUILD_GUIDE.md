# Guide de Build VKomic

## 🖥️ Version Windows (Rust/Tauri)

### Build local
```bash
# Sur la branche main
git checkout main
npm install
npm run tauri:build
```

**Fichiers générés :**
- `src-tauri/target/release/app.exe` (17 MB) - Exécutable portable
- `src-tauri/target/release/bundle/msi/*.msi` (6.3 MB) - Installer MSI
- `src-tauri/target/release/bundle/nsis/*-setup.exe` (4.1 MB) - Installer NSIS

### Distribution
L'exe portable peut être utilisé directement sans installation.

---

## 📱 Version Mobile (Android APK)

### Prérequis
- Node.js 20+
- Java JDK 17
- Android Studio + SDK Android
- Variables d'environnement :
  - `ANDROID_HOME` = chemin vers le SDK Android
  - Ajouter `%ANDROID_HOME%\platform-tools` au PATH

### Build local

```bash
# 1. Sur la branche mobile
git checkout mobile

# 2. Installer les dépendances
npm install

# 3. Configurer le SDK Android
echo "sdk.dir=C:\\Users\\VOTRE_USER\\AppData\\Local\\Android\\Sdk" > android/local.properties

# 4. Build l'APK
cd android
./gradlew assembleRelease

# 5. L'APK non-signé est dans :
# app/build/outputs/apk/release/app-release-unsigned.apk
```

### Signer l'APK (pour distribution)

```bash
# Générer une clé de signature (une seule fois)
keytool -genkey -v -keystore vkomic-release-key.keystore -alias vkomic -keyalg RSA -keysize 2048 -validity 10000

# Signer l'APK
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore vkomic-release-key.keystore app-release-unsigned.apk vkomic

# Optimiser l'APK signé
zipalign -v 4 app-release-unsigned.apk vkomic-release.apk
```

---

## 🚀 Build Automatique (GitHub Actions)

### Workflow optimisé
Le fichier `.github/workflows/build.yml` permet de builder automatiquement :

**Déclencheurs :**
- Push d'un tag `v*` (ex: v1.3.0)
- Manuellement via `workflow_dispatch`

**Options de build :**
- `all` - Build Windows + Mobile
- `windows` - Build Windows uniquement
- `mobile` - Build Mobile uniquement

### Secrets GitHub requis (pour signer l'APK)
```
SIGNING_KEY       = Clé de signature encodée en base64
ALIAS             = Alias de la clé
KEY_STORE_PASSWORD= Mot de passe du keystore
KEY_PASSWORD      = Mot de passe de la clé
```

### Utilisation manuelle
1. Aller sur GitHub → Actions → Build VKomic Releases
2. Cliquer sur "Run workflow"
3. Choisir le type de build
4. Les fichiers seront uploadés en artifacts

---

## 📦 Structure des fichiers générés

```
# Windows
vkomic/
├── src-tauri/target/release/
│   ├── app.exe                    # Exécutable portable (17 MB)
│   └── bundle/
│       ├── msi/
│       │   └── vkomic_1.3.0_x64_en-US.msi    # Installer MSI (6.3 MB)
│       └── nsis/
│           └── vkomic_1.3.0_x64-setup.exe    # Installer NSIS (4.1 MB)

# Android  
android/app/build/outputs/apk/release/
├── app-release-unsigned.apk       # APK non-signé
└── app-release-signed.apk         # APK signé (GitHub Actions)
```

---

## ⚡ Optimisations

### Workflow GitHub Actions
- **Parallélisation** : Windows et Mobile build en parallèle
- **Artifacts** : Fichiers conservés 90 jours
- **Matrix build** : Possibilité d'ajouter macOS/Linux si besoin
- **Dispatch manuel** : Build à la demande sans tag

### Taille des builds
- Windows portable : ~17 MB
- Windows installer : ~4-6 MB  
- Android APK : ~40-60 MB (dépend des assets)

---

## 🔧 Dépannage

### Erreur "SDK location not found"
```bash
# Créer le fichier local.properties
echo "sdk.dir=C:\\Users\\USERNAME\\AppData\\Local\\Android\\Sdk" > android/local.properties
```

### Erreur "JAVA_HOME not set"
```bash
# Vérifier l'installation Java
java -version
# Définir JAVA_HOME dans les variables d'environnement système
```

### Build Tauri qui échoue
```bash
# Réinstaller les outils Rust
rustup update
rustup target add x86_64-pc-windows-msvc
```
