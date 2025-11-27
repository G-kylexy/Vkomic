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
        connectedToVK: 'Connecté à VK',
        latency: 'Latence',
        region: 'Région',
    },

    // Settings
    settings: {
        title: 'Paramètres',
        subtitle: 'Configuration de l\'application et de la connexion VK',

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
        language: 'Langue de l\'interface',
        downloadFolder: 'Dossier de téléchargement',
        browse: 'Parcourir',

        // Save button
        saveAll: 'Sauvegarder',
        saved: 'Modifications enregistrées',
    },

    // Library
    library: {
        empty: 'Bibliothèque vide',
        emptyDescription: 'Synchronisez l\'application avec l\'index VK pour accéder aux BDs.',
        syncButton: 'Synchroniser depuis VK',
    },

    // Downloads
    downloads: {
        title: 'Téléchargements',
        noDownloads: 'Aucun téléchargement en cours',
        noDownloadsDescription: 'Vos téléchargements apparaîtront ici.',
    },

    // Languages
    languages: {
        fr: 'Français',
        en: 'English',
    },
};

export type Translations = typeof fr;
