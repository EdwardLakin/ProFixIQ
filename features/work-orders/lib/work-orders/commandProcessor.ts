export type WorkOrderCommand =
  | { type: "start_job"; jobId: string }
  | { type: "complete_job"; jobId: string }
  | { type: "put_on_hold"; jobId: string; reason: string }
  | { type: "assign_tech"; jobId: string; techName: string }
  | { type: "update_complaint"; jobId: string; complaint: string };

export function parseWorkOrderCommand(input: string): WorkOrderCommand | null {
  const lower = input.toLowerCase();

  if (lower.includes("start job")) {
    const jobId = extractJobId(lower);
    return jobId ? { type: "start_job", jobId } : null;
  }

  if (lower.includes("complete job")) {
    const jobId = extractJobId(lower);
    return jobId ? { type: "complete_job", jobId } : null;
  }

  if (lower.includes("hold") && lower.includes("because")) {
    const [_, idPart] = lower.split("job ");
    const [jobId, reason] = idPart?.split(" because ") ?? [];
    return jobId && reason
      ? { type: "put_on_hold", jobId: jobId.trim(), reason: reason.trim() }
      : null;
  }

  if (lower.includes("assign") && lower.includes("to")) {
    const match = lower.match(/assign job (\w+) to (\w+)/);
    if (match) {
      const [, jobId, techName] = match;
      return { type: "assign_tech", jobId, techName };
    }
  }

  if (lower.includes("complaint")) {
    const match = lower.match(/job (\w+) complaint (.+)/);
    if (match) {
      const [, jobId, complaint] = match;
      return { type: "update_complaint", jobId, complaint };
    }
  }

  return null;
}

function extractJobId(text: string): string | null {
  const match = text.match(/job (\w+)/);
  return match?.[1] ?? null;
}
