import PartsRequestsForWorkOrderPage from "../../../parts/requests/[id]/page";

export const dynamic = "force-dynamic";

export default function MobilePartsWorkbenchPage(): JSX.Element {
  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-2 sm:px-3">
      <PartsRequestsForWorkOrderPage />
    </div>
  );
}
