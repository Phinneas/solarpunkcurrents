import { chatWithMistral } from "../llm/mistral.js";
/** Editorial themes used to balance the newsletter across energy, community, and culture. */
export const CONTENT_THEMES = [
    "energy",
    "policy",
    "community",
    "justice",
    "culture",
    "activism",
    "living",
    "good-news",
    "research",
    "other",
];
export async function evaluateContentRelevance(content) {
    const prompt = `Given content fetched from a web page, analyze this content to determine if it is a full piece of content that would be considered relevant to our Solarpunk Currents newsletter.

Our newsletter covers the clean energy transition through a solarpunk lens — and solarpunk is a cultural movement, not just a technology beat. We center community power, climate justice, imaginative futures, off-grid and low-tech living, arts and fiction, and good news for the planet alongside hard energy news.

## What IS relevant:

Human stories and culture (high priority — do not require an energy angle):
- Solarpunk culture: fiction, books, art, music, film, design, and speculative visions of a sustainable world
- Off-grid living, permaculture, degrowth, simple living, homesteading, and DIY/maker projects
- Good news for the planet: ecosystem restoration, conservation wins, species recovery, cleanups, community repair
- People and communities creating real solutions: mutual aid, local organizing, repair cafés, food sovereignty, community gardens
- Resistance and activism: fossil fuel protests, pipeline fights, divestment campaigns, climate strikes, anti-extraction movements
- Climate justice and equity: who benefits and who's burdened, just transition for workers, environmental justice communities
- Indigenous-led projects and land sovereignty movements
- Community-owned and grassroots energy projects (co-ops, mutual aid solar, community-owned grids, microgrids)

Energy and policy (still relevant, but not the only beat):
- Solar energy news, deployments, and industry developments
- Wind, geothermal, hydro, hydrogen, and other renewables
- Energy storage (batteries, grid storage, pumped hydro, thermal storage)
- Clean energy policy, regulation, incentives, and market analysis
- Grid modernization, transmission, distributed energy, and electrification
- Research papers, studies, and technical deep-dives on energy topics

## What is NOT relevant:
- Job postings or hiring announcements
- Content centered around fossil fuels, oil, gas, or extractive industries with no clean energy or justice angle
- Corporate greenwashing — PR pieces that announce vague "commitments" with no concrete plans, timelines, or accountability
- Generic marketing content or product pages with no substantive information
- Content that is too short or thin to be useful (less than a few paragraphs)
- Listicles of energy companies or tools with no analysis or insight
- Content unrelated to energy, climate, sustainability, culture, or environmental justice

You must respond with valid JSON in this exact format:
{
  "chainOfThought": "your reasoning here",
  "is_relevant_content": true/false,
  "theme": "one of: energy, policy, community, justice, culture, activism, living, good-news, research, other"
}

Pick the single theme that best fits the content. For human-interest, arts, fiction, music, off-grid, permaculture, degrowth, or maker stories, use "culture", "living", or "good-news" rather than forcing "energy".

---
${content}`;
    const response = await chatWithMistral({ prompt, maxTokens: 2048 });
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { isRelevant: false, reasoning: "Failed to parse", theme: "other" };
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const theme = CONTENT_THEMES.includes(parsed.theme ?? "")
            ? parsed.theme
            : "other";
        return {
            isRelevant: parsed.is_relevant_content ?? false,
            reasoning: parsed.chainOfThought ?? "",
            theme,
        };
    }
    catch {
        return { isRelevant: false, reasoning: "Failed to parse LLM response", theme: "other" };
    }
}
