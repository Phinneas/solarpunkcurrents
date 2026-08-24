import { chatWithMistral } from "../llm/mistral.js";
import { log } from "../logger.js";

export async function generateSearchQueries(): Promise<string[]> {
  const today = new Date().toISOString().substring(0, 10);

  const prompt = `You are a solar and clean energy news researcher. Today's date is ${today}.

Generate 8-12 search queries to find the most important solar and clean energy news stories AND the best analysis/guides from today and the past few days.

## News queries (generate 5-7):
- New solar, wind, or battery storage project announcements and deployments
- Clean energy policy, regulation, incentives, and government actions
- Renewable energy market trends, pricing, and supply chain developments
- Grid modernization, transmission, and distributed energy news
- Clean energy research breakthroughs and new technology developments
- Major company announcements in solar, storage, EVs, or electrification
- Community solar, co-ops, and environmental justice developments
- Offshore wind, geothermal, hydrogen, and other emerging renewables

## Analysis/guide queries (generate 3-5):
- Explainers on clean energy policy, tax credits, or regulatory changes
- Guides on residential solar, battery storage, or heat pump installations
- Analysis of renewable energy market data, deployment statistics, or forecasts
- Technical deep-dives on solar cell technology, battery chemistry, or grid integration
- Beginner-friendly explainers on the energy transition and decarbonization

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

    const parsed = JSON.parse(jsonMatch[0]) as { queries?: string[] };
    const queries = parsed.queries;

    if (!Array.isArray(queries) || queries.length === 0) {
      log.warn("No queries returned from Mistral, using defaults");
      return getDefaultQueries();
    }

    log.info(`Generated ${queries.length} search queries`, { queries });
    return queries;
  } catch {
    log.warn("Failed to parse Mistral query response, using defaults");
    return getDefaultQueries();
  }
}

function getDefaultQueries(): string[] {
  return [
    "latest solar energy project announcement today",
    "clean energy policy regulation news 2025",
    "new battery storage deployment news",
    "renewable energy market trends pricing",
    "solar panel technology breakthrough research",
    "grid modernization transmission news",
    "community solar co-op clean energy news",
    "heat pump electrification deployment guide",
    "residential solar battery storage installation guide",
    "offshore wind geothermal hydrogen energy news",
  ];
}
