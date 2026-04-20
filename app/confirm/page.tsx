import { redirect } from "next/navigation";

type ConfirmPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const resolved = (await searchParams) ?? {};
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
      continue;
    }
    if (typeof value === "string") params.set(key, value);
  }

  const tail = params.toString();
  redirect(`/auth/callback${tail ? `?${tail}` : ""}`);
}
