"use client";

import { useEffect, useState } from "react";

export type TechnicianCopilotAvailabilityState =
  | { status: "idle" | "checking" | "available"; message: null }
  | { status: "unavailable" | "error"; message: string };

export function useTechnicianCopilotAvailabilityState(
  shouldCheck: boolean,
): TechnicianCopilotAvailabilityState {
  const [availability, setAvailability] =
    useState<TechnicianCopilotAvailabilityState>({
      status: shouldCheck ? "checking" : "idle",
      message: null,
    });

  useEffect(() => {
    let active = true;
    setAvailability({
      status: shouldCheck ? "checking" : "idle",
      message: null,
    });
    if (!shouldCheck) {
      return () => {
        active = false;
      };
    }

    void fetch("/api/copilot/technician/session?accessOnly=1", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          setAvailability({ status: "available", message: null });
          return;
        }

        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setAvailability({
          status:
            response.status === 401 || response.status === 403
              ? "unavailable"
              : "error",
          message:
            body?.error ??
            (response.status === 401 || response.status === 403
              ? "Technician CoPilot is not enabled for this account."
              : "Technician CoPilot availability could not be verified."),
        });
      })
      .catch(() => {
        if (active) {
          setAvailability({
            status: "error",
            message: "Technician CoPilot availability could not be verified.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [shouldCheck]);

  return availability;
}

export function useTechnicianCopilotAvailability(
  shouldCheck: boolean,
): boolean {
  return (
    useTechnicianCopilotAvailabilityState(shouldCheck).status === "available"
  );
}
