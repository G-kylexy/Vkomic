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
    statsInProgress: string;
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
    errorPermission: string;
    note: string;
    deleteConfirmTitle: string;
    deleteConfirmMsg: string;
    loading: string;
    statsFiles: string;
    statsTotal: string;
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
    themeLabel: string;
    themeDark: string;
    themeOled: string;
    maintenanceTitle: string;
    maintenanceSubtitle: string;
    resetLibrary: string;
    clearCache: string;
    resetDatabase: string;
    resetDatabaseDescription: string;
    save: string;
    saved: string;
    headerSubtitle: string;
  };
  reader: {
    back: string;
    loading: string;
    unsupported: string;
    return: string;
    openExternal: string;
    externalError: string;
    noAppAvailable: string;
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
    errorNoFolder: string;
  };

  browser: {
    searchPlaceholder: string;
    sync: string;
    syncing: string;
    syncAll: string;
    back: string;
    home: string;
    download: string;
    open: string;
    noTokenTitle: string;
    noTokenSubtitle: string;
    goSettings: string;
    emptyTitle: string;
    emptySubtitle: string;
    searchEmptyTitle: string;
    searchEmptySubtitle: string;
    searchIndexHint: string;
    loading: string;
    errorNoToken: string;
    errorSync: string;
    errorLoad: string;
    errorNoUrl: string;
    results: string;
    setupStep1: string;
    setupStep2: string;
    setupStep3: string;
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
      statsInProgress: "En cours",
      quickTitle: "Actions rapides",
      quickSubtitle: "Raccourcis les plus utilisés",
      openLibrary: "Ouvrir la bibliothèque",
      openDownloads: "Voir les téléchargements",
      latestTitle: "Dernières séries",
      latestSubtitle: "Aperçu rapide",
    },
    library: {
      title: "Bibliothèque",
      subtitle: "Affiche ici tes téléchargements locaux.",
      folderTitle: "Fichiers locaux",
      folderSubtitle: "Vos téléchargements",
      recentTitle: "Fichiers récents",
      recentSubtitle: "Placeholder",
      refresh: "Rafraîchir",
      empty: "Aucun fichier pour l'instant.",
      errorNoStorage: "Stockage local non disponible (documentDirectory).",
      errorRead: "Impossible de lire la bibliothèque locale.",
      errorPermission: "Permission perdue. Veuillez reconfigurer le dossier dans les paramètres.",
      note: "Récupération des fichiers locaux…",
      deleteConfirmTitle: "Supprimer le fichier ?",
      deleteConfirmMsg: "Voulez-vous vraiment supprimer {name} ? Cette action est irréversible.",
      loading: "Chargement...",
      statsFiles: "Fichiers",
      statsTotal: "Total",
    },
    reader: {
      back: "Retour",
      loading: "Chargement du lecteur...",
      unsupported: "Le lecteur intégré ne supporte actuellement que les PDFs locaux.",
      return: "Retour",
      openExternal: "Ouvrir avec une app externe",
      externalError: "Erreur",
      noAppAvailable: "Aucune application PDF disponible",
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
      emptySubtitle: "Lance un téléchargement depuis l'onglet Accueil.",
      actionPause: "Pause",
      actionCancel: "Annuler",
      actionResume: "Reprendre",
      actionRetry: "Réessayer",
      clearList: "Vider la liste",
      errorNoFolder: "Configurez un dossier de téléchargement dans les paramètres",
    },
    settings: {
      connectionTitle: "Connexion VK",
      connectionSubtitle: "Renseigne tes identifiants",
      tokenLabel: "Access token",
      tokenHint: "Cliquez ici pour obtenir votre token VK",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Préférences",
      prefsSubtitle: "Personnalisation",
      downloadFolderLabel: "Dossier de téléchargement",
      languageLabel: "Langue",
      resetGroupDefaults: "Rétablir les valeurs par défaut",
      autoSyncLabel: "Sync automatique",
      autoSyncHint: "Lance la synchro au démarrage",
      themeLabel: "Thème Visuel",
      themeDark: "Sombre",
      themeOled: "Tokyo Night",
      maintenanceTitle: "Maintenance",
      maintenanceSubtitle: "Cache & données",
      resetLibrary: "Réinitialiser la bibliothèque",
      clearCache: "Effacer le cache",
      resetDatabase: "Réinitialiser la base de données",
      resetDatabaseDescription: "Supprime l'index et les fichiers téléchargés",
      save: "Sauvegarder",
      saved: "Enregistré !",
      headerSubtitle: "Configuration de l'application",
    },
    browser: {
      searchPlaceholder: "Rechercher…",
      sync: "Synchroniser",
      syncing: "Synchronisation…",
      syncAll: "Tout synchroniser",
      back: "Retour",
      home: "Accueil",
      download: "Télécharger",
      open: "Ouvrir",
      noTokenTitle: "Token VK manquant",
      noTokenSubtitle: "Renseigne ton token dans Paramètres pour accéder à VK.",
      goSettings: "Aller aux paramètres",
      emptyTitle: "Bibliothèque vide",
      emptySubtitle: "Synchronise l'index VK pour afficher les dossiers et fichiers.",
      searchEmptyTitle: "Aucun résultat",
      searchEmptySubtitle: "Aucun contenu ne correspond à ta recherche.",
      searchIndexHint: "Index partiel : lance « Tout synchroniser » pour une recherche complète.",
      loading: "Chargement…",
      errorNoToken: "Configure un token VK dans Paramètres.",
      errorSync: "Impossible de synchroniser (VK API).",
      errorLoad: "Impossible de charger le contenu.",
      errorNoUrl: "Ce fichier n'a pas d'URL de téléchargement.",
      results: "résultat(s)",
      setupStep1: "1. Allez dans les Paramètres",
      setupStep2: "2. Cliquez sur le bouton d'obtention de token",
      setupStep3: "3. Copiez le token (URL) et collez-le ici",
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
      statsInProgress: "In progress",
      quickTitle: "Quick actions",
      quickSubtitle: "Most used shortcuts",
      openLibrary: "Open library",
      openDownloads: "Open downloads",
      latestTitle: "Latest series",
      latestSubtitle: "Quick preview",
    },
    library: {
      title: "Library",
      subtitle: "Your local downloads.",
      folderTitle: "Local files",
      folderSubtitle: "Your downloads",
      recentTitle: "Recent files",
      recentSubtitle: "Placeholder",
      refresh: "Refresh",
      empty: "No files yet.",
      errorNoStorage: "Local storage unavailable.",
      errorRead: "Unable to read local library.",
      errorPermission: "Permission lost. Please reconfigure the folder in settings.",
      note: "Fetching local files…",
      deleteConfirmTitle: "Delete file?",
      deleteConfirmMsg: "Are you sure you want to delete {name}? This action cannot be undone.",
      loading: "Loading...",
      statsFiles: "Files",
      statsTotal: "Total",
    },
    reader: {
      back: "Back",
      loading: "Loading reader...",
      unsupported: "The integrated reader currently only supports local PDFs.",
      return: "Return",
      openExternal: "Open with external app",
      externalError: "Error",
      noAppAvailable: "No PDF app available",
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
      errorNoFolder: "Configure a download folder in settings",
    },
    settings: {
      connectionTitle: "VK connection",
      connectionSubtitle: "Enter your credentials",
      tokenLabel: "Access token",
      tokenHint: "Click here to get your VK token",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Preferences",
      prefsSubtitle: "Customization",
      downloadFolderLabel: "Download folder",
      languageLabel: "Language",
      resetGroupDefaults: "Reset default values",
      autoSyncLabel: "Auto sync",
      autoSyncHint: "Sync index on startup",
      themeLabel: "Visual Theme",
      themeDark: "Dark",
      themeOled: "Tokyo Night",
      maintenanceTitle: "Maintenance",
      maintenanceSubtitle: "Cache & data",
      resetLibrary: "Reset local library",
      clearCache: "Clear cache",
      resetDatabase: "Reset database",
      resetDatabaseDescription: "Deletes index and downloaded files",
      save: "Save",
      saved: "Saved!",
      headerSubtitle: "Application settings",
    },
    browser: {
      searchPlaceholder: "Search…",
      sync: "Sync",
      syncing: "Syncing…",
      syncAll: "Sync All",
      back: "Back",
      home: "Home",
      download: "Download",
      open: "Open",
      noTokenTitle: "Missing VK token",
      noTokenSubtitle: "Set your token in Settings to access VK.",
      goSettings: "Go to settings",
      emptyTitle: "Empty library",
      emptySubtitle: "Sync the VK index to display folders and files.",
      searchEmptyTitle: "No results",
      searchEmptySubtitle: "No content matches your search.",
      searchIndexHint: "Partial index: run “Sync all” for complete search.",
      loading: "Loading…",
      errorNoToken: "Set a VK token in Settings.",
      errorSync: "Sync failed (VK API).",
      errorLoad: "Unable to load content.",
      errorNoUrl: "This file has no download URL.",
      results: "results",
      setupStep1: "1. Go to Settings",
      setupStep2: "2. Click on the get token button",
      setupStep3: "3. Copy the token (URL) and paste it here",
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
      statsInProgress: "В процессе",
      quickTitle: "Быстрые действия",
      quickSubtitle: "Часто используемые",
      openLibrary: "Открыть библиотеку",
      openDownloads: "Открыть загрузки",
      latestTitle: "Последние серии",
      latestSubtitle: "Быстрый просмотр",
    },
    library: {
      title: "Библиотека",
      subtitle: "Локальные загрузки.",
      folderTitle: "Локальные файлы",
      folderSubtitle: "Ваши загрузки",
      recentTitle: "Последние файлы",
      recentSubtitle: "Заглушка",
      refresh: "Обновить",
      empty: "Файлов пока нет.",
      errorNoStorage: "Локальное хранилище недоступно.",
      errorRead: "Не удалось прочитать локальную библиотеку.",
      errorPermission: "Разрешение утрачено. Пожалуйста, перенастройте папку в настройках.",
      note: "Получение локальных файлов…",
      deleteConfirmTitle: "Удалить файл?",
      deleteConfirmMsg: "Вы уверены, что хотите удалить {name}? Это действие необратимо.",
      loading: "Загрузка...",
      statsFiles: "Файлы",
      statsTotal: "Всего",
    },
    reader: {
      back: "Назад",
      loading: "Загрузка читалки...",
      unsupported: "Встроенный ридер в данный момент поддерживает только локальные PDF.",
      return: "Вернуться",
      openExternal: "Открыть во внешнем приложении",
      externalError: "Ошибка",
      noAppAvailable: "Нет приложения для PDF",
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
      errorNoFolder: "Настройте папку загрузок в настройках",
    },
    settings: {
      connectionTitle: "Подключение VK",
      connectionSubtitle: "Введите данные",
      tokenLabel: "Access token",
      tokenHint: "Нажмите здесь, чтобы получить токен VK",
      groupLabel: "Group ID",
      topicLabel: "Topic ID",
      prefsTitle: "Настройки",
      prefsSubtitle: "Персонализация",
      downloadFolderLabel: "Папка загрузок",
      languageLabel: "Язык",
      resetGroupDefaults: "Сбросить значения по умолчанию",
      autoSyncLabel: "Автосинхронизация",
      autoSyncHint: "Синхронизация при старте",
      themeLabel: "Тема оформления",
      themeDark: "Темная",
      themeOled: "Tokyo Night",
      maintenanceTitle: "Обслуживание",
      maintenanceSubtitle: "Кэш и данные",
      resetLibrary: "Сбросить локальную библиотеку",
      clearCache: "Очистить кэш",
      resetDatabase: "Сбросить базу данных",
      resetDatabaseDescription: "Удаляет индекс и загруженные файлы",
      save: "Сохранить",
      saved: "Сохранено!",
      headerSubtitle: "Настройки приложения",
    },
    browser: {
      searchPlaceholder: "Поиск…",
      sync: "Синхронизировать",
      syncing: "Синхронизация…",
      syncAll: "Синхронизировать всё",
      back: "Назад",
      home: "Главная",
      download: "Скачать",
      open: "Открыть",
      noTokenTitle: "Нет токена VK",
      noTokenSubtitle: "Укажите токен в настройках, чтобы получить доступ к VK.",
      goSettings: "Открыть настройки",
      emptyTitle: "Библиотека пуста",
      emptySubtitle: "Синхронизируйте индекс VK, чтобы увидеть папки и файлы.",
      searchEmptyTitle: "Ничего не найдено",
      searchEmptySubtitle: "По вашему запросу ничего не найдено.",
      searchIndexHint: "Индекс частичный: запусти «Полную синхронизацию» для полного поиска.",
      loading: "Загрузка…",
      errorNoToken: "Укажите токен VK в настройках.",
      errorSync: "Не удалось синхронизировать (VK API).",
      errorLoad: "Не удалось загрузить содержимое.",
      errorNoUrl: "У этого файла нет URL для скачивания.",
      results: "результат(ов)",
      setupStep1: "1. Перейдите в настройки",
      setupStep2: "2. Нажмите кнопку получения токена",
      setupStep3: "3. Скопируйте токен (URL) и вставьте его сюда",
    },
  },
};

export const getT = (language: Language): Translations =>
  translations[language] ?? translations.fr;
