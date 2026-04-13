export type DigestArticle = {
  title: string;
  url: string;
};

export type DigestTopicSource = "trending" | "user";

export type DigestItem = {
  date: string;
  topic: string;
  summary: string;
  articles: DigestArticle[];
  createdAt: string;
  articleCount?: number;
  topicSource?: DigestTopicSource;
};

export function normalizeDigestResponse(data: unknown): DigestItem[] {
  if (Array.isArray(data)) {
    return data as DigestItem[];
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      return record.items as DigestItem[];
    }

    if (Array.isArray(record.digests)) {
      return record.digests as DigestItem[];
    }
  }

  throw new Error("The API returned data in an unexpected format.");
}

export function getApiBaseUrl(): string {
  const testBaseUrl =
    typeof globalThis === "object" &&
    "__TEST_VITE_API_BASE_URL" in globalThis &&
    typeof (globalThis as { __TEST_VITE_API_BASE_URL?: unknown }).__TEST_VITE_API_BASE_URL === "string"
      ? ((globalThis as { __TEST_VITE_API_BASE_URL?: string }).__TEST_VITE_API_BASE_URL as string)
      : undefined;
  const envBaseUrl =
    typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.VITE_API_BASE_URL === "string"
      ? import.meta.env.VITE_API_BASE_URL
      : undefined;
  const baseUrl = envBaseUrl ?? testBaseUrl;

  if (!baseUrl) {
    throw new Error("Missing VITE_API_BASE_URL. Add it to frontend/.env.local.");
  }

  return baseUrl.replace(/\/$/, "");
}

export function buildDigestUrl(date: string): string {
  const params = new URLSearchParams({ date });
  return `${getApiBaseUrl()}/digest?${params.toString()}`;
}

async function buildApiError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const data = (await response.json()) as { message?: string; error?: string; code?: string };
    const details = [data.message, data.error].filter((value): value is string => typeof value === "string" && value.length > 0);

    if (details.length > 0) {
      return new Error(details.join(" "));
    }
  } catch {
    // Ignore JSON parsing failures and fall back to the status-based message.
  }

  return new Error(`${fallbackMessage} (${response.status}).`);
}

export async function fetchDigest(date: string): Promise<DigestItem[]> {
  const response = await fetch(buildDigestUrl(date));

  if (!response.ok) {
    throw await buildApiError(response, "Digest request failed");
  }

  const data = (await response.json()) as unknown;
  return normalizeDigestResponse(data);
}

export async function generateDigest(date: string, topic?: string): Promise<DigestItem[]> {
  const response = await fetch(`${getApiBaseUrl()}/digest`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(topic ? { date, topic } : { date })
  });

  if (!response.ok) {
    throw await buildApiError(response, "Digest generation failed");
  }

  const data = (await response.json()) as unknown;
  return normalizeDigestResponse(data);
}
