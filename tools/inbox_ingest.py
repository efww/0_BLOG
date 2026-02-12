#!/usr/bin/env python3
"""
Ingest Markdown files from docs/inbox into docs/posts/YYYY/MM with stable ASCII filenames.

Goal:
- You drop a .md file into docs/inbox
- This script:
  - extracts (date, title)
  - strips private-use citation markers like "..."
  - writes a Quartz-friendly markdown file into docs/posts/YYYY/MM/
  - archives the original into docs/inbox/_processed/YYYY/MM/
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INBOX_DIR = ROOT / "docs" / "inbox"
PROCESSED_DIR = INBOX_DIR / "_processed"
POSTS_DIR = ROOT / "docs" / "posts"


_PUA_BLOCK_RE = re.compile(r".*?", flags=re.DOTALL)
_FRONT_MATTER_RE = re.compile(r"\A---\s*\n.*?\n---\s*\n", flags=re.DOTALL)
_DATE_LINE_RE = re.compile(r"(?m)^\s*date\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*$")
_TITLE_LINE_RE = re.compile(r'(?m)^\s*title\s*:\s*("?)(.*?)\\1\s*$')
_H1_RE = re.compile(r"(?m)^\s*#\s+(.+?)\s*$")
_FILENAME_DATE1 = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")
_FILENAME_DATE2 = re.compile(r"([0-9]{4})([0-9]{2})([0-9]{2})")


def _today() -> dt.date:
    return dt.date.today()


def _strip_pua_blocks(text: str) -> str:
    # Removes markers like:
    #   cite..., entity..., image_group...
    out = _PUA_BLOCK_RE.sub("", text)
    # Collapse excessive blank lines created by removals.
    out = re.sub(r"\n{4,}", "\n\n\n", out)
    return out.strip() + "\n"


def _parse_front_matter(text: str) -> tuple[str | None, str | None]:
    m = _FRONT_MATTER_RE.match(text)
    if not m:
        return None, None
    fm = m.group(0)
    date_m = _DATE_LINE_RE.search(fm)
    title_m = _TITLE_LINE_RE.search(fm)
    date = date_m.group(1) if date_m else None
    title = title_m.group(2) if title_m else None
    return date, title


def _guess_date_from_filename(name: str) -> dt.date | None:
    m = _FILENAME_DATE1.search(name)
    if m:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = _FILENAME_DATE2.search(name)
    if m:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def _guess_title(text: str, fallback: str) -> str:
    # Prefer front matter title if present.
    _, fm_title = _parse_front_matter(text)
    if fm_title:
        return fm_title.strip()
    # Otherwise first H1.
    h1 = _H1_RE.search(text)
    if h1:
        return h1.group(1).strip()
    return fallback


def _guess_date(text: str, filename: str) -> dt.date:
    fm_date, _ = _parse_front_matter(text)
    if fm_date:
        try:
            return dt.date.fromisoformat(fm_date)
        except ValueError:
            pass
    fn_date = _guess_date_from_filename(filename)
    if fn_date:
        return fn_date
    return _today()


def _next_seq_for_date(target_dir: Path, d: dt.date) -> int:
    prefix = d.isoformat() + "_"
    max_n = 0
    if target_dir.exists():
        for p in target_dir.glob(f"{prefix}post-*.md"):
            # YYYY-MM-DD_post-0001.md
            m = re.search(r"_post-([0-9]{4})\.md$", p.name)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def _ensure_front_matter(text: str, title: str, d: dt.date) -> str:
    if _FRONT_MATTER_RE.match(text):
        # Keep existing front matter but ensure it has title/date. If missing, prepend a new block.
        fm_date, fm_title = _parse_front_matter(text)
        if fm_date and fm_title:
            return text

    body = text
    # If there is front matter, remove it; we will rewrite a minimal one.
    body = _FRONT_MATTER_RE.sub("", body, count=1)
    body = body.lstrip()
    safe_title = title.replace('"', '\\"')
    fm = (
        "---\n"
        f'title: "{safe_title}"\n'
        f"date: {d.isoformat()}\n"
        "---\n\n"
    )
    return fm + body


def ingest_one(path: Path, archive: bool, dry_run: bool) -> Path | None:
    if path.suffix.lower() != ".md":
        return None

    raw = path.read_text(encoding="utf-8", errors="replace")
    cleaned = _strip_pua_blocks(raw)
    d = _guess_date(cleaned, path.name)
    title = _guess_title(cleaned, fallback=path.stem)
    cleaned = _ensure_front_matter(cleaned, title=title, d=d)

    target_dir = POSTS_DIR / f"{d.year:04d}" / f"{d.month:02d}"
    seq = _next_seq_for_date(target_dir, d)
    out_name = f"{d.isoformat()}_post-{seq:04d}.md"
    out_path = target_dir / out_name

    if dry_run:
        return out_path

    target_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(cleaned, encoding="utf-8")

    if archive:
        archive_dir = PROCESSED_DIR / f"{d.year:04d}" / f"{d.month:02d}"
        archive_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(path), str(archive_dir / path.name))
    else:
        path.unlink(missing_ok=True)

    return out_path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--inbox", default=str(INBOX_DIR))
    p.add_argument("--archive", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--dry-run", action=argparse.BooleanOptionalAction, default=False)
    args = p.parse_args()

    inbox = Path(args.inbox).expanduser().resolve()
    inbox.mkdir(parents=True, exist_ok=True)
    (inbox / "_processed").mkdir(parents=True, exist_ok=True)

    items = sorted([x for x in inbox.iterdir() if x.is_file() and x.suffix.lower() == ".md"])
    if not items:
        return 0

    for f in items:
        out = ingest_one(f, archive=args.archive, dry_run=args.dry_run)
        if out:
            print(f"INGESTED {f.name} -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
