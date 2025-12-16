export type Language = "fr" | "en" | "ru";

export type Translations = {
  nav: {
    home: string;
    library: string;
    downloads: string;
    settings: string;
  };
  home: {
    tagline: string;
    connected: string;
    disconnected: string;
    statsIndexed: string;
    statsVolumes: string;
    statsDownloaded: string;
    quickTitle: string;
    quickSubtitle: string;
    openLibrary: string;
    openDownloads: string;
    latestTitle: string;
    latestSubtitle: string;
  };
  library: {
    title: string;
    subtitle: string;
    folderTitle: string;
    folderSubtitle: string;
    recentTitle: string;
    recentSubtitle: string;
    refresh: string;
    empty: string;
    errorNoStorage: string;
    errorRead: string;
    note: string;
  };
  downloads: {
    title: string;
    subtitle: string;
    historyTitle: string;
    historySubtitle: string;
    statusCompleted: string;
    statusPaused: string;
    statusDownloading: string;
    statusInProgress: string;
    statusCanceled: string;
    statusError: string;
    emptyTitle: string;
    emptySubtitle: string;
    actionPause: string;
    actionCancel: string;
    actionResume: string;
    actionRetry: string;
    clearList: string;
  };
  settings: {
    connectionTitle: string;
    connectionSubtitle: string;
    tokenLabel: string;
    tokenHint: string;
    groupLabel: string;
    topicLabel: string;
    prefsTitle: string;
    prefsSubtitle: string;
    downloadFolderLabel: string;
    languageLabel: string;
    resetGroupDefaults: string;
    autoSyncLabel: string;
    autoSyncHint: string;
    maintenanceTitle: string;
    maintenanceSubtitle: string;
    resetLibrary: string;
    clearCache: string;
  };
  browser: {
    searchPlaceholder: string;
    sync: string;
    syncing: string;
    back: string;
    home: string;
    download: string;
    open: string;
    noTokenTitle: string;
    noTokenSubtitle: string;
    goSettings: string;
    emptyTitle: string;
    emptySubtitle: string;
    loading: string;
    errorNoToken: string;
    errorSync: string;
    errorLoad: string;
    errorNoUrl: string;
  };
};

