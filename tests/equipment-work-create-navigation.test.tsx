import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  path: "/equipment/work-orders/create/asset",
  query: new URLSearchParams(),
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  rpc: vi.fn(),
  resume: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
  draftReset: vi.fn(),
  cvReset: vi.fn(),
  cvWrite: vi.fn(),
  cv: {
    customer: { first_name: "Wrong Shop Draft" },
    vehicle: { make: "Wrong machine" },
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.path,
  useSearchParams: () => mocks.query,
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
    replace: mocks.replace,
  }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/shared/lib/supabase/session-context", () => ({
  useSession: () => ({ user: { id: "staff" } }),
}));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
vi.mock("app/work-orders/state/useCustomerVehicleDraft", () => ({
  useCustomerVehicleDraft: () => ({
    ...mocks.cv,
    reset: mocks.cvReset,
    setCustomerField: mocks.cvWrite,
    setVehicleField: mocks.cvWrite,
    bulkSet: mocks.cvWrite,
  }),
}));
vi.mock("app/work-orders/state/useWorkOrderDraft", () => ({
  useWorkOrderDraft: () => ({
    customer: { first_name: "Wrong VIN Draft" },
    vehicle: {},
    reset: mocks.draftReset,
    setVehicle: vi.fn(),
  }),
}));
vi.mock("app/vehicle/VinCaptureModal", () => ({ default: () => null }));
vi.mock("@/features/vehicles/components/RegistrationScanModal", () => ({
  default: () => null,
}));
vi.mock(
  "@/features/maintenance/components/CreateFlowMaintenanceSelector",
  () => ({ default: () => null }),
);
vi.mock("@work-orders/components/MenuQuickAdd", () => ({
  MenuQuickAdd: () => null,
}));
vi.mock("@work-orders/components/NewWorkOrderLineForm", () => ({
  NewWorkOrderLineForm: () => null,
}));
vi.mock("@work-orders/components/AiSuggestModal", () => ({
  AiSuggestModal: () => null,
}));
vi.mock(
  "@/features/inspections/components/inspection/CustomerVehicleForm",
  () => ({
    default: ({
      customer,
      vehicle,
    }: {
      customer: { first_name: string };
      vehicle: { make: string };
    }) => (
      <div>
        <span>{customer.first_name}</span>
        <span>{vehicle.make}</span>
      </div>
    ),
  }),
);
vi.mock("@/features/shared/lib/vehicles/duplicateCheck", () => ({
  checkVehicleDuplicates: async () => ({ matches: [] }),
}));
vi.mock("@/features/vehicles/lib/requestRecallEnrichment", () => ({
  requestVehicleRecallEnrichment: vi.fn(),
}));
vi.mock("@/features/customers/lib/customerAccountCommands", () => ({
  createCustomerAccount: vi.fn(),
}));
vi.mock("@/features/work-orders/lib/client/validateMutableWorkOrder", () => ({
  CREATE_RESUME_BLOCKED_PREFIX: "blocked:",
  CREATE_WORK_ORDER_STALE_EVENT: "stale-create",
  STALE_CREATE_WORK_ORDER_MESSAGE: "Stale",
  requireResumableCreateWorkOrder: mocks.resume,
}));
import CreatePage from "@/features/work-orders/app/work-orders/create/page";
const context = { assetId: "asset", customerId: "customer", shopId: "shop" };
let rows: Record<string, Record<string, unknown>>;
beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  mocks.path = "/equipment/work-orders/create/asset";
  mocks.query = new URLSearchParams();
  rows = {
    profiles: { id: "staff", shop_id: "shop", user_id: "staff" },
    customers: {
      id: "customer",
      shop_id: "shop",
      first_name: "QA Customer",
      last_name: null,
      email: null,
      phone: null,
      business_name: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
    },
    vehicles: {
      id: "asset",
      shop_id: "shop",
      customer_id: "customer",
      make: "CAT",
      model: "320",
      year: 2024,
      unit_number: "EX-1",
      vin: null,
    },
    work_orders: {
      id: "new-wo",
      shop_id: "shop",
      customer_id: "customer",
      vehicle_id: "asset",
      custom_id: "WO-1",
      is_waiter: false,
    },
  };
  mocks.rpc.mockResolvedValue({ data: rows.work_orders, error: null });
  mocks.from.mockImplementation((table: string) => {
    let patch: Record<string, unknown> | undefined;
    const result = () => ({ data: { ...rows[table], ...patch }, error: null });
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      is: () => q,
      update: (value: Record<string, unknown>) => {
        patch = value;
        return q;
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    };
    return q;
  });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("canonical creation in the Equipment shell", () => {
  it("loads the linked identity without importing or overwriting Shop drafts; cancel/back stay in Equipment across remounts", async () => {
    for (let n = 0; n < 2; n++) {
      const view = render(<CreatePage equipmentContext={context} />);
      await screen.findAllByText("QA Customer");
      await screen.findByText("CAT");
      expect(screen.queryByText("Wrong Shop Draft")).toBeNull();
      fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
      expect(mocks.push).toHaveBeenLastCalledWith("/equipment/work-orders");
      fireEvent.click(screen.getByRole("button", { name: "Equipment asset" }));
      expect(mocks.push).toHaveBeenLastCalledWith("/equipment/asset");
      view.unmount();
    }
    expect(mocks.cvWrite).not.toHaveBeenCalled();
    expect(mocks.cvReset).not.toHaveBeenCalled();
    expect(mocks.draftReset).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "preserves canonical creation and approval state with Equipment=%s",
    async (equipment) => {
      if (!equipment) {
        mocks.path = "/work-orders/create";
        mocks.query = new URLSearchParams({
          customerId: "customer",
          vehicleId: "asset",
        });
      }
      render(<CreatePage equipmentContext={equipment ? context : undefined} />);
      await screen.findAllByText("QA Customer");
      await screen.findByText("CAT");
      fireEvent.click(
        screen.getAllByRole("button", { name: "Create work order" })[0],
      );
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(
          equipment
            ? "/equipment/work-orders/new-wo"
            : "/work-orders/new-wo/approve",
        ),
      );
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.rpc).toHaveBeenCalledWith(
        "create_work_order_with_custom_id",
        expect.objectContaining({
          p_customer_id: "customer",
          p_vehicle_id: "asset",
          p_shop_id: "shop",
        }),
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(rows.work_orders).not.toHaveProperty("approval_state");
    },
  );
  it("ignores a forged query handoff and blocks a persisted draft from another asset or tenant", async () => {
    mocks.query = new URLSearchParams({
      customerId: "foreign-customer",
      vehicleId: "foreign-asset",
      resumeWorkOrderId: "foreign-work",
      returnTo: "//outside.test",
    });
    localStorage.setItem(
      "tabs:u_staff:_equipment_work_orders_create_asset:__create_wo",
      JSON.stringify({ id: "old-work" }),
    );
    mocks.resume.mockResolvedValue({
      workOrder: {
        id: "old-work",
        shop_id: "foreign-shop",
        vehicle_id: "foreign-asset",
        customer_id: "foreign-customer",
      },
      lines: [],
    });
    render(<CreatePage equipmentContext={context} />);
    await screen.findByText(/saved draft no longer matches/);
    expect(
      screen.getAllByRole("button", { name: "Create work order" })[0],
    ).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resume).toHaveBeenCalledWith(
      expect.objectContaining({ workOrderId: "old-work", shopId: "shop" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Equipment asset" }));
    expect(mocks.push).toHaveBeenLastCalledWith("/equipment/asset");
  });
  it("isolates route drafts when moving to a second asset", async () => {
    const first = render(<CreatePage equipmentContext={context} />);
    await screen.findAllByText("QA Customer");
    first.unmount();
    mocks.path = "/equipment/work-orders/create/second-asset";
    rows.vehicles = {
      ...rows.vehicles,
      id: "second-asset",
      make: "Komatsu",
      customer_id: "second-customer",
    };
    rows.customers = {
      ...rows.customers,
      id: "second-customer",
      first_name: "Second Customer",
    };
    render(
      <CreatePage
        equipmentContext={{
          ...context,
          assetId: "second-asset",
          customerId: "second-customer",
        }}
      />,
    );
    await screen.findAllByText("Second Customer");
    await screen.findByText("Komatsu");
    expect(screen.queryAllByText("QA Customer")).toHaveLength(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
