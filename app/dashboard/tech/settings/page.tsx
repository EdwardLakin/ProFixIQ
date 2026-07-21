"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import SignaturePad, {
  openSignaturePad,
} from "@/features/shared/signaturePad/controller";
import ProfileIdentityCard from "@/features/users/components/ProfileIdentityCard";
import ProfileContactCard from "@/features/users/components/ProfileContactCard";

const PREFS_KEY = "profixiq.tech.prefs.v1";

type TechPrefs = {
  defaultBucket: "awaiting" | "in_progress" | "on_hold";
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

export default function TechSettingsPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal, setPostal] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [sigPath, setSigPath] = useState<string | null>(null);
  const [sigBusy, setSigBusy] = useState(false);

  const [prefs, setPrefs] = useState<TechPrefs>({
    defaultBucket: "awaiting",
    showUnassigned: false,
    compactCards: false,
    autoRefresh: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select(
          "id, shop_id, username, full_name, email, phone, street, city, province, postal_code, avatar_url, tech_signature_path",
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
        setAvatarUrl(profile.avatar_url ?? null);
        setSigPath(profile.tech_signature_path ?? null);
      }

      try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<TechPrefs>;
          setPrefs((prev) => ({
            ...prev,
            ...parsed,
            defaultBucket:
              parsed.defaultBucket === "awaiting" ||
              parsed.defaultBucket === "in_progress" ||
              parsed.defaultBucket === "on_hold"
                ? parsed.defaultBucket
                : prev.defaultBucket,
          }));
        }
      } catch {
        // noop
      }

      setLoading(false);
    })();
  }, [supabase]);

  const savePrefs = (next: TechPrefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
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

  const captureAndSaveSignature = async () => {
    if (!profileId) return;

    setSigBusy(true);
    setError(null);
    setOk(null);

    try {
      const dataUrl = await openSignaturePad({ shopName: "ProFixIQ" });
      if (!dataUrl) return;

      const blob = dataUrlToBlob(dataUrl);
      const hash = await sha256Base64(dataUrl);
      const path = `tech-signatures/${profileId}/${hash}.png`;

      const up = await supabase.storage.from("signatures").upload(path, blob, {
        upsert: true,
        contentType: "image/png",
      });

      if (up.error) throw up.error;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          tech_signature_path: path,
          tech_signature_hash: hash,
          tech_signature_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
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

  if (loading) return <div className="p-6 text-sm text-[color:var(--theme-text-secondary)]">Loading settings…</div>;

  return (
    <div className="space-y-6 p-6 text-[color:var(--theme-text-primary)]">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">Tech Settings</h1>
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Control your profile identity, workstation preferences, and signature tools.
          </p>
        </div>
        <div className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs text-[color:var(--theme-text-secondary)]">
          {username ? `@${username}` : "Technician"}
          {shopId ? ` • Shop workspace` : ""}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileIdentityCard
          supabase={supabase}
          userId={profileId ?? ""}
          shopId={shopId}
          fullName={fullName || username || "Technician"}
          email={email}
          roleLabel="Tech"
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
          title="Profile identity"
        />

        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Work Preferences</h2>
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">Local workstation</span>
          </div>

          <label className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
            <span>Default queue status</span>
            <select
              value={prefs.defaultBucket}
              onChange={(e) =>
                savePrefs({ ...prefs, defaultBucket: e.target.value as TechPrefs["defaultBucket"] })
              }
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
            >
              <option value="awaiting">Awaiting</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
            </select>
          </label>

          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.autoRefresh}
                onChange={(e) => savePrefs({ ...prefs, autoRefresh: e.target.checked })}
              />
              Auto-refresh tech queue
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.showUnassigned}
                onChange={(e) => savePrefs({ ...prefs, showUnassigned: e.target.checked })}
              />
              Show unassigned jobs
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.compactCards}
                onChange={(e) => savePrefs({ ...prefs, compactCards: e.target.checked })}
              />
              Compact card layout
            </label>
          </div>
        </section>

        <ProfileContactCard
          fullName={fullName}
          email={email}
          phone={phone}
          street={street}
          city={city}
          province={province}
          postal={postal}
          onFullNameChange={setFullName}
          onEmailChange={setEmail}
          onPhoneChange={setPhone}
          onStreetChange={setStreet}
          onCityChange={setCity}
          onProvinceChange={setProvince}
          onPostalChange={setPostal}
          title="Contact & Address"
          subtitle="Used for technician identity and internal communication details."
        />

        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Saved Signature</h2>
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">Inspections</span>
          </div>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Status: {sigPath ? "On file" : "Not set"}. Used automatically while signing inspections.
          </p>
          <button
            type="button"
            onClick={captureAndSaveSignature}
            disabled={sigBusy || !profileId}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] hover:bg-orange-600 disabled:opacity-60"
          >
            {sigBusy ? "Opening…" : sigPath ? "Update signature" : "Capture signature"}
          </button>
          {sigPath ? <p className="text-[11px] text-[color:var(--theme-text-muted)] break-all">{sigPath}</p> : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Notifications</h2>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Per-device queue behavior and prompt settings.</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.autoRefresh}
              onChange={(e) => savePrefs({ ...prefs, autoRefresh: e.target.checked })}
            />
            Queue auto-refresh
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.showUnassigned}
              onChange={(e) => savePrefs({ ...prefs, showUnassigned: e.target.checked })}
            />
            Include unassigned work
          </label>
        </section>

        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card backdrop-blur-xl">
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Account Metadata</h2>
          <dl className="space-y-2 text-xs text-[color:var(--theme-text-secondary)]">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--theme-text-muted)]">Username</dt>
              <dd>{username || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--theme-text-muted)]">Shop</dt>
              <dd>{shopId ? "Linked" : "Not linked"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] hover:bg-orange-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
        {ok && <span className="text-xs text-green-300">{ok}</span>}
      </div>

      <SignaturePad />
    </div>
  );
}
