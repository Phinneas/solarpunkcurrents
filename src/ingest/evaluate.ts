import { chatWithMistral } from "../llm/mistral.js";

export interface EvaluationResult {
  isRelevant: boolean;
  reasoning: string;
}

export async function evaluateContentRelevance(
  content: string
): Promise<EvaluationResult> {
  const prompt = `Given content fetched from a web page, analyze this content to determine if it is a full piece of content that would be considered relevant to our Solarpunk Currents newsletter. Our newsletter covers the clean energy transition through a solarpunk lens — centering community power, climate justice, and imaginative futures alongside hard energy news.

## What IS relevant:
- Solar energy news, announcements, product launches, and industry developments
- Wind, geothermal, hydro, hydrogen, and other renewable energy developments
- Energy storage (batteries, grid storage, pumped hydro, thermal storage)
- Clean energy policy, regulation, incentives, and market analysis
- Grid modernization, transmission, distributed energy, microgrids, community solar
- Community-owned and grassroots energy projects (co-ops, mutual aid solar, community-owned grids)
- Climate justice and equity (who benefits from the transition, who's burdened by fossil fuels, just transition for workers)
- Indigenous-led energy projects and land sovereignty movements
- Resistance and activism (fossil fuel protests, pipeline fights, divestment campaigns, anti-extraction movements)
- Electrification (EVs, heat pumps, electric appliances, building decarbonization)
- Climate tech, decarbonization, carbon capture, and emissions reduction
- Solarpunk culture, art, fiction, speculative futures, and imaginative visions of a sustainable world
- Practical/DIY content (community solar setup, mutual aid energy, grassroots organizing)
- Global perspectives (Global South, Asia, Africa, Latin America — not just US/Europe)
- Research papers, studies, and technical deep-dives on energy topics

## What is NOT relevant:
- Job postings or hiring announcements
- Content centered around fossil fuels, oil, gas, or extractive industries with no clean energy or justice angle
- Corporate greenwashing — PR pieces that announce vague "commitments" with no concrete plans, timelines, or accountability
- Generic marketing content or product pages with no substantive information
- Content that is too short or thin to be useful (less than a few paragraphs)
- Listicles of energy companies or tools with no analysis or insight
- Content unrelated to energy, climate, sustainability, or environmental justice

You must respond with valid JSON in this exact format:
{
  "chainOfThought": "your reasoning here",
  "is_relevant_content": true/false
}

---
${content}`;

  const response = await chatWithMistral({ prompt, maxTokens: 2048 });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { isRelevant: false, reasoning: "Failed to parse" };

    const parsed = JSON.parse(jsonMatch[0]) as {
      chainOfThought?: string;
      is_relevant_content?: boolean;
    };
    return {
      isRelevant: parsed.is_relevant_content ?? false,
      reasoning: parsed.chainOfThought ?? "",
    };
  } catch {
    return { isRelevant: false, reasoning: "Failed to parse LLM response" };
  }
}
