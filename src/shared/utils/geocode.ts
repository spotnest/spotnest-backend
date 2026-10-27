import { AppError } from "../errors/AppError.js";

export interface GeocodeResult {
    lat: number;
    lng: number;
    displayName: string; // what the provider matched, shown back to the user for confirmation
}


export type PlaceSuggestion = GeocodeResult;


export interface GeoBias {
    lat: number;
    lng: number;
}


const cache = new Map<string, { result: GeocodeResult | null; at: number }>();
const suggestCache = new Map<string, { results: PlaceSuggestion[]; at: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const requireUserAgent = (): string => {
    const userAgent = process.env.GEOCODER_USER_AGENT;
    if (!userAgent) {
        // Missing runtime config is a server problem, not the user's input.
        console.error("[GEOCODE_CONFIG] GEOCODER_USER_AGENT is not configured");
        throw new AppError(503, "Location lookup is temporarily unavailable. Please try again.");
    }
    return userAgent;
};


const searchNominatim = async (
    query: string,
    limit: number
): Promise<PlaceSuggestion[]> => {
    const userAgent = requireUserAgent();

    const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(query)}&format=json` +
        `&limit=${limit}&countrycodes=in`;

    let rows: { lat: string; lon: string; display_name: string }[];
    try {
        const res = await fetch(url, { headers: { "User-Agent": userAgent } });
        if (!res.ok) {
            throw new Error(`Geocoder responded ${res.status}`);
        }
        rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    } catch (err) {
        console.error("[GEOCODE_FAILED]", query, err);
        // Distinguish "provider is down" from "no such place" — never tell a
        // user their valid address doesn't exist because OSM had a bad minute.
        throw new AppError(503, "Location lookup is temporarily unavailable. Please try again.");
    }

    return rows.map((row) => ({
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lon), // provider calls it "lon"; GeoJSON wants it FIRST
        displayName: row.display_name,
    }));
};

export const geocode = async (query: string): Promise<GeocodeResult | null> => {
    const key = query.trim().toLowerCase();

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.result;
    }

    const results = await searchNominatim(query, 1);
    const result = results[0] ?? null;

    cache.set(key, { result, at: Date.now() });
    return result;
};

// -----------------------------------------------------
// TYPEAHEAD
// -----------------------------------------------------

interface PhotonProperties {
    name?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
}

interface PhotonFeature {
    geometry?: { coordinates?: number[] };
    properties?: PhotonProperties;
}


const toDisplayName = (properties: PhotonProperties): string | null => {
    const parts = [properties.name, properties.district, properties.city, properties.state, properties.country]
        .map((part) => part?.trim())
        .filter((part): part is string => !!part)
        .filter(
            (part, index, all) =>
                all.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index
        );

    if (parts.length === 0) return null;
    return parts.join(", ");
};


export const suggestPlaces = async (
    query: string,
    limit = 5,
    bias?: GeoBias
): Promise<PlaceSuggestion[]> => {
    const trimmed = query.trim();
    const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : "-";
    const key = `${limit}:${biasKey}:${trimmed.toLowerCase()}`;

    const cached = suggestCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.results;
    }

    const params = new URLSearchParams({
        q: trimmed,
        // A couple spare rows: Photon occasionally returns the same place from
        // two OSM nodes, and we drop those below.
        limit: String(limit + 2),
        lang: "en",
        countrycode: "in",
    });
    if (bias) {
        params.set("lat", String(bias.lat));
        params.set("lon", String(bias.lng));
    }

    const userAgent = process.env.GEOCODER_USER_AGENT ?? "SpotNest";

    let rows: PhotonFeature[];
    try {
        const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
            headers: { "User-Agent": userAgent },
        });
        if (!res.ok) {
            throw new Error(`Photon responded ${res.status}`);
        }
        const body = (await res.json()) as { features?: PhotonFeature[] };
        rows = body.features ?? [];
    } catch (err) {
        console.error("[SUGGEST_FAILED]", trimmed, err);
        // Typeahead must never block typing: the caller treats a failure as
        // "no suggestions" and the input stays fully usable.
        throw new AppError(503, "Location suggestions are temporarily unavailable.");
    }

    const results: PlaceSuggestion[] = [];
    for (const row of rows) {
        const coordinates = row.geometry?.coordinates;
        if (!row.properties || !coordinates) continue;

        const [lng, lat] = coordinates;
        if (typeof lng !== "number" || typeof lat !== "number") continue;

        const displayName = toDisplayName(row.properties);
        if (!displayName) continue;

        results.push({
            lat,
            lng, // GeoJSON order is [lng, lat]
            displayName,
        });
    }

    // Two OSM nodes can share one name ("Manikoth Housing Colony" twice) —
    // a repeated row in a 5-item list just looks broken.
    const deduped = results.filter(
        (row, index, all) =>
            all.findIndex(
                (other) =>
                    other.displayName.toLowerCase() === row.displayName.toLowerCase()
            ) === index
    );

    const final = deduped.slice(0, limit);

    suggestCache.set(key, { results: final, at: Date.now() });
    return final;
};
