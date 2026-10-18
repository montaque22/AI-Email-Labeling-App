export async function drainProviderDeleteQueues(
  items,
  { batchDelayMs = 0, batchSize = 10, maxAttempts = 3, onProgress = () => {}, worker },
) {
  const pools = new Map();
  for (const item of items) {
    const key = String(item.accountId || "");
    pools.set(key, [...(pools.get(key) ?? []), { ...item, attempts: 0 }]);
  }

  const results = [];
  await Promise.all([...pools.values()].map(async (initialQueue) => {
    const queue = [...initialQueue];
    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize);
      const settled = await Promise.all(batch.map(async (item) => {
        item.attempts += 1;
        try {
          await worker(item);
          return { item, ok: true };
        } catch (error) {
          if (item.attempts < maxAttempts) {
            queue.push(item);
            return null;
          }
          return { item, ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }));
      const completed = settled.filter(Boolean);
      results.push(...completed);
      await onProgress([...results]);
      if (queue.length > 0 && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }
  }));
  return results;
}
