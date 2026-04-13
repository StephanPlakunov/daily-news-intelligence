import type { NewsApiArticle } from "./digest";
import { getTodayDateString } from "./date";

type NewsApiResponse = {
  status: "ok" | "error";
  articles?: NewsApiArticle[];
  code?: string;
  message?: string;
};

const NEWS_API_BASE_URL = "https://newsapi.org/v2/everything";
const TOP_HEADLINES_BASE_URL = "https://newsapi.org/v2/top-headlines";
const CURATED_TREND_DISCOVERY_QUERY =
  '"artificial intelligence" OR climate OR election OR market OR smartphone OR football OR health OR war OR space';

async function sendNewsApiRequest(params: URLSearchParams, newsApiKey: string): Promise<NewsApiArticle[]> {
  const response = await fetch(`${NEWS_API_BASE_URL}?${params.toString()}`, {
    headers: {
      "X-Api-Key": newsApiKey
    }
  });

  if (!response.ok) {
    throw new Error(`News API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as NewsApiResponse;

  if (data.status !== "ok") {
    throw new Error(`News API returned an error: ${data.code ?? "unknown_code"} - ${data.message ?? "unknown message"}`);
  }

  return data.articles ?? [];
}

export async function fetchTopicArticles(topic: string, date: string, newsApiKey: string): Promise<NewsApiArticle[]> {
  const exactTopicQuery = topic.includes(" ") ? `"${topic}"` : topic;
  const params = new URLSearchParams({
    q: exactTopicQuery,
    from: `${date}T00:00:00Z`,
    pageSize: "5",
    sortBy: date === getTodayDateString() ? "publishedAt" : "relevancy",
    language: "en",
    searchIn: "title,description"
  });

  const datedArticles = await sendNewsApiRequest(params, newsApiKey);

  if (datedArticles.length > 0 || date !== getTodayDateString()) {
    return datedArticles;
  }

  const fallbackParams = new URLSearchParams({
    q: exactTopicQuery,
    pageSize: "5",
    sortBy: "publishedAt",
    language: "en",
    searchIn: "title,description"
  });

  return sendNewsApiRequest(fallbackParams, newsApiKey);
}

export async function fetchBroadNewsSample(date: string, newsApiKey: string): Promise<NewsApiArticle[]> {
  const params = new URLSearchParams({
    q: CURATED_TREND_DISCOVERY_QUERY,
    from: `${date}T00:00:00Z`,
    to: `${date}T23:59:59Z`,
    pageSize: "30",
    sortBy: "popularity",
    language: "en"
  });

  return sendNewsApiRequest(params, newsApiKey);
}

export async function fetchTodayHeadlineSample(newsApiKey: string): Promise<NewsApiArticle[]> {
  const params = new URLSearchParams({
    country: "us",
    pageSize: "30"
  });

  const response = await fetch(`${TOP_HEADLINES_BASE_URL}?${params.toString()}`, {
    headers: {
      "X-Api-Key": newsApiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Top headlines request failed with status ${response.status}`);
  }

  const data = (await response.json()) as NewsApiResponse;

  if (data.status !== "ok") {
    throw new Error(`Top headlines returned an error: ${data.code ?? "unknown_code"} - ${data.message ?? "unknown message"}`);
  }

  return data.articles ?? [];
}
