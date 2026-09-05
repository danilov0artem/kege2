#!/usr/bin/env python3
"""Собирает задачи каждой страницы в один JSON-файл.

Было: страница делала до 34 отдельных запросов к api.kege2.ru.
Стало: один запрос за сборкой на всю страницу.

Имя сборки содержит хеш содержимого, поэтому её можно кешировать навсегда:
при изменении задачи меняется хеш, а значит и URL.

    python3 tools/build-bundles.py            # собрать и прописать ссылки в страницы
    python3 tools/build-bundles.py --check    # только проверить, ничего не менять
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TASKS = ROOT / "tasks"
OUT = ROOT / "_bundles"
API = "https://api.kege2.ru"

TASK_RE = re.compile(r'source:\s*"kompege"\s*,\s*id:\s*(\d+)')
BUNDLE_LINE_RE = re.compile(r'^\s*bundleUrl:\s*"[^"]*",\s*\n', re.M)
CONFIG_RE = re.compile(r'(window\.TASK_PAGE_CONFIG\s*=\s*\{\n)')


def fetch(url: str) -> bytes:
    """curl вместо urllib: на macOS у сборок с python.org нет CA-бандла."""
    res = subprocess.run(["curl", "-sS", "--fail", "--max-time", "30", url],
                         capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"{url}: {res.stderr.decode().strip()}")
    return res.stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="не изменять файлы")
    args = ap.parse_args()

    pages = sorted(TASKS.glob("*/task*.html"))
    if not pages:
        print("страницы не найдены", file=sys.stderr)
        return 1

    OUT.mkdir(exist_ok=True)
    cache: dict[int, dict] = {}
    total_ids = 0
    failures: list[str] = []

    for page in pages:
        src = page.read_text(encoding="utf-8")
        ids = [int(m) for m in TASK_RE.findall(src)]
        if not ids:
            continue
        unique = sorted(set(ids))
        total_ids += len(unique)

        bundle: dict[str, dict] = {}
        for task_id in unique:
            if task_id not in cache:
                try:
                    cache[task_id] = json.loads(fetch(f"{API}/api/task/{task_id}"))
                except Exception as exc:
                    failures.append(f"{page.name}: задача {task_id} — {exc}")
                    continue
            bundle[str(task_id)] = cache[task_id]

        blob = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode()
        digest = hashlib.sha256(blob).hexdigest()[:8]
        name = f"{page.stem}.{digest}.json"

        # Удаляем прежние сборки этой страницы — их URL больше не используется
        for old in OUT.glob(f"{page.stem}.*.json"):
            if old.name != name:
                old.unlink()
        (OUT / name).write_bytes(blob)

        url = f"{API}/api/bundle/{name}"
        already = f'bundleUrl: "{url}",' in src
        print(f"{page.stem:14s} задач={len(bundle):3d}  {len(blob)/1024:7.1f} КБ  {name}"
              + ("  (без изменений)" if already else ""))

        if not args.check and not already:
            patched = BUNDLE_LINE_RE.sub("", src)
            patched, n = CONFIG_RE.subn(rf'\1      bundleUrl: "{url}",\n', patched, count=1)
            if n != 1:
                failures.append(f"{page.name}: не найден window.TASK_PAGE_CONFIG")
                continue
            page.write_text(patched, encoding="utf-8")

    print(f"\nСтраниц: {len(pages)}, уникальных задач: {len(cache)}, ссылок всего: {total_ids}")
    print(f"Сборки: {OUT}")
    if failures:
        print("\nОШИБКИ:", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
