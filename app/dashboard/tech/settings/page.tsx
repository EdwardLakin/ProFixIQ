"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const PREFS_KEY = "profixiq.tech.prefs.v1";

type TechPrefs = {
  defaultBucket: "awaiting" | "in_progress" | "on_hold" | "completed";
  showUnassigned: boolean;
  compactCards: boolean;
  autoRefresh: boolean;
};

export default function TechSettingsPage() {
  const supabase = createClientComponentClient<Database>();

  // profile fields (from profiles table)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(""); // <- user asked to include email
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");

  // local (non-DB) prefs for the tech queue
  const [prefs, setPrefs] = useState<TechPrefs>({
    defaultBucket: "awaiting",
    showUnassigned: false,
    compactCards: false,
    autoRefresh: false,
  });

  // load profile + prefs
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      // 1) auth user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      // 2) profile
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select(
          "id, shop_id, username, full_name, email, phone, street, city, province, postal_code",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        setError(profErr.message);
        setLoading(false);
        return;
      }

      if (profile) {
        setProfileId(profile.id);
        setShopId(profile.shop_id ?? null);
        setUsername(profile.username ?? "");
        setFullName(profile.full_name ?? "");
        setEmail(profile.email ?? "");
        setPhone(profile.phone ?? "");
        setStreet(profile.street ?? "");
        setCity(profile.city ?? "");
        setProvince(profile.province ?? "");
        setPostal(profile.postal_code ?? "");
      }

      // 3) local prefs
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(PREFS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as TechPrefs;
            setPrefs((prev) => ({ ...prev, ...parsed }));
          }
        } catch {
          // ignore
        }
      }

      setLoading(false);
    })();
  }, [supabase]);

  // helper to persist prefs to localStorage
  const savePrefs = (next: TechPrefs) => {
    setPrefs(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    }
  };

  const handleSaveProfile = async () => {
    if (!profileId) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      // NOTE: this updates the *profiles* table email, not auth.users email
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          email,
          phone,
          street,
          city,
          province,
          postal_code: postal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (updErr) throw updErr;

      setOk("Profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-white">
        <div className="h-6 w-36 animate-pulse rounded bg-neutral-800" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="h-40 rounded-lg bg-neutral-900/50" />
          <div className="h-40 rounded-lg bg-neutral-900/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">
            Tech Settings
          </h1>
          <p className="text-sm text-neutral-400">
            Personal info and queue preferences for your workstation.
          </p>
        </div>
        {shopId ? (
          <div className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
            Shop: <span className="text-orange-300">{shopId}</span>
          </div>
        ) : null}
      </div>

      {/* 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: profile */}
        <div className="space-y-6">
          <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">
                  Your Profile
                </h2>
                <p className="text-xs text-neutral-400">
                  This is what your team sees on work orders.
                </p>
              </div>
              {username ? (
                <span className="rounded bg-neutral-900 px-2 py-1 text-[10px] text-neutral-400">
                  Username: <span className="text-white">{username}</span>
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  placeholder="Jane Tech"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300">
                  Email (profile only)
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  placeholder="jane@example.com"
                  type="email"
                />
                <p className="text-[10px] text-neutral-500">
                  Changing this won’t change your login email.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300">
                  Street address
                </label>
                <input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
                  placeholder="123 Fleet Ave."
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-300">City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-300">
                    Province
                  </label>
                  <input
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm focus:border-orange-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] text-neutral-300">
                      Postal
                    </label>
                    <input
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm focus:border-orange-500 outline-none"
                    />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              {error && <span className="text-xs text-red-300">{error}</span>}
              {ok && <span className="text-xs text-green-300">{ok}</span>}
            </div>
          </section>

          {/* Notifications */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                Notifications
              </h2>
              <span className="text-[10px] text-neutral-500">
                Local preference
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              These are per-device; your manager controls shop-wide emails.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.autoRefresh}
                onChange={(e) =>
                  savePrefs({ ...prefs, autoRefresh: e.target.checked })
                }
                className="h-4 w-4 rounded border-neutral-500 bg-neutral-900"
              />
              Auto-refresh tech queue
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.showUnassigned}
                onChange={(e) =>
                  savePrefs({ ...prefs, showUnassigned: e.target.checked })
                }
                className="h-4 w-4 rounded border-neutral-500 bg-neutral-900"
              />
              Show unassigned jobs too
            </label>
          </section>
        </div>

        {/* RIGHT: work prefs */}
        <div className="space-y-6">
          <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                Work Preferences
              </h2>
              <span className="text-[10px] text-neutral-500">
                Used by /tech/queue
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] text-neutral-300">
                Default queue status
              </label>
              <select
                value={prefs.defaultBucket}
                onChange={(e) =>
                  savePrefs({
                    ...prefs,
                    defaultBucket: e.target.value as TechPrefs["defaultBucket"],
                  })
                }
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-orange-500 outline-none"
              >
                <option value="awaiting">Awaiting</option>
                <option value="in_progress">In progress</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
              <p className="text-[10px] text-neutral-500">
                We can read this on the queue page to preselect your tab.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] text-neutral-300">
                Card layout
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    savePrefs({ ...prefs, compactCards: false })
                  }
                  className={`rounded border px-3 py-2 text-sm ${
                    !prefs.compactCards
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-neutral-700 bg-neutral-900"
                  }`}
                >
                  Full cards
                </button>
                <button
                  type="button"
                  onClick={() =>
                    savePrefs({ ...prefs, compactCards: true })
                  }
                  className={`rounded border px-3 py-2 text-sm ${
                    prefs.compactCards
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-neutral-700 bg-neutral-900"
                  }`}
                >
                  Compact
                </button>
              </div>
              <p className="text-[10px] text-neutral-500">
                Compact is better on small screens.
              </p>
            </div>
          </section>

          {/* account info */}
          <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-100">
              Account
            </h2>
            <p className="text-xs text-neutral-400">
              Username and shop are managed by your owner/admin.
            </p>
            <dl className="space-y-1 text-xs text-neutral-300">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Username</dt>
                <dd>{username || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Shop</dt>
                <dd>{shopId || "—"}</dd>
              </div>
            </dl>
            <p className="text-[10px] text-neutral-500">
              Need a password reset? Ask your manager or owner — they can set a
              new temporary password from the admin screen.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}