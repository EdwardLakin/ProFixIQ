#!/usr/bin/env python3
"""Fail fast on SQL syntax errors before any database is started.

Parses files with libpg_query (the PostgreSQL parser, via pglast) and reports
every file that does not parse. psql meta-commands (lines starting with a
backslash, e.g. \\set / \\ir) are blanked first; they are not SQL.

Usage: check-sql-syntax.py FILE [FILE ...]
This is a syntax gate only. It never replaces replaying the migrations.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pglast

META_COMMAND = re.compile(r"(?m)^\\.*$")


def main(paths: list[str]) -> int:
    failures: list[str] = []
    for raw in paths:
        path = Path(raw)
        if not path.is_file():
            continue
        sql = META_COMMAND.sub("", path.read_text(encoding="utf-8"))
        try:
            pglast.parse_sql(sql)
        except pglast.parser.ParseError as exc:  # type: ignore[attr-defined]
            failures.append(f"{path}: {exc}")
    checked = len(paths)
    if failures:
        print(f"SQL syntax errors in {len(failures)} of {checked} file(s):")
        for failure in failures:
            print(f"  {failure}")
        return 1
    print(f"SQL syntax OK for {checked} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
