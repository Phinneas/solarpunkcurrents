import * as s3 from "../storage/s3.js";
import { log } from "../logger.js";
import { scrapeUrl } from "../ingest/scrape.js";
import { selectTopStories } from "./select-stories.js";
import { generateSubjectLine } from "./subject-line.js";
import { writeSection } from "./write-section.js";
import { writeIntro } from "./write-intro.js";
import { writeShortlist } from "./write-shortlist.js";
import { assembleNewsletter } from "./assemble.js";
import { searchHeroImage, type HeroImage } from "./hero-image.js";
import { humanizeNewsletter } from "./humanize.js";

interface ContentEntry {
  identifier: string;
  content: string;
  metadata: Record<string, string>;
  title: string;
  sourceName: string;
  type: string;
  externalSourceUrls: string;
}

/**
 * Load content from S3 for a single date prefix (CLI usage).
 */
async function loadContentForDate(date: string): Promise<ContentEntry[]> {
  log.info(`Loading content for date: ${date}`);
  const keys = await s3.list(`${date}/`);
  const mdKeys = keys.filter((k) => k.endsWith(".md"));
  log.info(`Found ${mdKeys.length} markdown files`);

  const entries: ContentEntry[] = [];
  for (const key of mdKeys) {
    try {
      const [content, metadata] = await Promise.all([
        s3.download(key),
        s3.getMetadata(key),
      ]);
      entries.push({
        identifier: key,
        content,
        metadata,
        title: metadata.title ?? key,
        sourceName: metadata["source-name"] ?? "",
        type: metadata.type ?? "article",
        externalSourceUrls: metadata["external-source-urls"] ?? "",
      });
    } catch (err) {
      log.warn(`Failed to load ${key}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`Loaded ${entries.length} content entries`);
  return entries;
}

/**
 * Load content from an R2 bucket across multiple date prefixes (Worker usage).
 */
async function loadContentFromR2(
  dates: string[],
  bucket: R2Bucket
): Promise<ContentEntry[]> {
  log.info(`Loading content from R2 for ${dates.length} date(s)`);
  const entries: ContentEntry[] = [];

  for (const date of dates) {
    // Try directory prefix first (new format: 2026-08-21/slug.source.md)
    let listed = await bucket.list({ prefix: `${date}/` });
    let mdKeys = listed.objects
      .map((o: R2Object) => o.key)
      .filter((k: string) => k.endsWith(".md"));

    // Fallback: flat format (legacy: 2026-08-21_source_slug.md)
    if (mdKeys.length === 0) {
      listed = await bucket.list({ prefix: `${date}_` });
      mdKeys = listed.objects
        .map((o: R2Object) => o.key)
        .filter((k: string) => k.endsWith(".md"));
    }

    log.info(`  ${date}: ${mdKeys.length} files`);

    for (const key of mdKeys) {
      try {
        const obj = await bucket.get(key);
        if (!obj) continue;
        const content = await obj.text();
        const metadata = (obj.customMetadata ?? {}) as Record<string, string>;
        entries.push({
          identifier: key,
          content,
          metadata,
          title: metadata.title ?? key,
          sourceName: metadata["source-name"] ?? "",
          type: metadata.type ?? "article",
          externalSourceUrls: metadata["external-source-urls"] ?? "",
        });
      } catch (err) {
        log.warn(`Failed to load ${key} from R2`, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  log.info(`Loaded ${entries.length} total content entries from R2`);
  return entries;
}

async function scrapeExternalSources(
  urls: string[]
): Promise<string> {
  if (urls.length === 0) return "N/A";

  const results: string[] = [];
  for (const url of urls) {
    try {
      const result = await scrapeUrl(url);
      if (result) {
        results.push(
          `<${url}>\n---\nurl: ${url}\n---\n${result.content}\n</${url}>`
        );
      }
    } catch (err) {
      log.warn(`Failed to scrape external source`, { url, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results.length > 0 ? results.join("\n\n") : "N/A";
}

export async function generateNewsletter(
  dateOrDates: string | string[],
  bucketOrPrevious?: R2Bucket | string,
  previousNewsletterArg?: string
): Promise<{ newsletter: string; heroImage: HeroImage | null }> {
  log.info("Starting Newsletter Generation");
  const totalTimer = log.timer("newsletter-generation");

  // Resolve overloaded arguments:
  // CLI:    generateNewsletter("2026-02-21", previousNewsletter?)
  // Worker: generateNewsletter(["2026-02-21", ...], bucket, previousNewsletter?)
  const isWorker = Array.isArray(dateOrDates);
  const dates = isWorker ? dateOrDates : [dateOrDates as string];
  const displayDate = dates[0];
  const bucket = isWorker ? (bucketOrPrevious as R2Bucket) : undefined;
  const previousNewsletter = isWorker
    ? previousNewsletterArg
    : (bucketOrPrevious as string | undefined);

  // Step 1: Load all content
  const loadTimer = log.timer("load-content");
  const entries = isWorker
    ? await loadContentFromR2(dates, bucket!)
    : await loadContentForDate(dates[0]);
  loadTimer.end();
  if (entries.length === 0) {
    throw new Error(`No content found for date range: ${dates.join(", ")}`);
  }

  // Step 2: Select top stories via Kimi K2
  log.info("Selecting top stories...");
  const selectTimer = log.timer("select-stories");
  const selection = await selectTopStories(entries, previousNewsletter);
  selectTimer.end();
  log.info(`Selected ${selection.stories.length} stories`);
  for (const story of selection.stories) {
    log.info(`  - ${story.title}`);
  }

  // Step 3: Generate subject line via Kimi K2
  log.info("Generating subject line...");
  const subjectTimer = log.timer("subject-line");
  const subjectResult = await generateSubjectLine(selection.stories, entries, displayDate);
  subjectTimer.end();
  log.info(`Subject: ${subjectResult.subjectLine}`);
  log.info(`Pre-header: ${subjectResult.preHeaderText}`);

  // Step 3b: Search for hero image via Pexels
  log.info("Searching for hero image...");
  const heroTimer = log.timer("hero-image");
  const heroImage = await searchHeroImage(subjectResult.subjectLine);
  heroTimer.end();
  if (heroImage) {
    log.info(`Hero image: ${heroImage.url}`);
  } else {
    log.info("No hero image — newsletter will publish without one");
  }

  // Step 4: Write each story section via Claude
  log.info("Writing story sections...");
  const sectionsTimer = log.timer("write-sections");
  const storySections: string[] = [];

  for (const story of selection.stories) {
    log.info(`  Writing: ${story.title}`);

    // Gather content for all identifiers of this story
    const storyContent = story.identifiers
      .map((id) => {
        const entry = entries.find((e) => e.identifier === id);
        if (!entry) return "";
        return `<${id}>\n---\nidentifier: ${id}\nfriendlyType: ${entry.type}\nsourceName: ${entry.sourceName}\nauthors: ${entry.metadata.authors ?? ""}\nexternalSourceUrls: ${entry.externalSourceUrls}\nimageUrls: ${entry.metadata["image-urls"] ?? ""}\n---\n\n${entry.content}\n</${id}>`;
      })
      .filter(Boolean)
      .join("\n\n");

    // Scrape external sources if any
    const externalUrls = story.external_source_links.filter(
      (u) => u && u.trim() !== ""
    );
    const externalContent = await scrapeExternalSources(externalUrls);

    const section = await writeSection({
      story,
      storyContent,
      externalSourceContent: externalContent,
      subjectLine: subjectResult.subjectLine,
      preHeaderText: subjectResult.preHeaderText,
      date: displayDate,
    });

    storySections.push(section.content);
  }

  sectionsTimer.end();
  const combinedSections = storySections.join("\n\n---\n");

  // Step 5: Write intro section via Claude
  log.info("Writing intro...");
  const introTimer = log.timer("write-intro");
  const intro = await writeIntro({
    subjectLine: subjectResult.subjectLine,
    preHeaderText: subjectResult.preHeaderText,
    storySections: combinedSections,
    date: displayDate,
  });

  introTimer.end();

  // Step 6: Write "The Quick Scribbles" via Claude
  log.info("Writing shortlist...");
  const shortlistTimer = log.timer("write-shortlist");
  const allContentText = entries
    .map(
      (e) =>
        `<${e.identifier}>\n---\nidentifier: ${e.identifier}\nsourceName: ${e.sourceName}\nfeedType: ${e.type}\nurl: ${e.metadata.url ?? ""}\n---\n\nTitle: ${e.title}\n\n${e.content.substring(0, 500)}...\n</${e.identifier}>`
    )
    .join("\n\n");

  const shortlist = await writeShortlist({
    subjectLine: subjectResult.subjectLine,
    storySections: combinedSections,
    allContent: allContentText,
    previousNewsletter,
    date: displayDate,
  });

  shortlistTimer.end();

  // Step 7: Assemble final newsletter
  log.info("Assembling newsletter...");
  const rawNewsletter = assembleNewsletter({
    subjectLine: subjectResult.subjectLine,
    preHeaderText: subjectResult.preHeaderText,
    intro,
    storySections,
    shortlist,
  });

  // Step 8: Humanize — remove AI writing patterns
  const newsletter = await humanizeNewsletter(rawNewsletter);

  totalTimer.end();
  log.info("Newsletter Generation Complete");
  return { newsletter, heroImage };
}
