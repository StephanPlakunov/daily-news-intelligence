import { generateScheduledDigest } from "../lib/digestGeneration";
import { loadGenerationDependencies } from "../lib/runtime";

export const handler = async (): Promise<void> => {
  const dependencies = await loadGenerationDependencies();
  const result = await generateScheduledDigest(dependencies);

  console.log(
    JSON.stringify({
      message: "Daily digest run completed.",
      date: result.date,
      generatedTopics: result.generatedTopics,
      storedItems: result.items.length
    })
  );
};
