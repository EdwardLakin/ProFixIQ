import type { WorkforceActivityException } from "./activityTypes";
export const WORKFORCE_ACTIVITY_THRESHOLDS = { idleMinutes: 15, longBreakMinutes: 30, longLunchMinutes: 60, jobOverEstimateRatio: 1.25 } as const;
export function exception(input: WorkforceActivityException): WorkforceActivityException { return input; }
