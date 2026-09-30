import { z } from "zod/v4";
import { chatWithClaude } from "../llm/anthropic.js";
import { log } from "../logger.js";
export async function writeShortlist(params) {
    const { subjectLine, storySections, allContent, previousNewsletter, date } = params;
    const prompt = `## Role:

You are an expert newsletter writer for Solarpunk Currents, specializing in concise, engaging summaries of clean energy news and solarpunk culture, community, and good-news stories. You are writing a specific section for the newsletter "Solarpunk Currents".

## Context:

We are creating the "Other Stories" section for our email newsletter, "Solarpunk Currents". This section should highlight interesting and relevant items that were *not* covered in the main segments of the newsletter — including solarpunk culture, community projects, off-grid living, protest and movement wins, good news for the planet, and human-interest maker stories, alongside clean energy news. The stories you pick MUST be related to the solarpunk movement broadly: solar and renewable energy, the clean energy transition, climate justice, or solarpunk culture and living.

Each content item includes a \`feedType\` field indicating its content type. When a story is a tutorial (feedType: "tutorial"), prefix the summary with **[Tutorial]**. When a story is research (feedType: "research"), prefix the summary with **[Research]**. News stories (feedType: "article") get no prefix.

Today's date for the newsletter is *${date}*.

## Task:

Analyze the provided list of stories, select the most relevant and interesting ones for our audience of clean energy enthusiasts and solarpunk community members (typically 3-5 stories, leaning toward culture, community, and good-news items that weren't already covered), ensuring they do *not* overlap with the stories already in the newsletter, and write a short summary for each selected story in the specified format.

You must include a minimum of at least 3 stories. If there is not a valid link to include, omit that story.

## Formatting and Style Requirements:
*   **Output Format:** Markdown.
*   **Story Structure:**
    *   The **first word** of each story summary *must* be **bolded**.
    *   The **second word** *must* be a **verb** and formatted as a Markdown **link** (\`[verb](URL)\`).
    *   The rest should be a concise summary of the story's key takeaway.
*   **Style:** Concise, informative, slightly informal, engaging, with an optimistic but grounded tone.
*   Each story must be its own paragraph. **Do NOT use bullet points or numbered lists.**

## Examples:

**NREL** [published](URL) a new roadmap showing the US could reach 80% renewable electricity by 2030 with accelerated transmission build-out and continued storage cost declines.

**California** [approved](URL) a landmark community solar program that will let renters and apartment dwellers subscribe to local solar projects and receive bill credits.

**[Research]** **Princeton** [released](URL) a study finding that distributed solar plus battery storage could reduce peak grid demand by 40% in retrofit-equipped neighborhoods.

**[Tutorial]** **Solar Power World** [published](URL) a step-by-step guide to designing residential battery storage systems for backup power and self-consumption.

## Link Requirements:

- All links MUST be copied verbatim from the source material. Do NOT modify URLs.
- NO generic homepages. Links must point to specific pages.
- If no valid URL exists for a story, omit that story entirely.

## Subject Line
${subjectLine}

## Main Stories Already Covered (Do NOT repeat these)
${storySections}

${previousNewsletter ? `## Previous Newsletter (avoid duplicates)\n\n${previousNewsletter}` : ""}

## List of Potential Other Stories
${allContent}

## Output Format

Respond with valid JSON:
{
  "chainOfThought": "your reasoning for each story selection and link verification...",
  "newsletter_other_top_stories_section_content": "the markdown content"
}`;
    const response = await chatWithClaude({
        system: "You are a newsletter writer for Solarpunk Currents, covering the clean energy transition through a solarpunk lens. You write concise, facts-first summaries: what's happening, who's doing it, real impact. No fluff. Always respond with valid JSON.",
        prompt,
        maxTokens: 4096,
    });
    const ShortlistSchema = z.object({
        chainOfThought: z.string().optional(),
        newsletter_other_top_stories_section_content: z.string(),
    });
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error("No JSON found");
        const result = ShortlistSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (!result.success) {
            log.error("Shortlist validation failed", { issues: result.error.issues });
            log.error("Raw LLM response", { response: response.slice(0, 2000) });
            throw new Error("Shortlist response did not match expected schema");
        }
        return result.data.newsletter_other_top_stories_section_content;
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("schema"))
            throw err;
        log.error("Failed to parse shortlist", { error: err instanceof Error ? err.message : String(err) });
        log.error("Raw LLM response", { response: response.slice(0, 2000) });
        throw new Error("Failed to parse shortlist from LLM");
    }
}
