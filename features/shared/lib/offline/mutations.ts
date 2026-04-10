"use client";

type PendingMutation<T = unknown> = {
  id: string;
  action: string;
  payload: T;
  createdAt: string;
  retryCount: number;
};

const KEY = "profixiq.pending_mutations.v1";

function readQueue(): PendingMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueueMutation<T>(entry: Omit<PendingMutation<T>, "createdAt" | "retryCount">) {
  const queue = readQueue();
  queue.push({ ...entry, createdAt: new Date().toISOString(), retryCount: 0 });
  writeQueue(queue);
}

export function removeMutation(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function listPendingMutations() {
  return readQueue();
}

export async function runMutationWithOfflineQueue<T>(args: {
  id: string;
  action: string;
  payload: T;
  runner: () => Promise<void>;
  queueOnOffline?: boolean;
}): Promise<{ queued: boolean }> {
  const queueOnOffline = args.queueOnOffline !== false;

  if (queueOnOffline && typeof navigator !== "undefined" && !navigator.onLine) {
    enqueueMutation({ id: args.id, action: args.action, payload: args.payload });
    return { queued: true };
  }

  try {
    await args.runner();
    removeMutation(args.id);
    return { queued: false };
  } catch {
    if (queueOnOffline) {
      enqueueMutation({ id: args.id, action: args.action, payload: args.payload });
      return { queued: true };
    }
    throw new Error("Mutation failed");
  }
}
