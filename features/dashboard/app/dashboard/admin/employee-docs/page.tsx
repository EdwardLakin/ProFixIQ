'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@shared/types/types/supabase';
import { uploadEmployeeDoc } from '@shared/lib/hr/uploadEmployeeDoc';

type DB = Database;
type Profile = DB['public']['Tables']['profiles']['Row'];
type EmpDoc = DB['public']['Tables']['employee_documents']['Row'];

export default function AdminEmployeeDocsPage() {
  const supabase = createClientComponentClient<Database>();
  const [me, setMe] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<EmpDoc['doc_type']>('drivers_license');
  const [loading, setLoading] = useState(false);

  const shopId = useMemo(() => me?.shop_id ?? null, [me]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setMe(data ?? null);
    })();
  }, [supabase]);

  const fetchDocs = async () => {
    if (!shopId) return;
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('shop_id', shopId)
      .order('uploaded_at', { ascending: false });
    if (!error && data) setDocs(data);
  };

  useEffect(() => { fetchDocs(); /* eslint-disable-next-line */ }, [shopId]);

  const handleUpload = async () => {
    if (!file || !shopId) return;
    setLoading(true);
    try {
      await uploadEmployeeDoc(file, docType, shopId);
      setFile(null);
      await fetchDocs();
    } finally {
      setLoading(false);
    }
  };

  const urlFor = async (path: string) => {
    const { data } = await supabase.storage.from('employee_docs').createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? '#';
  };

  return (
    <div className="p-6 space-y-6 text-white">
      <h1 className="text-2xl font-bold">Employee Documents</h1>

      <div className="rounded border border-neutral-700 p-4 space-y-3">
        <div className="flex gap-3 items-center">
          <select
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            value={docType}
            onChange={(e) => setDocType(e.target.value as EmpDoc['doc_type'])}
          >
            <option value="drivers_license">Driver&apos;s License</option>
            <option value="certification">Certification</option>
            <option value="i9">I-9</option>
            <option value="w4">W-4</option>
            <option value="w9">W-9</option>
            <option value="insurance">Insurance</option>
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
            {loading ? 'Uploading…' : 'Upload'}
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
              <li key={d.id} className="p-3 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{d.doc_type}</div>
                  <div className="text-neutral-400">
                    {d.status} • {new Date(d.uploaded_at).toLocaleString()}
                    {d.expires_at ? ` • expires ${d.expires_at}` : ''}
                  </div>
                </div>
                <DocLink path={d.file_path} urlFor={urlFor} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DocLink({ path, urlFor }: { path: string; urlFor: (p: string) => Promise<string>; }) {
  const [href, setHref] = useState('#');
  useEffect(() => { urlFor(path).then((u) => setHref(u)); }, [path, urlFor]);
  return (
    <a href={href} className="text-sm px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600" target="_blank">
      Open
    </a>
  );
}
