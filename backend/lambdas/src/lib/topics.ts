const TOPICS_ENV = "DIGEST_TOPICS";

const DEFAULT_TOPICS = ["F1 racing", "AI technology", "climate tech"] as const;

export function getDefaultTopics(): readonly string[] {
  return DEFAULT_TOPICS;
}

export function parseTopics(value: string | undefined): string[] {
  const rawTopics = value
    ?.split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);

  return rawTopics && rawTopics.length > 0 ? rawTopics : [...DEFAULT_TOPICS];
}

export function getConfiguredTopics(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseTopics(env[TOPICS_ENV]);
}
