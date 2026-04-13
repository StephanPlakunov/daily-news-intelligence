import { useEffect, useRef, useState } from "react";
import { fetchDigest, generateDigest, type DigestItem } from "./lib/api";
import "./styles.css";

const EARLIEST_SUPPORTED_DIGEST_DATE = "2026-04-01";

function getBerlinTodayDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

export default function App() {
  const [digests, setDigests] = useState<DigestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getBerlinTodayDate);
  const [customTopic, setCustomTopic] = useState("");

  useEffect(() => {
    async function loadDigests() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const items = await fetchDigest(selectedDate);
        setDigests(items);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setErrorMessage(`We couldn't load the digest for ${selectedDate}. ${message}`);
      } finally {
        setIsLoading(false);
      }
    }

    void loadDigests();
  }, [selectedDate]);

  async function handleGenerateTrendingClick(): Promise<void> {
    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const items = await generateDigest(selectedDate);
      setDigests(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(`We couldn't generate trending topics for ${selectedDate}. ${message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCustomTopicSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const topic = customTopic.trim();

    if (!topic) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const generatedItems = await generateDigest(selectedDate, topic);
      const generatedItem = generatedItems[0];

      setDigests((currentItems) => {
        if (!generatedItem) {
          return currentItems;
        }

        const remaining = currentItems.filter((item) => item.topic !== generatedItem.topic);
        return [...remaining, generatedItem].sort((left, right) => left.topic.localeCompare(right.topic));
      });

      setCustomTopic("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(`We couldn't generate a digest for "${topic}". ${message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Portfolio Build</p>
          <h1>Daily News Intelligence</h1>
          <p className="hero-copy">
            A deployed AWS application that discovers trending topics for any supported day, stores AI summaries, and lets you
            add custom topics on demand.
          </p>
        </div>

        <div className="control-panel">
          <label className="date-picker">
            <span>Digest date</span>
            <input
              type="date"
              min={EARLIEST_SUPPORTED_DIGEST_DATE}
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <button className="primary-button" type="button" onClick={handleGenerateTrendingClick} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate Trending Topics"}
          </button>
        </div>
      </header>

      <section className="composer-card">
        <div>
          <p className="section-label">Custom topic</p>
          <h2>Add a one-off digest for any topic</h2>
          <p>
            Pick a date, enter a topic such as <em>Formula 1 strategy</em> or <em>EU AI Act</em>, and the backend will fetch
            source coverage, summarize it, and persist it for that day.
          </p>
        </div>

        <form className="composer-form" onSubmit={handleCustomTopicSubmit}>
          <input
            type="text"
            value={customTopic}
            onChange={(event) => setCustomTopic(event.target.value)}
            placeholder="Enter a topic to summarize"
            disabled={isGenerating}
          />
          <button className="secondary-button" type="submit" disabled={isGenerating || customTopic.trim().length === 0}>
            Add Topic
          </button>
        </form>
      </section>

      {isLoading ? (
        <section className="status-panel" aria-live="polite" aria-busy="true">
          <div className="spinner" aria-hidden="true" />
          <p>Loading digest coverage for {selectedDate}...</p>
        </section>
      ) : null}

      {!isLoading && isGenerating ? (
        <section className="status-panel" aria-live="polite" aria-busy="true">
          <div className="spinner" aria-hidden="true" />
          <p>Generating and storing digest items for {selectedDate}...</p>
        </section>
      ) : null}

      {!isLoading && errorMessage ? (
        <section className="status-panel error-panel" role="alert">
          <h2>Unable to load the digest</h2>
          <p>{errorMessage}</p>
          <p>Check that the API is deployed and that `VITE_API_BASE_URL` points to the correct API Gateway URL.</p>
        </section>
      ) : null}

      {!isLoading && !errorMessage && digests.length === 0 ? (
        <section className="status-panel" aria-live="polite">
          <h2>No digest stored yet</h2>
          <p>No items were found for {selectedDate}.</p>
          <p>Use Generate Trending Topics to create a curated daily set, or add a custom topic to store a one-off digest.</p>
        </section>
      ) : null}

      {!isLoading && !errorMessage && digests.length > 0 ? (
        <section className="digest-grid" aria-label="Stored digest topics">
          {digests.map((digest) => (
            <article className="digest-card" key={`${digest.date}-${digest.topic}`}>
              <div className="card-header">
                <div>
                  <p className="card-kicker">{digest.date}</p>
                  <h2>{digest.topic}</h2>
                </div>
                <span className={`source-chip ${digest.topicSource === "user" ? "user-chip" : "trending-chip"}`}>
                  {digest.topicSource === "user" ? "Custom" : "Trending"}
                </span>
              </div>

              <p className="summary">{digest.summary}</p>
              <p className="metadata">{digest.articleCount ?? digest.articles.length} source articles</p>

              <div className="article-list">
                <h3>Source Articles</h3>
                <ul>
                  {digest.articles.map((article) => (
                    <li key={article.url}>
                      <a href={article.url} target="_blank" rel="noreferrer">
                        {article.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
