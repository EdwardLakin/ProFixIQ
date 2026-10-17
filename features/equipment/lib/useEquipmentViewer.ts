"use client";

import { useEffect, useState } from "react";

import {
  getEquipmentClassification,
  getKnownEquipmentClassification,
  getRememberedViewerProfileId,
  rememberViewerProfileId,
  type EquipmentClassification,
} from "@/features/equipment/lib/equipmentClassification";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { getSessionMatchedOfflineScope } from "@/features/shared/lib/offline/mutations";

type ViewerClient = Parameters<typeof resolveCanonicalStaffProfile>[0] & {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
};

export type EquipmentViewer = {
  equipmentClass: EquipmentClassification;
  /** The signed-in technician's profile id (what labor segments are keyed by). */
  viewerProfileId: string | null;
};

/**
 * Whether this is an Equipment shop and who the signed-in technician is, for
 * screens that decide Start/Finish from the viewer's own timer. Both come from
 * authoritative sources and are remembered for offline use. If either is
 * unavailable the screen keeps its standard behavior and never guesses.
 */
export function useEquipmentViewer(enabled: boolean, supabase: ViewerClient): EquipmentViewer {
  const [equipmentClass, setEquipmentClass] = useState<EquipmentClassification>("unknown");
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      try {
        const scope = await getSessionMatchedOfflineScope();
        if (!active) return;
        setEquipmentClass(getKnownEquipmentClassification(scope));
        setViewerProfileId(getRememberedViewerProfileId(scope));

        const [classification, profileId] = await Promise.all([
          getEquipmentClassification(scope),
          (async () => {
            // Offline: rely on the remembered profile id; no network lookup.
            if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) return null;
            const { profile } = await resolveCanonicalStaffProfile(supabase, user.id);
            return profile?.id ?? null;
          })().catch(() => null),
        ]);
        if (!active) return;
        setEquipmentClass(classification);
        if (profileId) {
          rememberViewerProfileId(scope, profileId);
          setViewerProfileId(profileId);
        }
      } catch {
        // Keep the standard behavior.
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, supabase]);

  return { equipmentClass, viewerProfileId };
}
