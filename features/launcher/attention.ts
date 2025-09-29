export type AttentionLevel = "base" | "info" | "warn" | "error" | "success";

/**
 * Broadcast a temporary attention level to the PhoneShell glow.
 * Usage:
 *   emitAttention("error")   // red glow
 *   emitAttention("warn")    // amber glow
 *   emitAttention("base")    // back to default (orange-400)
 */
export function emitAttention(level: AttentionLevel) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AttentionLevel>("pf:attention", { detail: level }));
}
