import crypto from "node:crypto";

export type DatabaseErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

type SafeDatabaseErrorOptions = {
  context: string;
  fallback: string;
  publicMessagePatterns?: RegExp[];
};

export type SafeDatabaseError = {
  message: string;
  correlationId: string;
  isPublicMessage: boolean;
};

export function toSafeDatabaseError(
  error: DatabaseErrorLike,
  options: SafeDatabaseErrorOptions,
): SafeDatabaseError {
  const correlationId = crypto.randomUUID();
  const rawMessage = error.message?.trim() ?? "";
  const isPublicMessage = (options.publicMessagePatterns ?? []).some(
    (pattern) => pattern.test(rawMessage),
  );

  console.error(`[${options.context}] database operation failed`, {
    correlationId,
    error,
  });

  return {
    message: isPublicMessage && rawMessage ? rawMessage : options.fallback,
    correlationId,
    isPublicMessage,
  };
}
