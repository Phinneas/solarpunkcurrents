/**
 * Pexels image search for newsletter hero images.
 * Searches Pexels for a landscape photo matching the subject line
 * and returns the CDN URL + attribution info.
 */

import { log } from "../logger.js";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const FALLBACK_QUERY = "solar energy renewable";

export interface HeroImage {
  url: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

/**
 * Search Pexels for a hero image matching the newsletter subject line.
 * Falls back to a generic solar energy query if the subject line yields no results.
 * Returns null if the API key is missing or no images are found.
 */
export async function searchHeroImage(
  subjectLine: string,
  apiKey?: string
): Promise<HeroImage | null> {
  const key = apiKey || process.env?.PEXELS_API_KEY || "";
  if (!key) {
    log.warn("No Pexels API key, skipping hero image");
    return null;
  }

  // Try the subject line first, fall back to generic query
  for (const query of [subjectLine, FALLBACK_QUERY]) {
    const result = await searchPexels(query, key);
    if (result) return result;
  }

  log.warn("No hero image found on Pexels");
  return null;
}

async function searchPexels(query: string, apiKey: string): Promise<HeroImage | null> {
  try {
    const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.debug(`Pexels HTTP error`, { status: response.status, query });
      return null;
    }

    const data = (await response.json()) as {
      photos?: Array<{
        src: { landscape: string; large: string; large2x: string };
        alt: string;
        photographer: string;
        photographer_url: string;
        url: string;
      }>;
    };

    const photo = data.photos?.[0];
    if (!photo) {
      log.debug(`Pexels returned no photos`, { query });
      return null;
    }

    // Use large2x for retina displays (940x650 DPR2), fall back to landscape (1200x627)
    const imageUrl = photo.src.large2x || photo.src.landscape || photo.src.large;

    return {
      url: imageUrl,
      alt: photo.alt || query,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      pexelsUrl: photo.url,
    };
  } catch (err) {
    log.debug(`Pexels search error`, { error: err instanceof Error ? err.message : String(err), query });
    return null;
  }
}
