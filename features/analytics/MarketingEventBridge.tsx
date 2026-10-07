"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  isAcquisitionMarketingPath,
  trackMarketingEvent,
  type MarketingEventName,
} from "@/features/analytics/marketingEvents";

function eventForPath(pathname: string): MarketingEventName | null {
  if (pathname === "/request-demo") return "marketing_demo_click";
  if (pathname === "/compare-plans") return "marketing_trial_click";
  if (pathname === "/subscribe") return "marketing_subscribe_click";
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
      if (!isAcquisitionMarketingPath(window.location.pathname)) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/")) return;

      let destinationPath: string;
      try {
        destinationPath = new URL(href, window.location.origin).pathname;
      } catch {
        return;
      }

      const marketingEvent = eventForPath(destinationPath);
      if (!marketingEvent) return;

      trackMarketingEvent(marketingEvent, {
        source: window.location.pathname,
        destination: destinationPath,
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
