<instruction>You are an expert software engineer. You are working on a WIP branch. Please run `git status` and `git diff` to understand the changes and the current state of the code. Analyze the workspace context and complete the mission brief.</instruction>
<workspace_context>
<active_errors>
File: tsconfig.json Line 23: File 'expo/tsconfig.base' not found.
</active_errors>
<artifacts>
--- CURRENT TASK CHECKLIST ---
# Conversion Rust - VKomic & Feature Parity

## Backend Rust
- [x] Ajouter `extract_documents()` dans `vk_parser.rs`
- [x] Ajouter `fetch_node_content()` dans `vk_api.rs`
- [x] Exposer `vk_fetch_node_content` dans `lib.rs`
- [x] Fix Download Manager (Race conditions, file access)

## Frontend
- [x] Ajouter appel à `fetchNodeContent` dans `tauri.ts`
- [x] Corriger `vk-client.ts` pour utiliser la vraie commande
- [x] Fix "Open Folder" button (use Tauri APIs)

## Feature Parity & Polish
- [x] Fix Scrolling in Downloads View
- [x] Verify Download Folder Structure (Series Name -> Folder)
- [ ] Verify "Download All" (Whole Series) behavior
- [ ] Verify UI Responsiveness (Mobile/Desktop)
- [ ] Verify Navigation (Back button, Breadcrumbs)

## Build & Release
- [x] Build macOS High Sierra Compatibility (Legacy Electron)
- [x] Build macOS High Sierra Compatibility (Tauri)

--- IMPLEMENTATION PLAN ---
# Continuation de la Conversion TypeScript → Rust

## Situation Actuelle

L'application VKomic utilise déjà un backend Rust via Tauri pour les fonctionnalités principales:

**Déjà converti en Rust:**
- ✅ `vk_ping` - Vérification de connexion VK
- ✅ `vk_fetch_root_index` - Récupération de l'index racine
- ✅ `vk_fetch_full_index` - Synchronisation complète par niveaux (optimisée batch)
- ✅ `vk_parser.rs` - Parsing des topics VK (BBCode, mentions, URLs)
- ✅ `download.rs` - Gestionnaire de téléchargements avec queue, pause/resume, progression
- ✅ `fs_ops.rs` - Opérations système de fichiers

**Reste à faire:**
- ❌ `fetchNodeContent` - Chargement lazy du contenu d'un dossier (actuellement contourne en appelant `fetchRootIndex`)
- ❌ Extraction des documents (PDF, CBZ, CBR, ZIP) depuis les commentaires VK
- ❌ Recherche VK (`searchVkBoard`)

---

## Proposed Changes

### 1. Backend Rust - Nouvelles Commandes

#### [MODIFY] [vk_api.rs](file:///c:/Users/FX706/Downloads/vkomic/src-tauri/src/vk_api.rs)

Ajouter:
- `fetch_node_content()` - Récupère le contenu complet d'un topic (sous-dossiers + documents)
- `extract_documents()` - Parse les attachements VK pour extraire les fichiers

```rust
// Nouvelle méthode pour charger le contenu d'un nœud
pub async fn fetch_node_content(&self, group_id: &str, topic_id: &str) -> Result<VkNode>

// Extraction des documents des commentaires
fn extract_documents(items: &[Value]) -> Vec<VkNode>
```

#### [MODIFY] [vk_parser.rs](file:///c:/Users/FX706/Downloads/vkomic/src-tauri/src/vk_parser.rs)

Ajouter:
- `extract_documents()` - Nouvelle fonction pour parser les attachements `doc` des commentaires VK

---

#### [MODIFY] [lib.rs](file:///c:/Users/FX706/Downloads/vkomic/src-tauri/src/lib.rs)

Ajouter:
- `vk_fetch_node_content` - Nouvelle commande Tauri exposée au frontend

---

### 2. Frontend - Mise à jour du Client

#### [MODIFY] [tauri.ts](file:///c:/Users/FX706/Downloads/vkomic/lib/tauri.ts)

Ajouter l'appel à la nouvelle commande Rust:
```typescript
fetchNodeContent: (token: string, groupId: string, topicId: string) =>
    invoke<VkNode>("vk_fetch_node_content", { token, groupId, topicId }),
```

#### [MODIFY] [vk-client.ts](file:///c:/Users/FX706/Downloads/vkomic/utils/vk-client.ts)

Corriger `fetchNodeContent` pour utiliser la vraie commande Rust au lieu du workaround actuel.

---

## Verification Plan

### Tests Automatisés

L'application utilise Tauri sans tests unitaires formels. La vérification se fera par:

1. **Build et lint Rust:**
   ```bash
   cd src-tauri && cargo check && cargo clippy
   ```

2. **Build de l'application:**
   ```bash
   npm run tauri dev
   ```

### Vérification Manuelle

1. **Lancer l'application** avec `npm run tauri dev`
2. **Entrer un token VK** dans les paramètres
3. **Cliquer sur "Synchroniser"** - Doit charger l'arborescence complète
4. **Naviguer dans un dossier** (ex: "BDs EN FRANCAIS" → un sous-dossier) - Doit charger les fichiers PDF/CBZ
5. **Vérifier la console Rust** (logs) pour confirmer que `fetch_node_content` est appelé

> [!IMPORTANT]
> L'utilisateur devra confirmer que la navigation fonctionne correctement et que les fichiers (PDF, CBZ, etc.) apparaissent dans les dossiers finaux.
</artifacts>
</workspace_context>
<mission_brief>[Describe your task here...]</mission_brief>