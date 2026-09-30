// Single-microphone arbiter for the app's two independent voice surfaces:
// Technician CoPilot voice and inspection voice control. Both run their own
// mic + Realtime WebSocket (see useRealtimeTranscription.ts), so without this
// both would hear — and act on — the same speech at once.
//
// Whoever starts listening claims the mic and the other owner is preempted
// (its onPreempt callback stops it). Modules here are plain singletons on
// purpose: neither surface needs to import the other.

export type VoiceOwner = "copilot" | "inspection";

type Claim = { owner: VoiceOwner; onPreempt: () => void };

let holder: Claim | null = null;
const listeners = new Set<(owner: VoiceOwner | null) => void>();

function notify(): void {
  const owner = holder?.owner ?? null;
  for (const fn of Array.from(listeners)) fn(owner);
}

export function getVoiceHolder(): VoiceOwner | null {
  return holder?.owner ?? null;
}

/** Take the mic. Any other current holder is preempted (stopped). */
export function claimVoice(owner: VoiceOwner, onPreempt: () => void): void {
  const previous = holder;
  if (previous && previous.owner === owner) {
    holder = { owner, onPreempt };
    return;
  }
  holder = { owner, onPreempt };
  if (previous) {
    try {
      previous.onPreempt();
    } catch {}
  }
  notify();
}

/** Give the mic back. No-op unless `owner` still holds it. */
export function releaseVoice(owner: VoiceOwner): void {
  if (!holder || holder.owner !== owner) return;
  holder = null;
  notify();
}

export function subscribeVoiceHolder(
  fn: (owner: VoiceOwner | null) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
