export const REGRESSION_FIXTURE_VERSION = "profixiq-regression-v1" as const;
export const REGRESSION_FIXTURE_TIMESTAMP = "2026-08-21T18:00:00.000Z" as const;
export const REGRESSION_FIXTURE_PASSWORD = "ProFixIQ-Regression-Only!" as const;

export const REGRESSION_FIXTURE = {
  protectedLiveWorkOrders: ["WO-000014"],
  shops: {
    pro: {
      id: "f1000000-0000-4000-8000-000000000001",
      slug: "regression-pro-shop",
      plan: "pro",
    },
    starter: {
      id: "f1000000-0000-4000-8000-000000000002",
      slug: "regression-starter-shop",
      plan: "starter",
    },
  },
  personas: {
    proOwner: {
      id: "f1100000-0000-4000-8000-000000000001",
      email: "pro-owner@regression.profixiq.invalid",
      role: "owner",
      shop: "pro",
    },
    starterOwner: {
      id: "f1100000-0000-4000-8000-000000000002",
      email: "starter-owner@regression.profixiq.invalid",
      role: "owner",
      shop: "starter",
    },
    manager: {
      id: "f1100000-0000-4000-8000-000000000003",
      email: "manager@regression.profixiq.invalid",
      role: "manager",
      shop: "pro",
    },
    advisor: {
      id: "f1100000-0000-4000-8000-000000000004",
      email: "advisor@regression.profixiq.invalid",
      role: "advisor",
      shop: "pro",
    },
    technician: {
      id: "f1100000-0000-4000-8000-000000000005",
      email: "technician@regression.profixiq.invalid",
      role: "mechanic",
      shop: "pro",
    },
    leadTech: {
      id: "f1100000-0000-4000-8000-000000000006",
      email: "lead-tech@regression.profixiq.invalid",
      role: "lead_hand",
      shop: "pro",
    },
    parts: {
      id: "f1100000-0000-4000-8000-000000000007",
      email: "parts@regression.profixiq.invalid",
      role: "parts",
      shop: "pro",
    },
    customer: {
      id: "f1100000-0000-4000-8000-000000000008",
      email: "customer@regression.profixiq.invalid",
      role: "customer",
      shop: null,
    },
    fleetManager: {
      id: "f1100000-0000-4000-8000-000000000009",
      email: "fleet-manager@regression.profixiq.invalid",
      role: "fleet_manager",
      shop: null,
    },
    dispatcher: {
      id: "f1100000-0000-4000-8000-000000000010",
      email: "dispatcher@regression.profixiq.invalid",
      role: "dispatcher",
      shop: null,
    },
    driver: {
      id: "f1100000-0000-4000-8000-000000000011",
      email: "driver@regression.profixiq.invalid",
      role: "driver",
      shop: null,
    },
    fieldOperator: {
      id: "f1100000-0000-4000-8000-000000000012",
      email: "field-operator@regression.profixiq.invalid",
      role: "mechanic",
      shop: "pro",
      fieldEnabled: true,
    },
    fieldDisabled: {
      id: "f1100000-0000-4000-8000-000000000013",
      email: "field-disabled@regression.profixiq.invalid",
      role: "mechanic",
      shop: "pro",
      fieldEnabled: false,
    },
  },
  customers: {
    portal: "f1200000-0000-4000-8000-000000000001",
    unrelated: "f1200000-0000-4000-8000-000000000002",
    fleet: "f1200000-0000-4000-8000-000000000003",
  },
  vehicles: {
    customer: "f1300000-0000-4000-8000-000000000001",
    unrelated: "f1300000-0000-4000-8000-000000000002",
    fleetAssetOne: "f1300000-0000-4000-8000-000000000003",
    fleetAssetTwo: "f1300000-0000-4000-8000-000000000004",
  },
  fleet: "f1400000-0000-4000-8000-000000000001",
  workOrders: {
    authorized: "f1500000-0000-4000-8000-000000000001",
    unrelated: "f1500000-0000-4000-8000-000000000002",
  },
  workOrderLine: "f1600000-0000-4000-8000-000000000001",
  quotes: {
    authorized: "f1700000-0000-4000-8000-000000000001",
    unrelated: "f1700000-0000-4000-8000-000000000002",
  },
  quotedPart: "f1800000-0000-4000-8000-000000000001",
  fleetRequests: [
    "f1900000-0000-4000-8000-000000000001",
    "f1900000-0000-4000-8000-000000000002",
  ],
  pretrips: [
    "f1a00000-0000-4000-8000-000000000001",
    "f1a00000-0000-4000-8000-000000000002",
  ],
  fleetDefects: [
    "f1b00000-0000-4000-8000-000000000001",
    "f1b00000-0000-4000-8000-000000000002",
  ],
  dispatchAssignments: [
    "f1c00000-0000-4000-8000-000000000001",
    "f1c00000-0000-4000-8000-000000000002",
  ],
  schedulingResources: {
    proCapacity: "f1d00000-0000-4000-8000-000000000001",
    starterCapacity: "f1d00000-0000-4000-8000-000000000002",
    technician: "f1d00000-0000-4000-8000-000000000003",
    leadTech: "f1d00000-0000-4000-8000-000000000004",
    fieldOperator: "f1d00000-0000-4000-8000-000000000005",
    fieldDisabled: "f1d00000-0000-4000-8000-000000000006",
  },
} as const;
