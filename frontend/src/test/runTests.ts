import assert from "node:assert/strict";

function runTest(name: string, testFn: () => void): void {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  (globalThis as { __TEST_VITE_API_BASE_URL?: string }).__TEST_VITE_API_BASE_URL =
    "https://example.execute-api.eu-central-1.amazonaws.com/prod";
  const { buildDigestUrl, generateDigest, normalizeDigestResponse } = await import("../lib/api.js");

  runTest("normalizeDigestResponse accepts object payloads with items", () => {
    assert.deepEqual(
      normalizeDigestResponse({
        items: [{ date: "2026-04-13", topic: "AI", summary: "Summary", articles: [], createdAt: "2026-04-13T07:00:00Z" }]
      }),
      [{ date: "2026-04-13", topic: "AI", summary: "Summary", articles: [], createdAt: "2026-04-13T07:00:00Z" }]
    );
  });

  runTest("buildDigestUrl appends the selected date", () => {
    assert.equal(
      buildDigestUrl("2026-04-10"),
      "https://example.execute-api.eu-central-1.amazonaws.com/prod/digest?date=2026-04-10"
    );
  });

  runTest("normalizeDigestResponse keeps topic source metadata", () => {
    assert.deepEqual(
      normalizeDigestResponse({
        items: [
          {
            date: "2026-04-13",
            topic: "AI",
            summary: "Summary",
            articles: [],
            createdAt: "2026-04-13T07:00:00Z",
            topicSource: "user"
          }
        ]
      })[0]?.topicSource,
      "user"
    );
  });

  runTest("normalizeDigestResponse rejects unexpected payloads", () => {
    assert.throws(() => normalizeDigestResponse({ digest: [] }), /unexpected format/i);
  });

  runTest("generateDigest surfaces a rate-limit specific message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          message: "Failed to generate the requested digest.",
          error: "News API request failed with status 429",
          code: "rate_limited"
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json"
          }
        }
      );

    try {
      await assert.rejects(
        () => generateDigest("2026-04-11"),
        /The news provider rate-limited this request\. Try again later or use a higher NewsAPI quota\./
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log("All frontend API tests passed.");
}

void main();
