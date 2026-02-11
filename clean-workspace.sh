#!/bin/bash
# Script de nettoyage avant changement de branche
# Usage: ./clean-workspace.sh

echo "🔍 Vérification du workspace..."

# 1. Vérifier s'il y a des modifications non commitées
if ! git diff --quiet HEAD; then
    echo "⚠️  Modifications détectées !"
    echo "Options:"
    echo "  1. git stash (mettre de côté)"
    echo "  2. git commit (committer)"
    echo "  3. git checkout . (annuler)"
    exit 1
fi

# 2. Vérifier les fichiers non trackés
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ ! -z "$UNTRACKED" ]; then
    echo "📁 Fichiers non trackés trouvés:"
    echo "$UNTRACKED"
    echo ""
    read -p "Voulez-vous les supprimer ? (o/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        git clean -fd
        echo "✅ Fichiers supprimés"
    else
        echo "❌ Annulé"
        exit 1
    fi
fi

echo "✅ Workspace propre ! Tu peux changer de branche en toute sécurité."
