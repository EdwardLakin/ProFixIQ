// app/work-orders/queue/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import QueuePage from "@/features/work-orders/app/work-orders/queue/page";

export default function Page({
  searchParams,
}: {
  // match what Next expects: any keys, string or string[] or undefined
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // pull out just the `status` we care about
  const statusValue = searchParams?.status;
  const status =
    typeof statusValue === "string" ? statusValue : undefined;

  return <QueuePage searchParams={{ status }} />;
}