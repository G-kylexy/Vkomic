export const fr = {
    // Navigation
    nav: {
        home: 'Accueil',
        downloads: 'Téléchargements',
        library: 'Bibliothèque',
        settings: 'Paramètres',
    },

    // TopBar
    topbar: {
        searchPlaceholder: 'Rechercher...',
    },

    // Sidebar status
    sidebar: {
        connected: 'Connecté',
        disconnected: 'Déconnecté',
        latency: 'Latence',
        lastSync: 'Dernière synchro',
        connectedToVK: 'Connecté à VK',
        region: 'Région',
    },

    // Settings
    settings: {
        title: 'Paramètres',
        subtitle: "Configuration de l'application et de la connexion VK",

        // VK Connection
        vkConnection: 'Connexion VK',
        accessToken: 'Access Token',
        tokenHelper: 'Pour obtenir un token VK (Kate Mobile),',
        clickHere: 'cliquez ici',
        tokenInstructions: ', vous devez copier le texte entre',
        and: 'et',
        groupId: 'ID du Groupe',
        topicId: 'ID du Topic',

        // General Preferences
        generalPreferences: 'Préférences Générales',
        language: "Langue de l'interface",
        downloadFolder: 'Dossier de téléchargement',
        browse: 'Parcourir',
        folderDialogWarning: "La sélection de dossier est disponible uniquement dans la version bureau. Veuillez saisir le chemin manuellement.",

        // Save button
        saveAll: 'Sauvegarder',
        saved: 'Modifications enregistrées',
    },

    // Library
    library: {
        empty: 'Bibliothèque vide',
        emptyDescription: "Synchronisez l'application avec l'index VK pour accéder aux BDs.",
        syncButton: 'Synchroniser depuis VK',
        syncing: 'Synchronisation...',
        searching: 'Recherche dans le dossier actuel...',
        noResults: 'Ce dossier est vide ou aucun résultat trouvé.',
        localTitle: 'Bibliothèque locale',
        noDownloadPath: 'Choisissez un dossier de téléchargement dans Paramètres pour afficher vos fichiers ici.',
        desktopOnly: "La bibliothèque locale est disponible uniquement dans l'application desktop.",
        readError: 'Impossible de lire ce dossier. Vérifiez que le chemin est valide.',
        loading: 'Chargement de votre bibliothèque...',
        back: 'Retour',
        refresh: 'Rafraîchir',
        rootLabel: 'Téléchargements',
        folderLabel: 'Dossier',
        fileLabel: 'Fichier',
        size: 'Taille',
        modified: 'Modifié',
        openFolder: 'Ouvrir',
        openFile: 'Ouvrir le fichier',
        downloadFile: 'Télécharger',
        downloadAll: 'Tout télécharger',
        cancelAll: 'Tout annuler',
        emptyFolder: 'Ce dossier est vide.',
    },

    // Downloads
    downloads: {
        title: 'Téléchargements',
        overviewTitle: "Vue d'ensemble",
        statsIndexed: 'SERIES INDEXEES',
        statsDownloaded: 'TOMES TÉLÉCHARGÉS',
        statsInProgress: 'EN COURS',
        tableSeries: 'Série',
        tableVolume: 'Tome',
        tableStatus: 'Statut',
        tableDate: 'Date',
        tableSize: 'Taille',
        tableActions: 'Actions',
        completed: 'Téléchargé',
        canceled: 'Annulé',
        redownload: 'Retélécharger',
        noDownloads: 'Aucun téléchargement effectué',
        noDownloadsDescription: "L'historique des téléchargements apparaîtra ici",
    },

    // Languages
    languages: {
        fr: 'Français',
        en: 'English',
    },
};

export type Translations = typeof fr;
