import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { LLMClient } from "./types.js";

let client: Anthropic | null = null;
let lastApiKey = "";

function getClient(): Anthropic {
  const apiKey = config.anthropic.apiKey || process.env?.ANTHROPIC_API_KEY || "";
  if (!client || apiKey !== lastApiKey) {
    client = new Anthropic({ apiKey });
    lastApiKey = apiKey;
  }
  return client;
}

export const anthropicClient: LLMClient = {
  async chat({ system, prompt, maxTokens = 8192, effort = "medium" }) {
    const response = await getClient().messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: maxTokens,
      output_config: { effort },
      system: system ?? "",
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  },
};

export async function chatWithClaude(params: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "max";
}): Promise<string> {
  return anthropicClient.chat(params);
}
