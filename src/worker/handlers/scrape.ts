/**
 * Stage 2: Scrape URLs via Jina Reader → Parallel Extract → native fetch
 * Consumes messages from scrape-queue, enqueues to evaluate-queue
 */

import { Env } from '../index.js';
import { scrapeUrl } from '../../../src/ingest/scrape.js';
import type { ScrapeMessage, EvaluateMessage } from '../types.js';

export async function handleScrapeQueue(batch: MessageBatch<ScrapeMessage>, env: Env): Promise<void> {
  console.log(`[Stage 2] Processing scrape batch with ${batch.messages.length} messages`);
  
  for (const msg of batch.messages) {
    const message = msg.body;
    
    try {
      // Scrape each item in the batch
      const scrapedItems = [];
      
      for (const itemData of message.items) {
        console.log(`[Stage 2] Scraping: ${itemData.title}`);
        
        // Check if already processed in KV (deduplication)
        const cacheKey = `scrape:${itemData.uploadFileName}`;
        const cached = await env.INGEST_STATE.get(cacheKey);
        
        if (cached) {
          console.log(`[Stage 2] Already scraped: ${itemData.title}`);
          const cachedResult = JSON.parse(cached);
          scrapedItems.push({
            item: itemData,
            scrapeResult: cachedResult,
          });
          continue;
        }
        
        // Pass API key from env to scrape function
        const result = await scrapeUrl(itemData.url, env.PARALLEL_API_KEY);
        
        if (!result || !result.content) {
          console.warn(`[Stage 2] Failed to scrape: ${itemData.title}`);
          // Store failure in KV to avoid retrying too frequently
          await env.INGEST_STATE.put(
            `failed:scrape:${itemData.uploadFileName}`,
            JSON.stringify({
              timestamp: Date.now(),
              reason: 'scrape_failed',
            }),
            { expirationTtl: 86400 } // Retry after 24 hours
          );
          continue;
        }
        
        // Cache the scrape result
        await env.INGEST_STATE.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 604800, // Cache for 7 days
        });
        
        scrapedItems.push({
          item: itemData,
          scrapeResult: result,
        });
      }
      
      // Only enqueue if we have successfully scraped items
      if (scrapedItems.length > 0) {
        // Send items individually to stay under Cloudflare Queue's 128KB
        // message limit — full scrapeResult (content + rawHtml) for 5 items
        // can easily exceed it.
        for (const scrapedItem of scrapedItems) {
          const evaluateMessage: EvaluateMessage = {
            type: 'batch',
            items: [scrapedItem],
            batchId: message.batchId,
            timestamp: Date.now(),
          };
          await env.EVALUATE_QUEUE.send(evaluateMessage);
        }
        console.log(`[Stage 2] Enqueued ${scrapedItems.length} items for evaluation (individual messages)`);
      }
      
    } catch (error) {
      console.error(`[Stage 2] Error processing batch ${message.batchId}:`, error);
      throw error; // Let the queue retry
    }
  }
}
