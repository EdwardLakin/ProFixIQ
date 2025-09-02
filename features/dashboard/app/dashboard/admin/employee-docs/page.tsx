"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { uploadEmployeeDoc, type EmployeeDocType } from "@shared/lib/hr/uploadEmployeeDoc";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type EmpDoc = DB["public"]["Tables"]["employee_documents"]["Row"];

export default function AdminEmployeeDocsPage() {
  const supabase = createClientComponentClient<Database>();
  const [me, setMe] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<EmployeeDocType>("drivers_license");
  const [loading, setLoading] = useState(false);

  const shopId = useMemo(() => me?.shop_id ?? null, [me]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setMe(data ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDocs = async () => {
    if (!shopId) return;
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("shop_id", shopId)
      .order("uploaded_at", { ascending: false });
    if (!error && data) setDocs(data);
  };

  useEffect(() => {
    void fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const handleUpload = async () => {
    if (!file || !shopId) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // 👇 pass user.id as the 4th argument
      await uploadEmployeeDoc(file, docType, shopId, user.id);
      setFile(null);
      await fetchDocs();
    } finally {
      setLoading(false);
    }
  };

  const urlFor = async (path: string) => {
    const { data } = await supabase.storage
      .from("employee_docs")
      .createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? "#";
  };

  return (
    <div className="p-6 space-y-6 text-white">
      <h1 className="text-2xl font-bold">Employee Documents</h1>

      <div className="rounded border border-neutral-700 p-4 space-y-3">
        <div className="flex gap-3 items-center">
          <select
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            value={docType}
            onChange={(e) => setDocType(e.target.value as EmployeeDocType)}
          >
            <option value="drivers_license">Driver&apos;s License</option>
            <option value="certification">Certification</option>
            <option value="tax_form">Tax Form</option>
            <option value="other">Other</option>
          </select>

          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            onClick={handleUpload}
            disabled={!file || !shopId || loading}
            className="px-3 py-1 rounded bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {!shopId && (
          <p className="text-sm text-neutral-400">
            Join or create a shop to enable uploads.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">All Documents (shop)</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-neutral-400">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 border border-neutral-800 rounded">
            {docs.map((d) => (
              <DocRow key={d.id} doc={d} urlFor={urlFor} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DocRow({
  doc,
  urlFor,
}: {
  doc: EmpDoc;
  urlFor: (p: string) => Promise<string>;
}) {
  const [href, setHref] = useState("#");
  useEffect(() => {
    urlFor(doc.file_path).then((u) => setHref(u));
  }, [doc.file_path, urlFor]);

  return (
    <li className="p-3 flex items-center justify-between">
      <div className="text-sm">
        <div className="font-medium capitalize">{doc.doc_type}</div>
        <div className="text-neutral-400">
          {doc.status} • {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : "—"}
          {doc.expires_at ? ` • expires ${doc.expires_at}` : ""}
        </div>
      </div>
      <a
        href={href}
        className="text-sm px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600"
        target="_blank"
        rel="noreferrer"
      >
        Open
      </a>
    </li>
  );
}