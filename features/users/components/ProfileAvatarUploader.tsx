"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import ProfileAvatar from "@/features/users/components/ProfileAvatar";
import {
  buildAvatarStoragePath,
  extractAvatarStoragePath,
  PROFILE_AVATAR_BUCKET,
  validateAvatarFile,
} from "@/features/users/lib/avatar";

type Props = {
  supabase: SupabaseClient<Database>;
  userId: string;
  shopId: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  onChange: (nextUrl: string | null) => void;
};

export default function ProfileAvatarUploader({
  supabase,
  userId,
  shopId,
  name,
  avatarUrl,
  onChange,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayAvatar = previewUrl ?? avatarUrl ?? null;

  const onPickFile = async (file: File) => {
    const validation = validateAvatarFile(file);
    if (validation) {
      toast.error(validation);
      return;
    }

    setBusy(true);
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl(nextPreview);

    try {
      const nextPath = buildAvatarStoragePath({
        shopId,
        userId,
        fileName: file.name,
      });

      const upload = await supabase.storage
        .from(PROFILE_AVATAR_BUCKET)
        .upload(nextPath, file, { upsert: true, contentType: file.type });

      if (upload.error) throw upload.error;

      const oldPath = extractAvatarStoragePath(avatarUrl);
      if (oldPath && oldPath !== nextPath) {
        await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([oldPath]);
      }

      const { data } = supabase.storage
        .from(PROFILE_AVATAR_BUCKET)
        .getPublicUrl(nextPath);

      const nextUrl = data.publicUrl;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ avatar_url: nextUrl, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (profileErr) throw profileErr;

      await supabase.auth.updateUser({ data: { avatar_url: nextUrl } });

      onChange(nextUrl);
      setPreviewUrl(null);
      toast.success("Profile photo saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload photo.";
      toast.error(message);
      setPreviewUrl(null);
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    setBusy(true);
    try {
      const existingPath = extractAvatarStoragePath(avatarUrl);
      if (existingPath) {
        await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([existingPath]);
      }

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;

      await supabase.auth.updateUser({ data: { avatar_url: null } });

      onChange(null);
      setPreviewUrl(null);
      toast.success("Profile photo removed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove photo.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const hasAvatar = useMemo(() => Boolean(avatarUrl || previewUrl), [avatarUrl, previewUrl]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <ProfileAvatar name={name} avatarUrl={displayAvatar} size="xl" />
        <div className="space-y-2">
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPickFile(file);
              e.currentTarget.value = "";
            }}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Saving…" : hasAvatar ? "Replace photo" : "Upload photo"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={removeAvatar}
              disabled={busy || !hasAvatar}
            >
              Remove
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400">
            Used in work orders, chat, queue views, and technician activity surfaces.
          </p>
        </div>
      </div>
    </div>
  );
}
