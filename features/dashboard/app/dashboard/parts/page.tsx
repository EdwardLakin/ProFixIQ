"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import clsx from "clsx";
import { toast } from "sonner";
import PartsRequestChat from "@parts/components/PartsRequestChat";

type PartsRequest = Database["public"]["Tables"]["parts_requests"]["Row"];

export default function PartsDashboard() {
  const supabase = createClientComponentClient<Database>();
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [touchStartY, setTouchStartY] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Fetch initial user
  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      setUserId(res.data.user?.id ?? null);
    });
  }, []);

  // Fetch initial requests
  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("parts_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) setRequests(data);
    };
    fetch();
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("parts-requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parts_requests",
        },
        (payload) => {
          const updated = payload.new as PartsRequest;

          setRequests((prev) => {
            const exists = prev.find((r) => r.id === updated.id);
            if (!exists && payload.eventType === "INSERT") {
              toast.info(`New parts request: ${updated.part_name}`);
              return [updated, ...prev];
            }

            return prev.map((r) => (r.id === updated.id ? updated : r));
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleView = async (id: string) => {
    setSelectedId(id);
    const req = requests.find((r) => r.id === id);
    if (req && !req.viewed_at) {
      const now = new Date().toISOString();
      await supabase
        .from("parts_requests")
        .update({ viewed_at: now })
        .eq("id", id);
    }
  };

  const handleFulfill = async (id: string) => {
    const now = new Date().toISOString();
    await supabase
      .from("parts_requests")
      .update({ fulfilled_at: now })
      .eq("id", id);
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, fulfilled_at: now } : r)),
    );
  };

  const filtered = requests.filter((r) =>
    tab === "active" ? !r.fulfilled_at : !!r.fulfilled_at,
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto text-white font-blackops">
      <h1 className="text-3xl text-orange-500 mb-6">Parts Requests</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTab("active")}
          className={clsx(
            "px-4 py-2 rounded font-semibold",
            tab === "active"
              ? "bg-orange-500 text-white"
              : "bg-neutral-700 hover:bg-neutral-600",
          )}
        >
          Active
        </button>
        <button
          onClick={() => setTab("archived")}
          className={clsx(
            "px-4 py-2 rounded font-semibold",
            tab === "archived"
              ? "bg-orange-500 text-white"
              : "bg-neutral-700 hover:bg-neutral-600",
          )}
        >
          Archived
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400">No {tab} requests found.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => {
            const isNew = !req.viewed_at;

            return (
              <div
                key={req.id}
                className={clsx(
                  "rounded p-4 border shadow transition",
                  isNew && tab === "active"
                    ? "border-yellow-500 bg-yellow-900/20 animate-pulse"
                    : "border-gray-600 bg-gray-800",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                  <div>
                    <p className="text-lg font-semibold text-orange-300">
                      {req.part_name} × {req.quantity}
                    </p>
                    <p className="text-sm text-gray-400">
                      <strong>Urgency:</strong> {req.urgency}{" "}
                      <strong className="ml-4">Requested by:</strong>{" "}
                      {req.requested_by}
                    </p>
                    <p className="text-xs text-gray-500">
                      <strong>Sent:</strong>{" "}
                      {req.created_at
                        ? new Date(req.created_at).toLocaleString()
                        : "—"}{" "}
                      <br />
                      <strong>Viewed:</strong>{" "}
                      {req.viewed_at
                        ? new Date(req.viewed_at).toLocaleString()
                        : "—"}{" "}
                      <br />
                      <strong>Fulfilled:</strong>{" "}
                      {req.fulfilled_at
                        ? new Date(req.fulfilled_at).toLocaleString()
                        : "—"}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {tab === "active" && (
                      <button
                        onClick={() => handleView(req.id)}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {req.viewed_at ? "View Again" : "View"}
                      </button>
                    )}
                    {tab === "active" && !req.fulfilled_at && (
                      <button
                        onClick={() => handleFulfill(req.id)}
                        className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
                      >
                        Mark Fulfilled
                      </button>
                    )}
                  </div>
                </div>

                {selectedId === req.id && req.notes && (
                  <div className="mt-2 text-sm text-white">
                    <strong>Notes:</strong> {req.notes}
                  </div>
                )}

                {selectedId === req.id && req.photo_urls?.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {req.photo_urls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt="Part"
                        className="w-20 h-20 rounded border border-gray-500 object-cover"
                      />
                    ))}
                  </div>
                )}

                {selectedId === req.id && userId && (
                  <>
                    {/* Mobile Full-Screen Chat with Swipe-to-Close */}
                    <div
                      className="fixed inset-0 bg-black bg-opacity-80 z-50 sm:hidden flex flex-col transition-transform duration-300 ease-out"
                      style={{
                        touchAction: "none",
                        transform: `translateY(${swipeOffset}px)`,
                      }}
                      onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
                      onTouchMove={(e) => {
                        const delta = e.touches[0].clientY - touchStartY;
                        if (delta > 0) setSwipeOffset(delta);
                      }}
                      onTouchEnd={() => {
                        if (swipeOffset > 100) {
                          setSelectedId(null);
                        } else {
                          setSwipeOffset(0);
                        }
                      }}
                    >
                      <div className="flex justify-between items-center p-3 bg-neutral-900 text-white border-b border-gray-700">
                        <h2 className="text-lg font-semibold">Request Chat</h2>
                        <button
                          onClick={() => setSelectedId(null)}
                          className="text-gray-300 hover:text-white text-sm"
                        >
                          Close ✕
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto bg-neutral-800">
                        <PartsRequestChat
                          requestId={req.id}
                          senderId={userId}
                        />
                      </div>
                    </div>

                    {/* Desktop Inline View */}
                    <div className="hidden sm:block mt-4">
                      <PartsRequestChat requestId={req.id} senderId={userId} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
