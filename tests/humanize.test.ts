import { describe, it, expect, vi, beforeEach } from "vitest";
import { humanizeNewsletter } from "../src/generate/humanize.js";
import { chatWithClaude } from "../src/llm/anthropic.js";

vi.mock("../src/llm/anthropic.js", () => ({
  chatWithClaude: vi.fn(),
}));

const mockedChat = vi.mocked(chatWithClaude);

describe("humanizeNewsletter", () => {
  beforeEach(() => {
    mockedChat.mockReset();
  });

  it("returns the Claude rewrite when output is valid", async () => {
    const original =
      "# Subject\n\nSome newsletter content that is long enough to survive the length check.";
    const rewritten = "# Subject\n\nNatural human prose without AI tells.";

    mockedChat.mockResolvedValue(rewritten);

    const result = await humanizeNewsletter(original);

    expect(result).toBe(rewritten);
    expect(mockedChat).toHaveBeenCalledTimes(1);

    const call = mockedChat.mock.calls[0][0];
    expect(call.prompt).toContain(original);
    expect(call.maxTokens).toBe(16384);
    expect(call.system ?? "").toContain("35.");
  });

  it("keeps the original when Claude returns empty output", async () => {
    const original = "# Subject\n\nContent.";
    mockedChat.mockResolvedValue("");

    const result = await humanizeNewsletter(original);

    expect(result).toBe(original);
  });

  it("keeps the original when output is too short", async () => {
    const original =
      "This is a sufficiently long newsletter body for the length check.";
    mockedChat.mockResolvedValue("short");

    const result = await humanizeNewsletter(original);

    expect(result).toBe(original);
  });

  it("strips em and en dashes from Claude output", async () => {
    const original =
      "A long enough original newsletter body that will pass the length check.";
    mockedChat.mockResolvedValue(
      "Human prose \u2014 with an em dash and \u2013 an en dash in it."
    );

    const result = await humanizeNewsletter(original);

    expect(result).not.toContain("\u2014");
    expect(result).not.toContain("\u2013");
    expect(result).toContain("Human prose");
  });

  it("keeps the original when Claude throws", async () => {
    const original = "Newsletter content here.";
    mockedChat.mockRejectedValue(new Error("API down"));

    const result = await humanizeNewsletter(original);

    expect(result).toBe(original);
  });
});
