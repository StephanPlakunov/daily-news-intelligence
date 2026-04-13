import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { DigestGenerationDependencies } from "./digestGeneration";

const NEWS_API_SECRET_ARN_ENV = "NEWS_API_SECRET_ARN";
const CLAUDE_API_SECRET_ARN_ENV = "CLAUDE_API_SECRET_ARN";
const DIGESTS_TABLE_NAME_ENV = "DIGESTS_TABLE_NAME";

const secretsManagerClient = new SecretsManagerClient({});

export function requireRuntimeEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function getSecretValue(secretArn: string): Promise<string> {
  const normalizedSecretId = secretArn.endsWith("*") ? secretArn.slice(0, -1) : secretArn;
  const response = await secretsManagerClient.send(
    new GetSecretValueCommand({
      SecretId: normalizedSecretId
    })
  );

  const secret = response.SecretString?.trim();

  if (!secret) {
    throw new Error(`Secret ${normalizedSecretId} is empty or is not stored as a plain text string`);
  }

  return secret;
}

export async function loadGenerationDependencies(): Promise<DigestGenerationDependencies> {
  const newsApiSecretArn = requireRuntimeEnv(NEWS_API_SECRET_ARN_ENV);
  const claudeApiSecretArn = requireRuntimeEnv(CLAUDE_API_SECRET_ARN_ENV);
  const tableName = requireRuntimeEnv(DIGESTS_TABLE_NAME_ENV);
  const [newsApiKey, claudeApiKey] = await Promise.all([
    getSecretValue(newsApiSecretArn),
    getSecretValue(claudeApiSecretArn)
  ]);

  return {
    tableName,
    newsApiKey,
    claudeApiKey
  };
}
