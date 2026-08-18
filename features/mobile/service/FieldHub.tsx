"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  EyeOff,
  FilePlus2,
  PackagePlus,
  Plus,
  RadioTower,
  ReceiptText,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Wrench,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";
import MobileServiceShell from "./MobileServiceShell";
import {
  buildFieldDashboardLayoutCache,
  buildDefaultFieldDashboardLayout,
  createFieldDashboardLayoutSaveQueue,
  FIELD_DASHBOARD_LEGACY_LAYOUT_CACHE_KEY,
  FIELD_DASHBOARD_LAYOUT_SCOPE,
  getFieldDashboardLayoutCacheKey,
  moveFieldDashboardCard,
  normalizeFieldDashboardLayout,
  parseFieldDashboardLayoutCache,
  setFieldDashboardCardVisibility,
  type FieldDashboardCardId,
  type FieldDashboardLayoutCacheRecord,
  type FieldDashboardLayoutItem,
} from "./fieldDashboardLayout";
import {
  canUseFieldWorkspaceCapability,
  type FieldWorkspaceCapabilities,
} from "./fieldWorkspaceCapabilities";

type FieldAction = {
  title: string;
  href: string;
  icon: LucideIcon;
  requiredCapability?: keyof FieldWorkspaceCapabilities;
};

type FieldDashboardCard = FieldAction & {
  id: FieldDashboardCardId;
  description: string;
};

const FIELD_PRIMARY_ACTIONS: FieldAction[] = [
  {
    title: "New appointment",
    href: "/mobile/appointments#new-appointment",
    icon: CalendarDays,
    requiredCapability: "canManageScheduling",
  },
  {
    title: "New service call",
    href: "/mobile/service/new",
    icon: Plus,
  },
  {
    title: "New work order",
    href: "/mobile/work-orders/create",
    icon: FilePlus2,
    requiredCapability: "canManageOperations",
  },
  {
    title: "Scan or create part",
    href: "/mobile/service/truck-inventory",
    icon: Boxes,
  },
  {
    title: "Start inspection",
    href: "/mobile/inspections",
    icon: ClipboardCheck,
  },
  {
    title: "Invoice or payment",
    href: "/mobile/work-orders?status=ready_to_invoice&mode=field_closeout",
    icon: CreditCard,
  },
];

const FIELD_DASHBOARD_CARDS: FieldDashboardCard[] = [
  {
    id: "dispatch_queue",
    title: "Dispatch queue",
    description: "Assign new service calls to an operator and truck.",
    href: "/mobile/service/dispatch",
    icon: RadioTower,
    requiredCapability: "canManageScheduling",
  },
  {
    id: "jobs_in_progress",
    title: "Jobs in progress",
    description: "Return to active repairs and service calls.",
    href: "/mobile/work-orders?status=in_progress",
    icon: Wrench,
  },
  {
    id: "awaiting_approval",
    title: "Awaiting approval",
    description: "Review work waiting on a customer decision.",
    href: "/mobile/work-orders?status=awaiting_approval",
    icon: ClipboardCheck,
    requiredCapability: "canManageOperations",
  },
  {
    id: "parts_required",
    title: "Parts required",
    description: "Open requests that need sourcing or review.",
    href: "/mobile/parts?view=requests",
    icon: Boxes,
    requiredCapability: "canManageParts",
  },
  {
    id: "truck_inventory",
    title: "Truck inventory",
    description: "Scan, receive, transfer and consume truck stock.",
    href: "/mobile/service/truck-inventory",
    icon: RadioTower,
  },
  {
    id: "unpaid_invoices",
    title: "Ready for closeout",
    description: "Invoice completed work and take payment in the field.",
    href: "/mobile/work-orders?status=ready_to_invoice&mode=field_closeout",
    icon: ReceiptText,
    requiredCapability: "canManageOperations",
  },
  {
    id: "followups_due",
    title: "Follow-ups due",
    description: "Turn deferred recommendations into future work.",
    href: "/mobile/service/followups",
    icon: BriefcaseBusiness,
    requiredCapability: "canManageOperations",
  },
  {
    id: "purchase_orders",
    title: "Purchase orders",
    description: "Order and receive parts into Field stock.",
    href: "/mobile/service/purchase-orders",
    icon: PackagePlus,
    requiredCapability: "canManageParts",
  },
];

