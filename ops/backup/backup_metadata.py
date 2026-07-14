#!/usr/bin/env python3
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path


MANAGED_NAME = re.compile(r"^dashboard-(\d{8}T\d{6}Z)\.dump$")


def utc_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def parse_managed_name(name: str):
    match = MANAGED_NAME.fullmatch(name)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def build_state(path: Path, completed_at: datetime, size_bytes: int, sha256: str, classes: list[str]) -> dict:
    if parse_managed_name(path.name) is None:
        raise ValueError("backup filename is not managed")
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise ValueError("sha256 must contain 64 lowercase hexadecimal characters")
    return {
        "schemaVersion": 1,
        "completedAt": utc_text(completed_at),
        "filename": path.name,
        "sizeBytes": int(size_bytes),
        "sha256": sha256,
        "classes": sorted(set(classes)),
    }


def validate_state(state: dict, root: Path, now: datetime, max_age_hours: int, minimum_bytes: int) -> list[str]:
    errors = []
    try:
        completed = parse_utc(state["completedAt"])
        filename = state["filename"]
        recorded_size = int(state["sizeBytes"])
    except (KeyError, TypeError, ValueError):
        return ["backup state is malformed"]
    if parse_managed_name(filename) is None or Path(filename).name != filename:
        return ["backup filename is not managed"]
    age_hours = (now.astimezone(timezone.utc) - completed).total_seconds() / 3600
    if age_hours > max_age_hours:
        errors.append(f"backup is older than {max_age_hours} hours")
    path = root / filename
    if not path.is_file():
        errors.append("backup file does not exist")
        return errors
    actual_size = path.stat().st_size
    if actual_size != recorded_size:
        errors.append("backup size does not match state")
    if actual_size < minimum_bytes:
        errors.append(f"backup is smaller than {minimum_bytes} bytes")
    return errors


def retention_plan(names: list[str], daily_count: int = 7, weekly_count: int = 4, monthly_count: int = 3) -> dict:
    managed = []
    unmanaged = []
    for name in names:
        timestamp = parse_managed_name(name)
        if timestamp is None:
            unmanaged.append(name)
        else:
            managed.append((timestamp, name))
    managed.sort()

    daily = [name for _, name in managed[-daily_count:]]

    by_week = {}
    for timestamp, name in managed:
        by_week[timestamp.isocalendar()[:2]] = (timestamp, name)
    weekly = [name for _, name in sorted(by_week.values())[-weekly_count:]]

    by_month = {}
    for timestamp, name in managed:
        by_month.setdefault((timestamp.year, timestamp.month), (timestamp, name))
    monthly = [name for _, name in sorted(by_month.values())[-monthly_count:]]

    if managed and managed[-1][1] not in daily:
        daily.append(managed[-1][1])
    return {"daily": daily, "weekly": weekly, "monthly": monthly, "unmanaged": sorted(unmanaged)}


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    state_parser = subparsers.add_parser("state")
    state_parser.add_argument("--file", required=True, type=Path)
    state_parser.add_argument("--completed-at", required=True)
    state_parser.add_argument("--size", required=True, type=int)
    state_parser.add_argument("--sha256", required=True)
    state_parser.add_argument("--class", dest="classes", action="append", default=[])

    validate_parser = subparsers.add_parser("validate-state")
    validate_parser.add_argument("--state", required=True, type=Path)
    validate_parser.add_argument("--root", required=True, type=Path)
    validate_parser.add_argument("--max-age-hours", type=int, default=36)
    validate_parser.add_argument("--minimum-bytes", type=int, default=1)

    retention_parser = subparsers.add_parser("retention-plan")
    retention_parser.add_argument("names", nargs="+")

    args = parser.parse_args()
    if args.command == "state":
        result = build_state(args.file, parse_utc(args.completed_at), args.size, args.sha256, args.classes)
    elif args.command == "validate-state":
        state = json.loads(args.state.read_text())
        errors = validate_state(state, args.root, datetime.now(timezone.utc), args.max_age_hours, args.minimum_bytes)
        result = {"ok": not errors, "errors": errors}
        print(json.dumps(result, sort_keys=True))
        return 0 if not errors else 1
    else:
        result = retention_plan(args.names)
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
