import { z } from "zod/v4";
import { chatWithClaude } from "../llm/anthropic.js";
import { log } from "../logger.js";
import type { SelectedStory } from "./select-stories.js";

export interface SectionResult {
  content: string;
  reasoning: string;
}

export async function writeSection(params: {
  story: SelectedStory;
  storyContent: string;
  externalSourceContent: string;
  subjectLine: string;
  preHeaderText: string;
  date: string;
}): Promise<SectionResult> {
  const { story, storyContent, externalSourceContent, subjectLine, preHeaderText, date } = params;

  const prompt = `## Task and Purpose

Create a single newsletter section for Solarpunk Currents, covering solar energy, renewable energy, the clean energy transition, and the solarpunk movement. You will be given details of a single section to write about and supporting source material. Use this to write this newsletter section.

Today's date for the newsletter is *${date}*.

### Audience

- Clean energy enthusiasts, climate-conscious readers, solarpunk community members, and activists following the energy transition.
- They want real developments — not hype. They care about community power, climate justice, and actual deployments, not corporate pledges.

### Editorial Style: BLUF (Bottom Line Up Front)

**Lead with BLUF.** State the solution, initiative, or community win upfront. What's actually happening? Who's doing it? Real impact, real scale.

**Support with narrative.** Include a specific story, example, or moment from the community — but only if it illustrates the facts. One concrete example per piece. Keep it grounded and brief.

**Avoid aspirational fluff.** Focus on what's working now, not what could someday. Use accessible language. Cite sources. Be direct about both progress and remaining work.

**Story shows why it matters; facts show it's real.**

### Section Structure

Follow this structure when writing your newsletter segment:

1. **The Bottom Line:** (should be bolded)
  - Lead with the win, the deployment, the policy change — whatever is actually happening.
  - Who's doing it? Where? At what scale?
  - 2-3 sentences. No hedging, no "could" or "might." State what IS happening.
  - Start this section with **The Bottom Line:** followed by your sentences.

2. **The Story:** (should be bolded)
  - One concrete example, specific moment, or community story that illustrates the facts.
  - Grounded and brief — a few sentences, not a paragraph of color.
  - Only include narrative if it illustrates the facts. If the story doesn't add anything, keep it to the data.

3. **By the numbers:** (should be bolded)
  - Key data points, stats, and scale. Bulleted.
  - Use \`-\` for each bullet. 3-5 bullets max.
  - **Bold** the numbers (MW, GWh, $/W, %, $, tonnes CO2).
  - Maximum 1 link per bullet. Links must NOT be bold.
  - Cite the source for each data point.

4. **What remains:** (should be bolded)
  - Be direct about challenges, limitations, or what comes next.
  - 1-2 sentences. No fluff, no "the road ahead is long." State the specific obstacle or next step.
  - This is what separates us from greenwashing — we tell the truth about what's not done yet.

### Writing Rules

- Place verbs directly after helping verbs like "makes," "allows," "enables"
- Use clear subject-verb-object structure
- Keep sentences concise and purposeful
- Avoid technical jargon — write for non-technical readers
- Cite sources for every claim. Link to the actual source, not a homepage.
- Never use "could," "might," or "may" when describing something that has already happened
- Never use "revolutionary," "game-changing," or similar hype words

### Word Blacklist

Smarts, Game changing, game-changing, Revolutionize, revolutionary, sophisticated, next-level, enhanced, greenwashing (unless calling it out), disrupt, disruptive, transformative, "the road ahead," "paving the way," "a beacon of hope"

### Formatting

- Short paragraphs (1-3 sentences). Bullet points for data.
- **Bold** key data points and numbers. Use *italics* sparingly.
- Format in markdown. Section heading should use \`#\` heading level.

### Link Requirements

- Link specific entities to their official source on first mention.
- All links MUST point to exact, specific pages (NOT generic homepages).
- Maximum 1 link per paragraph or bullet point.
- Links must be copied verbatim from source materials. Do NOT modify URLs.
- If no valid URL exists, omit the link entirely.

## Newsletter Context

- Subject Line: ${subjectLine}
- Pre-Header Text: ${preHeaderText}

### Current Segment Story Context

Title: ${story.title}
Summary: ${story.summary}

${storyContent}

### Additional Current Segment Source Materials

${externalSourceContent || "N/A"}

## Output Format

Respond with valid JSON:
{
  "chainOfThought": "your reasoning for how you applied BLUF style and editorial principles...",
  "newsletter_section_content": "the markdown content of this section"
}`;

  const response = await chatWithClaude({
    system:
      "You are a newsletter writer for Solarpunk Currents, covering the clean energy transition through a solarpunk lens. You write BLUF-style: lead with what's actually happening, who's doing it, and real impact. You support with one concrete community story. You avoid aspirational fluff and are direct about remaining work. Story shows why it matters; facts show it's real. Always respond with valid JSON.",
    prompt,
    maxTokens: 8192,
  });

  const SectionSchema = z.object({
    chainOfThought: z.string(),
    newsletter_section_content: z.string(),
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const result = SectionSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!result.success) {
      log.error("Section validation failed", { issues: result.error.issues });
      log.error("Raw LLM response", { response: response.slice(0, 2000) });
      throw new Error("Section response did not match expected schema");
    }
    return {
      content: result.data.newsletter_section_content,
      reasoning: result.data.chainOfThought,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("schema")) throw err;
    log.error("Failed to parse section content", { error: err instanceof Error ? err.message : String(err) });
    log.error("Raw LLM response", { response: response.slice(0, 2000) });
    throw new Error("Failed to parse section content from LLM");
  }
}
