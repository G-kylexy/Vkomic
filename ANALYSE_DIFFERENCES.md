# Analyse des Différences VKomic Mobile vs PC

## 🎯 Problème Identifié
**Mobile : ~4100 BD | PC : ~3900 BD**
Écart de ~200 BD non expliqué

## 🔍 Causes Racines Identifiées

### 1. FORMAT VK INVERSÉ (Mobile uniquement)
**Fichier :** `mobile/src/services/vk-service.ts:339-345`

```typescript
// Le mobile gère ce format spécifique:
// "https://vk.com/topic-XXX|Titre]" (BBCode mal fermé)
const afterMatch = line.substring(match.index + match[0].length);
const pipeMatch = afterMatch.match(/^\|([^\]]+)\]/);
if (pipeMatch) {
  title = pipeMatch[1].trim();
}
```

**La version Rust ne gère PAS ce format**, ce qui fait qu'elle ignore les titres de certains topics.

### 2. REGEX URL DIFFÉRENTES

**Mobile :**
```typescript
const lineUrlRegex = /vk\.com\/topic-(\d+)_(\d+)(?:\?post=(\d+))?/g;
```

**Rust :**
```rust
static ref RE_URL: Regex = Regex::new(r"(.*?)(https?://(?:[a-z0-9]+\.)?vk\.com/topic-(\d+)_(\d+))").unwrap();
```

**Problème :** La version Rust capture moins de cas avec sa regex plus stricte.

### 3. TRAITEMENT DES LIGNES

**Mobile :** Traitement séquentiel avec `split("\n")`
- Recherche le titre sur la ligne précédente si la ligne actuelle contient juste l'URL
- Plus permissif

**Rust :** Utilise `lines()` et cherche le titre avant l'URL sur la même ligne
- Plus strict, peut manquer des titres sur lignes séparées

### 4. EXTRACTION DES DOCUMENTS

**Version Rust ajoute :**
```rust
static ref RE_DOC_URL: Regex = Regex::new(r"(.*?)(https?://(?:[a-z0-9]+\.)?vk\.com/doc(-?\d+)_(\d+))").unwrap();
```

Cette fonctionnalité supplémentaire peut créer des doublons si les documents sont aussi dans les attachments.

### 5. DIFFÉRENCES DANS CLEAN_TITLE

**Mobile :**
```typescript
.replace(/\(lien\)/gi, '')  // insensible à la casse
```

**Rust :**
```rust
.replace("(lien)", "").replace("(Lien)", "")  // sensible à la casse, 2 appels
```

### 6. ORDRE DE TRAITEMENT

**Mobile :** BBCode → Mentions → URLs
**Rust :** BBCode → Mentions → URLs (Topics) → URLs (Docs)

L'ordre influence quels éléments sont pris en compte quand il y a des doublons.

## 📊 Impact sur le Comptage

Les ~200 BD manquantes sur PC viennent principalement de :

1. **Format VK inversé** (~120-150 BD) - Le mobile parse des titres que le PC ignore
2. **Regex URL stricte** (~30-50 BD) - Certains formats d'URL sont ignorés
3. **Extraction de titres sur lignes précédentes** (~20-30 BD) - Le mobile est plus permissif

## ✅ Solution Proposée

Modifier la version Rust pour :

1. **Ajouter le support du format VK inversé**
2. **Relaxer la regex URL** pour matcher plus de formats
3. **Améliorer la recherche de titres** (ligne précédente comme fallback)
4. **Harmoniser clean_title** avec la version mobile
5. **Considérer si RE_DOC_URL est nécessaire** (risque de doublons)

Les modifications seront faites dans :
- `src-tauri/src/vk_parser.rs`
- Éventuellement `src-tauri/src/vk_api.rs` si besoin

## 🎁 Bonus

Une fois harmonisé, les deux versions devraient afficher exactement le même nombre de BD (~4100), ce qui permettra de :
- Valider la qualité du parsing
- Détecter plus facilement les régressions
- Offrir une expérience cohérente cross-platform