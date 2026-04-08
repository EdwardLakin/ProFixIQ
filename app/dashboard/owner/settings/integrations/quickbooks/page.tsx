import QuickBooksConnectCard from "@/features/integrations/quickbooks/components/QuickBooksConnectCard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pickFirst(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function QuickBooksSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const connected = pickFirst(params.connected);
  const error = pickFirst(params.error);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 text-white">
      <div>
        <h1 className="text-2xl font-semibold">QuickBooks Integration</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Connect QuickBooks Online for this shop, then push finalized invoices into accounting.
        </p>
      </div>

      {connected === "1" ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          QuickBooks connected successfully.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <QuickBooksConnectCard />

      <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <h2 className="text-lg font-semibold">Launch scope</h2>
        <div className="mt-3 space-y-2 text-sm text-neutral-300">
          <p>• Connect one QuickBooks company per shop</p>
          <p>• Auto-create or match customers during invoice sync</p>
          <p>• Push invoices from ProFixIQ into QuickBooks</p>
          <p>• Store link records and sync logs for retries and auditing</p>
        </div>
      </div>
    </div>
  );
}