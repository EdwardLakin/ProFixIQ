"use client";

import { useEffect, useState } from "react";

export function useTechnicianCopilotAvailability(
  shouldCheck: boolean,
): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    setAvailable(false);
    if (!shouldCheck) {
      return () => {
        active = false;
      };
    }

    void fetch("/api/copilot/technician/session?accessOnly=1", {
      cache: "no-store",
    })
      .then((response) => {
        if (active) setAvailable(response.ok);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });

    return () => {
      active = false;
    };
  }, [shouldCheck]);

  return available;
}
