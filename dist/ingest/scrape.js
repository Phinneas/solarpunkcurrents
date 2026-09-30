/**
 * Multi-tier web scraping with automatic fallbacks:
 * 1. Jina Reader (primary) - free, no API key, returns markdown
 * 2. Parallel Extract (secondary) - cheap ($1/1000 URLs), handles JS pages + PDFs
 * 3. Native fetch + HTML extraction (fallback) - works everywhere
 * 4. Return null (final)
 */
import { log } from "../logger.js";
const MAX_TIMEOUT_MS = 30000; // 30 seconds max per scrape
const JINA_READER_URL = "https://r.jina.ai/";
const PARALLEL_EXTRACT_URL = "https://api.parallel.ai/v1/extract";
/**
 * Scrape a URL using multiple fallback strategies.
 * The apiKey parameter is expected to be a Parallel API key.
 * Returns null if all methods fail.
 */
export async function scrapeUrl(url, apiKey) {
    // Tier 1: Jina Reader (free, returns clean markdown)
    const jinaResult = await tryJinaReader(url);
    if (jinaResult) {
        log.debug(`Jina Reader success`, { url });
        return jinaResult;
    }
    log.warn(`Jina Reader failed, trying Parallel Extract`, { url });
    // Tier 2: Parallel Extract (cheap, handles JS pages + PDFs)
    if (apiKey) {
        const parallelResult = await tryParallelExtract(url, apiKey);
        if (parallelResult) {
            log.debug(`Parallel Extract success`, { url });
            return parallelResult;
        }
        log.warn(`Parallel Extract failed, trying native fetch`, { url });
    }
    else {
        log.warn(`No Parallel API key, trying native fetch`, { url });
    }
    // Tier 3: Native HTML fetch + extraction (free)
    const nativeResult = await tryNativeFetch(url);
    if (nativeResult) {
        log.debug(`Native fetch success`, { url });
        return nativeResult;
    }
    log.warn(`All scraping methods failed`, { url });
    return null;
}
/**
 * Jina Reader - Free URL-to-markdown service.
 * Simply prefix any URL with https://r.jina.ai/ to get markdown.
 * No API key required, works for most content.
 */
async function tryJinaReader(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
        const response = await fetch(`${JINA_READER_URL}${encodeURIComponent(url)}`, {
            method: "GET",
            headers: {
                "Accept": "text/markdown",
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            log.debug(`Jina Reader HTTP error`, { status: response.status, url });
            return null;
        }
        const markdown = await response.text();
        if (!markdown || markdown.length < 100) {
            log.debug(`Jina Reader returned empty/short content`, { length: markdown?.length ?? 0, url });
            return null;
        }
        const titleMatch = markdown.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : extractTitleFromUrl(url);
        const imageUrls = extractImageUrls(markdown);
        return {
            content: markdown,
            mainContentImageUrls: imageUrls,
            rawHtml: "",
            links: extractLinks(markdown),
            metadata: {
                url,
                title,
            },
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.debug(`Jina Reader error`, { error: errorMsg, url });
        return null;
    }
}
/**
 * Parallel Extract API - converts any URL to clean markdown.
 * Handles JavaScript-rendered pages and PDFs.
 * Cost: $1 per 1,000 URLs.
 */
async function tryParallelExtract(url, apiKey) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
        const response = await fetch(PARALLEL_EXTRACT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
            },
            body: JSON.stringify({
                urls: [url],
                advanced_settings: {
                    full_content: true,
                },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            log.debug(`Parallel Extract HTTP error`, { status: response.status, url });
            return null;
        }
        const data = (await response.json());
        const result = data.results?.[0];
        if (!result) {
            log.debug(`Parallel Extract returned no results`, { url, errors: data.errors });
            return null;
        }
        // Prefer full_content, fall back to joined excerpts
        const content = result.full_content ?? (result.excerpts?.join("\n\n") ?? "");
        if (!content || content.length < 100) {
            log.debug(`Parallel Extract returned empty/short content`, { length: content?.length ?? 0, url });
            return null;
        }
        const title = result.title ?? extractTitleFromUrl(url);
        const imageUrls = extractImageUrls(content);
        const links = extractLinks(content);
        return {
            content,
            mainContentImageUrls: imageUrls,
            rawHtml: "",
            links,
            metadata: {
                url,
                title,
            },
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.debug(`Parallel Extract error`, { error: errorMsg, url });
        return null;
    }
}
/**
 * Native fetch + HTML extraction fallback.
 * Fetches the raw HTML and extracts main content using simple heuristics.
 * Works in both Node.js and Cloudflare Workers.
 */
async function tryNativeFetch(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SolarpunkCurrents-Bot/1.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
            log.debug(`Native fetch HTTP error`, { status: response.status, url });
            return null;
        }
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
            log.debug(`Native fetch non-HTML content`, { contentType, url });
            return null;
        }
        const html = await response.text();
        if (!html || html.length < 500) {
            log.debug(`Native fetch returned empty/short HTML`, { length: html?.length ?? 0, url });
            return null;
        }
        const { content, title, imageUrls } = extractFromHtml(html, url);
        if (!content || content.length < 100) {
            log.debug(`HTML extraction returned empty/short content`, { length: content?.length ?? 0, url });
            return null;
        }
        return {
            content,
            mainContentImageUrls: imageUrls,
            rawHtml: html,
            links: extractLinksFromHtml(html),
            metadata: {
                url,
                title,
            },
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.debug(`Native fetch error`, { error: errorMsg, url });
        return null;
    }
}
/**
 * Extract main content from HTML using lightweight regex-based parsing.
 * No external dependencies - works in Workers.
 */
