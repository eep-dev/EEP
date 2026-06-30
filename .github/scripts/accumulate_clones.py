#!/usr/bin/env python3
# Copyright 2026 EEP Contributors — Apache-2.0
"""Accumulate GitHub clone counts into a running total.

GitHub's traffic API (`GET /repos/{owner}/{repo}/traffic/clones`) only retains
the last 14 days, so a daily job must merge each fresh window into a persisted
total. This script reads:

  - ``clone.json``        — the current 14-day API response (today's window)
  - ``clone_before.json`` — the running total persisted in a Gist

and writes the merged running total back to ``clone.json`` (which the workflow
then PATCHes into the Gist; the README badge reads ``count`` from it).

Vendored from MShawon/github-clone-count-badge (MIT) rather than curl-piped
into ``python3`` at runtime, so no unpinned remote code executes in CI — in
keeping with this repo's supply-chain posture. Behaviour is unchanged except
for tolerating a missing ``clones`` array on the very first run.

Note: the total only accumulates from the day this job starts running; clones
from before setup are not exposed by GitHub and cannot be recovered.
"""

import json


def _load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    now = _load("clone.json")
    before = _load("clone_before.json")

    before_clones = before.get("clones", []) or []
    now_clones = now.get("clones", []) or []

    # Index the persisted per-day entries by timestamp so a fresh window
    # overwrites overlapping days (same 14-day rows) and appends new ones.
    timestamps = {entry["timestamp"]: i for i, entry in enumerate(before_clones)}

    latest = dict(before)
    latest["clones"] = before_clones
    for entry in now_clones:
        ts = entry["timestamp"]
        if ts in timestamps:
            latest["clones"][timestamps[ts]] = entry
        else:
            latest["clones"].append(entry)

    latest["count"] = sum(int(c["count"]) for c in latest["clones"])
    latest["uniques"] = sum(int(c["uniques"]) for c in latest["clones"])

    # Compaction: once history grows past 100 daily rows, fold the oldest
    # (keeping the most recent 35 days at daily granularity) into monthly
    # buckets so the Gist payload stays small.
    if len(latest["clones"]) > 100:
        clones = latest["clones"]
        remove_this = []
        for i in range(len(clones) - 35):
            clones[i]["timestamp"] = clones[i]["timestamp"][:7]
            if clones[i]["timestamp"] == clones[i + 1]["timestamp"][:7]:
                clones[i + 1]["count"] += clones[i]["count"]
                clones[i + 1]["uniques"] += clones[i]["uniques"]
                remove_this.append(clones[i])
        for item in remove_this:
            clones.remove(item)

    with open("clone.json", "w", encoding="utf-8") as fh:
        json.dump(latest, fh, ensure_ascii=False, indent=4)


if __name__ == "__main__":
    main()
