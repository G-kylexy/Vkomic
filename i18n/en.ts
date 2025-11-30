import { Translations } from './fr';

export const en: Translations = {
    // Navigation
    nav: {
        home: 'Home',
        downloads: 'Downloads',
        library: 'Library',
        settings: 'Settings',
    },

    // TopBar
    topbar: {
        searchPlaceholder: 'Search...',
    },

    // Sidebar status
    sidebar: {
        connected: 'Connected',
        disconnected: 'Disconnected',
        latency: 'Latency',
        lastSync: 'Last sync',
        connectedToVK: 'Connected to VK',
        region: 'Region',
    },

    // Settings
    settings: {
        title: 'Settings',
        subtitle: 'Application and VK connection configuration',

        // VK Connection
        vkConnection: 'VK Connection',
        accessToken: 'Access Token',
        tokenHelper: 'To get a VK token (Kate Mobile),',
        clickHere: 'click here',
        tokenInstructions: ', you must copy the text between',
        and: 'and',
        groupId: 'Group ID',
        topicId: 'Topic ID',
        resetGroupDefaults: 'Reset to default group/topic',

        // General Preferences
        generalPreferences: 'General Preferences',
        language: 'Interface Language',
        downloadFolder: 'Download Folder',
        browse: 'Browse',
        folderDialogWarning: 'Folder selection is only available in the desktop app. Please enter the path manually.',

        // Save button
        saveAll: 'Save',
        saved: 'Changes Saved',
    },

    // Library
    library: {
        empty: 'Empty Library',
        emptyDescription: 'Sync the app with VK index to access comics.',
        syncButton: 'Sync from VK',
        syncing: 'Syncing...',
        searching: 'Searching inside this folder...',
        noResults: 'This folder is empty or nothing matches your search.',
        localTitle: 'Local Library',
        noDownloadPath: 'Choose a download folder in Settings to browse your files here.',
        desktopOnly: 'Local browsing is only available inside the desktop application.',
        readError: 'Unable to read this folder. Please verify the selected path.',
        loading: 'Loading your library...',
        back: 'Parent folder',
        refresh: 'Refresh',
        rootLabel: 'Downloads',
        folderLabel: 'Folder',
        fileLabel: 'File',
        size: 'Size',
        modified: 'Modified',
        openFolder: 'Open folder',
        openFile: 'Open file',
        downloadFile: 'Download',
        downloadAll: 'Download All',
        cancelAll: 'Cancel All',
        emptyFolder: 'This folder is empty.',
    },

    // Downloads
    downloads: {
        title: 'Downloads',
        overviewTitle: 'Overview',
        statsIndexed: 'INDEXED SERIES',
        statsDownloaded: 'VOLUMES DOWNLOADED',
        statsInProgress: 'IN PROGRESS',
        tableSeries: 'Series',
        tableVolume: 'Volume',
        tableStatus: 'Status',
        tableDate: 'Date',
        tableSize: 'Size',
        tableActions: 'Actions',
        completed: 'Downloaded',
        canceled: 'Canceled',
        redownload: 'Redownload',
        noDownloads: 'No downloads yet',
        noDownloadsDescription: 'Your download history will appear here.',
    },

    // Languages
    languages: {
        fr: 'Français',
        en: 'English',
    },
};