function serializeLayout(layout: FieldDashboardLayoutItem[]): string {
  return JSON.stringify(layout);
}

function readCachedLayout(
  cacheKey: string,
  scope: OfflineMutationScope,
): FieldDashboardLayoutCacheRecord | null {
  try {
    return parseFieldDashboardLayoutCache(
      JSON.parse(window.localStorage.getItem(cacheKey) ?? "null"),
      scope,
    );
  } catch {
    return null;
  }
}

function writeCachedLayout(
  cacheKey: string,
  scope: OfflineMutationScope,
  layout: FieldDashboardLayoutItem[],
  pendingSync: boolean,
): void {
  const record = buildFieldDashboardLayoutCache(scope, layout, pendingSync);
  if (!record) return;

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(record));
  } catch {
    // Remote preferences remain authoritative when device storage is unavailable.
  }
}

function FieldDashboardCardLink({ card }: { card: FieldDashboardCard }) {
  const Icon = card.icon;

  return (
    <Link className="field-hub-module" href={card.href}>
      <span className="field-hub-module__icon">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="field-hub-module__title">{card.title}</span>
        <span className="field-hub-module__description">
          {card.description}
        </span>
      </span>
      <ArrowRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-[color:var(--accent-copper)]"
      />
    </Link>
  );
}

