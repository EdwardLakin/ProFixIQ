"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { Dialog } from "@headlessui/react";
import {
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { Database } from "@shared/types/types/supabase";

type VehiclePhoto = Database["public"]["Tables"]["vehicle_photos"]["Row"];

interface Props {
  vehicleId: string;
  currentUserId: string;
}

export default function VehiclePhotoGallery({
  vehicleId,
  currentUserId,
}: Props) {
  const supabase = createBrowserSupabase();

  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState("");
  const [fullscreenPhoto, setFullscreenPhoto] = useState<VehiclePhoto | null>(
    null,
  );

  useEffect(() => {
    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from("vehicle_photos")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Failed to load vehicle photos", error);
        return;
      }

      if (data) setPhotos(data);
    };

    void fetchPhotos();
  }, [vehicleId, supabase]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("vehicle_photos")
      .delete()
      .eq("id", id);
    if (error) {
      console.warn("Failed to delete vehicle photo", error);
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCaptionSave = async (id: string) => {
    const trimmed = editedCaption.trim();
    const { error } = await supabase
      .from("vehicle_photos")
      .update({ caption: trimmed || null })
      .eq("id", id);

    if (error) {
      console.warn("Failed to update caption", error);
      return;
    }

    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption: trimmed || null } : p)),
    );
    setEditingCaptionId(null);
    setEditedCaption("");
  };

  return (
    <>
      {/* wrapper card for gallery */}
      <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 shadow-[var(--theme-shadow-medium)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Vehicle photo history
          </h3>
          <p className="text-[11px] text-[color:var(--theme-text-muted)]">
            Click a photo to view full screen.
          </p>
        </div>

        {photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-6 text-center text-sm text-[color:var(--theme-text-secondary)]">
            No photos for this vehicle yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-medium)] transition hover:border-[var(--accent-copper-light)] hover:bg-[color:var(--theme-surface-overlay)]"
              >
                <button
                  type="button"
                  className="block w-full focus:outline-none"
                  onClick={() => setFullscreenPhoto(photo)}
                >
                  <div className="relative aspect-video w-full bg-[color:var(--theme-surface-inset)]">
                    {/* plain <img> instead of next/image */}
                    <img
                      src={photo.url}
                      alt={photo.caption || "Vehicle photo"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </button>

                {/* hover controls */}
                {photo.uploaded_by === currentUserId && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                    <div className="flex items-center gap-1 rounded-full bg-[color:var(--theme-surface-overlay)] px-2 py-1 shadow-[var(--theme-shadow-medium)]">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCaptionId(photo.id);
                          setEditedCaption(photo.caption || "");
                        }}
                        className="p-0.5 text-[11px] text-[var(--accent-copper-light)] hover:text-[color:var(--theme-text-primary)]"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(photo.id)}
                        className="p-0.5 text-[11px] text-red-400 hover:text-red-200"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* caption area */}
                <div className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2.5 py-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                  {editingCaptionId === photo.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editedCaption}
                        onChange={(e) => setEditedCaption(e.target.value)}
                        className="h-7 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                        placeholder="Add a note about this photo…"
                      />
                      <button
                        type="button"
                        onClick={() => handleCaptionSave(photo.id)}
                        className="rounded-full bg-[var(--accent-copper)] px-2 py-1 text-[10px] font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_14px_rgba(248,113,22,0.55)] hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  ) : photo.caption ? (
                    <p className="line-clamp-2 text-[11px] text-[color:var(--theme-text-primary)]">
                      {photo.caption}
                    </p>
                  ) : (
                    <p className="text-[11px] italic text-[color:var(--theme-text-muted)]">
                      No caption
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* fullscreen viewer */}
      <Dialog
        open={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        className="fixed inset-0 z-[120] flex items-center justify-center"
      >
        {/* backdrop */}
        <div
          className="fixed inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
          aria-hidden="true"
        />

        <div className="relative z-[130] mx-3 my-6 w-full max-w-5xl">
          <Dialog.Panel className="relative overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 shadow-[var(--theme-shadow-medium)]">
            {/* close button */}
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)] shadow-sm transition hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]"
              onClick={() => setFullscreenPhoto(null)}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>

            <div className="flex flex-col gap-3 pt-2">
              <div className="relative mx-auto max-h-[70vh] w-full">
                {fullscreenPhoto && (
                  <img
                    src={fullscreenPhoto.url}
                    alt={fullscreenPhoto.caption || "Vehicle photo"}
                    className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain"
                  />
                )}
              </div>

              {fullscreenPhoto?.caption && (
                <p className="mx-auto max-w-3xl px-2 pb-1 text-center text-sm text-[color:var(--theme-text-primary)]">
                  {fullscreenPhoto.caption}
                </p>
              )}

              <p className="text-center text-[11px] text-[color:var(--theme-text-muted)]">
                Click outside or press ESC to close.
              </p>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
}