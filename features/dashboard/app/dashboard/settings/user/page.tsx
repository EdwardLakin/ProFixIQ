"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import ProfileIdentityCard from "@/features/users/components/ProfileIdentityCard";
import ProfileContactCard from "@/features/users/components/ProfileContactCard";

type StatusKind = "success" | "error" | "info";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

      setUserId(user.id);
      if (user.email) setEmail(user.email);
      setEmailVerified(Boolean(user.email_confirmed_at));

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id, full_name, email, phone, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      setShopId(profile?.shop_id ?? null);
      setFullName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
      setAvatarUrl(profile?.avatar_url ?? null);
      if (profile?.email) setEmail(profile.email);
    };
    void loadUser();
  }, [supabase]);

  const showStatus = (msg: string, type: StatusKind = "info") => {
    setStatus(msg);
    setStatusType(type);
  };

  const saveContact = async () => {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        phone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setBusy(false);

    if (error) showStatus(error.message, "error");
    else showStatus("Profile details saved.", "success");
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

  const statusClass =
    statusType === "success"
      ? "text-emerald-400"
      : statusType === "error"
      ? "text-red-400"
      : "text-neutral-300";

  if (!userId) {
    return <div className="p-6 text-sm text-neutral-300">Loading settings…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-foreground">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">User Settings</h1>
          <p className="text-sm text-neutral-400">
            Manage your profile identity, security, and communication details.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()} size="sm">
          Back
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileIdentityCard
          supabase={supabase}
          userId={userId}
          shopId={shopId}
          fullName={fullName || email || "User"}
          email={email}
          roleLabel="User"
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
        />

        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-card backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-neutral-50">Account</h2>
          <p className="text-xs text-neutral-400">
            Status: {emailVerified ? "Email verified" : "Email not verified"}
          </p>
          <Button
            onClick={handleResendVerification}
            disabled={busy || !email}
            variant="outline"
          >
            {busy ? "Sending…" : "Resend verification email"}
          </Button>

          <div className="pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-300">
              Change password
            </h3>
            <div className="grid gap-2">
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
            <Button
              className="mt-3"
              onClick={handlePasswordUpdate}
              disabled={busy || !newPassword || !confirmPassword}
            >
              {busy ? "Updating…" : "Update password"}
            </Button>
          </div>
        </section>
      </div>

      <ProfileContactCard
        fullName={fullName}
        email={email}
        phone={phone}
        onFullNameChange={setFullName}
        onEmailChange={setEmail}
        onPhoneChange={setPhone}
      />

      <div className="flex items-center gap-3">
        <Button onClick={saveContact} disabled={busy}>
          {busy ? "Saving…" : "Save profile details"}
        </Button>
        {status ? <span className={`text-sm ${statusClass}`}>{status}</span> : null}
      </div>
    </div>
  );
}
