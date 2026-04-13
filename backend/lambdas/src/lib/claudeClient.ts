const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const SUMMARY_MODEL = "claude-sonnet-4-20250514";

type ClaudeTextBlock = {
  type: "text";
  text: string;
};

type ClaudeResponse = {
  content?: ClaudeTextBlock[];
};

export async function runClaudePrompt(prompt: string, claudeApiKey: string, maxTokens = 300): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(`Claude API request failed with status ${response.status}: ${errorBody}`);

      if (response.status === 529 || response.status >= 500) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }

      throw error;
    }

    const data = (await response.json()) as ClaudeResponse;
    const summary = data.content?.find((block) => block.type === "text")?.text?.trim();

    if (!summary) {
      throw new Error("Claude API returned an empty text response");
    }

    return summary;
  }

  throw lastError ?? new Error("Claude API request failed for an unknown reason");
}
