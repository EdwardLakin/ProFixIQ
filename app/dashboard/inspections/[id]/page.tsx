// app/dashboard/inspections/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { FC, ReactElement } from "react";
import FeatureRaw from "@/features/inspections/app/inspection/[id]/page";

type FeatureProps = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

// The imported feature page is a server component; give it explicit props typing
const Feature: FC<FeatureProps> =
  FeatureRaw as unknown as FC<FeatureProps>;

export default function Page({
  params,
  searchParams,
}: FeatureProps): ReactElement {
  return <Feature params={params} searchParams={searchParams} />;
}