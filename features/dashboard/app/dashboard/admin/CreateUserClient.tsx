"use client";

import * as React from "react";

export default function CreateUserClient() {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          full_name: formData.get("full_name"),
          role: formData.get("role"),
        }),
      });
      const j = await res.json();
      setMsg(j.ok ? "✅ User create request accepted." : `❌ ${j.error ?? "Failed"}`);
    } catch (e:any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 text-white max-w-lg">
      <h1 className="text-2xl font-semibold mb-4">Create User</h1>
      <form action={onSubmit} className="space-y-3">
        <input name="full_name" placeholder="Full name" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" />
        <input name="email" placeholder="Email" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700" />
        <select name="role" className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700">
          <option value="tech">Tech</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
        </select>
        <button disabled={busy} className="px-4 py-2 rounded bg-orange-600 disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm opacity-80">{msg}</p>}
    </div>
  );
}
