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
      full_name: String(fd.get("full_name") ?? ""),
      role: String(fd.get("role") ?? "tech"),
    };

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      setMsg(j.ok ? "✅ User create request accepted." : `❌ ${j.error ?? "Failed"}`);
    } catch (e) {
      const err = e as Error;
      setMsg(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 text-white max-w-lg">
      <h1 className="text-2xl font-semibold mb-4">Create User</h1>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          name="full_name"
          placeholder="Full name"
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          required
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          required
        />
        <select
          name="role"
          className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
          defaultValue="tech"
        >
          <option value="tech">Tech</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
        </select>

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded bg-orange-600 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </form>

      {msg && <p className="mt-3 text-sm opacity-80">{msg}</p>}
    </div>
  );
}