export default function FieldHub({
  capabilities,
  scope,
}: {
  capabilities: FieldWorkspaceCapabilities;
  scope: OfflineMutationScope;
}) {
  const [online, setOnline] = useState(true);
  const [dateLabel, setDateLabel] = useState("Today");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [layout, setLayout] = useState<FieldDashboardLayoutItem[]>(() =>
    buildDefaultFieldDashboardLayout(),
  );
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const lastRemoteLayoutRef = useRef<string | null>(null);
  const latestLayoutRef = useRef(serializeLayout(layout));
  const pendingSyncRef = useRef(false);
  const cacheScope = useMemo(
    () => ({ userId: scope.userId, shopId: scope.shopId }),
    [scope.shopId, scope.userId],
  );
  const cacheKey = useMemo(
    () => getFieldDashboardLayoutCacheKey(cacheScope),
    [cacheScope],
  );
  const saveQueue = useMemo(
    () =>
      createFieldDashboardLayoutSaveQueue(async (request) => {
        if (!navigator.onLine) return false;

        const response = await fetch("/api/dashboard/layout", {
          method: "PUT",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: FIELD_DASHBOARD_LAYOUT_SCOPE,
            layout: request.layout,
          }),
        }).catch(() => null);
        if (!response?.ok) return false;

        lastRemoteLayoutRef.current = request.serialized;
        if (cacheKey && latestLayoutRef.current === request.serialized) {
          pendingSyncRef.current = false;
          writeCachedLayout(cacheKey, cacheScope, request.layout, false);
        }
        return true;
      }),
    [cacheKey, cacheScope],
  );

  latestLayoutRef.current = serializeLayout(layout);

  const eligibleCards = useMemo(
    () =>
      FIELD_DASHBOARD_CARDS.filter((card) =>
        canUseFieldWorkspaceCapability(capabilities, card.requiredCapability),
      ),
    [capabilities],
  );
  const eligibleCardIds = useMemo(
    () => eligibleCards.map((card) => card.id),
    [eligibleCards],
  );
  const cardById = useMemo(
    () => new Map(eligibleCards.map((card) => [card.id, card] as const)),
    [eligibleCards],
  );
  const orderedEligibleCards = useMemo(
    () =>
      layout
        .map((item) => ({ item, card: cardById.get(item.id) }))
        .filter(
          (
            entry,
          ): entry is {
            item: FieldDashboardLayoutItem;
            card: FieldDashboardCard;
          } => Boolean(entry.card),
        ),
    [cardById, layout],
  );
  const visibleCards = orderedEligibleCards.filter(
    ({ item }) => item.hidden !== true,
  );
  const primaryActions = FIELD_PRIMARY_ACTIONS.filter((action) =>
    canUseFieldWorkspaceCapability(capabilities, action.requiredCapability),
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    setDateLabel(
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!controlsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [controlsOpen]);

  useEffect(() => {
    let active = true;
    setPreferencesLoaded(false);
    lastRemoteLayoutRef.current = null;

    if (!cacheKey) {
      setLayout(buildDefaultFieldDashboardLayout());
      pendingSyncRef.current = false;
      setPreferencesLoaded(true);
      return () => {
        active = false;
      };
    }

    try {
      window.localStorage.removeItem(FIELD_DASHBOARD_LEGACY_LAYOUT_CACHE_KEY);
    } catch {
      // The legacy unscoped cache is never read, even if cleanup is unavailable.
    }

    const cached = readCachedLayout(cacheKey, cacheScope);
    const cachedLayout = cached?.layout ?? buildDefaultFieldDashboardLayout();
    pendingSyncRef.current = cached?.pendingSync === true;
    setLayout(cachedLayout);
    latestLayoutRef.current = serializeLayout(cachedLayout);

    void fetch(
      `/api/dashboard/layout?scope=${encodeURIComponent(FIELD_DASHBOARD_LAYOUT_SCOPE)}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    )
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          layout?: unknown;
        } | null;
        if (!active || !response.ok) return;
        const remote = normalizeFieldDashboardLayout(body?.layout);
        const serializedRemote = serializeLayout(remote);
        lastRemoteLayoutRef.current = serializedRemote;
        if (!pendingSyncRef.current) {
          setLayout(remote);
          latestLayoutRef.current = serializedRemote;
          writeCachedLayout(cacheKey, cacheScope, remote, false);
        }
      })
      .catch(() => {
        // Device preferences remain usable while the operator is offline.
      })
      .finally(() => {
        if (active) setPreferencesLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [cacheKey, cacheScope]);

  useEffect(() => {
    if (!preferencesLoaded || !cacheKey || !pendingSyncRef.current) return;
    const serialized = serializeLayout(layout);
    if (
      serialized === lastRemoteLayoutRef.current &&
      !saveQueue.hasWork()
    ) {
      pendingSyncRef.current = false;
      writeCachedLayout(cacheKey, cacheScope, layout, false);
      return;
    }

    writeCachedLayout(cacheKey, cacheScope, layout, true);
    saveQueue.enqueue(layout);
    if (!online) return;

    const timeout = window.setTimeout(() => {
      void saveQueue.flush();
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [cacheKey, cacheScope, layout, online, preferencesLoaded, saveQueue]);

  const updateLayout = (
    updater: (
      current: FieldDashboardLayoutItem[],
    ) => FieldDashboardLayoutItem[],
  ) => {
    pendingSyncRef.current = true;
    setLayout(updater);
  };

  const resetLayout = () =>
    updateLayout(() => buildDefaultFieldDashboardLayout());

  return (
    <main className="field-hub">
      <section className="field-hub-hero">
        <div className="min-w-0">
          <div className="field-hub-hero__eyebrow">
            <RadioTower aria-hidden className="h-3.5 w-3.5" /> Field command
          </div>
          <h1 className="field-hub-hero__title">Run the day from here.</h1>
          <p className="field-hub-hero__subtitle">
            {dateLabel}. One workspace for the call, repair, customer and money.
          </p>
        </div>
        <div
          className="field-hub-hero__status"
          data-online={online ? "true" : "false"}
        >
          {online ? (
            <Wifi aria-hidden className="h-4 w-4" />
          ) : (
            <WifiOff aria-hidden className="h-4 w-4" />
          )}
          <span>{online ? "Online" : "Working offline"}</span>
        </div>
      </section>

      <section
        className="field-hub-actions"
        aria-labelledby="field-actions-heading"
      >
        <div className="field-hub-section-heading">
          <div>
            <div className="field-hub-section-heading__eyebrow">Start here</div>
            <h2 id="field-actions-heading">Primary actions</h2>
          </div>
        </div>
        <div className="field-hub-actions__grid">
          {primaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                href={action.href}
                className="field-hub-action"
              >
                <Icon aria-hidden className="h-5 w-5" />
                <span>{action.title}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="field-hub-grid">
        <section
          className="field-hub-today"
          aria-labelledby="field-today-heading"
        >
          <div className="field-hub-section-heading">
            <div>
              <div className="field-hub-section-heading__eyebrow">Today</div>
              <h2 id="field-today-heading">Schedule and active work</h2>
            </div>
            <Link href="/mobile/work-orders" className="field-hub-text-link">
              All work <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          <MobileServiceShell
            embedded
            canManageScheduling={capabilities.canManageScheduling}
          />
        </section>

        <aside
          className="field-hub-operations"
          aria-labelledby="field-operations-heading"
        >
          <div className="field-hub-section-heading">
            <div>
              <div className="field-hub-section-heading__eyebrow">
                Operations
              </div>
              <h2 id="field-operations-heading">Your command cards</h2>
            </div>
            <button
              type="button"
              onClick={() => setControlsOpen(true)}
              disabled={!preferencesLoaded}
              className="field-hub-customize"
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" /> Customize
            </button>
          </div>
          {visibleCards.length > 0 ? (
            <div className="field-hub-module-grid">
              {visibleCards.map(({ card }) => (
                <FieldDashboardCardLink key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="field-hub-empty-cards">
              <EyeOff aria-hidden className="h-5 w-5" />
              <p>Your optional cards are hidden.</p>
              <button type="button" onClick={() => setControlsOpen(true)}>
                Choose cards
              </button>
            </div>
          )}
        </aside>
      </div>

      {controlsOpen ? (
        <div
          className="field-hub-controls__backdrop"
          onClick={() => setControlsOpen(false)}
        >
          <aside
            className="field-hub-controls"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-controls-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="field-hub-controls__header">
              <div>
                <div className="field-hub-section-heading__eyebrow">
                  Dashboard
                </div>
                <h2 id="field-controls-heading">Arrange command cards</h2>
                <p>Choose what appears and set the order for this workspace.</p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setControlsOpen(false)}
                aria-label="Close dashboard controls"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>

            <div className="field-hub-controls__list">
              {orderedEligibleCards.map(({ item, card }, index) => {
                const visible = item.hidden !== true;
                const Icon = card.icon;
                return (
                  <div key={item.id} className="field-hub-control-row">
                    <span className="field-hub-control-row__icon">
                      <Icon aria-hidden className="h-4 w-4" />
                    </span>
                    <span className="field-hub-control-row__label">
                      <strong>{card.title}</strong>
                      <small>{visible ? "Shown" : "Hidden"}</small>
                    </span>
                    <span className="field-hub-control-row__actions">
                      <button
                        type="button"
                        onClick={() =>
                          updateLayout((current) =>
                            moveFieldDashboardCard(
                              current,
                              item.id,
                              -1,
                              eligibleCardIds,
                            ),
                          )
                        }
                        disabled={index === 0}
                        aria-label={`Move ${card.title} up`}
                      >
                        <ArrowUp aria-hidden className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateLayout((current) =>
                            moveFieldDashboardCard(
                              current,
                              item.id,
                              1,
                              eligibleCardIds,
                            ),
                          )
                        }
                        disabled={index === orderedEligibleCards.length - 1}
                        aria-label={`Move ${card.title} down`}
                      >
                        <ArrowDown aria-hidden className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="field-hub-control-row__toggle"
                        data-visible={visible ? "true" : "false"}
                        aria-pressed={visible}
                        onClick={() =>
                          updateLayout((current) =>
                            setFieldDashboardCardVisibility(
                              current,
                              item.id,
                              !visible,
                            ),
                          )
                        }
                      >
                        {visible ? "On" : "Off"}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="field-hub-controls__footer">
              <button type="button" onClick={resetLayout}>
                <RotateCcw aria-hidden className="h-4 w-4" /> Reset cards
              </button>
              <button type="button" onClick={() => setControlsOpen(false)}>
                <Settings2 aria-hidden className="h-4 w-4" /> Done
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
