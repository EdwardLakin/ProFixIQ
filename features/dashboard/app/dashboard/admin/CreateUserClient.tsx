"use client";
import { useState, FormEvent } from "react";

export default function CreateUserClient() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),     // temp password
      full_name: String(fd.get("full_name") ?? ""),
      role: String(fd.get("role") ?? ""),             // owner/admin/manager/advisor/mechanic
      shop_id: String(fd.get("shop_id") ?? "") || null,
    };

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to create user");
      setMsg("✅ User created");
      (e.target as HTMLFormElement).reset();
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 text-white max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Create User</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input name="full_name" placeholder="Full name" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" required />
        <input name="email" type="email" placeholder="Email" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" required />
        <input name="password" type="text" placeholder="Temporary password" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" required />
        <select name="role" defaultValue="mechanic" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700">
          <option value="mechanic">Mechanic</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <input name="shop_id" type="text" placeholder="Shop ID (optional)" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" />

        <button type="submit" disabled={busy} className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60">
          {busy ? "Creating…" : "Create User"}
        </button>
      </form>

      {msg ? <p className="text-sm mt-2">{msg}</p> : null}
    </div>
  );
}