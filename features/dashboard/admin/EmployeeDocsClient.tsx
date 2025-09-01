// features/dashboard/admin/EmployeeDocsClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { uploadEmployeeDoc } from "@shared/lib/hr/uploadEmployeeDoc";

type DB = Database;
type EmpDoc = DB["public"]["Tables"]["employee_documents"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

export default function EmployeeDocsClient() {
  const supabase = createClientComponentClient<DB>();

  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState<EmpDoc["doc_type"]>("drivers_license");
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (!error && data) setDocs(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setBusy(true);
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user) throw new Error("Not signed in");

      // Pull current user's shop_id from profiles
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<ProfileRow, "shop_id">>();
      if (profErr) throw profErr;

      const shopId = prof?.shop_id ?? null;
      if (!shopId) throw new Error("No shop_id on profile");

      await uploadEmployeeDoc(file, docType, shopId);
      setFile(null);
      await load();
    } catch (err) {
      console.error(err);
      // (Optional) surface a toast or set an error message state here
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Employee Documents</h1>

      <form onSubmit={onUpload} className="mb-6 flex items-center gap-2">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as EmpDoc["doc_type"])}
          className="rounded border px-2 py-1"
        >
          <option value="drivers_license">Driver&apos;s License</option>
          <option value="certification">Certification</option>
          <option value="tax_form">Tax Form</option>
          <option value="other">Other</option>
        </select>

        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="rounded border px-2 py-1"
        />

        <button
          type="submit"
          disabled={busy || !file}
          className="rounded bg-neutral-800 px-3 py-1 text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="space-y-2">
        {docs.length === 0 && (
          <p className="text-sm text-neutral-500">No documents uploaded yet.</p>
        )}

        {docs.map((d) => {
          const publicUrl =
            supabase.storage.from("employee_docs").getPublicUrl(d.file_path)
              .data.publicUrl;

          return (
            <div
              key={d.id}
              className="flex justify-between rounded border p-3"
            >
              <div>
                <div className="font-medium">{d.doc_type}</div>
                <div className="text-xs text-neutral-500">
                  {d.user_id} •{" "}
                  {d.uploaded_at
                    ? new Date(d.uploaded_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div className="text-sm">
                <a
                  className="underline"
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}