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
  const { buildDigestUrl, normalizeDigestResponse } = await import("../lib/api.js");

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

  console.log("All frontend API tests passed.");
}

void main();
