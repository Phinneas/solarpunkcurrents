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

    // Thinking tokens count toward max_tokens. Fail loudly instead of
    // returning a truncated or empty payload that surfaces later as a parse error.
    if (response.stop_reason === "max_tokens") {
      throw new Error(
        `Claude hit max_tokens (${maxTokens}) with effort=${effort} — output truncated, likely thinking overhead`,
      );
    }

    // The content array can hold thinking blocks and more than one text block.
    // Join every text block so the JSON is not dropped.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!text.trim()) {
      throw new Error(
        `Claude returned no text content: stop_reason=${response.stop_reason}, ` +
          `blocks=[${response.content.map((b) => b.type).join(", ") || "none"}], ` +
          `effort=${effort}, max_tokens=${maxTokens}`,
      );
    }

    return text;
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
