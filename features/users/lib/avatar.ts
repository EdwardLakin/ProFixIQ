export const PROFILE_AVATAR_BUCKET = "profile-photos";
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function profileInitials(name?: string | null): string {
  const safe = (name ?? "").trim();
  if (!safe) return "U";
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Upload a JPG, PNG, WEBP, or GIF image.";
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Avatar must be 5MB or smaller.";
  }
  return null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "avatar.png";
}

export function buildAvatarStoragePath({
  shopId,
  userId,
  fileName,
}: {
  shopId: string | null;
  userId: string;
  fileName: string;
}): string {
  const shopSegment = (shopId ?? "unscoped").trim() || "unscoped";
  const stamp = Date.now();
  return `${shopSegment}/${userId}/${stamp}-${sanitizeFileName(fileName)}`;
}

export function extractAvatarStoragePath(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  const marker = `/${PROFILE_AVATAR_BUCKET}/`;
  const markerIdx = avatarUrl.indexOf(marker);
  if (markerIdx >= 0) {
    return avatarUrl.slice(markerIdx + marker.length);
  }

  try {
    const parsed = new URL(avatarUrl);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return avatarUrl;
  }
}
