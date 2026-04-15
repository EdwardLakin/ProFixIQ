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
type TimeOffRequest = {
  id: string;
  request_type: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  reason: string | null;
  created_at: string;
};

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
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [requestType, setRequestType] = useState("vacation");
  const [requestStart, setRequestStart] = useState("");
  const [requestEnd, setRequestEnd] = useState("");
  const [requestReason, setRequestReason] = useState("");

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

      const reqRes = await fetch("/api/time-off/requests", { cache: "no-store" });
      const reqBody = await reqRes.json().catch(() => null);
      if (reqRes.ok) setRequests((reqBody?.requests ?? []) as TimeOffRequest[]);
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

  const loadTimeOff = async () => {
    const reqRes = await fetch("/api/time-off/requests", { cache: "no-store" });
    const reqBody = await reqRes.json().catch(() => null);
    if (reqRes.ok) setRequests((reqBody?.requests ?? []) as TimeOffRequest[]);
  };

  const submitTimeOff = async () => {
    if (!requestStart || !requestEnd) {
      showStatus("Choose a start and end date/time for your request.", "error");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/time-off/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request_type: requestType,
        starts_at: new Date(requestStart).toISOString(),
        ends_at: new Date(requestEnd).toISOString(),
        reason: requestReason || null,
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      showStatus(body?.error ?? "Failed to submit time off request.", "error");
      return;
    }
    setRequestReason("");
    setRequestStart("");
    setRequestEnd("");
    await loadTimeOff();
    showStatus("Time off request submitted.", "success");
  };

  const cancelPendingRequest = async (id: string) => {
    setBusy(true);
    const res = await fetch(`/api/time-off/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      showStatus(body?.error ?? "Failed to cancel request.", "error");
      return;
    }
    await loadTimeOff();
    showStatus("Request cancelled.", "success");
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

      <section className="space-y-3 rounded-2xl border border-white/10 bg-black/35 p-4 shadow-card backdrop-blur-xl">
        <h2 className="text-sm font-semibold text-neutral-50">Time Off</h2>
        <p className="text-xs text-neutral-400">
          Submit and track your own time away requests. Approved requests automatically block schedule availability.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm" value={requestType} onChange={(e) => setRequestType(e.target.value)}>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick</option>
            <option value="personal">Personal</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm" type="datetime-local" value={requestStart} onChange={(e) => setRequestStart(e.target.value)} />
          <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm" type="datetime-local" value={requestEnd} onChange={(e) => setRequestEnd(e.target.value)} />
          <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2" placeholder="Reason (optional)" value={requestReason} onChange={(e) => setRequestReason(e.target.value)} />
        </div>
        <Button onClick={submitTimeOff} disabled={busy || !requestStart || !requestEnd}>
          {busy ? "Submitting…" : "Request time off"}
        </Button>

        <div className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-xs text-neutral-500">No time off requests yet.</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-neutral-100">
                    {r.request_type} · {new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}
                  </p>
                  <span className="text-xs uppercase tracking-wide text-neutral-300">{r.status}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">{r.reason ?? "No note"}</p>
                {r.status === "pending" ? (
                  <button className="mt-2 rounded border border-white/15 px-2 py-1 text-xs text-neutral-200" onClick={() => void cancelPendingRequest(r.id)} disabled={busy}>
                    Cancel request
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
