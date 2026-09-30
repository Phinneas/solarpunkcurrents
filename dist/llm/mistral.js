import { Mistral } from "@mistralai/mistralai";
import { config } from "../config.js";
let client = null;
let lastApiKey = "";
function getClient() {
    const apiKey = config.mistral.apiKey || process.env?.MISTRAL_API_KEY || "";
    if (!client || apiKey !== lastApiKey) {
        client = new Mistral({ apiKey });
        lastApiKey = apiKey;
    }
    return client;
}
export const mistralClient = {
    async chat({ system, prompt, maxTokens = 4096 }) {
        const messages = [];
        if (system)
            messages.push({ role: "system", content: system });
        messages.push({ role: "user", content: prompt });
        const response = await getClient().chat.complete({
            model: "mistral-large-latest",
            messages,
            maxTokens,
        });
        return response.choices?.[0]?.message?.content ?? "";
    },
};
export async function chatWithMistral(params) {
    return mistralClient.chat(params);
}
