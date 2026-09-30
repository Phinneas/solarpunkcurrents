import { z } from "zod/v4";
import { chatWithClaude } from "../llm/anthropic.js";
import { log } from "../logger.js";
export async function selectTopStories(contentItems, previousNewsletter) {
    const contentText = contentItems
        .map((item) => `<${item.identifier}>\n---\nidentifier: ${item.identifier}\nfriendlyType: ${item.type}\ntheme: ${item.theme}\nsourceName: ${item.sourceName}\nexternalSourceUrls: ${item.externalSourceUrls}\n---\n\n${item.content}\n</${item.identifier}>`)
        .join("\n\n");
    const prompt = `You are the editor of Solarpunk Currents, a newsletter that covers the clean energy transition through a solarpunk lens. You believe the energy transition is not just about technology and policy — it's about building a more just, equitable, and beautiful world. You center community power, climate justice, and imaginative futures alongside hard energy news.

## Task

Select the top 4 stories from the provided content to feature in our newsletter. These should be the most impactful, interesting, and relevant stories for our audience of clean energy enthusiasts, climate-conscious readers, solarpunk community members, and activists following the energy transition.

Each content item includes a \`feedType\` field indicating its type: "article" (news), "tutorial" (how-to/guide), "research" (papers/studies), or "newsletter" (analysis).

## Editorial Principles

Apply these principles when evaluating and ranking stories:

1. **Community over corporate**: Prioritize stories about community-owned energy, grassroots projects, co-ops, and mutual aid solar over corporate earnings calls and product launches. A story about a rural co-op going solar is more interesting to our readers than a Fortune 500 company's renewable energy pledge.

2. **Justice lens**: Center stories that ask who benefits from the transition and who bears the burden. Just transition for fossil fuel workers, Indigenous-led energy projects, environmental justice communities, and energy equity are core to our editorial mission.

3. **Solutions and hope**: We are a solarpunk newsletter — we believe a better world is possible. Prefer stories about real solutions, successful deployments, and people building the future over pure problem-reporting or doom. But don't shy away from hard truths — critical analysis is welcome when it serves accountability.

4. **Anti-greenwashing**: Be skeptical of corporate "commitments" and "pledges" that lack concrete plans, timelines, or accountability. A story about a company announcing a vague 2050 net-zero target with no interim milestones is not a good story. A story about a company being held accountable for greenwashing is.

5. **Global perspectives**: The energy transition is global. Prioritize stories from the Global South, Asia, Africa, and Latin America alongside US/Europe. Indigenous-led projects and land sovereignty movements are especially welcome.

6. **Resistance and power**: Stories about communities resisting fossil fuel expansion, pipeline protests, divestment campaigns, and anti-extraction movements are core to our beat.

7. **Imagination and culture**: Solarpunk is about imagining better futures. Stories about solarpunk art, fiction, speculative design, community visioning, and creative approaches to the energy transition add something unique that other newsletters don't cover.

## Selection Criteria

1. **Impact**: Stories about major developments in solar, renewables, energy storage, or clean energy policy — but measure impact by real-world consequences for communities and the planet, not just stock prices
2. **Relevance**: Stories about solar, wind, geothermal, hydrogen, storage, grids, electrification, decarbonization, climate justice, or the solarpunk movement — including its culture: fiction, art, music, off-grid living, permaculture, protest, and good news for the planet
3. **Interest**: Stories that would genuinely interest and excite our audience — community energy projects, environmental justice victories, real-world deployments, resistance movements, and imaginative futures
4. **Diversity and balance (required)**: Cover different aspects of the movement, not just energy tech. Aim for a mix of:
   - Technology vs policy vs community vs culture vs living
   - Solutions/hopeful vs critical/accountability
   - Global vs local
   - Each item carries a theme field (energy, policy, community, justice, culture, activism, living, good-news, research, other). Use it to balance the picks.
   - At least 2 of the 4 stories MUST be non-energy themes: culture, community, justice, activism, living, or good-news. At most 2 may be energy, policy, or research tech stories.
   - Do not lead with a data-center, gadget, or product-launch story unless it carries a real community or justice angle.
5. **Recency**: Prefer newer developments over older news

## Content to Evaluate

${contentText}

${previousNewsletter ? `## Previous Newsletter (avoid duplicating these stories)\n\n${previousNewsletter}` : ""}

## Output Format

You MUST respond with valid JSON in this exact format:
{
  "top_selected_stories_chain_of_thought": "Your detailed reasoning for each story selection and rejection. Explain how each pick serves our solarpunk editorial principles...",
  "top_selected_stories": [
    {
      "title": "A concise, catchy headline for this story section",
      "summary": "A brief summary of this story with notes on what to expand on",
      "identifiers": ["identifier1", "identifier2"],
      "external_source_links": ["url1", "url2"]
    }
  ]
}

Select exactly 4 stories. The first story should be the most impactful/important one (the lead story). Consider which story best embodies our editorial mission — not just the biggest headline, but the one that matters most to our community.`;
    const response = await chatWithClaude({
        system: "You are the editor of Solarpunk Currents, a newsletter covering the clean energy transition through a solarpunk lens. You center community power, climate justice, and imaginative futures. You are skeptical of corporate greenwashing and prioritize stories about real solutions and grassroots action. Always respond with valid JSON.",
        prompt,
        maxTokens: 8192,
    });
    const StorySelectionSchema = z.object({
        top_selected_stories_chain_of_thought: z.string(),
        top_selected_stories: z.array(z.object({
            title: z.string(),
            summary: z.string(),
            identifiers: z.array(z.string()),
            external_source_links: z.array(z.string()),
        })),
    });
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error("No JSON found in response");
        const result = StorySelectionSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (!result.success) {
            log.error("Story selection validation failed", { issues: result.error.issues });
            log.error("Raw LLM response", { response: response.slice(0, 2000) });
            throw new Error("Story selection response did not match expected schema");
        }
        return {
            reasoning: result.data.top_selected_stories_chain_of_thought,
            stories: result.data.top_selected_stories,
        };
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("schema"))
            throw err;
        log.error("Failed to parse story selection", { error: err instanceof Error ? err.message : String(err) });
        log.error("Raw LLM response", { response: response.slice(0, 2000) });
        throw new Error("Failed to parse story selection from LLM");
    }
}
