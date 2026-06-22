export async function withMinimumDelay<T>(task: Promise<T>, minimumMs = 350) {
  const startedAt = Date.now();
  try {
    return await task;
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < minimumMs) {
      await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
    }
  }
}
