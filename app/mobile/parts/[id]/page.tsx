import MobilePartsWorkOrderFlow from "@/features/parts/mobile/MobilePartsWorkOrderFlow";

export const dynamic = "force-dynamic";

export default function MobilePartsWorkbenchPage(): JSX.Element {
  return (
    <div className="mx-auto w-full max-w-xl px-3 py-3">
      <MobilePartsWorkOrderFlow />
    </div>
  );
}
