import { z } from "zod/v4";
import { chatWithClaude } from "../llm/anthropic.js";
import { log } from "../logger.js";
export async function writeIntro(params) {
    const { subjectLine, preHeaderText, storySections, date } = params;
    const prompt = `# Prompt for Generating Newsletter Intro Section

## Role:

You are an expert newsletter writer for Solarpunk Currents, skilled at crafting engaging and informative introductory sections that precisely match a specific style and format. Your voice blends optimistic solarpunk spirit with hard energy news facts.

## Goal:

Generate an introductory section for our email newsletter, "Solarpunk Currents," based on the provided inputs. The generated intro must strictly adhere to the format, style, length, and tone demonstrated in the examples below.

Today's date for the newsletter is *${date}*.

## Constraints & Instructions:

1.  **Format Mimicry:** Replicate the exact structure of the examples:
    *   Greeting: Start *precisely* with "**Good morning.**" — no name, no merge tags, just the greeting formatted as bold markdown.
    *   Paragraph 1: Introduce the most prominent news story or theme from the provided content. Concise (2-3 sentences). AVOID repeating the same sentence structure as the first story's content.
    *   Paragraph 2: Briefly elaborate, pose a key question, or highlight significance (2-3 sentences). Avoid duplicating information.
    *   Transition Phrase: Use the *exact* phrase "In today's Solarpunk Currents:" (bolded in markdown).
    *   Bulleted List: Create a bulleted list (using \`-\`) summarizing the main topics covered (usually 4 items).
2.  **Style & Tone:** Informative, engaging, slightly speculative/analytical, concise, optimistic but grounded in real energy data.
3.  **Length:** Similar to the examples provided.
4.  **Keyword:** Use "Solarpunk Currents" in the transition phrase, not "recap" or "rundown".

## Examples:

**Example 1:**

**Good morning.** The US solar industry just had its biggest quarter on record, with 11.8 GW of new capacity installed in Q1, driven by utility-scale projects and a resurgent residential market.

With the IRA's clean energy tax credits now flowing and module prices at historic lows, the question is no longer whether solar will scale, but how fast the grid can keep up.

**In today's Solarpunk Currents:**

- Record US solar deployment in Q1
- California's new community solar program
- Grid-scale battery storage hits new milestone
- The co-op movement going national

**Example 2:**

**Good morning.** A new NREL study shows that reaching 80% renewable electricity by 2030 is technically feasible with today's technology, if transmission build-out accelerates and storage costs continue their downward trend.

The analysis models 35 scenarios and finds that solar and wind alone could supply 60-70% of demand, with batteries, hydropower, and demand response filling the gaps.

**In today's Solarpunk Currents:**

- NREL's 80% renewables roadmap
- Offshore wind breakthrough in the North Sea
- Community-owned microgrid powers rural town
- Heat pump adoption outpaces projections

### Word Blacklist: Smarts, Game changing, game-changing, next-level, Revolutionize, sophisticated, enhanced, greenwashing (unless calling it out)

## Your Task:

Based on the inputs below, generate the intro section for the "Solarpunk Currents" newsletter.

### Subject Line
${subjectLine}

### Pre-header Text
${preHeaderText}

### Newsletter Content
${storySections}

## Output Format

Respond with valid JSON:
{
  "chainOfThought": "your reasoning...",
  "newsletter_intro_section_content": "the markdown intro content"
}`;
    const response = await chatWithClaude({
        system: "You are a newsletter writer for Solarpunk Currents, covering the clean energy transition through a solarpunk lens. You write BLUF-style: lead with what's actually happening this week, grounded in real data. Optimistic but never fluffy. Always respond with valid JSON.",
        prompt,
        maxTokens: 4096,
    });
    const IntroSchema = z.object({
        chainOfThought: z.string().optional(),
        newsletter_intro_section_content: z.string(),
    });
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error("No JSON found");
        const result = IntroSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (!result.success) {
            log.error("Intro validation failed", { issues: result.error.issues });
            log.error("Raw LLM response", { response: response.slice(0, 2000) });
            throw new Error("Intro response did not match expected schema");
        }
        return result.data.newsletter_intro_section_content;
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("schema"))
            throw err;
        log.error("Failed to parse intro", { error: err instanceof Error ? err.message : String(err) });
        log.error("Raw LLM response", { response: response.slice(0, 2000) });
        throw new Error("Failed to parse intro from LLM");
    }
}
