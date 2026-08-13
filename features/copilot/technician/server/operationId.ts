import "server-only";

function hash32(input: string, seed: number): number {
  let value = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

export function deriveCopilotOperationId(turnId: string, suffix: string): string {
  const input = `${turnId}:${suffix}`;
  const a = hash32(input, 2166136261);
  const b = hash32(input, 2246822519);
  const c = hash32(input, 3266489917);
  const d = hash32(input, 668265263);
  const hex = [a, b, c, d].map((value) => value.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
