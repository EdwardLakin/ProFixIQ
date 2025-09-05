export const dynamic = "force-dynamic";
export const revalidate = 0;

// Note: importing a bracket route is fine as long as the file exists at that path.
import FeaturePage from "@/features/inspections/app/inspection/[id]/page";

export default function Page(props: any) {
  // Pass through route params/search params if the feature page expects them
  return <FeaturePage {...props} />;
}
