import { getTodayDateString } from "./date";

export type NewsApiArticle = {
  title?: string | null;
  description?: string | null;
  url?: string | null;
};

export type DigestArticleReference = {
  title: string;
  url: string;
};

export type DigestTopicSource = "trending" | "user";

export type ProcessedTopicDigest = {
  topic: string;
  summary: string;
  articles: DigestArticleReference[];
  articleCount: number;
  topicSource: DigestTopicSource;
};

export type StoredDigestRecord = {
  date: string;
  topic: string;
  summary: string;
  articles: DigestArticleReference[];
  articleCount: number;
  createdAt: string;
  topicSource: DigestTopicSource;
};

export function normalizeArticles(articles: NewsApiArticle[]): DigestArticleReference[] {
  return articles.flatMap((article) => {
    const title = article.title?.trim();
    const url = article.url?.trim();

    if (!title || !url) {
      return [];
    }

    return [{ title, url }];
  });
}

export function buildClaudePrompt(topic: string, articles: NewsApiArticle[]): string {
  const articleText = articles
    .map((article, index) => {
      const title = article.title?.trim() || "Untitled article";
      const description = article.description?.trim() || "No description provided.";

      return `${index + 1}. Title: ${title}\nDescription: ${description}`;
    })
    .join("\n\n");

  return [
    `You are writing a daily news digest for the topic "${topic}".`,
    "Using only the article titles and descriptions below, write exactly 3 sentences.",
    "Keep the summary concise, factual, and easy to read.",
    "Do not use bullet points.",
    "",
    articleText
  ].join("\n");
}

export function buildTrendingTopicsPrompt(date: string, articles: NewsApiArticle[]): string {
  const articleText = articles
    .map((article, index) => {
      const title = article.title?.trim() || "Untitled article";
      const description = article.description?.trim() || "No description provided.";

      return `${index + 1}. Title: ${title}\nDescription: ${description}`;
    })
    .join("\n\n");

  return [
    `You are identifying the three most prominent news topics for ${date}.`,
    "Use only the article titles and descriptions below.",
    "Return exactly three short topic labels.",
    "Each topic must be 2 to 5 words.",
    "Prefer concrete themes over generic labels like 'world news' or 'current events'.",
    "Return each topic on its own line with no numbering, bullets, or extra commentary.",
    "",
    articleText
  ].join("\n");
}

export function parseTopicsFromModelOutput(output: string): string[] {
  return [...new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .map((topic) => topic.slice(0, 60))
  )].slice(0, 3);
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "amid",
  "and",
  "are",
  "because",
  "before",
  "conference",
  "coverage",
  "cbs",
  "developing",
  "doctors",
  "from",
  "free",
  "guide",
  "game",
  "have",
  "how",
  "into",
  "latest",
  "live",
  "more",
  "movie",
  "politico",
  "press",
  "report",
  "round",
  "scientists",
  "slashdot",
  "stream",
  "sunday",
  "over",
  "says",
  "that",
  "their",
  "them",
  "they",
  "this",
  "today",
  "watch",
  "what",
  "when",
  "with",
  "will",
  "world"
]);

function tokenizeHeadlineText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

export function inferTopicsHeuristically(articles: NewsApiArticle[]): string[] {
  const scores = new Map<string, number>();

  for (const article of articles) {
    const title = article.title?.trim();

    if (!title) {
      continue;
    }

    const tokens = tokenizeHeadlineText(title);

    for (let index = 0; index < tokens.length; index += 1) {
      const unigram = tokens[index];
      scores.set(unigram, (scores.get(unigram) ?? 0) + 1);

      const next = tokens[index + 1];

      if (next) {
        const bigram = `${unigram} ${next}`;
        scores.set(bigram, (scores.get(bigram) ?? 0) + 2);
      }
    }
  }

  const scoredTopics = [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([topic]) => topic)
    .filter((topic, index, topics) => !topics.slice(0, index).some((existing) => existing.includes(topic) || topic.includes(existing)));

  const titleDerivedTopics = articles.flatMap((article) => {
    const title = article.title?.trim();

    if (!title) {
      return [];
    }

    const tokens = tokenizeHeadlineText(title).slice(0, 3);

    if (tokens.length === 0) {
      return [];
    }

    return [tokens.join(" ")];
  });

  return [...new Set([...scoredTopics, ...titleDerivedTopics])]
    .filter((topic, index, topics) => !topics.slice(0, index).some((existing) => existing.includes(topic) || topic.includes(existing)))
    .slice(0, 6)
    .map((topic) => topic.replace(/\b\w/g, (match) => match.toUpperCase()));
}

export function buildFallbackSummary(topic: string, articles: NewsApiArticle[]): string {
  const normalizedArticles = normalizeArticles(articles).slice(0, 3);

  if (normalizedArticles.length === 0) {
    throw new Error(`No usable fallback articles were returned for topic "${topic}"`);
  }

  const sentences = normalizedArticles.map((article, index) => {
    if (index === 0) {
      return `${topic} coverage centers on ${article.title}.`;
    }

    if (index === 1) {
      return `Another major development is ${article.title}.`;
    }

    return `Additional reporting highlights ${article.title}.`;
  });

  while (sentences.length < 3) {
    sentences.push(`Coverage on ${topic} is still developing.`);
  }

  return sentences.join(" ");
}

export function buildDigestRecord(
  topic: string,
  summary: string,
  articles: NewsApiArticle[],
  topicSource: DigestTopicSource
): ProcessedTopicDigest {
  const normalizedArticles = normalizeArticles(articles);

  if (normalizedArticles.length === 0) {
    throw new Error(`No usable articles were returned for topic "${topic}"`);
  }

  const trimmedSummary = summary.trim();

  if (!trimmedSummary) {
    throw new Error(`Summary for topic "${topic}" is empty`);
  }

  return {
    topic,
    summary: trimmedSummary,
    articles: normalizedArticles,
    articleCount: normalizedArticles.length,
    topicSource
  };
}

export { getTodayDateString };
