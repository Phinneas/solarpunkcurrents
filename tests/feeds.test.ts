import { describe, it, expect } from "vitest";
import {
  NEWSLETTER_FEEDS,
  JSON_FEEDS,
  REDDIT_FEEDS,
  BLOG_FEEDS,
  NEWS_FEEDS,
  SUBSTACK_FEEDS,
  TUTORIAL_FEEDS,
  RESEARCH_FEEDS,
  ALL_FEEDS,
  DOMAIN_SOURCE_MAP,
} from "../src/ingest/feeds.js";

describe("feed definitions (loaded from feeds.json)", () => {
  it("has 0 newsletter feeds (migrated to substack)", () => {
    expect(NEWSLETTER_FEEDS).toHaveLength(0);
  });

  it("has 0 JSON feeds", () => {
    expect(JSON_FEEDS).toHaveLength(0);
  });

  it("has 0 Reddit feeds", () => {
    expect(REDDIT_FEEDS).toHaveLength(0);
  });

  it("has 1 blog feed", () => {
    expect(BLOG_FEEDS).toHaveLength(1);
  });

  it("has 36 news feeds (energy trade press + solarpunk culture/living)", () => {
    expect(NEWS_FEEDS).toHaveLength(36);
  });

  it("includes cultural, living, and good-news feeds alongside energy news", () => {
    const newsNames = NEWS_FEEDS.map((f) => f.name);
    for (const name of [
      "reactor",
      "orion",
      "emergence",
      "permaculture_magazine",
      "low_tech_magazine",
      "waging_nonviolence",
      "positive_news",
      "reasons_to_be_cheerful",
      "fix_the_news",
    ]) {
      expect(newsNames).toContain(name);
    }
  });

  it("has 1 substack feed", () => {
    expect(SUBSTACK_FEEDS).toHaveLength(1);
    for (const feed of SUBSTACK_FEEDS) {
      expect(feed.feedType).toBe("newsletter");
    }
  });

  it("has 0 tutorial feeds", () => {
    expect(TUTORIAL_FEEDS).toHaveLength(0);
  });

  it("has 0 research feeds", () => {
    expect(RESEARCH_FEEDS).toHaveLength(0);
  });

  it("ALL_FEEDS contains all feeds combined", () => {
    expect(ALL_FEEDS).toHaveLength(
      NEWSLETTER_FEEDS.length +
        JSON_FEEDS.length +
        REDDIT_FEEDS.length +
        BLOG_FEEDS.length +
        NEWS_FEEDS.length +
        SUBSTACK_FEEDS.length +
        TUTORIAL_FEEDS.length +
        RESEARCH_FEEDS.length
    );
  });

  it("all blog feeds have feedType 'article'", () => {
    for (const feed of BLOG_FEEDS) {
      expect(feed.feedType).toBe("article");
    }
  });

  it("all feeds have unique names", () => {
    const names = ALL_FEEDS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all feeds have unique source names", () => {
    const sourceNames = ALL_FEEDS.map((f) => f.sourceName);
    expect(new Set(sourceNames).size).toBe(sourceNames.length);
  });

  it("all feeds have a valid format", () => {
    for (const feed of ALL_FEEDS) {
      expect(["rss", "json", "scraped_page"]).toContain(feed.format);
    }
  });

  it("all feeds have non-empty feedUrl", () => {
    for (const feed of ALL_FEEDS) {
      expect(feed.feedUrl.length).toBeGreaterThan(0);
    }
  });

  it("all feeds have a category matching their array", () => {
    for (const feed of NEWSLETTER_FEEDS) expect(feed.category).toBe("newsletter");
    for (const feed of JSON_FEEDS) expect(feed.category).toBe("json");
    for (const feed of REDDIT_FEEDS) expect(feed.category).toBe("reddit");
    for (const feed of BLOG_FEEDS) expect(feed.category).toBe("blog");
    for (const feed of NEWS_FEEDS) expect(feed.category).toBe("news");
    for (const feed of SUBSTACK_FEEDS) expect(feed.category).toBe("substack");
    for (const feed of TUTORIAL_FEEDS) expect(feed.category).toBe("tutorial");
    for (const feed of RESEARCH_FEEDS) expect(feed.category).toBe("research");
  });

  it("ALL_FEEDS only contains enabled feeds (disabled feeds filtered out)", () => {
    for (const feed of ALL_FEEDS) {
      expect(feed.enabled).toBe(true);
    }
  });
});

describe("domain source map (loaded from feeds.json)", () => {
  it("has at least 20 domain mappings", () => {
    expect(Object.keys(DOMAIN_SOURCE_MAP).length).toBeGreaterThanOrEqual(20);
  });

  it("maps known domains correctly", () => {
    expect(DOMAIN_SOURCE_MAP["techcrunch.com"]).toBe("techcrunch");
    expect(DOMAIN_SOURCE_MAP["theverge.com"]).toBe("the-verge");
    expect(DOMAIN_SOURCE_MAP["reuters.com"]).toBe("reuters");
    expect(DOMAIN_SOURCE_MAP["nytimes.com"]).toBe("the-new-york-times");
  });
});
