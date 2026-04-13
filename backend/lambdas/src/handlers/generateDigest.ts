import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { generateDailyTrendingDigest, type DigestGenerationDependencies } from "../lib/digestGeneration";
import { buildDigestErrorResponse, buildDigestSuccessResponse, resolveDigestDate } from "../lib/getDigest";
import { requireRuntimeEnv, loadGenerationDependencies } from "../lib/runtime";

type GenerateDigestBody = {
  date?: string;
  topic?: string;
};

function parseBody(body: string | null): GenerateDigestBody {
  if (!body) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON request body.");
  }

  if (typeof parsed !== "object" || !parsed) {
    throw new Error("Invalid JSON request body.");
  }

  const payload = parsed as GenerateDigestBody;
  const topic = payload.topic?.trim();

  if (payload.topic !== undefined && (!topic || topic.length < 3)) {
    throw new Error("Topic labels must be at least 3 characters long.");
  }

  return typeof parsed === "object" && parsed ? parsed : {};
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const payload = parseBody(event.body ?? null);
    const date = resolveDigestDate(payload.date);
    const topic = payload.topic?.trim();

    const dependencies: DigestGenerationDependencies = await loadGenerationDependencies();
    const result = await generateDailyTrendingDigest(
      {
        date,
        topic
      },
      dependencies
    );

    return buildDigestSuccessResponse(result.items, result.date, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildDigestErrorResponse("Failed to generate the requested digest.", message, error);
  }
};
