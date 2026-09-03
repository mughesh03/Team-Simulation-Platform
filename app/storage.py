"""Append-only JSONL persistence for batch runs and human sessions."""

import asyncio
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SESSIONS_DIR = DATA_DIR / "sessions"
BATCHES_DIR = DATA_DIR / "batches"
_batch_write_locks: dict[str, asyncio.Lock] = {}
_session_write_locks: dict[str, asyncio.Lock] = {}


def init_storage():
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    BATCHES_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _batch_lock(job_id: str) -> asyncio.Lock:
    return _batch_write_locks.setdefault(job_id, asyncio.Lock())


def _session_lock(session_id: str) -> asyncio.Lock:
    return _session_write_locks.setdefault(session_id, asyncio.Lock())


def _session_config_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.config.json"


def _session_log_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.jsonl"


def _batch_config_path(job_id: str) -> Path:
    return BATCHES_DIR / f"{job_id}.config.json"


def _batch_log_path(job_id: str) -> Path:
    return BATCHES_DIR / f"{job_id}.jsonl"


def save_session_config(session_id: str, config: dict):
    init_storage()
    payload = {"session_id": session_id, "created_at": now_iso(), **config}
    _session_config_path(session_id).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def save_batch_config(job_id: str, config: dict):
    init_storage()
    payload = {"job_id": job_id, "created_at": now_iso(), **config}
    _batch_config_path(job_id).write_text(json.dumps(payload, indent=2), encoding="utf-8")


async def log_session_event(session_id: str, actor: str, event_type: str, content: str = "", metadata: dict | None = None) -> dict:
    init_storage()
    event = {
        "timestamp": now_iso(),
        "actor": actor,
        "event_type": event_type,
        "content": content,
        "metadata": metadata or {},
    }
    async with _session_lock(session_id):
        with _session_log_path(session_id).open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


async def log_batch_result(job_id: str, result: dict):
    init_storage()
    async with _batch_lock(job_id):
        with _batch_log_path(job_id).open("a", encoding="utf-8") as f:
            f.write(json.dumps(result, ensure_ascii=False) + "\n")


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    with path.open("r", encoding="utf-8") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if line:
                obj = json.loads(line)
                obj.setdefault("id", i)
                out.append(obj)
    return out


def get_session_events(session_id: str) -> list[dict]:
    return _read_jsonl(_session_log_path(session_id))


def get_batch_results(job_id: str) -> list[dict]:
    return _read_jsonl(_batch_log_path(job_id))


def session_events_to_csv(session_id: str) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "actor", "event_type", "content", "metadata"])
    for e in get_session_events(session_id):
        writer.writerow([e.get("id"), e.get("timestamp"), e.get("actor"), e.get("event_type"), e.get("content"), json.dumps(e.get("metadata", {}))])
    return output.getvalue()


def batch_results_to_csv(job_id: str) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["sim_id", "num_turns", "num_agent_turns", "num_human_events", "toy_agreement_score"])
    for r in get_batch_results(job_id):
        s = r.get("summary", {})
        writer.writerow([r.get("sim_id"), s.get("num_turns"), s.get("num_agent_turns"), s.get("num_human_events"), s.get("toy_agreement_score")])
    return output.getvalue()
