import assert from "node:assert/strict";

import {
  buildClaudePrompt,
  buildDigestRecord,
  buildTrendingTopicsPrompt,
  inferTopicsHeuristically,
  getTodayDateString,
  normalizeArticles,
  parseTopicsFromModelOutput
} from "../lib/digest";
import { EARLIEST_SUPPORTED_DIGEST_DATE } from "../lib/date";
import { buildDigestErrorResponse, buildDigestSuccessResponse, classifyDigestError, resolveDigestDate, sortDigestItems } from "../lib/getDigest";
import { getDefaultTopics, parseTopics } from "../lib/topics";

function runTest(name: string, testFn: () => void): void {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("getDefaultTopics returns the seeded portfolio topics", () => {
  assert.deepEqual(getDefaultTopics(), ["F1 racing", "AI technology", "climate tech"]);
});

runTest("getTodayDateString returns a Berlin-local ISO calendar date", () => {
  assert.equal(getTodayDateString(new Date("2026-04-13T10:15:00.000Z")), "2026-04-13");
});

runTest("normalizeArticles keeps only usable title and url pairs", () => {
  assert.deepEqual(
    normalizeArticles([
      { title: "  First  ", url: " https://example.com/first " },
      { title: "Missing url", url: "" },
      { title: null, url: "https://example.com/ignored" }
    ]),
    [{ title: "First", url: "https://example.com/first" }]
  );
});

runTest("buildClaudePrompt includes the topic and article context", () => {
  const prompt = buildClaudePrompt("AI technology", [
    {
      title: "Open-source model ships",
      description: "A new open-source reasoning model was released.",
      url: "https://example.com/model"
    }
  ]);

  assert.match(prompt, /AI technology/);
  assert.match(prompt, /Open-source model ships/);
  assert.match(prompt, /exactly 3 sentences/);
});

runTest("buildTrendingTopicsPrompt asks for three short labels", () => {
  const prompt = buildTrendingTopicsPrompt("2026-04-13", [
    {
      title: "Markets rally on AI spending",
      description: "Tech stocks led another market surge.",
      url: "https://example.com/markets"
    }
  ]);

  assert.match(prompt, /2026-04-13/);
  assert.match(prompt, /exactly three short topic labels/);
});

runTest("parseTopicsFromModelOutput normalizes line-based topics", () => {
  assert.deepEqual(parseTopicsFromModelOutput("1. AI chip demand\n- Climate adaptation\n3) Formula 1 strategy"), [
    "AI chip demand",
    "Climate adaptation",
    "Formula 1 strategy"
  ]);
});

runTest("buildDigestRecord trims the summary and returns normalized references", () => {
  assert.deepEqual(
    buildDigestRecord(
      "climate tech",
      "  Investment picked up across battery startups.  ",
      [{ title: "Battery startups raise capital", url: "https://example.com/battery" }],
      "trending"
    ),
    {
      topic: "climate tech",
      summary: "Investment picked up across battery startups.",
      articles: [{ title: "Battery startups raise capital", url: "https://example.com/battery" }],
      articleCount: 1,
      topicSource: "trending"
    }
  );
});

runTest("buildDigestRecord rejects topics without usable articles", () => {
  assert.throws(
    () => buildDigestRecord("F1 racing", "A summary", [{ title: "Missing URL", url: null }], "user"),
    /No usable articles/
  );
});

runTest("inferTopicsHeuristically derives repeated headline themes", () => {
  const topics = inferTopicsHeuristically([
    { title: "OpenAI ships new coding agent", url: "https://example.com/1" },
    { title: "Coding agent usage grows in enterprises", url: "https://example.com/2" },
    { title: "New coding agent sparks developer debate", url: "https://example.com/3" }
  ]);

  assert.equal(topics[0], "Coding Agent");
  assert.ok(topics.length >= 2);
});

runTest("parseTopics supports comma-separated topic configuration", () => {
  assert.deepEqual(parseTopics("space, economics , robotics"), ["space", "economics", "robotics"]);
});

runTest("resolveDigestDate accepts explicit history dates", () => {
  assert.equal(resolveDigestDate("2026-04-10"), "2026-04-10");
});

runTest("resolveDigestDate rejects malformed dates", () => {
  assert.throws(() => resolveDigestDate("10-04-2026"), /YYYY-MM-DD/);
});

runTest("resolveDigestDate rejects dates before the supported archive window", () => {
  assert.throws(() => resolveDigestDate("2026-03-31"), new RegExp(EARLIEST_SUPPORTED_DIGEST_DATE));
});

runTest("classifyDigestError marks invalid dates as client errors", () => {
  assert.deepEqual(classifyDigestError(new Error("The date query parameter must use YYYY-MM-DD format.")), {
    statusCode: 400,
    code: "invalid_request"
  });
});

runTest("classifyDigestError marks upstream failures as bad gateway", () => {
  assert.deepEqual(classifyDigestError(new Error("News API request failed with status 429")), {
    statusCode: 502,
    code: "upstream_dependency_failed"
  });
});

runTest("buildDigestErrorResponse includes an explicit error code", () => {
  const response = buildDigestErrorResponse(
    "Failed to generate the requested digest.",
    "The date query parameter must use YYYY-MM-DD format.",
    new Error("The date query parameter must use YYYY-MM-DD format.")
  );
  const payload = JSON.parse(response.body) as { code: string };

  assert.equal(response.statusCode, 400);
  assert.equal(payload.code, "invalid_request");
});

runTest("sortDigestItems returns items ordered by topic", () => {
  assert.deepEqual(
    sortDigestItems([
      { date: "2026-04-13", topic: "zeta", summary: "A", articles: [], createdAt: "2026-04-13T00:00:00Z" },
      { date: "2026-04-13", topic: "alpha", summary: "B", articles: [], createdAt: "2026-04-13T00:00:00Z" }
    ]).map((item) => item.topic),
    ["alpha", "zeta"]
  );
});

runTest("buildDigestSuccessResponse returns API payload with selected date", () => {
  const response = buildDigestSuccessResponse(
    [
      {
        date: "2026-04-11",
        topic: "AI",
        summary: "Summary",
        articles: [],
        createdAt: "2026-04-11T07:00:00Z",
        topicSource: "trending"
      }
    ],
    "2026-04-11"
  );
  const payload = JSON.parse(response.body) as { date: string; items: Array<{ topic: string }> };

  assert.equal(response.statusCode, 200);
  assert.equal(payload.date, "2026-04-11");
  assert.deepEqual(payload.items.map((item: { topic: string }) => item.topic), ["AI"]);
});

console.log("All backend digest tests passed.");
