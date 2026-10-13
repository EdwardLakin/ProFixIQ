from pathlib import Path

# Host-aware destinations for Fleet-host exits.
path = Path('features/shared/lib/workspaceProducts.ts')
text = path.read_text()
if 'const PRIMARY_SITE_ORIGIN' not in text:
    text = text.replace(
        'export const WORKSPACE_PRODUCTS: readonly WorkspaceProductDefinition[] = [',
        'const PRIMARY_SITE_ORIGIN =\n  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\\/$/, "") ||\n  "https://profixiq.com";\n\nexport const WORKSPACE_PRODUCTS: readonly WorkspaceProductDefinition[] = ['
    )
old = '''export function workspaceProductHref(
  product: WorkspaceProductDefinition,
  entitled: boolean,
): string {
  return entitled ? product.workspaceHref : product.marketingHref;
}
'''
new = '''export function workspaceProductHref(
  product: WorkspaceProductDefinition,
  entitled: boolean,
  currentSurface?: WorkspaceSurface,
): string {
  const href = entitled ? product.workspaceHref : product.marketingHref;
  if (currentSurface === "fleet" && product.surface !== "fleet") {
    return `${PRIMARY_SITE_ORIGIN}${href}`;
  }
  return href;
}
'''
if old in text:
    text = text.replace(old, new)
path.write_text(text)

# Share the entitlement request across responsive switcher instances.
path = Path('features/shared/components/WorkspaceProductSwitcher.tsx')
text = path.read_text()
marker = 'import { cn } from "@/features/shared/utils/cn";\n\n'
cache = '''import { cn } from "@/features/shared/utils/cn";

let entitlementRequest: Promise<WorkspaceEntitlementsPayload | null> | null = null;

function loadWorkspaceEntitlements(): Promise<WorkspaceEntitlementsPayload | null> {
  if (!entitlementRequest) {
    entitlementRequest = fetch("/api/workspaces/entitlements", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as WorkspaceEntitlementsPayload;
      })
      .catch(() => null);
  }
  return entitlementRequest;
}

'''
if 'let entitlementRequest:' not in text:
    text = text.replace(marker, cache)
start = text.index('  useEffect(() => {')
end = text.index('  }, []);', start) + len('  }, []);')
replacement = '''  useEffect(() => {
    let active = true;
    void loadWorkspaceEntitlements().then((payload) => {
      if (active && payload) setEntitlements(payload);
    });
    return () => {
      active = false;
    };
  }, []);'''
text = text[:start] + replacement + text[end:]
old_href = '''        const href = active
          ? product.workspaceHref
          : verified
            ? workspaceProductHref(product, entitled)
            : product.marketingHref;'''
new_href = '''        const href = active
          ? workspaceProductHref(product, true, surface)
          : workspaceProductHref(product, verified ? entitled : false, surface);'''
text = text.replace(old_href, new_href)
path.write_text(text)

# Field desktop switcher belongs in persistent sidebar.
path = Path('features/mobile/service/FieldWorkspaceShell.tsx')
text = path.read_text()
text = text.replace('        <WorkspaceProductSwitcher surface="field" className="hidden md:flex" />\n', '')
brand_anchor = '''        </Link>

        <Link href="/mobile/service/new" className="field-workspace-new-call">'''
sidebar_switcher = '''        </Link>

        <div className="px-3 pb-2">
          <WorkspaceProductSwitcher surface="field" />
        </div>

        <Link href="/mobile/service/new" className="field-workspace-new-call">'''
if sidebar_switcher not in text:
    if brand_anchor not in text:
        raise SystemExit('Field sidebar brand anchor changed')
    text = text.replace(brand_anchor, sidebar_switcher, 1)
path.write_text(text)

# Shop/Equipment compact mobile placement.
path = Path('features/shared/components/AppShell.tsx')
text = path.read_text()
main_anchor = '''          <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-14 pt-16 md:px-4 md:pb-6 md:pt-16 lg:px-6 lg:pt-[4.25rem] xl:px-8 2xl:px-10">
            <TabsBridge tabsSubdued={chatOpen}>'''
mobile = '''          <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-14 pt-16 md:px-4 md:pb-6 md:pt-16 lg:px-6 lg:pt-[4.25rem] xl:px-8 2xl:px-10">
            <div className="mb-2 md:hidden">
              <WorkspaceProductSwitcher
                surface={pathname.startsWith("/equipment") ? "equipment" : "shop"}
              />
            </div>
            <TabsBridge tabsSubdued={chatOpen}>'''
if 'className="mb-2 md:hidden"' not in text:
    if main_anchor not in text:
        raise SystemExit('AppShell main anchor changed')
    text = text.replace(main_anchor, mobile, 1)
path.write_text(text)

# Acquisition pages must be public.
path = Path('middleware.ts')
text = path.read_text()
public_anchor = '''    pathname === "/mobile-truck-repair-software" ||
    pathname === "/service-truck-work-order-software" ||'''
public_routes = '''    pathname === "/mobile-truck-repair-software" ||
    pathname === "/repair-shop-management-software" ||
    pathname === "/field-service" ||
    pathname === "/fleet-maintenance" ||
    pathname === "/equipment-maintenance-software" ||
    pathname === "/service-truck-work-order-software" ||'''
if 'pathname === "/repair-shop-management-software"' not in text:
    if public_anchor not in text:
        raise SystemExit('Middleware public route anchor changed')
    text = text.replace(public_anchor, public_routes, 1)
path.write_text(text)

# Regression coverage.
path = Path('tests/workspace-product-switcher.test.ts')
text = path.read_text()
if 'workspace switcher review regressions' not in text:
    text += '''

describe("workspace switcher review regressions", () => {
  it("keeps acquisition destinations public", () => {
    const middleware = source("middleware.ts");
    for (const route of [
      "/repair-shop-management-software",
      "/field-service",
      "/fleet-maintenance",
      "/equipment-maintenance-software",
    ]) {
      expect(middleware).toContain(`pathname === "${route}"`);
    }
  });

  it("fleet host exits use the primary site origin", () => {
    const products = source("features/shared/lib/workspaceProducts.ts");
    expect(products).toContain("NEXT_PUBLIC_SITE_URL");
    expect(products).toContain('currentSurface === "fleet"');
    expect(products).toContain('product.surface !== "fleet"');
  });

  it("shares entitlement loading across responsive switchers", () => {
    const switcher = source("features/shared/components/WorkspaceProductSwitcher.tsx");
    expect(switcher).toContain("let entitlementRequest");
    expect(switcher).toContain("loadWorkspaceEntitlements");
  });

  it("renders Field desktop switching from the persistent sidebar", () => {
    const field = source("features/mobile/service/FieldWorkspaceShell.tsx");
    const brand = field.indexOf('className="field-workspace-brand"');
    const switcher = field.indexOf('<WorkspaceProductSwitcher surface="field" />', brand);
    const header = field.indexOf('<header className="field-workspace-header">');
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(switcher).toBeGreaterThan(brand);
    expect(switcher).toBeLessThan(header);
  });

  it("renders Shop and Equipment switching on mobile", () => {
    const shell = source("features/shared/components/AppShell.tsx");
    expect(shell).toContain('className="mb-2 md:hidden"');
  });
});
'''
path.write_text(text)
