export const palette = {
  background: "#0B1222",
  surface: "#10192D",
  card: "#131926",
  border: "#1e293b",
  primary: "#2563eb",
  primaryBright: "#3b82f6",
  text: "#e2e8f0",
  muted: "#94a3b8",
  subtle: "#64748b",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#f43f5e",
};

export const paletteComics = {
  // Comics BD français: fond clair papier + ligne claire
  background: "#F5F1E8",      // Crème papier journal
  surface: "#FFFFFF",          // Blanc pur pour les cartes
  card: "#FFFEF9",            // Blanc chaud
  border: "#1a1a1a",          // Noir quasi-pur pour bordures BD
  primary: "#DC2626",         // Rouge vif BD
  primaryBright: "#EF4444",   // Rouge plus clair
  text: "#0a0a0a",            // Noir profond pour texte (contraste manga)
  muted: "#4a4a4a",           // Gris moyen
  subtle: "#5a5a5a",           // Gris foncé pour meilleur contraste sur crème
  success: "#16A34A",         // Vert franc
  warning: "#F59E0B",         // Ambre vif
  danger: "#DC2626",          // Rouge (même que primary)
};

// Petites constantes de design pour garder une UI cohérente entre écrans.
export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// Radius Comics - plus arrondis pour effet cartoon BD
export const radiusComics = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

// Bordures noires épaisses pour le style BD (ligne claire)
export const comicsBorder = {
  width: 2.5,
  color: "#1a1a1a",
  style: "solid" as const,
};

// Styles "dessinés à la main" pour casser l'aspect numérique
export const handDrawn = {
  icon: {
    transform: [{ rotate: "-2deg" }], // Légère inclinaison
  },
  card: {
    transform: [{ rotate: "0.5deg" }], // Très léger décalage pour les cartes
  },
  text: {
    letterSpacing: -0.5, // Pour un effet plus compact style lettrage à la main
  }
};


export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

// Ombres décalées style BD (ligne claire) - effet comic book
export const comicsShadow = {
  // iOS shadow
  shadowColor: "#1a1a1a",
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0, // Pas de blur = ombre nette style BD
  elevation: 0,
};

// Alternative Android (pas de support shadow nette, utiliser bordures)
export const comicsShadowAndroid = {
  borderRightWidth: 3,
  borderBottomWidth: 3,
  borderRightColor: "#1a1a1a",
  borderBottomColor: "#1a1a1a",
};

// Accents par onglet - sobres et luxueux
export const tabAccents = {
  home: {
    // Bleu profond - exploration, navigation
    accent: "#3b82f6",
    accentBright: "#60a5fa",
    accentMuted: "#1e40af",
    gradient: ["#1e3a5f", "#0f172a"] as [string, string],
    gradientBright: ["#3b82f620", "#1e40af10"] as [string, string],
  },
  library: {
    // Ambre/Or chaud - collection précieuse
    accent: "#d97706",
    accentBright: "#f59e0b",
    accentMuted: "#92400e",
    gradient: ["#451a03", "#0f172a"] as [string, string],
    gradientBright: ["#f59e0b20", "#92400e10"] as [string, string],
  },
  downloads: {
    // Teal/Deep Sea - vitesse, flux, modernite
    accent: "#14b8a6",
    accentBright: "#2dd4bf",
    accentMuted: "#0f766e",
    gradient: ["#042f2e", "#0f172a"] as [string, string],
    gradientBright: ["#14b8a620", "#0f766e10"] as [string, string],
  },
  settings: {
    // Violet/Lavande - élégance, sophistication
    accent: "#8b5cf6",
    accentBright: "#a78bfa",
    accentMuted: "#5b21b6",
    gradient: ["#2e1065", "#0f172a"] as [string, string],
    gradientBright: ["#8b5cf620", "#5b21b610"] as [string, string],
  },
};

// Accents Comics BD - couleurs franches sur fond clair
export const tabAccentsComics = {
  home: {
    // Bleu BD classique (Tintin)
    accent: "#2563EB",
    accentBright: "#3B82F6",
    accentMuted: "#1E40AF",
    gradient: ["#DBEAFE", "#BFDBFE"] as [string, string],
    gradientBright: ["#EFF6FF", "#DBEAFE"] as [string, string],
  },
  library: {
    // Orange chaud BD (Spirou)
    accent: "#EA580C",
    accentBright: "#F97316",
    accentMuted: "#C2410C",
    gradient: ["#FFEDD5", "#FED7AA"] as [string, string],
    gradientBright: ["#FFF7ED", "#FFEDD5"] as [string, string],
  },
  downloads: {
    // Turquoise BD - energie et fluidite
    accent: "#0891B2",
    accentBright: "#22D3EE",
    accentMuted: "#0E7490",
    gradient: ["#CFFAFE", "#A5F3FC"] as [string, string],
    gradientBright: ["#ECFEFF", "#CFFAFE"] as [string, string],
  },
  settings: {
    // Violet royal BD (Lucky Luke)
    accent: "#7C3AED",
    accentBright: "#8B5CF6",
    accentMuted: "#6D28D9",
    gradient: ["#EDE9FE", "#DDD6FE"] as [string, string],
    gradientBright: ["#F5F3FF", "#EDE9FE"] as [string, string],
  },
};
