/**
 * Stage 6: Publish newsletter as a draft post in the solarcurrents.co Astro repo
 * Consumes messages from publish-queue
 *
 * Takes the assembled newsletter markdown, wraps it in the `post` content
 * collection's frontmatter schema, and commits it via the GitHub Contents
 * API. The post is committed with draft: true so it stays out of the build
 * until reviewed and flipped to false in the repo.
 */

import { Env } from '../index.js';

interface PublishMessage {
  type: 'publish';
  generateId: string;
  newsletter: string;
  dates: string[]; // YYYY-MM-DD, newest first
  heroImage?: {
    url: string;
    alt: string;
    photographer: string;
    photographerUrl: string;
    pexelsUrl: string;
  } | null;
  timestamp: number;
}

const GITHUB_OWNER = 'Phinneas';
const GITHUB_REPO = 'solarcurrents';
const GITHUB_BRANCH = 'main';
const POST_DIR = 'astro-citrus/src/content/newsletter';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function formatPublishDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Escape a string for safe embedding in YAML frontmatter (double-quoted scalar). */
function yamlEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildFrontmatter(
  title: string,
  description: string,
  isoDate: string,
  heroImage?: { url: string; alt: string; photographer: string; photographerUrl: string; pexelsUrl: string } | null
): string {
  const lines = [
    '---',
    `title: "${yamlEscape(title)}"`,
    `description: "${yamlEscape(description)}"`,
    `publishDate: "${formatPublishDate(isoDate)}"`,
    'draft: false',
    'tags: ["newsletter", "solar", "energy"]',
  ];

  if (heroImage) {
    lines.push('coverImage:');
    lines.push(`  src: "${yamlEscape(heroImage.url)}"`);
    lines.push(`  alt: "${yamlEscape(heroImage.alt)}"`);
  }

  lines.push('---', '');
  return lines.join('\n');
}

/** Base64-encode a UTF-8 string (btoa alone mangles multi-byte chars). */
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function commitToGithub(
  token: string,
  path: string,
  content: string,
  message: string
): Promise<{ url: string }> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'solarpunkcurrents-ingest-worker',
    },
    body: JSON.stringify({
      message,
      content: toBase64(content),
      branch: GITHUB_BRANCH,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { content: { html_url: string } };
  return { url: data.content.html_url };
}

export async function handlePublishQueue(
  batch: MessageBatch<PublishMessage>,
  env: Env
): Promise<void> {
  console.log(`[Stage 6] Processing publish batch with ${batch.messages.length} message(s)`);

  for (const msg of batch.messages) {
    const message = msg.body;
    console.log(`[Stage 6] Publishing for generate ID: ${message.generateId}`);

    try {
      // Dedup check
      const dedupKey = `published:${message.generateId}`;
      const alreadyPublished = await env.INGEST_STATE.get(dedupKey);
      if (alreadyPublished) {
        console.log(`[Stage 6] Already published: ${message.generateId} — skipping`);
        continue;
      }

      // Parse subject line from first line of newsletter (# Subject Line)
      const lines = message.newsletter.split('\n');
      const title =
        lines[0].replace(/^#\s+/, '').trim() || `Solarpunk Currents — ${message.dates[0]}`;

      // Parse description from second non-empty line (preheader)
      const description =
        lines.find((l, i) => i > 0 && l.trim().length > 0)?.trim().slice(0, 200) ?? title;

      const isoDate = message.dates[0];
      const slug = `${isoDate}-${slugify(title)}`;
      const path = `${POST_DIR}/${slug}.md`;

      // Strip the leading # Title line — the page template renders it from frontmatter
      const bodyWithoutTitle = message.newsletter.replace(/^#\s+.+\n*/, '').trimStart();

      const frontmatter = buildFrontmatter(title, description, isoDate, message.heroImage);
      const fileContent = frontmatter + bodyWithoutTitle;

      const { url } = await commitToGithub(
        env.GITHUB_TOKEN,
        path,
        fileContent,
        `Add Solarpunk Currents newsletter: ${title}`
      );

      console.log(`[Stage 6] ✓ Committed draft post — ${path}`);
      console.log(`[Stage 6] ✓ URL: ${url}`);

      // Mark as published in KV
      await env.INGEST_STATE.put(
        dedupKey,
        JSON.stringify({
          path,
          url,
          title,
          timestamp: Date.now(),
        }),
        { expirationTtl: 60 * 60 * 24 * 30 } // 30 days
      );
    } catch (error) {
      console.error(`[Stage 6] Publish failed for ${message.generateId}:`, error);

      await env.INGEST_STATE.put(
        `error:publish:${message.generateId}`,
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        }),
        { expirationTtl: 60 * 60 * 24 * 7 }
      );

      throw error; // Let queue retry
    }
  }
}
