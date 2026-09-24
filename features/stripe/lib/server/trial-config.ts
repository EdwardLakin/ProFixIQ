import "server-only";

export function configuredTrialDays(): number {
  const parsed = Math.trunc(Number(process.env.STRIPE_TRIAL_DAYS ?? "7"));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 60 ? parsed : 7;
}
