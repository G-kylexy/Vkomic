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
    groupId: 'ID du groupe',
    topicId: 'ID du topic',
    resetGroupDefaults: 'Par défaut',

    // General Preferences
    generalPreferences: 'Préférences générales',
    language: "Langue de l'interface",
    downloadFolder: 'Dossier de téléchargement',
    browse: 'Parcourir',
    folderDialogWarning:
      "La sélection de dossier est disponible uniquement dans la version bureau. Veuillez saisir le chemin manuellement.",

    // Save button
    saveAll: 'Sauvegarder',
    saved: 'Modifications enregistrées',

    // Data Management
    dataManagement: 'Gestion des données',
    resetDatabase: 'Réinitialiser la base de données',
    resetDatabaseDescription: "Efface le cache local de l'arborescence VK. Utile si l'application semble désynchronisée ou affiche des dossiers vides.",
    resetButton: 'Réinitialiser',
    resetWarning: 'Attention : Vous devrez effectuer une nouvelle synchronisation pour accéder au contenu.',
  },

  // Library
  library: {
    empty: 'Bibliothèque vide',
    emptyDescription: "Veuillez configurer votre token dans les Paramètres, puis synchronisez l'application avec l’index VK pour accéder aux BDs.",
    syncButton: 'Synchroniser depuis VK',
    syncAllButton: 'Tout synchroniser',
    syncAllWarning: "Attention : cette opération va précharger tous les dossiers. Selon votre connexion et la charge des serveurs VK, cela peut prendre plusieurs secondes. Idéal si vous comptez utiliser la barre de recherche.",
    syncing: 'Synchronisation...',
    searching: 'Recherche dans la bibliothèque...',
    noResults: 'Ce dossier est vide ou aucun résultat trouvé.',
    localTitle: 'Bibliothèque locale',
    noDownloadPath:
      'Choisissez un dossier de téléchargement dans Paramètres pour afficher vos fichiers ici.',
    desktopOnly:
      "La bibliothèque locale est disponible uniquement dans l'application desktop.",
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
    statsIndexed: 'SÉRIES INDEXÉES',
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
    noDownloadsDescription: "L'historique des téléchargements apparaîtra ici.",
    statusDownloading: 'Téléchargement...',
    statusPending: 'En attente',
    statusPaused: 'Pause',
  },

  // Tooltips
  tooltips: {
    home: 'Accueil',
    resetDatabase: 'Réinitialiser la base de données',
    clean: 'Nettoyer',
    resume: 'Reprendre',
    pause: 'Pause',
    cancel: 'Annuler',
    openFolder: 'Ouvrir le dossier',
  },

  // Languages
  languages: {
    fr: 'Français',
    en: 'English',
  },
};

export type Translations = typeof fr;

