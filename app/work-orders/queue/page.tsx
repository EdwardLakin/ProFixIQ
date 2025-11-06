// app/work-orders/queue/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import QueuePage from "@/features/work-orders/app/work-orders/queue/page";

// Next is giving us *async* searchParams, so the wrapper must be async too.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const statusParam = Array.isArray(sp.status) ? sp.status[0] : sp.status;

  return <QueuePage searchParams={{ status: statusParam }} />;
}