export type PostSendWarning = {
  step: string;
  message: string;
};

export type PostSendStep = {
  step: string;
  run: () => Promise<void>;
};

export async function runPostSendPersistence(
  steps: PostSendStep[],
): Promise<PostSendWarning[]> {
  const warnings: PostSendWarning[] = [];

  for (const { step, run } of steps) {
    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({ step, message });
    }
  }

  return warnings;
}
