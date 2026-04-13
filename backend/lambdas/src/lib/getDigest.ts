import type { APIGatewayProxyResult } from "aws-lambda";

import { normalizeRequestedDate } from "./date";
import type { DigestTopicSource } from "./digest";

export type StoredDigestItem = {
  date: string;
  topic: string;
  summary: string;
  articles: Array<{
    title: string;
    url: string;
  }>;
  articleCount?: number;
  createdAt: string;
  topicSource?: DigestTopicSource;
};

export type DigestErrorCode =
  | "invalid_request"
  | "invalid_payload"
  | "upstream_dependency_failed"
  | "service_unavailable"
  | "internal_error";

export function resolveDigestDate(dateParam: string | undefined): string {
  return normalizeRequestedDate(dateParam);
}

export function sortDigestItems(items: StoredDigestItem[]): StoredDigestItem[] {
  return [...items].sort((left, right) => left.topic.localeCompare(right.topic));
}

export function buildDigestSuccessResponse(items: StoredDigestItem[], date: string, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify({
      date,
      items: sortDigestItems(items)
    })
  };
}

export function classifyDigestError(error: unknown): { statusCode: number; code: DigestErrorCode } {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (
    message.includes("YYYY-MM-DD") ||
    message.includes("earliest supported digest date") ||
    message.includes("cannot be in the future") ||
    message.includes("Invalid JSON request body") ||
    message.includes("Topic labels must")
  ) {
    return { statusCode: 400, code: "invalid_request" };
  }

  if (message.includes("No broad news sample") || message.includes("No articles were found")) {
    return { statusCode: 404, code: "invalid_payload" };
  }

  if (message.includes("News API") || message.includes("Claude API")) {
    return { statusCode: 502, code: "upstream_dependency_failed" };
  }

  if (message.includes("Missing required environment variable") || message.includes("Secret ")) {
    return { statusCode: 503, code: "service_unavailable" };
  }

  return { statusCode: 500, code: "internal_error" };
}

export function buildDigestErrorResponse(message: string, details: string, error: unknown): APIGatewayProxyResult {
  const { statusCode, code } = classifyDigestError(error);

  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify({
      message,
      error: details,
      code
    })
  };
}
