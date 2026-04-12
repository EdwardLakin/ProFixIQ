"use client";

import ProfileAvatar from "@/features/users/components/ProfileAvatar";

type UserAvatarProps = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

export default function UserAvatar({
  name,
  avatarUrl,
  size = "md",
}: UserAvatarProps): JSX.Element {
  return <ProfileAvatar name={name} avatarUrl={avatarUrl} size={size} />;
}
