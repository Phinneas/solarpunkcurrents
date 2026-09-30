import { z } from "zod/v4";
import { chatWithClaude } from "../llm/anthropic.js";
import { log } from "../logger.js";
import type { SelectedStory } from "./select-stories.js";

export interface SubjectLineResult {
  subjectLine: string;
  preHeaderText: string;
  alternativeSubjectLines: string[];
}

const SUBJECT_LINE_EXAMPLES = `- US solar installs hit record 11.8 GW in Q1
- California's community solar program launches
- Battery storage costs hit new low
- NREL roadmap: 80% renewables by 2030
- China's solar manufacturing surges past target
- Texas grid runs on 100% renewables (briefly)
- The co-op solar movement goes national
- Offshore wind breakthrough in the North Sea
- Heat pump sales outpace gas boilers in Europe
- Grid-scale battery project comes online in Arizona
- EU greenlights new transmission superhighway
- Solar panel prices drop to historic lows
- New perovskite-silicon cell hits 33% efficiency
- Distributed solar could cut peak demand 40%
- Community microgrid powers town through blackout
- The IRA's clean energy credits start flowing
- Wind energy smashes production records
- Green hydrogen plant breaks ground in Texas
- US clears path for 30 GW of new transmission
- Rural co-ops lead the charge on clean energy
- The state of solar in 2025 (according to SEIA)
- Argentina launches national solar push
- Perovskite tandem cells edge closer to commercial
- Germany hits 60% renewable electricity milestone
- The solarpunk novel club is reimagining the future
- A repair café is fixing the throwaway economy
- Neighbors turn a vacant lot into a food forest
- This town just made mutual aid permanent`;

export async function generateSubjectLine(
  stories: SelectedStory[],
  contentItems: Array<{ identifier: string; content: string }>,
  date: string
): Promise<SubjectLineResult> {
  const prompt = `**Role:** Expert Email Copywriter Specializing in Clean Energy Content Engagement

**Core Objective:** Optimize email engagement elements (Subject Line, Pre-header Text) for the Solarpunk Currents newsletter to maximize open rates, based on provided story data.

Today's date for the newsletter is *${date}*.

## Top Newsletter Stories

${JSON.stringify(stories, null, 2)}

## Writing Guidelines

You Should Avoid:
- AVOID ALL CAPS or excessive punctuation!!!
- Avoid making the news sound more significant than it actually is
- Avoid over-exaggeration
- Avoid using cliché and over-the-top buzzwords like "revolution" and "game-changing"

Your pre-header text should be a straightforward teaser (15-20 words max) that teases and hints at what other stories will be included on this newsletter (outside of the main story). You should follow the "PLUS:" format for the pre-header text. DO NOT end this pre-header text with a period "." character.

You must prefer concrete specificity. It is better to reference a specific project, policy, or company instead of a generic term like "solar energy" or "clean energy".

## Great Subject Line Examples

${SUBJECT_LINE_EXAMPLES}

## Output Format

Respond with valid JSON:
{
  "subject_line_reasoning": "your detailed reasoning...",
  "subject_line": "7-9 word compelling subject line about the lead story",
  "additional_subject_lines": ["alt1", "alt2", "alt3", "alt4", "alt5"],
  "pre_header_text_reasoning": "your reasoning...",
  "pre_header_text": "PLUS: teaser about other stories"
}

The subject line MUST be 7-9 words and focus exclusively on the lead story (first story).`;

  const response = await chatWithClaude({
    system:
      "You are an expert email copywriter for Solarpunk Currents, a newsletter covering solar energy and the clean energy transition. Always respond with valid JSON.",
    prompt,
    maxTokens: 4096,
  });

  const SubjectLineSchema = z.object({
    subject_line_reasoning: z.string().optional(),
    subject_line: z.string(),
    additional_subject_lines: z.array(z.string()),
    pre_header_text_reasoning: z.string().optional(),
    pre_header_text: z.string(),
  });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const result = SubjectLineSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!result.success) {
      log.error("Subject line validation failed", { issues: result.error.issues });
      log.error("Raw LLM response", { response: response.slice(0, 2000) });
      throw new Error("Subject line response did not match expected schema");
    }
    return {
      subjectLine: result.data.subject_line,
      preHeaderText: result.data.pre_header_text,
      alternativeSubjectLines: result.data.additional_subject_lines,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("schema")) throw err;
    log.error("Failed to parse subject line", { error: err instanceof Error ? err.message : String(err) });
    log.error("Raw LLM response", { response: response.slice(0, 2000) });
    throw new Error("Failed to parse subject line from LLM");
  }
}
