"use client";

type UserAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

function initials(name?: string | null): string {
  const safe = (name ?? "").trim();
  if (!safe) return "U";
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export default function UserAvatar({
  name,
  avatarUrl,
  size = "md",
}: UserAvatarProps): JSX.Element {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "User avatar"}
        className={`${SIZE_CLASS[size]} rounded-full border border-[var(--metal-border-soft)] object-cover`}
      />
    );
  }

  return (
    <div
      className={`${SIZE_CLASS[size]} flex items-center justify-center rounded-full border border-[var(--accent-copper-soft)] bg-black/60 font-semibold text-[var(--accent-copper-soft)]`}
      aria-label={name ?? "User"}
      title={name ?? "User"}
    >
      {initials(name)}
    </div>
  );
}
