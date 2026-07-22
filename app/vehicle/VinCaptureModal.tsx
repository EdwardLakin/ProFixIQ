"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";
import {
  decodeVin,
  mapDecodedVinToVehicleSelectValues,
  type DecodedVin,
} from "@/features/shared/lib/vin/decodeVin";
import { decodeVinLocally } from "@/features/shared/lib/vin/localDecodeVin";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import VehicleIntakeScanner from "@/features/vehicles/components/VehicleIntakeScanner";
import VinCaptureModalContent from "@/features/vehicles/components/VinCaptureModal";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";

export type VinDecodedDetail = {
  vin: string;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  submodel?: string | null;
  engine?: string | null;
  engineFamily?: string | null;
  engineType?: string | null;
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;
};

type Props = {
  userId: string;
  onDecoded?: (data: VinDecodedDetail) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  /** Existing server route used only for optional online enrichment. */
  action?: string;
};

type DecodeVinResponseExtended = DecodedVin & {
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;
};

function buildDecodedDetail(
  vin: string,
  decoded: DecodeVinResponseExtended,
): VinDecodedDetail {
  const mapped = mapDecodedVinToVehicleSelectValues(decoded);

  return {
    vin,
    year: decoded.year ?? null,
    make: decoded.make ?? null,
    model: decoded.model ?? null,
    trim: decoded.trim ?? null,
    submodel: decoded.submodel ?? decoded.trim ?? null,
    engine: decoded.engine ?? null,
    engineFamily: decoded.engineFamily ?? null,
    engineType: decoded.engineType ?? null,
    engineDisplacementL: decoded.engineDisplacementL ?? null,
    engineCylinders: decoded.engineCylinders ?? null,
    fuelType: mapped.fuel_type ?? null,
    transmission: mapped.transmission ?? null,
    transmissionType:
      decoded.transmissionType ?? decoded.transmission ?? null,
    driveType: mapped.drivetrain ?? null,
    bodyClass: decoded.bodyClass ?? null,
    manufacturer: decoded.manufacturer ?? null,
    gvwr: decoded.gvwr ?? null,
  };
}

export default function VinCaptureModal({
  userId,
  onDecoded,
  open,
  onOpenChange,
  children,
  action = "/api/vin",
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const captureLockRef = useRef(false);

  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? (open as boolean) : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (isControlled) onOpenChange?.(value);
      else setInternalOpen(value);
    },
    [isControlled, onOpenChange],
  );

  const setVehicleDraft = useWorkOrderDraft((state) => state.setVehicle);
  const onDecodedRef = useRef<Props["onDecoded"]>(onDecoded);

  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);

  useEffect(() => {
    if (!isOpen) return;
    captureLockRef.current = false;
    setCaptureError(null);

    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  const applyDecodedVehicle = useCallback(
    (vin: string, decoded: DecodeVinResponseExtended) => {
      const mapped = mapDecodedVinToVehicleSelectValues(decoded);

      setVehicleDraft({
        vin,
        year: decoded.year ?? null,
        make: decoded.make ?? null,
        model: decoded.model ?? null,
        trim: decoded.trim ?? null,
        submodel: decoded.submodel ?? decoded.trim ?? null,
        engine: decoded.engine ?? null,
        engine_family: decoded.engineFamily ?? null,
        engine_type: decoded.engineType ?? null,
        transmission_type:
          decoded.transmissionType ?? decoded.transmission ?? null,
        fuel_type: mapped.fuel_type ?? null,
        drivetrain: mapped.drivetrain ?? null,
        transmission: mapped.transmission ?? null,
      });

      onDecodedRef.current?.(buildDecodedDetail(vin, decoded));
    },
    [setVehicleDraft],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<VinDecodedDetail>)?.detail;
      if (!detail?.vin) return;
      onDecodedRef.current?.(detail);
      setOpen(false);
    };

    window.addEventListener("vin:decoded", handler as EventListener);
    return () =>
      window.removeEventListener("vin:decoded", handler as EventListener);
  }, [setOpen]);

  const fetchRecallData = useCallback(
    (vin: string, decoded: DecodeVinResponseExtended) => {
      if (!decoded.year || !decoded.make || !decoded.model) return;

      void fetch("/api/recalls/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          year: decoded.year,
          make: decoded.make,
          model: decoded.model,
          user_id: userId,
        }),
        keepalive: true,
      }).catch(() => {
        // Recall enrichment must never block vehicle intake.
      });
    },
    [userId],
  );

  const handleFoundVin = useCallback(
    async (rawVin: string) => {
      const normalized = normalizeVinInput(rawVin);
      if (!normalized.isValid) {
        setCaptureError(normalized.message);
        return;
      }
      if (captureLockRef.current) return;

      captureLockRef.current = true;
      setIsDecoding(true);
      setCaptureError(null);

      const local = decodeVinLocally(normalized.vin);
      const localDecoded: DecodeVinResponseExtended = {
        year: local?.year ?? null,
        make: local?.make ?? null,
        manufacturer: local?.manufacturer ?? null,
      };

      // The VIN and locally-known fields land immediately. This keeps intake fast
      // and functional without network or a third-party scan/OCR service.
      applyDecodedVehicle(normalized.vin, localDecoded);
      setOpen(false);
      setIsDecoding(false);

      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      // Existing vPIC decoding remains optional background enrichment. A failure
      // leaves the locally captured VIN and manual form untouched.
      void decodeVin(normalized.vin, userId)
        .then((decoded) => {
          if (decoded.error) return;
          const enriched = decoded as DecodeVinResponseExtended;
          applyDecodedVehicle(normalized.vin, enriched);
          fetchRecallData(normalized.vin, enriched);
        })
        .catch(() => {
          // Intake is already complete locally.
        });
    },
    [applyDecodedVehicle, fetchRecallData, setOpen, userId],
  );

  return (
    <>
      {children ? (
        <span
          onClick={() => setOpen(true)}
          role="button"
          style={{ cursor: "pointer" }}
        >
          {children}
        </span>
      ) : null}

      <ModalShell
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        title="Vehicle Intake Scan"
        size="lg"
        hideFooter={true}
      >
        <VinCaptureModalContent
          action={action}
          userId={userId}
          onManualSubmit={handleFoundVin}
          isDecoding={isDecoding}
          error={captureError}
          onClearError={() => setCaptureError(null)}
          onContinueManual={() => {
            setCaptureError(null);
            setOpen(false);
          }}
          scanSlot={
            <VehicleIntakeScanner
              onFoundVin={(vin) => void handleFoundVin(vin)}
              onError={setCaptureError}
              isBusy={isDecoding}
            />
          }
        />
      </ModalShell>
    </>
  );
}
