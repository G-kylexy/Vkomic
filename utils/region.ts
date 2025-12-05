/**
 * Region detection utilities for the VKomic application.
 * Used to display user-friendly region names based on timezone.
 */

// City lists for region detection
const EAST_EUROPE_CITIES = [
    "moscow", "kiev", "kyiv", "bucharest", "sofia", "warsaw", "prague",
    "budapest", "minsk", "tallinn", "riga", "vilnius", "helsinki", "athens", "istanbul"
];

const NORTH_EUROPE_CITIES = ["stockholm", "oslo", "copenhagen", "reykjavik"];

const SOUTH_AMERICA_CITIES = [
    "argentina", "sao_paulo", "santiago", "buenos_aires", "lima",
    "bogota", "caracas", "montevideo", "asuncion", "la_paz"
];

const CENTRAL_AMERICA_CITIES = ["mexico", "guatemala", "panama", "costa_rica", "managua"];

const EAST_ASIA_CITIES = ["tokyo", "seoul", "shanghai", "beijing", "hong_kong", "taipei"];

const SOUTHEAST_ASIA_CITIES = [
    "singapore", "bangkok", "manila", "jakarta", "kuala_lumpur", "ho_chi_minh", "hanoi"
];

const SOUTH_ASIA_CITIES = ["kolkata", "delhi", "mumbai", "dhaka", "karachi", "colombo"];

const CENTRAL_ASIA_CITIES = ["almaty", "tashkent", "bishkek"];

const MIDDLE_EAST_CITIES = [
    "dubai", "riyadh", "baghdad", "tehran", "jerusalem", "beirut", "damascus", "amman", "kuwait", "doha"
];

const NORTH_AFRICA_CITIES = ["cairo", "algiers", "tunis", "tripoli", "casablanca"];

const WEST_AFRICA_CITIES = ["lagos", "accra", "dakar", "abidjan"];

const EAST_AFRICA_CITIES = ["nairobi", "addis_ababa", "dar_es_salaam", "kampala"];

const SOUTH_AFRICA_CITIES = ["johannesburg", "cape_town", "maputo", "lusaka"];

/**
 * Detect detailed region name from timezone string.
 * @param timezone - Timezone string (e.g., "Europe/Paris")
 * @param language - Language code for localization ("fr" | "en")
 * @returns Human-readable region name
 */
export const detectDetailedRegion = (
    timezone?: string | null,
    language: string = "en"
): string => {
    if (!timezone) return "--";

    const tz = timezone.toLowerCase();
    const isFr = language === "fr";

    // Europe
    if (tz.startsWith("europe/")) {
        if (EAST_EUROPE_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Europe de l'Est" : "Eastern Europe";
        }
        if (NORTH_EUROPE_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Europe du Nord" : "Northern Europe";
        }
        return isFr ? "Europe de l'Ouest" : "Western Europe";
    }

    // America
    if (tz.startsWith("america/")) {
        if (SOUTH_AMERICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Amérique du Sud" : "South America";
        }
        if (CENTRAL_AMERICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Amérique Centrale" : "Central America";
        }
        return isFr ? "Amérique du Nord" : "North America";
    }

    // Asia
    if (tz.startsWith("asia/")) {
        if (EAST_ASIA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Asie de l'Est" : "East Asia";
        }
        if (SOUTHEAST_ASIA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Asie du Sud-Est" : "Southeast Asia";
        }
        if (SOUTH_ASIA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Asie du Sud" : "South Asia";
        }
        if (CENTRAL_ASIA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Asie Centrale" : "Central Asia";
        }
        if (MIDDLE_EAST_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Moyen-Orient" : "Middle East";
        }
        return isFr ? "Asie" : "Asia";
    }

    // Africa
    if (tz.startsWith("africa/")) {
        if (NORTH_AFRICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Afrique du Nord" : "North Africa";
        }
        if (WEST_AFRICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Afrique de l'Ouest" : "West Africa";
        }
        if (EAST_AFRICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Afrique de l'Est" : "East Africa";
        }
        if (SOUTH_AFRICA_CITIES.some((city) => tz.includes(city))) {
            return isFr ? "Afrique Australe" : "Southern Africa";
        }
        return isFr ? "Afrique" : "Africa";
    }

    // Oceania
    if (tz.startsWith("pacific/") || tz.startsWith("australia/")) {
        return isFr ? "Océanie" : "Oceania";
    }

    // Atlantic (Western Europe)
    if (tz.startsWith("atlantic/")) {
        return isFr ? "Europe de l'Ouest" : "Western Europe";
    }

    return "--";
};

/**
 * Map timezone prefix to simplified region name.
 * Used for VK connection status.
 * @param value - Timezone string
 * @returns Simplified region name or null
 */
export const mapRegion = (value: string | null): string | null => {
    if (!value) return null;
    const lower = value.toLowerCase();

    if (lower.startsWith("europe/")) return "Europe";
    if (lower.startsWith("asia/")) return "Asia";
    if (lower.startsWith("america/")) return "Americas";
    if (lower.startsWith("africa/")) return "Africa";
    if (lower.startsWith("pacific/") || lower.startsWith("australia/")) return "Oceania";
    if (lower.startsWith("atlantic/")) return "Atlantic";

    return value; // Return original if no match
};
