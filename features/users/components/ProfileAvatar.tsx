"use client";

import { profileInitials } from "@/features/users/lib/avatar";

type Props = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-2xl",
};

export default function ProfileAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: Props): JSX.Element {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${name ?? "User"} avatar`}
        className={`${sizeClass[size]} rounded-full border border-white/15 object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass[size]} flex items-center justify-center rounded-full border border-[var(--accent-copper-soft)] bg-black/50 font-semibold text-[var(--accent-copper-light)] ${className}`}
    >
      {profileInitials(name)}
    </div>
  );
}
