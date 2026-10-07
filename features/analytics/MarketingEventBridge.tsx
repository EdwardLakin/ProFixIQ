"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  trackMarketingEvent,
  type MarketingEventName,
} from "@/features/analytics/marketingEvents";

function eventForHref(href: string, text: string): MarketingEventName | null {
  const normalized = href.split("?")[0]?.split("#")[0] ?? href;
  const label = text.trim().toLowerCase();

  if (normalized === "/request-demo") return "marketing_demo_click";
  if (normalized === "/compare-plans") {
    return label.includes("subscribe")
      ? "marketing_subscribe_click"
      : "marketing_trial_click";
  }
  if (normalized === "/subscribe") return "marketing_subscribe_click";

  return null;
}

export default function MarketingEventBridge() {
  const pathname = usePathname();
  const lastPricingPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname !== "/compare-plans") {
      lastPricingPath.current = null;
      return;
    }
    if (lastPricingPath.current === pathname) return;

    lastPricingPath.current = pathname;
    trackMarketingEvent("pricing_view", { source: pathname });
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/")) return;

      const marketingEvent = eventForHref(href, anchor.textContent ?? "");
      if (!marketingEvent) return;

      trackMarketingEvent(marketingEvent, {
        source: window.location.pathname,
        destination: href,
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
