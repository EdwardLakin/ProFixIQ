import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const suffix = query.from ? `?from=${encodeURIComponent(query.from)}` : "";
  redirect(`/dashboard/workforce/people/${id}${suffix}`);
}
