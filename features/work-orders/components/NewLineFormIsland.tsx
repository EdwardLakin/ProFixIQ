// features/work-orders/components/NewLineFormIsland.tsx
"use client";
import { useRouter } from "next/navigation";
import { NewWorkOrderLineForm } from "./NewWorkOrderLineForm";

type Props = {
  workOrderId: string;
  vehicleId: string | null;
  defaultJobType: "inspection" | "maintenance" | "diagnosis" | null;
};

export default function NewLineFormIsland(props: Props) {
  const router = useRouter();
  return (
    <NewWorkOrderLineForm
      {...props}
      onCreated={() => router.refresh()}
    />
  );
}