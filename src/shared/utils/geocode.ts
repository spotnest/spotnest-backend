import { AppError } from "../errors/AppError.js";

export interface GeocodeResult {
    lat: number;
    lng: number;
    displayName: string; // what the provider matched, shown back to the user for confirmation
}

// Simple in-process cache. Place names repeat heavily ("Calicut", "Kochi"),
// and Nominatim allows only ~1 request/second, so this matters more than the
// hit rate alone suggests. Resets on restart and isn't shared across instances —
// fine at this scale, revisit if you run multiple app servers.
const cache = new Map<string, { result: GeocodeResult | null; at: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const geocode = async (query: string): Promise<GeocodeResult | null> => {
    const key = query.trim().toLowerCase();

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.result;
    }

    const userAgent = process.env.GEOCODER_USER_AGENT;
    if (!userAgent) {
        // Missing runtime config is a server problem, not the user's input —
        // surface the same "try again" path the rest of this module uses for
        // a down provider rather than leaking a generic 500.
        throw new AppError(503, "Location lookup is temporarily unavailable. Please try again.");
    }

    // PRODUCTION SWAP POINT: replace this block with LocationIQ or OpenCage.
    // Same OSM data, near-identical response shape, proper rate limits and SLA.
    // Nominatim's usage policy forbids production traffic.
    const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;

    let result: GeocodeResult | null = null;
    try {
        const res = await fetch(url, { headers: { "User-Agent": userAgent } });
        if (!res.ok) {
            throw new Error(`Geocoder responded ${res.status}`);
        }
        const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
        const first = data[0];
        if (first) {
            result = {
                lat: parseFloat(first.lat),
                lng: parseFloat(first.lon), // provider calls it "lon"; GeoJSON wants it FIRST
                displayName: first.display_name,
            };
        }
    } catch (err) {
        console.error("[GEOCODE_FAILED]", query, err);
        // Distinguish "provider is down" from "no such place" — never tell a
        // user their valid address doesn't exist because OSM had a bad minute.
        throw new AppError(503, "Location lookup is temporarily unavailable. Please try again.");
    }

    cache.set(key, { result, at: Date.now() });
    return result;
};