import "server-only";

export async function runWithProviderTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("AI provider timed out", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
