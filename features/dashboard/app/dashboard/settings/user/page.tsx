"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";

type StatusKind = "success" | "error" | "info";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [statusType, setStatusType] = useState<StatusKind>("info");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      if (user.email) setEmail(user.email);
      setEmailVerified(Boolean(user.email_confirmed_at));

      // if you ever store avatar in user_metadata or profiles, hydrate it here
      if (typeof user.user_metadata?.avatar_url === "string") {
        setPhotoUrl(user.user_metadata.avatar_url);
      }
    };
    void loadUser();
  }, [supabase]);

  const showStatus = (msg: string, type: StatusKind = "info") => {
    setStatus(msg);
    setStatusType(type);
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      showStatus("Enter and confirm your new password.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showStatus("Passwords do not match.", "error");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);

    if (error) {
      showStatus(error.message, "error");
    } else {
      showStatus("Password updated successfully.", "success");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      showStatus("No email address found for your account.", "error");
      return;
    }

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "";

    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${origin.replace(/\/$/, "")}/auth/callback`,
      },
    });
    setBusy(false);

    if (error) {
      showStatus(error.message, "error");
    } else {
      showStatus("Verification email resent.", "success");
      router.refresh();
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePath = `avatars/${crypto.randomUUID()}-${file.name}`;
    setBusy(true);
    const { error } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      setBusy(false);
      showStatus(error.message, "error");
      return;
    }

    const { data } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(filePath);

    setPhotoUrl(data.publicUrl);
    setBusy(false);
    showStatus("Profile photo updated.", "success");
    router.refresh();
  };

  const statusClass =
    statusType === "success"
      ? "text-emerald-400"
      : statusType === "error"
      ? "text-red-400"
      : "text-neutral-300";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-foreground">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">
            User Settings
          </h1>
          <p className="text-xs text-neutral-400">
            Manage your password, email verification, and profile photo.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()} size="sm">
          Back
        </Button>
      </div>

      {/* content cards */}
      <div className="space-y-6">
        {/* Account info */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-50">
            Account
          </h2>
          <p className="text-xs text-neutral-400">
            Signed in as{" "}
            <span className="font-mono text-orange-300">{email || "—"}</span>
          </p>
          {emailVerified != null && (
            <p className="mt-1 text-xs">
              Status:{" "}
              <span
                className={
                  emailVerified ? "text-emerald-400" : "text-yellow-300"
                }
              >
                {emailVerified ? "Email verified" : "Email not verified"}
              </span>
            </p>
          )}
        </section>

        {/* Password */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-neutral-50">
            Change password
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            Use at least 8 characters. Avoid reusing passwords from other
            services.
          </p>
          <Button
            onClick={handlePasswordUpdate}
            disabled={busy || !newPassword || !confirmPassword}
          >
            {busy ? "Updating…" : "Update password"}
          </Button>
        </section>

        {/* Email verification */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-neutral-50">
            Email verification
          </h2>
          <p className="text-xs text-neutral-400 mb-2">
            We use your email for security notices and portal invites.
          </p>
          <p className="text-sm mb-2">
            Current email:{" "}
            <span className="font-mono text-orange-300">
              {email || "Unknown"}
            </span>
          </p>
          <Button
            onClick={handleResendVerification}
            disabled={busy || !email}
            variant="outline"
          >
            {busy ? "Sending…" : "Resend verification email"}
          </Button>
        </section>

        {/* Profile photo */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-neutral-50">
            Profile photo
          </h2>
          <p className="text-xs text-neutral-400">
            This avatar appears in the app where your profile is shown.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={busy}
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Recommended: square image, at least 256×256.
              </p>
            </div>
            {photoUrl && (
              <img
                src={photoUrl}
                alt="Profile"
                className="h-20 w-20 rounded-full border border-border object-cover"
              />
            )}
          </div>
        </section>

        {/* Status line */}
        {status && (
          <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <span className={statusClass}>{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}