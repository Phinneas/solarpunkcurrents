import { Mistral } from "@mistralai/mistralai";
import { config } from "../config.js";
import type { LLMClient } from "./types.js";

let client: Mistral | null = null;
let lastApiKey = "";

function getClient(): Mistral {
  const apiKey = config.mistral.apiKey || process.env?.MISTRAL_API_KEY || "";
  if (!client || apiKey !== lastApiKey) {
    client = new Mistral({ apiKey });
    lastApiKey = apiKey;
  }
  return client;
}

export const mistralClient: LLMClient = {
  async chat({ system, prompt, maxTokens = 4096 }) {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const response = await getClient().chat.complete({
      model: "mistral-large-latest",
      messages,
      maxTokens,
    });

    return response.choices?.[0]?.message?.content as string ?? "";
  },
};

export async function chatWithMistral(params: {
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  return mistralClient.chat(params);
}
