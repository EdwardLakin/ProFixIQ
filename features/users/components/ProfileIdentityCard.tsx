"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import ProfileAvatarUploader from "@/features/users/components/ProfileAvatarUploader";

type Props = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shopId: string | null;
  fullName: string;
  email?: string;
  roleLabel?: string;
  avatarUrl?: string | null;
  onAvatarChange: (url: string | null) => void;
  title?: string;
  subtitle?: string;
};

export default function ProfileIdentityCard({
  supabase,
  userId,
  shopId,
  fullName,
  email,
  roleLabel,
  avatarUrl,
  onAvatarChange,
  title = "Profile identity",
  subtitle = "Set the photo and name your team sees across the workspace.",
}: Props): JSX.Element {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-card backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-neutral-400">{subtitle}</p>
        </div>
        {roleLabel ? (
          <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-neutral-300">
            {roleLabel}
          </span>
        ) : null}
      </div>

      <ProfileAvatarUploader
        supabase={supabase}
        userId={userId}
        shopId={shopId}
        name={fullName}
        avatarUrl={avatarUrl}
        onChange={onAvatarChange}
      />

      {email ? <p className="text-xs text-neutral-500">Signed in as {email}</p> : null}
    </section>
  );
}
