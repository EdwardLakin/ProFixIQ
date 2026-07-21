#!/usr/bin/env python3
"""Generate the guarded ProFixIQ public-schema baseline migration.

The production database predates the versioned migrations in this repository.
`db/sql/schema.sql` is the schema snapshot immediately before the first
incremental migration (`202607050001`). This script converts that snapshot into
one guarded migration:

- an existing complete ProFixIQ database records the baseline without replaying
  historical DDL;
- a completely empty public schema restores the snapshot and then continues
  through the normal incremental migration chain;
- a partially initialized schema fails closed instead of guessing.

Managed Supabase extension/event-trigger objects are intentionally excluded.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "db/sql/schema.sql"
OUTPUT_PATH = (
    ROOT
    / "supabase/migrations/20260705000000_public_schema_baseline.sql"
)

BASELINE_VERSION = "20260705000000"
CORE_TABLES = (
    "shops",
    "profiles",
    "customers",
    "vehicles",
    "work_orders",
    "work_order_lines",
)

# These objects were introduced by migrations after the baseline snapshot. If
# they appear in db/sql/schema.sql, the snapshot has been advanced and must not
# silently replace this historical baseline.
POST_BASELINE_SENTINELS = (
    "state_province",
    "requested_part_number",
    "shop_assistant_threads",
    "workforce_operation_keys",
)


def split_sql(source: str) -> list[str]:
    """Split top-level SQL statements without breaking quoted function bodies."""

    statements: list[str] = []
    buffer: list[str] = []
    index = 0
    single_quote = False
    double_quote = False
    line_comment = False
    block_comment_depth = 0
    dollar_tag: str | None = None

    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if line_comment:
            buffer.append(char)
            if char == "\n":
                line_comment = False
            index += 1
            continue

        if block_comment_depth:
            buffer.append(char)
            if char == "/" and next_char == "*":
                buffer.append(next_char)
                block_comment_depth += 1
                index += 2
                continue
            if char == "*" and next_char == "/":
                buffer.append(next_char)
                block_comment_depth -= 1
                index += 2
                continue
            index += 1
            continue

        if dollar_tag is not None:
            if source.startswith(dollar_tag, index):
                buffer.append(dollar_tag)
                index += len(dollar_tag)
                dollar_tag = None
            else:
                buffer.append(char)
                index += 1
            continue

        if single_quote:
            buffer.append(char)
            if char == "'":
                if next_char == "'":
                    buffer.append(next_char)
                    index += 2
                    continue
                single_quote = False
            index += 1
            continue

        if double_quote:
            buffer.append(char)
            if char == '"':
                if next_char == '"':
                    buffer.append(next_char)
                    index += 2
                    continue
                double_quote = False
            index += 1
            continue

        if char == "-" and next_char == "-":
            buffer.extend((char, next_char))
            line_comment = True
            index += 2
            continue

        if char == "/" and next_char == "*":
            buffer.extend((char, next_char))
            block_comment_depth = 1
            index += 2
            continue

        if char == "'":
            single_quote = True
            buffer.append(char)
            index += 1
            continue

        if char == '"':
            double_quote = True
            buffer.append(char)
            index += 1
            continue

        if char == "$":
            match = re.match(
                r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$",
                source[index:],
            )
            if match:
                dollar_tag = match.group(0)
                buffer.append(dollar_tag)
                index += len(dollar_tag)
                continue

        if char == ";":
            buffer.append(char)
            statement = "".join(buffer).strip()
            if statement:
                statements.append(statement)
            buffer.clear()
            index += 1
            continue

        buffer.append(char)
        index += 1

    tail = "".join(buffer).strip()
    if tail:
        statements.append(tail)
    return statements


def strip_leading_comments(statement: str) -> str:
    remaining = statement
    while True:
        remaining = remaining.lstrip()
        if remaining.startswith("--"):
            newline = remaining.find("\n")
            if newline < 0:
                return ""
            remaining = remaining[newline + 1 :]
            continue
        if remaining.startswith("/*"):
            end = remaining.find("*/", 2)
            if end < 0:
                return ""
            remaining = remaining[end + 2 :]
            continue
        return remaining


def include_public_statement(statement: str) -> bool:
    leading = strip_leading_comments(statement)
    upper = leading.upper()

    if not leading or '"public"' not in statement:
        return False
    if upper.startswith(
        ("CREATE SCHEMA ", "ALTER SCHEMA ", "COMMENT ON SCHEMA ")
    ):
        return False
    if '"extensions".' in leading[:180]:
        return False
    if upper.startswith(
        (
            "CREATE EVENT TRIGGER ",
            "ALTER EVENT TRIGGER ",
            "DROP EVENT TRIGGER ",
        )
    ):
        return False
    return True


def validate_snapshot(source: str) -> None:
    missing_core = [
        table
        for table in CORE_TABLES
        if f'CREATE TABLE IF NOT EXISTS "public"."{table}"' not in source
    ]
    if missing_core:
        raise RuntimeError(
            "Baseline snapshot is missing core tables: "
            + ", ".join(missing_core)
        )

    advanced = [token for token in POST_BASELINE_SENTINELS if token in source]
    if advanced:
        raise RuntimeError(
            "db/sql/schema.sql is no longer the pre-migration snapshot; "
            "post-baseline objects were found: "
            + ", ".join(advanced)
        )


def render_baseline(source: str) -> str:
    validate_snapshot(source)
    source_sha = hashlib.sha256(source.encode()).hexdigest()
    statements = [
        statement
        for statement in split_sql(source)
        if include_public_statement(statement)
    ]
    if not statements:
        raise RuntimeError("No public schema statements were selected")

    all_core_expression = " and\n      ".join(
        f"to_regclass('public.{table}') is not null"
        for table in CORE_TABLES
    )
    any_core_expression = " or\n      ".join(
        f"to_regclass('public.{table}') is not null"
        for table in CORE_TABLES
    )

    lines = [
        "-- ProFixIQ public-schema baseline for clean Supabase migration replay.",
        "--",
        "-- Existing complete databases record the baseline without replaying DDL.",
        "-- Empty databases restore db/sql/schema.sql, then continue through every",
        "-- incremental migration beginning with 202607050001.",
        "-- Partial schemas fail closed.",
        "--",
        "-- Generated by scripts/generate-supabase-public-baseline.py.",
        f"-- Source SHA-256: {source_sha}",
        f"-- Public statements: {len(statements)}",
        "",
        "set check_function_bodies = false;",
        "set row_security = off;",
        "",
        "create schema if not exists extensions;",
        'create extension if not exists "uuid-ossp" with schema extensions;',
        "create extension if not exists pgcrypto with schema extensions;",
        "",
        "create table if not exists public.profixiq_schema_baselines (",
        "  version text primary key,",
        "  mode text not null check (mode in ('bootstrap', 'existing')),",
        "  source_sha256 text not null,",
        "  applied_at timestamptz not null default now()",
        ");",
        "",
        "do $profixiq_public_baseline$",
        "declare",
        "  v_all_core_tables_present boolean;",
        "  v_any_core_table_present boolean;",
        "begin",
        "  select",
        f"      {all_core_expression}",
        "    into v_all_core_tables_present;",
        "",
        "  select",
        f"      {any_core_expression}",
        "    into v_any_core_table_present;",
        "",
        "  if v_all_core_tables_present then",
        "    insert into public.profixiq_schema_baselines(",
        "      version, mode, source_sha256",
        "    )",
        f"    values ('{BASELINE_VERSION}', 'existing', '{source_sha}')",
        "    on conflict (version) do update",
        "      set mode = excluded.mode,",
        "          source_sha256 = excluded.source_sha256,",
        "          applied_at = now();",
        "    return;",
        "  end if;",
        "",
        "  if v_any_core_table_present then",
        "    raise exception using errcode = 'P0001',",
        "      message = 'PARTIAL_PROFIXIQ_SCHEMA: baseline refused because only some core tables exist.';",
        "  end if;",
        "",
    ]

    for number, statement in enumerate(statements, 1):
        tag = f"$profixiq_stmt_{number:04d}$"
        if tag in statement:
            raise RuntimeError(f"Dollar-tag collision in statement {number}")
        lines.extend(
            (
                f"  execute {tag}",
                statement.rstrip(),
                f"{tag};",
                "",
            )
        )

    lines.extend(
        (
            "  insert into public.profixiq_schema_baselines(",
            "    version, mode, source_sha256",
            "  )",
            f"  values ('{BASELINE_VERSION}', 'bootstrap', '{source_sha}')",
            "  on conflict (version) do update",
            "    set mode = excluded.mode,",
            "        source_sha256 = excluded.source_sha256,",
            "        applied_at = now();",
            "end;",
            "$profixiq_public_baseline$;",
            "",
            "reset all;",
            "",
        )
    )
    return "\n".join(lines)


def main() -> None:
    source = SCHEMA_PATH.read_text()
    rendered = render_baseline(source)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(rendered)
    print(
        f"wrote {OUTPUT_PATH.relative_to(ROOT)} "
        f"({len(rendered.encode())} bytes)"
    )


if __name__ == "__main__":
    main()
