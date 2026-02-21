// mobile/settings/MobileTechSettingsScreen.tsx (FULL FILE REPLACEMENT)
// ✅ Adds saved tech signature capture + persist (same logic as desktop TechSettingsPage)
// ✅ Theme aligned to MobileTechHome (app-shell / metal-bar / mobile-body-gradient / glass-card)
// ❗ No change to existing profile/prefs logic beyond adding signature fields

"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import SignaturePad, {
  openSignaturePad,
} from "@/features/shared/signaturePad/controller";

const PREFS_KEY = "profixiq.tech.prefs.v1";

type TechPrefs = {
  defaultBucket: "awaiting" | "in_progress" | "on_hold" | "completed";
  showUnassigned: boolean;
  compactCards: boolean;
  autoRefresh: boolean;
};

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function sha256Base64(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function MobileTechSettingsPage(): JSX.Element {
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
  const [email, setEmail] = useState(""); // profile-only email
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");

  // ✅ saved tech signature state
  const [sigPath, setSigPath] = useState<string | null>(null);
  const [sigBusy, setSigBusy] = useState(false);

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
          "id, shop_id, username, full_name, email, phone, street, city, province, postal_code, tech_signature_path, tech_signature_hash",
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

        const p = profile as unknown as { tech_signature_path?: string | null };
        setSigPath(p.tech_signature_path ?? null);
      }

      // 3) local prefs
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(PREFS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<TechPrefs>;
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

  // ✅ capture and persist a saved tech signature (1-time setup, update anytime)
  const captureAndSaveSignature = async () => {
    if (!profileId) return;

    setSigBusy(true);
    setError(null);
    setOk(null);

    try {
      const dataUrl = await openSignaturePad({ shopName: "ProFixIQ" });
      if (!dataUrl) return; // user cancelled

      const blob = dataUrlToBlob(dataUrl);
      const hash = await sha256Base64(dataUrl);

      const path = `tech-signatures/${profileId}.png`;

      const up = await supabase.storage.from("signatures").upload(path, blob, {
        upsert: true,
        contentType: "image/png",
      });

      if (up.error) throw up.error;

      const update: Database["public"]["Tables"]["profiles"]["Update"] = {
        tech_signature_path: path,
        tech_signature_hash: hash,
        tech_signature_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", profileId);

      if (updErr) throw updErr;

      setSigPath(path);
      setOk("Signature saved. Technician signing will now auto-use it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save signature.");
    } finally {
      setSigBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen flex-col text-foreground">
        <header className="metal-bar sticky top-0 z-40 px-4 py-3">
          <div className="text-sm font-blackops text-[var(--accent-copper-light)]">
            Tech Settings
          </div>
          <div className="text-[0.75rem] text-neutral-400">Loading…</div>
        </header>
        <main className="mobile-body-gradient flex-1 px-4 py-4">
          <div className="space-y-3">
            <div className="h-5 w-32 animate-pulse rounded bg-white/5" />
            <div className="h-28 rounded-2xl bg-white/5" />
            <div className="h-28 rounded-2xl bg-white/5" />
            <div className="h-24 rounded-2xl bg-white/5" />
          </div>
        </main>
      </div>
    );
  }

  const SigPill = () => (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
        sigPath
          ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
          : "border-amber-400/60 bg-amber-500/10 text-amber-100"
      }`}
    >
      {sigPath ? "On file" : "Not set"}
    </span>
  );

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground">
      <header className="metal-bar sticky top-0 z-40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="text-lg font-blackops text-[var(--accent-copper-light)]">
              Tech Settings
            </h1>
            <p className="text-[0.75rem] text-neutral-400">
              Personal info and queue preferences for your bench.
            </p>
          </div>

          {shopId && (
            <div className="mt-0.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[0.7rem] text-neutral-200">
              <span className="text-neutral-500">Shop</span>
              <span className="font-mono text-[var(--accent-copper-soft)]">
                {shopId}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mobile-body-gradient flex-1 px-4 py-4">
        <div className="mx-auto max-w-xl space-y-5">
          {/* profile card */}
          <section className="glass-card rounded-2xl border border-white/10 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">
                  Your profile
                </h2>
                <p className="text-[0.7rem] text-neutral-400">
                  Shown on work orders and job cards.
                </p>
              </div>
              {username && (
                <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[0.65rem] text-neutral-300">
                  @{username}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <Field
                label="Full name"
                value={fullName}
                onChange={setFullName}
                placeholder="Jane Tech"
              />
              <Field
                label="Email (profile only)"
                value={email}
                onChange={setEmail}
                placeholder="jane@example.com"
                helper="Does not change your login email."
                type="email"
              />
              <Field
                label="Phone"
                value={phone}
                onChange={setPhone}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="space-y-3">
              <Field
                label="Street address"
                value={street}
                onChange={setStreet}
                placeholder="123 Fleet Ave."
              />

              <div className="grid grid-cols-3 gap-2">
                <Field label="City" value={city} onChange={setCity} compact />
                <Field
                  label="Province"
                  value={province}
                  onChange={setProvince}
                  compact
                />
                <Field label="Postal" value={postal} onChange={setPostal} compact />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded-full bg-[var(--accent-copper-soft)] px-4 py-2 text-xs font-semibold text-black hover:bg-[var(--accent-copper)] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
              {error && <span className="text-[0.7rem] text-red-300">{error}</span>}
              {ok && <span className="text-[0.7rem] text-emerald-300">{ok}</span>}
            </div>
          </section>

          {/* ✅ Saved Signature (mobile) */}
          <section className="glass-card rounded-2xl border border-white/10 px-4 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">
                  Saved signature
                </h2>
                <p className="text-[0.7rem] text-neutral-400">
                  Used automatically when you sign inspections.
                </p>
              </div>
              <SigPill />
            </div>

            {sigPath ? (
              <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-neutral-300">
                <div className="text-neutral-500">Path</div>
                <div className="font-mono">{sigPath}</div>
              </div>
            ) : (
              <div className="text-[11px] text-neutral-400">
                No signature on file yet.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={captureAndSaveSignature}
                disabled={sigBusy || !profileId}
                className="rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)] px-4 py-2 text-xs font-semibold text-black shadow-[0_0_12px_rgba(248,113,22,0.25)] hover:bg-[var(--accent-copper-light)] disabled:opacity-60"
              >
                {sigBusy ? "Opening…" : sigPath ? "Update signature" : "Capture signature"}
              </button>

              <span className="text-[11px] text-neutral-500">
                Stored in <span className="font-mono text-neutral-300">signatures</span> bucket
              </span>
            </div>

            <p className="text-[11px] text-neutral-500">
              Tech signing will pull this automatically so you don’t have to re-sign every
              inspection.
            </p>
          </section>

          {/* queue + layout prefs */}
          <section className="glass-card rounded-2xl border border-white/10 px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-100">
                Work preferences
              </h2>
              <span className="text-[0.65rem] text-neutral-500">
                Used on tech queue
              </span>
            </div>

            <div className="space-y-2">
              <label className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
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
                className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-[var(--accent-copper)] focus:outline-none"
              >
                <option value="awaiting">Awaiting</option>
                <option value="in_progress">In progress</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
              <p className="text-[0.65rem] text-neutral-500">
                We’ll use this as your default tab when you open the queue.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
                Card layout
              </label>
              <div className="flex gap-2">
                <TogglePill
                  active={!prefs.compactCards}
                  label="Full cards"
                  onClick={() => savePrefs({ ...prefs, compactCards: false })}
                />
                <TogglePill
                  active={prefs.compactCards}
                  label="Compact"
                  onClick={() => savePrefs({ ...prefs, compactCards: true })}
                />
              </div>
              <p className="text-[0.65rem] text-neutral-500">
                Compact mode fits more jobs on small screens.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <CheckboxRow
                label="Auto-refresh queue"
                helper="Polls for changes while this screen is open."
                checked={prefs.autoRefresh}
                onChange={(checked) => savePrefs({ ...prefs, autoRefresh: checked })}
              />
              <CheckboxRow
                label="Show unassigned jobs"
                helper="Include jobs that aren’t assigned to you yet."
                checked={prefs.showUnassigned}
                onChange={(checked) =>
                  savePrefs({ ...prefs, showUnassigned: checked })
                }
              />
            </div>
          </section>

          {/* account summary */}
          <section className="glass-card rounded-2xl border border-white/10 px-4 py-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-100">Account info</h2>
            <p className="text-[0.7rem] text-neutral-400">
              Username and shop are managed by your owner or manager.
            </p>
            <dl className="space-y-1 text-[0.75rem] text-neutral-200">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Username</dt>
                <dd>{username || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Shop</dt>
                <dd>{shopId || "—"}</dd>
              </div>
            </dl>
            <p className="text-[0.65rem] text-neutral-500">
              Need a password reset? Ask your manager or owner to issue a new
              temporary password from the admin screen.
            </p>
          </section>

          {/* ✅ Host for the signature modal */}
          <SignaturePad />
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small mobile-friendly subcomponents                                         */
/* -------------------------------------------------------------------------- */

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  type?: string;
  compact?: boolean;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  compact = false,
}: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className={`w-full rounded-lg border border-white/12 bg-black/40 px-3 ${
          compact ? "py-1.5 text-xs" : "py-2 text-sm"
        } text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper)] focus:outline-none`}
      />
      {helper && <p className="text-[0.65rem] text-neutral-500">{helper}</p>}
    </div>
  );
}

function TogglePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-3 py-1.5 text-[0.75rem] ${
        active
          ? "border border-[var(--accent-copper)] bg-[var(--accent-copper)]/15 text-[var(--accent-copper-light)]"
          : "border border-white/10 bg-black/40 text-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}

function CheckboxRow({
  label,
  helper,
  checked,
  onChange,
}: {
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[2px] h-4 w-4 rounded border-white/30 bg-black/40"
      />
      <div className="space-y-0.5">
        <div className="text-[0.8rem] text-neutral-100">{label}</div>
        {helper && <div className="text-[0.65rem] text-neutral-500">{helper}</div>}
      </div>
    </label>
  );
}