function extractFromHtml(html, url) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? decodeHtml(titleMatch[1].trim()) : extractTitleFromUrl(url);
    let content = "";
    // Priority 1: Look for <article> tags
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
        content = articleMatch[1];
    }
    // Priority 2: Look for main content divs with common class names
    if (!content) {
        const mainPatterns = [
            /<main[^>]*>([\s\S]*?)<\/main>/i,
            /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<section[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
        ];
        for (const pattern of mainPatterns) {
            const match = html.match(pattern);
            if (match && match[1].length > 500) {
                content = match[1];
                break;
            }
        }
    }
    // Priority 3: Just use body content
    if (!content) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            content = bodyMatch[1];
        }
    }
    content = htmlToMarkdown(content);
    const imageUrls = extractImageUrlsFromHtml(html, url);
    return { content, title, imageUrls };
}
/**
 * Convert HTML to markdown using regex replacements.
 * Lightweight, no dependencies.
 */
function htmlToMarkdown(html) {
    let md = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "");
    md = md
        .replace(/<h1[^>]*>([^<]+)<\/h1>/gi, "# $1\n\n")
        .replace(/<h2[^>]*>([^<]+)<\/h2>/gi, "## $1\n\n")
        .replace(/<h3[^>]*>([^<]+)<\/h3>/gi, "### $1\n\n")
        .replace(/<h4[^>]*>([^<]+)<\/h4>/gi, "#### $1\n\n")
        .replace(/<h5[^>]*>([^<]+)<\/h5>/gi, "##### $1\n\n")
        .replace(/<h6[^>]*>([^<]+)<\/h6>/gi, "###### $1\n\n");
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
    md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, "[$2]($1)");
    md = md
        .replace(/<(strong|b)[^>]*>([^<]+)<\/(strong|b)>/gi, "**$2**")
        .replace(/<(em|i)[^>]*>([^<]+)<\/(em|i)>/gi, "*$2*");
    md = md
        .replace(/<li[^>]*>([^<]+)<\/li>/gi, "- $1\n")
        .replace(/<\/?[uo]l[^>]*>/gi, "\n");
    md = md
        .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n")
        .replace(/<code[^>]*>([^<]+)<\/code>/gi, "`$1`");
    md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n");
    md = md.replace(/<br\s*\/?>/gi, "\n");
    md = md.replace(/<[^>]+>/g, "");
    md = decodeHtml(md);
    md = md
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();
    return md;
}
/**
 * Decode common HTML entities.
 */
function decodeHtml(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
/**
 * Extract image URLs from markdown.
 */
function extractImageUrls(markdown) {
    const urls = [];
    const imgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(markdown)) !== null) {
        urls.push(match[1]);
    }
    return urls;
}
/**
 * Extract links from markdown.
 */
function extractLinks(markdown) {
    const urls = [];
    const linkRegex = /\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(markdown)) !== null) {
        urls.push(match[1]);
    }
    return urls;
}
/**
 * Extract image URLs from HTML, filtering for large images.
 */
function extractImageUrlsFromHtml(html, baseUrl) {
    const urls = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        let imgUrl = match[1];
        const imgTag = match[0];
        const widthMatch = imgTag.match(/width=["']?(\d+)/i);
        const heightMatch = imgTag.match(/height=["']?(\d+)/i);
        if (widthMatch && parseInt(widthMatch[1]) < 400)
            continue;
        if (heightMatch && parseInt(heightMatch[1]) < 300)
            continue;
        if (imgUrl.includes("avatar") || imgUrl.includes("icon") || imgUrl.includes("logo") || imgUrl.includes("favicon"))
            continue;
        if (imgUrl.endsWith(".svg"))
            continue;
        if (imgUrl.startsWith("//")) {
            imgUrl = "https:" + imgUrl;
        }
        else if (imgUrl.startsWith("/")) {
            try {
                const base = new URL(baseUrl);
                imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
            }
            catch {
                continue;
            }
        }
        if (imgUrl.startsWith("http")) {
            urls.push(imgUrl);
        }
    }
    return urls.slice(0, 5);
}
/**
 * Extract links from HTML.
 */
function extractLinksFromHtml(html) {
    const urls = [];
    const linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        urls.push(match[1]);
    }
    return urls.slice(0, 20);
}
/**
 * Extract a readable title from URL path.
 */
function extractTitleFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const slug = path.split("/").filter(Boolean).pop() || "";
        return slug
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .substring(0, 100);
    }
    catch {
        return "Untitled";
    }
}
