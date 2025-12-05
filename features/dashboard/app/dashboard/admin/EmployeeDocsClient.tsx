"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { uploadEmployeeDoc, type EmployeeDocType } from "@shared/lib/hr/uploadEmployeeDoc";

type DB = Database;
type EmpDocRow = DB["public"]["Tables"]["employee_documents"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type DocType = EmployeeDocType;

export default function EmployeeDocsClient() {
  const supabase = createClientComponentClient<DB>();
  const [docs, setDocs] = useState<EmpDocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>("drivers_license");

  const load = async () => {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (!error && data) setDocs(data as EmpDocRow[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<ProfileRow, "shop_id">>();
      if (error) throw error;

      const shopId = prof?.shop_id ?? null;
      if (!shopId) throw new Error("No shop_id on profile");

      // 👇 pass user.id as the 4th argument
      await uploadEmployeeDoc(file, docType, shopId, user.id);
      setFile(null);
      await load();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // bucket name: employee_docs
  const publicUrlFor = (p: string) =>
    supabase.storage.from("employee_docs").getPublicUrl(p).data.publicUrl;

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Employee Documents</h1>

      <form onSubmit={onUpload} className="mb-6 flex gap-2 items-center">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="border rounded px-2 py-1 bg-neutral-900"
        >
          <option value="drivers_license">Driver&apos;s License</option>
          <option value="certification">Certification</option>
          <option value="tax_form">Tax Form</option>
          <option value="other">Other</option>
        </select>

        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="border rounded px-2 py-1 bg-neutral-900"
        />

        <button
          type="submit"
          disabled={busy || !file}
          className="px-3 py-1 rounded bg-orange-600 text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="space-y-2">
        {docs.length === 0 ? (
          <p className="text-sm text-neutral-400">No documents uploaded yet.</p>
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              className="border rounded p-3 flex items-center justify-between bg-neutral-900/40"
            >
              <div>
                <div className="font-medium capitalize">{d.doc_type}</div>
                <div className="text-xs text-neutral-400">
                  {d.user_id} •{" "}
                  {d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "—"}
                </div>
              </div>
              <a
                className="text-sm underline"
                href={publicUrlFor(d.file_path)}
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}