from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

WITA = ZoneInfo("Asia/Makassar")


def wita_local_to_utc(local: str) -> str:
    parsed = datetime.strptime(local, "%Y-%m-%dT%H:%M").replace(tzinfo=WITA)
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def wita_date(instant: str) -> date:
    parsed = datetime.fromisoformat(instant.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("instant must include a UTC offset")
    return parsed.astimezone(WITA).date()
