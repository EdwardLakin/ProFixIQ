from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"{label} anchor changed")
    return text.replace(old, new, 1)


# Shop + Equipment share AppShell.
path = Path("features/shared/components/AppShell.tsx")
text = path.read_text()
import_anchor = 'import RoleSidebar from "@/features/shared/components/RoleSidebar";\n'
switcher_import = 'import WorkspaceProductSwitcher from "@/features/shared/components/WorkspaceProductSwitcher";\n'
if switcher_import not in text:
    text = text.replace(import_anchor, import_anchor + switcher_import, 1)
text = replace_once(
    text,
    '''              <nav className="flex gap-3 text-sm text-[color:var(--theme-text-secondary)]">
                <Link
                  href="/dashboard"
                  className="hover:text-[color:var(--theme-text-primary)]"
                >
                  Dashboard
                </Link>
              </nav>''',
    '''              <WorkspaceProductSwitcher
                surface={pathname.startsWith("/equipment") ? "equipment" : "shop"}
              />''',
    "AppShell dashboard navigation",
)
path.write_text(text)

# Field workspace.
path = Path("features/mobile/service/FieldWorkspaceShell.tsx")
text = path.read_text()
import_anchor = 'import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";\n'
switcher_import = 'import WorkspaceProductSwitcher from "@/features/shared/components/WorkspaceProductSwitcher";\n'
if switcher_import not in text:
    text = text.replace(import_anchor, switcher_import + import_anchor, 1)
text = replace_once(
    text,
    '''        <Link
          href="/mobile/service/new"
          aria-label="Create service call"''',
    '''        <WorkspaceProductSwitcher surface="field" className="hidden md:flex" />
        <Link
          href="/mobile/service/new"
          aria-label="Create service call"''',
    "Field header",
)
text = replace_once(
    text,
    '      <main className="field-workspace-main">{children}</main>\n',
    '''      <div className="border-b border-[color:var(--theme-border-soft)] px-3 py-2 md:hidden">
        <WorkspaceProductSwitcher surface="field" />
      </div>

      <main className="field-workspace-main">{children}</main>
''',
    "Field mobile switcher",
)
path.write_text(text)

# Fleet workspace.
path = Path("features/fleet/components/FleetProductShell.tsx")
text = path.read_text()
import_anchor = 'import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";\n'
switcher_import = 'import WorkspaceProductSwitcher from "@/features/shared/components/WorkspaceProductSwitcher";\n'
if switcher_import not in text:
    text = text.replace(import_anchor, import_anchor + switcher_import, 1)
text = replace_once(
    text,
    '            <div className="hidden items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 sm:flex">',
    '''            <WorkspaceProductSwitcher surface="fleet" className="hidden md:flex" />

            <div className="hidden items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 sm:flex">''',
    "Fleet header",
)
text = replace_once(
    text,
    '''        <main
          aria-busy={navigationTarget ? true : undefined}''',
    '''        <div className="border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-header-bg)]/88 px-3 py-2 md:hidden">
          <WorkspaceProductSwitcher surface="fleet" />
        </div>

        <main
          aria-busy={navigationTarget ? true : undefined}''',
    "Fleet mobile switcher",
)
path.write_text(text)