const translations: Record<Language, Translations> = {
  fr: {
    nav: {
      home: "Accueil",
      library: "Bibliothèque",
      downloads: "Téléchargements",
      settings: "Paramètres",
    },
    home: {
      tagline: "Retrouve ta bibliothèque VK dans un format optimisé mobile.",
      connected: "Connecté",
      disconnected: "Déconnecté",
      statsIndexed: "Séries indexées",
      statsVolumes: "Volumes",
      statsDownloaded: "Téléchargés",
      quickTitle: "Actions rapides",
      quickSubtitle: "Raccourcis les plus utilisés",
      openLibrary: "Ouvrir la bibliothèque",
      openDownloads: "Voir les téléchargements",
      latestTitle: "Dernières séries",
      latestSubtitle: "Aperçu rapide",
    },
    library: {
      title: "Bibliothèque",
      subtitle: "Affiche ici tes téléchargements locaux (à brancher).",
      folderTitle: "Dossier",
      folderSubtitle: "Emplacement de téléchargement",
      recentTitle: "Fichiers récents",
      recentSubtitle: "Placeholder",
      refresh: "Rafraîchir",
      empty: "Aucun fichier pour l’instant.",
      errorNoStorage: "Stockage local non disponible (documentDirectory).",
      errorRead: "Impossible de lire la bibliothèque locale.",
      note:
        "Pour le “vrai” accès fichiers sur mobile, il faudra utiliser le Document Picker / Media Library et gérer les permissions.",
    },
    downloads: {
      title: "Téléchargements",
      subtitle: "Suivi temps réel",
      historyTitle: "Historique",
      historySubtitle: "3 derniers téléchargements",
      statusCompleted: "Terminé",
      statusPaused: "En pause",
      statusDownloading: "Téléchargement…",
      statusInProgress: "En cours",
      statusCanceled: "Annulé",
      statusError: "Erreur",
      emptyTitle: "Aucun téléchargement",
      emptySubtitle: "Lance un téléchargement depuis l’onglet Accueil.",
      actionPause: "Pause",
      actionCancel: "Annuler",
      actionResume: "Reprendre",
      actionRetry: "Réessayer",
      clearList: "Vider la liste",
    },
    settings: {
      connectionTitle: "Connexion VK",
      connectionSubtitle: "Renseigne tes identifiants",
      tokenLabel: "Access token",
      tokenHint: "Génère un token via VK OAuth",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Préférences",
      prefsSubtitle: "Chemin & langue",
      downloadFolderLabel: "Dossier de téléchargement",
      languageLabel: "Langue",
      resetGroupDefaults: "Rétablir les valeurs par défaut",
      autoSyncLabel: "Sync automatique",
      autoSyncHint: "Lance la synchro au démarrage de l’app",
      maintenanceTitle: "Maintenance",
      maintenanceSubtitle: "Cache & données",
      resetLibrary: "Réinitialiser la bibliothèque locale",
      clearCache: "Effacer le cache",
    },
    browser: {
      searchPlaceholder: "Rechercher…",
      sync: "Synchroniser",
      syncing: "Synchronisation…",
      back: "Retour",
      home: "Accueil",
      download: "Télécharger",
      open: "Ouvrir",
      noTokenTitle: "Token VK manquant",
      noTokenSubtitle: "Renseigne ton token dans Paramètres pour accéder à VK.",
      goSettings: "Aller aux paramètres",
      emptyTitle: "Bibliothèque vide",
      emptySubtitle: "Synchronise l’index VK pour afficher les dossiers et fichiers.",
      loading: "Chargement…",
      errorNoToken: "Configure un token VK dans Paramètres.",
      errorSync: "Impossible de synchroniser (VK API).",
      errorLoad: "Impossible de charger le contenu.",
      errorNoUrl: "Ce fichier n'a pas d'URL de téléchargement.",
    },
  },
  en: {
    nav: {
      home: "Home",
      library: "Library",
      downloads: "Downloads",
      settings: "Settings",
    },
    home: {
      tagline: "Browse your VK library with a mobile-first UI.",
      connected: "Connected",
      disconnected: "Disconnected",
      statsIndexed: "Indexed series",
      statsVolumes: "Volumes",
      statsDownloaded: "Downloaded",
      quickTitle: "Quick actions",
      quickSubtitle: "Most used shortcuts",
      openLibrary: "Open library",
      openDownloads: "Open downloads",
      latestTitle: "Latest series",
      latestSubtitle: "Quick preview",
    },
    library: {
      title: "Library",
      subtitle: "Your local downloads (to be wired).",
      folderTitle: "Folder",
      folderSubtitle: "Download location",
      recentTitle: "Recent files",
      recentSubtitle: "Placeholder",
      refresh: "Refresh",
      empty: "No files yet.",
      errorNoStorage: "Local storage unavailable (documentDirectory).",
      errorRead: "Unable to read local library.",
      note:
        "On mobile, real file access requires Document Picker / Media Library + permissions.",
    },
    downloads: {
      title: "Downloads",
      subtitle: "Live tracking",
      historyTitle: "History",
      historySubtitle: "Last 3 downloads",
      statusCompleted: "Completed",
      statusPaused: "Paused",
      statusDownloading: "Downloading…",
      statusInProgress: "In progress",
      statusCanceled: "Canceled",
      statusError: "Error",
      emptyTitle: "No downloads",
      emptySubtitle: "Start a download from the Home tab.",
      actionPause: "Pause",
      actionCancel: "Cancel",
      actionResume: "Resume",
      actionRetry: "Retry",
      clearList: "Clear list",
    },
    settings: {
      connectionTitle: "VK connection",
      connectionSubtitle: "Enter your credentials",
      tokenLabel: "Access token",
      tokenHint: "Generate a token via VK OAuth",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Preferences",
      prefsSubtitle: "Path & language",
      downloadFolderLabel: "Download folder",
      languageLabel: "Language",
      resetGroupDefaults: "Reset default values",
      autoSyncLabel: "Auto sync",
      autoSyncHint: "Run sync when the app starts",
      maintenanceTitle: "Maintenance",
      maintenanceSubtitle: "Cache & data",
      resetLibrary: "Reset local library",
      clearCache: "Clear cache",
    },
    browser: {
      searchPlaceholder: "Search…",
      sync: "Sync",
      syncing: "Syncing…",
      back: "Back",
      home: "Home",
      download: "Download",
      open: "Open",
      noTokenTitle: "Missing VK token",
      noTokenSubtitle: "Set your token in Settings to access VK.",
      goSettings: "Go to settings",
      emptyTitle: "Empty library",
      emptySubtitle: "Sync the VK index to display folders and files.",
      loading: "Loading…",
      errorNoToken: "Set a VK token in Settings.",
      errorSync: "Sync failed (VK API).",
      errorLoad: "Unable to load content.",
      errorNoUrl: "This file has no download URL.",
    },
  },
  ru: {
    nav: {
      home: "Главная",
      library: "Библиотека",
      downloads: "Загрузки",
      settings: "Настройки",
    },
    home: {
      tagline: "VK библиотека в удобном мобильном интерфейсе.",
      connected: "Подключено",
      disconnected: "Отключено",
      statsIndexed: "Серии в индексе",
      statsVolumes: "Тома",
      statsDownloaded: "Скачано",
      quickTitle: "Быстрые действия",
      quickSubtitle: "Часто используемые",
      openLibrary: "Открыть библиотеку",
      openDownloads: "Открыть загрузки",
      latestTitle: "Последние серии",
      latestSubtitle: "Быстрый просмотр",
    },
    library: {
      title: "Библиотека",
      subtitle: "Локальные загрузки (нужно подключить).",
      folderTitle: "Папка",
      folderSubtitle: "Путь загрузки",
      recentTitle: "Последние файлы",
      recentSubtitle: "Заглушка",
      refresh: "Обновить",
      empty: "Файлов пока нет.",
      errorNoStorage: "Локальное хранилище недоступно (documentDirectory).",
      errorRead: "Не удалось прочитать локальную библиотеку.",
      note:
        "Для доступа к файлам на мобильных устройствах нужны Document Picker / Media Library и разрешения.",
    },
    downloads: {
      title: "Загрузки",
      subtitle: "Статус в реальном времени",
      historyTitle: "История",
      historySubtitle: "Последние 3 загрузки",
      statusCompleted: "Готово",
      statusPaused: "Пауза",
      statusDownloading: "Скачивание…",
      statusInProgress: "В процессе",
      statusCanceled: "Отменено",
      statusError: "Ошибка",
      emptyTitle: "Загрузок нет",
      emptySubtitle: "Запусти загрузку во вкладке Главная.",
      actionPause: "Пауза",
      actionCancel: "Отмена",
      actionResume: "Продолжить",
      actionRetry: "Повторить",
      clearList: "Очистить список",
    },
    settings: {
      connectionTitle: "Подключение VK",
      connectionSubtitle: "Введите данные",
      tokenLabel: "Access token",
      tokenHint: "Сгенерируйте токен через VK OAuth",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Настройки",
      prefsSubtitle: "Путь и язык",
      downloadFolderLabel: "Папка загрузок",
      languageLabel: "Язык",
      resetGroupDefaults: "Сбросить значения по умолчанию",
      autoSyncLabel: "Автосинхронизация",
      autoSyncHint: "Запускать синхронизацию при старте",
      maintenanceTitle: "Обслуживание",
      maintenanceSubtitle: "Кэш и данные",
      resetLibrary: "Сбросить локальную библиотеку",
      clearCache: "Очистить кэш",
    },
    browser: {
      searchPlaceholder: "Поиск…",
      sync: "Синхронизировать",
      syncing: "Синхронизация…",
      back: "Назад",
      home: "Главная",
      download: "Скачать",
      open: "Открыть",
      noTokenTitle: "Нет токена VK",
      noTokenSubtitle: "Укажите токен в настройках, чтобы получить доступ к VK.",
      goSettings: "Открыть настройки",
      emptyTitle: "Библиотека пуста",
      emptySubtitle: "Синхронизируйте индекс VK, чтобы увидеть папки и файлы.",
      loading: "Загрузка…",
      errorNoToken: "Укажите токен VK в настройках.",
      errorSync: "Не удалось синхронизировать (VK API).",
      errorLoad: "Не удалось загрузить содержимое.",
      errorNoUrl: "У этого файла нет URL для скачивания.",
    },
  },
};

export const getT = (language: Language): Translations =>
  translations[language] ?? translations.fr;
