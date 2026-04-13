import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildFallbackSummary,
  buildClaudePrompt,
  buildDigestRecord,
  inferTopicsHeuristically,
  buildTrendingTopicsPrompt,
  getTodayDateString,
  parseTopicsFromModelOutput,
  type DigestTopicSource,
  type NewsApiArticle,
  type StoredDigestRecord
} from "./digest";
import { runClaudePrompt } from "./claudeClient";
import { getConfiguredTopics } from "./topics";
import { fetchBroadNewsSample, fetchTodayHeadlineSample, fetchTopicArticles } from "./newsClient";

const dynamoClient = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamoClient);

export type DigestGenerationDependencies = {
  tableName: string;
  newsApiKey: string;
  claudeApiKey: string;
};

export type GenerateDigestRequest = {
  date?: string;
  topic?: string;
  createdAt?: string;
};

export type GenerateDigestResponse = {
  date: string;
  generatedTopics: string[];
  items: StoredDigestRecord[];
};

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

async function saveDigest(params: {
  tableName: string;
  date: string;
  topic: string;
  summary: string;
  articles: NewsApiArticle[];
  createdAt: string;
  topicSource: DigestTopicSource;
}): Promise<StoredDigestRecord> {
  const digestRecord = buildDigestRecord(params.topic, params.summary, params.articles, params.topicSource);
  const item: StoredDigestRecord = {
    date: params.date,
    topic: digestRecord.topic,
    summary: digestRecord.summary,
    articles: digestRecord.articles,
    articleCount: digestRecord.articleCount,
    createdAt: params.createdAt,
    topicSource: digestRecord.topicSource
  };

  await documentClient.send(
    new PutCommand({
      TableName: params.tableName,
      Item: item
    })
  );

  return item;
}

async function deleteStaleTrendingDigestsForDate(tableName: string, date: string, activeTopics: readonly string[]): Promise<void> {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: tableName,
      ConsistentRead: true,
      KeyConditionExpression: "#date = :date",
      ExpressionAttributeNames: {
        "#date": "date"
      },
      ExpressionAttributeValues: {
        ":date": date
      },
      ProjectionExpression: "topic, topicSource"
    })
  );

  const activeTopicSet = new Set(activeTopics);
  const staleTopics = ((result.Items as Array<{ topic?: string; topicSource?: DigestTopicSource }> | undefined) ?? [])
    .filter((item) => item.topicSource !== "user")
    .map((item) => item.topic)
    .filter((topic): topic is string => typeof topic === "string" && !activeTopicSet.has(topic));

  await Promise.all(
    staleTopics.map((topic) =>
      documentClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            date,
            topic
          }
        })
      )
    )
  );
}

async function discoverTrendingTopics(date: string, newsApiKey: string, claudeApiKey: string): Promise<string[]> {
  const isToday = date === getTodayDateString();
  const broadSample = isToday ? await fetchTodayHeadlineSample(newsApiKey) : await fetchBroadNewsSample(date, newsApiKey);

  if (broadSample.length === 0) {
    throw new Error(`No broad news sample was available for ${date}`);
  }

  if (isToday) {
    const heuristicTopics = inferTopicsHeuristically(broadSample);

    if (heuristicTopics.length >= 3) {
      return heuristicTopics;
    }
  }

  let topics: string[];

  try {
    const modelOutput = await runClaudePrompt(buildTrendingTopicsPrompt(date, broadSample), claudeApiKey, 120);
    topics = parseTopicsFromModelOutput(modelOutput);
  } catch (error) {
    console.warn(`Falling back to heuristic topic discovery for ${date}: ${error instanceof Error ? error.message : "Unknown error"}`);
    topics = inferTopicsHeuristically(broadSample);
  }

  if (topics.length < 3) {
    throw new Error(`Could not identify three trending topics for ${date}`);
  }

  return topics;
}

async function generateTopicDigest(
  date: string,
  topic: string,
  topicSource: DigestTopicSource,
  dependencies: DigestGenerationDependencies,
  createdAt: string
): Promise<StoredDigestRecord> {
  const normalizedTopic = normalizeTopic(topic);
  const articles = await fetchTopicArticles(normalizedTopic, date, dependencies.newsApiKey);

  if (articles.length === 0) {
    throw new Error(`No articles were found for topic "${normalizedTopic}" on ${date}`);
  }

  let summary: string;

  try {
    summary = await runClaudePrompt(buildClaudePrompt(normalizedTopic, articles), dependencies.claudeApiKey);
  } catch (error) {
    console.warn(
      `Falling back to deterministic summary for ${normalizedTopic} on ${date}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    summary = buildFallbackSummary(normalizedTopic, articles);
  }

  return saveDigest({
    tableName: dependencies.tableName,
    date,
    topic: normalizedTopic,
    summary,
    articles,
    createdAt,
    topicSource
  });
}

export async function generateDailyTrendingDigest(
  request: GenerateDigestRequest,
  dependencies: DigestGenerationDependencies
): Promise<GenerateDigestResponse> {
  const date = request.date ?? getTodayDateString();
  const createdAt = request.createdAt ?? new Date().toISOString();
  const candidateTopics = request.topic
    ? [normalizeTopic(request.topic)]
    : await discoverTrendingTopics(date, dependencies.newsApiKey, dependencies.claudeApiKey);
  const topicSource: DigestTopicSource = request.topic ? "user" : "trending";
  const settled = await Promise.allSettled(
    candidateTopics.map((topic) => generateTopicDigest(date, topic, topicSource, dependencies, createdAt))
  );

  const fulfilledByTopic = new Map<string, StoredDigestRecord>();
  const failures = settled.flatMap((result) =>
    result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Unknown error"] : []
  );

  for (const result of settled) {
    if (result.status === "fulfilled") {
      fulfilledByTopic.set(result.value.topic, result.value);
    }
  }

  const items = candidateTopics
    .map((topic) => fulfilledByTopic.get(topic))
    .filter((item): item is StoredDigestRecord => Boolean(item))
    .slice(0, request.topic ? 1 : 3);

  if (items.length === 0) {
    throw new Error(`Digest generation failed for ${date}: ${failures.join(" | ")}`);
  }

  if (!request.topic && items.length < 3) {
    throw new Error(`Could not store three trending topics for ${date}: ${failures.join(" | ")}`);
  }

  if (!request.topic) {
    await deleteStaleTrendingDigestsForDate(
      dependencies.tableName,
      date,
      items.map((item) => item.topic)
    );
  }

  return {
    date,
    generatedTopics: items.map((item) => item.topic),
    items
  };
}

export async function generateScheduledDigest(dependencies: DigestGenerationDependencies): Promise<GenerateDigestResponse> {
  const date = getTodayDateString();
  return generateDailyTrendingDigest({ date }, dependencies);
}

export function getFallbackTopicsForDevelopment(): string[] {
  return getConfiguredTopics();
}
