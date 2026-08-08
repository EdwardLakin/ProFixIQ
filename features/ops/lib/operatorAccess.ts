const DEFAULT_OPS_OPERATOR_EMAIL = "edwardlakin35@gmail.com";

export function normalizeOpsOperatorEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isDefaultOpsOperatorEmail(value: string | null | undefined): boolean {
  return normalizeOpsOperatorEmail(value) === DEFAULT_OPS_OPERATOR_EMAIL;
}

export const defaultOpsOperatorEmails = [DEFAULT_OPS_OPERATOR_EMAIL] as const;
