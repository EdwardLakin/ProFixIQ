import type { ShopAssistantContext } from "@/features/shop-assistant/types";

const RESERVED_WORK_ORDER_SEGMENTS = new Set([
  "board",
  "confirm",
  "create",
  "editor",
  "fleet-requests",
  "history",
  "invoice",
  "queue",
  "quote-review",
  "view",
]);

function contextParam(
  params: URLSearchParams,
  key: string,
): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export function deriveAssistantContext(
  pathname: string,
  searchParams = new URLSearchParams(),
): ShopAssistantContext {
  const context: ShopAssistantContext = {
    workOrderId: contextParam(searchParams, "workOrderId"),
    customerId: contextParam(searchParams, "customerId"),
    vehicleId: contextParam(searchParams, "vehicleId"),
    bookingId: contextParam(searchParams, "bookingId"),
    invoiceId: contextParam(searchParams, "invoiceId"),
  };
  const directWorkOrderMatch = pathname.match(/^\/work-orders\/([^/]+)$/i);
  const directWorkOrderId = directWorkOrderMatch?.[1];
  const workOrderMatch =
    pathname.match(/^\/work-orders\/view\/([^/]+)$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/quote-review$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/approve$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/intake$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/invoice$/i) ??
    pathname.match(/^\/work-orders\/([^/]+)\/focused-job\/[^/]+$/i) ??
    pathname.match(/^\/work-orders\/invoice\/([^/]+)$/i) ??
    pathname.match(/^\/mobile\/work-orders\/([^/]+)$/i) ??
    (directWorkOrderId &&
    !RESERVED_WORK_ORDER_SEGMENTS.has(directWorkOrderId.toLowerCase())
      ? directWorkOrderMatch
      : null);

  if (workOrderMatch?.[1]) {
    context.workOrderId = decodeURIComponent(workOrderMatch[1]);
    const invoicePage = /\/invoice(?:\/|$)/i.test(pathname);
    context.pageType = invoicePage ? "invoice" : "work_order";
    context.pageTitle = invoicePage ? "Invoice" : "Work Order";
    return context;
  }

  const customerMatch =
    pathname.match(/^\/customers\/([^/]+)$/i) ??
    pathname.match(/^\/mobile\/customers\/([^/]+)$/i);
  if (customerMatch?.[1]) {
    context.customerId = decodeURIComponent(customerMatch[1]);
    context.pageType = "customer";
    context.pageTitle = "Customer";
    return context;
  }

  const bookingMatch =
    pathname.match(/^\/portal\/bookings\/([^/]+)$/i) ??
    pathname.match(/^\/dashboard\/appointments\/([^/]+)$/i);
  if (bookingMatch?.[1]) {
    context.bookingId = decodeURIComponent(bookingMatch[1]);
    context.pageType = "booking";
    context.pageTitle = "Booking";
    return context;
  }

  const vehicleMatch =
    pathname.match(/^\/fleet\/assets\/([^/]+)$/i) ??
    pathname.match(/^\/fleet\/units\/([^/]+)$/i) ??
    pathname.match(/^\/portal\/fleet\/units\/([^/]+)$/i);
  if (vehicleMatch?.[1]) {
    context.vehicleId = decodeURIComponent(vehicleMatch[1]);
    context.pageType = "vehicle";
    context.pageTitle = "Vehicle";
    return context;
  }

  if (pathname.startsWith("/parts/inventory")) {
    context.pageType = "inventory";
    context.pageTitle = "Parts Inventory";
    return context;
  }
  if (pathname.startsWith("/parts/requests")) {
    context.pageType = "parts_requests";
    context.pageTitle = "Parts Requests";
    return context;
  }
  if (pathname.startsWith("/parts/po")) {
    context.pageType = "purchasing";
    context.pageTitle = "Purchase Orders";
    return context;
  }
  if (pathname.startsWith("/parts")) {
    context.pageType = "inventory";
    context.pageTitle = "Parts";
    return context;
  }
  if (pathname.startsWith("/billing")) {
    context.pageType = "billing";
    context.pageTitle = "Billing";
    return context;
  }
  if (pathname.startsWith("/dashboard/appointments")) {
    context.pageType = "scheduling";
    context.pageTitle = "Scheduling";
    return context;
  }
  if (pathname.startsWith("/dashboard")) {
    context.pageType = "dashboard";
    context.pageTitle = "Dashboard";
    return context;
  }
  if (pathname.startsWith("/workforce")) {
    context.pageType = "workforce";
    context.pageTitle = "Workforce";
    return context;
  }
  if (pathname.startsWith("/inspection")) {
    context.pageType = "inspections";
    context.pageTitle = "Inspections";
    return context;
  }
  if (pathname.startsWith("/fleet")) {
    context.pageType = "fleet";
    context.pageTitle = "Fleet";
    return context;
  }
  if (pathname.startsWith("/customers")) {
    context.pageType = "customers";
    context.pageTitle = "Customers";
    return context;
  }
  if (pathname.startsWith("/work-orders")) {
    context.pageType = "work_orders";
    context.pageTitle = "Work Orders";
    return context;
  }
  if (pathname.startsWith("/property")) {
    context.pageType = "property";
    context.pageTitle = "Property";
    return context;
  }
  if (pathname.startsWith("/marketing")) {
    context.pageType = "marketing";
    context.pageTitle = "Marketing";
    return context;
  }
  if (pathname.startsWith("/reviews")) {
    context.pageType = "reviews";
    context.pageTitle = "Reviews";
    return context;
  }
  if (pathname.startsWith("/settings")) {
    context.pageType = "settings";
    context.pageTitle = "Settings";
    return context;
  }
  if (pathname.startsWith("/mobile")) {
    context.pageType = "mobile";
    context.pageTitle = "Mobile";
  }

  return context;
}
