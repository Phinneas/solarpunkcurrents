import { chatWithMistral } from "../llm/mistral.js";
import { log } from "../logger.js";
export async function generateSearchQueries() {
    const today = new Date().toISOString().substring(0, 10);
    const prompt = `You are a solarpunk news researcher. Today's date is ${today}.

Solarpunk is a cultural movement, not just an energy technology beat. Generate 10-14 search queries to find the most important solar and clean energy news AND the best human stories, culture, community, and good-news pieces from today and the past few days.

## News queries (generate 4-5):
- New solar, wind, or battery storage project announcements and deployments
- Clean energy policy, regulation, incentives, and government actions
- Grid modernization, transmission, and distributed energy news
- Community solar, co-ops, and environmental justice developments
- Clean energy research breakthroughs and new technology developments

## Culture & human stories (generate 4-5):
- New solarpunk or climate fiction books, art, music, or film
- Off-grid, permaculture, degrowth, and simple living projects and people
- Grassroots protests, mutual aid, and community organizing wins
- Makers, repair cafés, and DIY sustainability solutions
- Good news for the planet: restoration, conservation wins, species recovery

## Analysis/guide queries (generate 2-4):
- Explainers on clean energy policy, tax credits, or regulatory changes
- Guides on residential solar, battery storage, heat pumps, or off-grid systems
- Analysis of renewable energy market data or deployment statistics

Each query should be specific enough to return relevant results but broad enough to capture multiple stories. Use natural search language, not boolean operators.

Respond with valid JSON in this exact format:
{
  "queries": ["query 1", "query 2", "query 3"]
}`;
    const response = await chatWithMistral({ prompt, maxTokens: 1024 });
    try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn("Failed to parse search queries from Mistral response");
            return getDefaultQueries();
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const queries = parsed.queries;
        if (!Array.isArray(queries) || queries.length === 0) {
            log.warn("No queries returned from Mistral, using defaults");
            return getDefaultQueries();
        }
        log.info(`Generated ${queries.length} search queries`, { queries });
        return queries;
    }
    catch {
        log.warn("Failed to parse Mistral query response, using defaults");
        return getDefaultQueries();
    }
}
function getDefaultQueries() {
    return [
        "latest solar energy project announcement today",
        "clean energy policy regulation news 2025",
        "new battery storage deployment news",
        "community solar co-op clean energy news",
        "solarpunk climate fiction new book release",
        "off-grid permaculture living project profile",
        "climate justice protest victory this week",
        "mutual aid community organizing climate",
        "good news for the planet restoration conservation",
        "repair cafe DIY sustainability maker story",
        "residential solar battery storage installation guide",
        "heat pump electrification deployment guide",
    ];
}
