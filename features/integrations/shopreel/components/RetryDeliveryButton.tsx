"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

export default function RetryDeliveryButton({
  deliveryId,
}: {
  deliveryId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    try {
      setLoading(true);

      const response = await fetch("/api/shopreel/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ deliveryId }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || result?.message || "Retry failed.");
      }

      toast.success(result?.message || "Retried successfully.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={handleRetry} disabled={loading}>
      {loading ? "Retrying..." : "Retry"}
    </Button>
  );
}
