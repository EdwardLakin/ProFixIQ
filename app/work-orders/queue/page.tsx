// app/work-orders/queue/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import QueuePage from "@/features/work-orders/app/work-orders/queue/page";

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // normalize to what QueuePage expects: { status?: string }
  const statusParam = Array.isArray(searchParams?.status)
    ? searchParams?.status[0]
    : searchParams?.status;

  return <QueuePage searchParams={{ status: statusParam }} />;
}