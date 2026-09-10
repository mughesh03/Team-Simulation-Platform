"""Combined MVP for AI-only and human+AI team research experiments.

Flow 1: configurable concurrent batch simulations with progress + JSONL logs.
Flow 2: autonomous mock-agent conversation over WebSocket with pause/resume,
        information injection, human team messages, and direct questions.
"""

import asyncio
import json
import os
import random
import uuid
from pathlib import Path
from typing import Dict, Literal, Optional, Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from .agents import agent_turn, answer_human_question, make_agent_names, summarize_transcript
from . import storage

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Team Simulation Platform - Combined MVP")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.on_event("startup")
def startup():
    storage.init_storage()


BATCH_JOBS: Dict[str, dict] = {}
SESSIONS: Dict[str, "HumanLoopSession"] = {}
_SECRET_KEYS = {"api_key", "apiKey", "multiApiKey"}


def public_config(params: dict) -> dict:
    """Drop credentials before persisting or returning config to the browser."""
    return {k: v for k, v in params.items() if k not in _SECRET_KEYS}


class ExperimentParams(BaseModel):
    num_agents: int = Field(3, ge=1, le=12)
    num_rounds: int = Field(6, ge=1, le=100)
    team_structure: str = "sequential"
    random_seed: Optional[int] = None
    multi_llm: bool = False
    provider_model: str = "mock"
    selected_models: list[str] = Field(default_factory=lambda: ["mock"])
    llm_tasks: dict[str, str] = Field(default_factory=dict)
    custom_prompt: str = ""


class BatchParams(ExperimentParams):
    num_simulations: int = Field(20, ge=1, le=5000)
    concurrency: int = Field(5, ge=1, le=100)


class SessionParams(ExperimentParams):
    num_rounds: int = Field(10, ge=1, le=100)


def _agent_order(agent_names: list[str], team_structure: str, round_idx: int) -> list[str]:
    if team_structure in ["parallel", "team"]:
        return agent_names
    if team_structure in ["hierarchical", "reciprocal"]:
        if len(agent_names) <= 1:
            return agent_names
        leader = agent_names[0]
        member = agent_names[1 + (round_idx % (len(agent_names) - 1))]
        return [member, leader] if round_idx % 2 == 1 else [leader, member]
    # sequential / default pooled
    return [agent_names[round_idx % len(agent_names)]]


async def _run_round(history: list[dict], agent_names: list[str], params: dict, round_idx: int) -> list[dict]:
    team_structure = params.get("team_structure", "sequential")
    order = _agent_order(agent_names, team_structure, round_idx)
    if team_structure in ["parallel", "team"]:
        snapshot = list(history)
        return await asyncio.gather(*[
            agent_turn(name, round_idx, snapshot, {**params, "agent_names": agent_names})
            for name in order
        ])
    results = []
    for name in order:
        result = await agent_turn(name, round_idx, history + results, {**params, "agent_names": agent_names})
        results.append(result)
    return results


# ---------------- Flow 1: AI-only batch simulations ----------------
async def run_single_simulation(job_id: str, sim_id: int, params: dict) -> dict:
    num_agents = params.get("num_agents", 3)
    num_rounds = params.get("num_rounds", 6)
    agent_names = make_agent_names(num_agents)
    p = dict(params)
    seed = params.get("random_seed")
    p["rng_seed"] = None if seed is None else seed + sim_id
    history: list[dict] = []
    for round_idx in range(num_rounds):
        history.extend(await _run_round(history, agent_names, p, round_idx))
    result = {
        "sim_id": sim_id,
        "config": {
            "num_agents": num_agents,
            "num_rounds": num_rounds,
            "team_structure": params.get("team_structure", "sequential"),
            "multi_llm": params.get("multi_llm", False),
            "selected_models": params.get("selected_models", []),
            "llm_tasks": params.get("llm_tasks", {})
        },
        "transcript": history,
        "summary": summarize_transcript(history, agent_names, p.get("rng_seed")),
    }
    await storage.log_batch_result(job_id, result)
    return result


async def run_batch(job_id: str, params: dict):
    job = BATCH_JOBS[job_id]
    concurrency = params.get("concurrency", 5)
    num_simulations = params.get("num_simulations", 20)
    sem = asyncio.Semaphore(concurrency)
    results: list[Optional[dict]] = [None] * num_simulations

    async def worker(i: int):
        async with sem:
            results[i] = await run_single_simulation(job_id, i + 1, params)
            job["completed"] += 1

    try:
        await asyncio.gather(*(worker(i) for i in range(num_simulations)))
        job["results"] = results
        job["status"] = "done"
    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)


@app.post("/api/batch/start")
@app.post("/api/experiment/pure-ai/start")
async def start_batch(payload: Dict[str, Any]):
    job_id = uuid.uuid4().hex
    
    # Handle structured payload from pure_ai.html form
    if "llm" in payload:
        llm_info = payload.get("llm", {})
        task_info = payload.get("task", {})
        team_info = payload.get("team", {})
        params_dict = {
            "num_agents": team_info.get("num_agents", 3),
            "num_rounds": team_info.get("num_rounds", 6),
            "team_structure": team_info.get("structure", "sequential"),
            "num_simulations": payload.get("num_simulations", 20),
            "concurrency": payload.get("concurrency", 5),
            "random_seed": payload.get("random_seed"),
            "multi_llm": llm_info.get("multi_llm", False),
            "provider_model": llm_info.get("provider_model", "mock"),
            "selected_models": llm_info.get("selected_models", [llm_info.get("provider_model", "mock")]),
            "llm_tasks": task_info.get("llm_tasks", {}),
            "custom_prompt": task_info.get("custom_prompt", ""),
            "task_type": task_info.get("type", "lost_at_sea"),
            "api_key": llm_info.get("api_key", ""),
            "temperature": llm_info.get("temperature", 0.7),
            "max_tokens": llm_info.get("max_tokens", 0),
            "persona_strategy": payload.get("persona_strategy", "generic"),
            "experiment_label": payload.get("experiment_label", ""),
        }
    else:
        params_dict = payload

    total_sims = params_dict.get("num_simulations", 20)
    BATCH_JOBS[job_id] = {"status": "running", "completed": 0, "total": total_sims, "results": None, "config": public_config(params_dict)}
    storage.save_batch_config(job_id, public_config(params_dict))
    # Vercel serverless functions exit after the HTTP response, so finish the
    # mock batch in this request instead of creating a background task.
    if os.getenv("VERCEL"):
        await run_batch(job_id, params_dict)
    else:
        asyncio.create_task(run_batch(job_id, params_dict))
    return {"job_id": job_id, "experiment_id": job_id}


@app.get("/api/batch/{job_id}/status")
@app.get("/api/experiment/{job_id}/status")
async def batch_status(job_id: str):
    job = BATCH_JOBS.get(job_id)
    return job if job else {"error": "job not found"}


@app.get("/api/batch/{job_id}/results")
@app.get("/api/experiment/{job_id}/results")
async def batch_results(job_id: str):
    job = BATCH_JOBS.get(job_id)
    if not job or job.get("status") != "done":
        return {"error": "not ready"}
    summaries = [r["summary"] for r in job.get("results", []) if r]
    avg = round(sum(s["toy_agreement_score"] for s in summaries) / len(summaries), 3) if summaries else None
    return {"summaries": summaries, "avg_agreement": avg, "config": job.get("config")}


@app.get("/api/batch/{job_id}/results.csv")
@app.get("/api/experiment/{job_id}/results.csv")
async def batch_results_csv(job_id: str):
    return Response(storage.batch_results_to_csv(job_id), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{job_id}_batch_results.csv"'})


# ---------------- Flow 2: Human + AI interactive sessions ----------------
class HumanLoopSession:
    def __init__(self, session_id: str, params: dict):
        self.session_id = session_id
        self.params = params
        self.num_agents = params.get("num_agents", 3)
        self.num_rounds = params.get("num_rounds", 10)
        self.agent_names = make_agent_names(self.num_agents)
        self.history: list[dict] = []
        self.running_gate = asyncio.Event(); self.running_gate.set()
        self.interventions: asyncio.Queue = asyncio.Queue()
        self.websocket: Optional[WebSocket] = None
        self.run_task: Optional[asyncio.Task] = None

    async def send(self, payload: dict):
        if self.websocket:
            await self.websocket.send_json(payload)

    async def flush_interventions(self):
        while not self.interventions.empty():
            item = await self.interventions.get()
            event_type = item["event_type"]
            content = item["content"]
            recipient = item.get("recipient")
            human_entry = {"agent": "Human", "actor_type": "human", "turn": -1, "text": content, "event_type": event_type, "recipient": recipient}
            self.history.append(human_entry)
            await storage.log_session_event(self.session_id, "human", event_type, content, {"recipient": recipient} if recipient else {})
            await self.send({"type": "message", **human_entry})

            if event_type == "HUMAN_QUERY" and recipient:
                reply = await answer_human_question(recipient, content, self.history, {**self.params, "agent_names": self.agent_names})
                self.history.append(reply)
                await storage.log_session_event(self.session_id, recipient, "AGENT_REPLY_TO_HUMAN", reply["text"], {"recipient": "human"})
                await self.send({"type": "message", **reply, "event_type": "AGENT_REPLY_TO_HUMAN"})

    async def run(self):
        await storage.log_session_event(self.session_id, "system", "SESSION_STARTED", "Agent team started")
        try:
            for round_idx in range(self.num_rounds):
                await self.running_gate.wait()
                await self.flush_interventions()
                await self.running_gate.wait()
                live_params = dict(self.params)
                live_params["rng_seed"] = self.params.get("random_seed")
                results = await _run_round(self.history, self.agent_names, live_params, round_idx)
                for result in results:
                    self.history.append(result)
                    await storage.log_session_event(self.session_id, result["agent"], "AGENT_MESSAGE", result["text"], {"round": round_idx})
                    await self.send({"type": "message", **result, "event_type": "AGENT_MESSAGE"})
                await self.flush_interventions()

            summary = summarize_transcript(self.history, self.agent_names, self.params.get("random_seed"))
            await storage.log_session_event(self.session_id, "system", "SESSION_COMPLETED", "Session completed", summary)
            await self.send({"type": "done", "summary": summary})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await storage.log_session_event(self.session_id, "system", "SESSION_ERROR", str(exc))
            await self.send({"type": "error", "text": str(exc)})


@app.post("/api/session/start")
@app.post("/api/experiment/hitl/create")
async def start_session(payload: Dict[str, Any]):
    session_id = uuid.uuid4().hex
    
    if "llm" in payload:
        llm_info = payload.get("llm", {})
        task_info = payload.get("task", {})
        team_info = payload.get("team", {})
        intervention = payload.get("intervention_rules", {})
        params_dict = {
            "num_agents": team_info.get("num_agents", 3),
            "num_rounds": team_info.get("num_rounds", 10),
            "team_structure": team_info.get("structure", "sequential"),
            "multi_llm": llm_info.get("multi_llm", False),
            "provider_model": llm_info.get("provider_model", "mock"),
            "selected_models": llm_info.get("selected_models", [llm_info.get("provider_model", "mock")]),
            "llm_tasks": task_info.get("llm_tasks", {}),
            "custom_prompt": task_info.get("custom_prompt", ""),
            "task_type": task_info.get("type", "lost_at_sea"),
            "intervention_rules": intervention,
            "api_key": llm_info.get("api_key", ""),
            "temperature": llm_info.get("temperature", 0.7),
            "max_tokens": llm_info.get("max_tokens", 0),
            "persona_strategy": payload.get("persona_strategy", "generic"),
            "experiment_label": payload.get("experiment_label", ""),
        }
    else:
        params_dict = payload

    session = HumanLoopSession(session_id, params_dict)
    SESSIONS[session_id] = session
    live = any(m != "mock" for m in params_dict.get("selected_models", [params_dict.get("provider_model", "mock")]))
    storage.save_session_config(session_id, {
        "mode": "human_ai",
        "mock_backend": not live,
        **public_config(params_dict),
        "agent_names": session.agent_names,
    })
    await storage.log_session_event(session_id, "system", "SESSION_CREATED", "Interactive session created")
    return {"session_id": session_id, "session_code": session_id[:8], "agent_names": session.agent_names}


@app.websocket("/ws/session/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = SESSIONS.get(session_id)
    if not session:
        for s in SESSIONS.values():
            if s.session_id.startswith(session_id):
                session = s; break
    if not session:
        await websocket.send_json({"type": "error", "text": "session not found"}); await websocket.close(); return
    session.websocket = websocket
    if session.run_task is None or session.run_task.done():
        session.run_task = asyncio.create_task(session.run())
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "pause":
                await storage.log_session_event(session.session_id, "human", "PAUSE_REQUESTED", "Human requested pause")
                session.running_gate.clear()
                await storage.log_session_event(session.session_id, "system", "SESSION_PAUSED", "Paused before next agent round/turn")
                await session.send({"type": "status", "text": "paused"})
            elif action == "resume":
                session.running_gate.set()
                await storage.log_session_event(session.session_id, "human", "RESUME", "Human resumed the AI team")
                await session.send({"type": "status", "text": "resumed"})
            elif action in {"inject_info", "team_message", "ask_agent"}:
                text = str(data.get("text", "")).strip()
                if not text:
                    continue
                mapping = {"inject_info": "HUMAN_INFORMATION", "team_message": "HUMAN_TEAM_MESSAGE", "ask_agent": "HUMAN_QUERY"}
                await session.interventions.put({"event_type": mapping[action], "content": text, "recipient": data.get("recipient")})
                await session.send({"type": "status", "text": "human input queued"})
    except WebSocketDisconnect:
        session.websocket = None


@app.get("/api/session/{session_id}/events.csv")
async def session_events_csv(session_id: str):
    return Response(storage.session_events_to_csv(session_id), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{session_id}_events.csv"'})


# -------------- Experiments List API ----------------
@app.get("/api/experiments")
async def list_experiments():
    """Return all batch jobs and sessions for the experiments list page."""
    experiments = []
    # In-memory batch jobs
    for job_id, job in BATCH_JOBS.items():
        config = job.get("config", {})
        experiments.append({
            "id": job_id,
            "type": "Pure AI",
            "status": job.get("status", "unknown"),
            "created_at": config.get("created_at", ""),
            "task_type": config.get("task_type", "lost_at_sea"),
            "num_agents": config.get("num_agents", 3),
            "num_simulations": config.get("num_simulations", 20),
            "team_structure": config.get("team_structure", "sequential"),
            "completed": job.get("completed", 0),
            "total": job.get("total", 0),
            "label": config.get("experiment_label", ""),
            "multi_llm": config.get("multi_llm", False),
            "models": config.get("selected_models", []),
        })
    # In-memory sessions
    for session_id, session in SESSIONS.items():
        experiments.append({
            "id": session_id,
            "type": "HITL",
            "status": "active" if session.run_task and not session.run_task.done() else "completed",
            "created_at": "",
            "task_type": session.params.get("task_type", "lost_at_sea"),
            "num_agents": session.num_agents,
            "num_simulations": 1,
            "team_structure": session.params.get("team_structure", "team"),
            "completed": 1,
            "total": 1,
            "label": session.params.get("experiment_label", ""),
            "multi_llm": session.params.get("multi_llm", False),
            "models": session.params.get("selected_models", []),
        })
    return {"experiments": experiments}


# -------------- Dashboard Results API ----------------
@app.get("/api/experiment/{job_id}/dashboard")
async def experiment_dashboard(job_id: str):
    """Return full statistics for the dashboard page."""
    job = BATCH_JOBS.get(job_id)
    if not job:
        return {"error": "experiment not found"}
    if job.get("status") != "done":
        return {"error": "not ready", "status": job.get("status")}

    results = [r for r in (job.get("results") or []) if r]
    summaries = [r.get("summary", {}) for r in results]
    config = job.get("config", {})

    scores = [s.get("agreement_score", s.get("toy_agreement_score", 0)) for s in summaries]
    turns_list = [s.get("num_turns", 0) for s in summaries]
    token_list = [s.get("total_tokens", 0) for s in summaries]
    input_tokens = [s.get("total_input_tokens", 0) for s in summaries]
    output_tokens = [s.get("total_output_tokens", 0) for s in summaries]
    latencies = [s.get("avg_latency_ms", 0) for s in summaries]

    n = len(scores) or 1
    mean_score = round(sum(scores) / n, 3)
    sorted_scores = sorted(scores)
    median_score = round(sorted_scores[n // 2], 3) if scores else 0
    std_dev = round((sum((s - mean_score) ** 2 for s in scores) / n) ** 0.5, 3) if scores else 0
    min_score = round(min(scores), 3) if scores else 0
    max_score = round(max(scores), 3) if scores else 0

    # Histogram buckets (10 buckets from 0 to 1)
    histogram = [0] * 10
    for s in scores:
        bucket = min(int(s * 10), 9)
        histogram[bucket] += 1

    return {
        "config": config,
        "num_completed": len(results),
        "num_failed": (job.get("total", 0) - len(results)),
        "mean_score": mean_score,
        "median_score": median_score,
        "std_dev": std_dev,
        "min_score": min_score,
        "max_score": max_score,
        "score_histogram": histogram,
        "avg_turns": round(sum(turns_list) / n, 1),
        "total_input_tokens": sum(input_tokens),
        "total_output_tokens": sum(output_tokens),
        "total_tokens": sum(token_list),
        "avg_latency_ms": round(sum(latencies) / n),
        "runs": [
            {
                "sim_id": r.get("sim_id"),
                "score": r.get("summary", {}).get("agreement_score", r.get("summary", {}).get("toy_agreement_score", 0)),
                "num_turns": r.get("summary", {}).get("num_turns", 0),
                "total_tokens": r.get("summary", {}).get("total_tokens", 0),
            }
            for r in results
        ],
    }


# -------------- Individual Run Transcript API ----------------
@app.get("/api/experiment/{job_id}/run/{sim_id}")
async def get_run_transcript(job_id: str, sim_id: int):
    """Return the full transcript for one simulation run."""
    job = BATCH_JOBS.get(job_id)
    if not job or not job.get("results"):
        return {"error": "not found"}
    for r in job["results"]:
        if r and r.get("sim_id") == sim_id:
            return r
    return {"error": "run not found"}


# -------------- Session Info API ----------------
@app.get("/api/session/{session_id}/info")
async def session_info(session_id: str):
    """Return config and agent list for a session (used by participant page)."""
    session = SESSIONS.get(session_id)
    if not session:
        for s in SESSIONS.values():
            if s.session_id.startswith(session_id):
                session = s; break
    if not session:
        return {"error": "session not found"}
    return {
        "session_id": session.session_id,
        "agent_names": session.agent_names,
        "params": public_config(session.params),
        "instructions": session.params.get("intervention_rules", {}).get("instructions", ""),
    }


# -------------- Data Download ----------------
@app.get("/api/experiment/{job_id}/download")
async def download_experiment(job_id: str):
    """Return full results as JSON (simulates a download)."""
    job = BATCH_JOBS.get(job_id)
    if not job:
        return {"error": "not found"}
    export = {
        "experiment_id": job_id,
        "config": job.get("config"),
        "status": job.get("status"),
        "results": [
            {"sim_id": r.get("sim_id"), "summary": r.get("summary"), "transcript": r.get("transcript")}
            for r in (job.get("results") or []) if r
        ],
    }
    return Response(
        json.dumps(export, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{job_id}_full_export.json"'}
    )


# ---------------- Pages ----------------
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/pure-ai", response_class=HTMLResponse)
async def batch_page(request: Request):
    return templates.TemplateResponse("pure_ai.html", {"request": request})

@app.get("/hitl", response_class=HTMLResponse)
async def session_page(request: Request):
    return templates.TemplateResponse("hitl_setup.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request): return templates.TemplateResponse("login.html", {"request": request})

@app.get("/experiments", response_class=HTMLResponse)
async def experiments_page(request: Request): return templates.TemplateResponse("experiments.html", {"request": request})

@app.get("/experiment/{id}/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request, id: str): return templates.TemplateResponse("dashboard.html", {"request": request, "experiment_id": id})

@app.get("/experiment/{id}/runs", response_class=HTMLResponse)
async def runs_page(request: Request, id: str): return templates.TemplateResponse("run_viewer.html", {"request": request, "experiment_id": id})

@app.get("/participant/{session_id}", response_class=HTMLResponse)
async def participant_page(request: Request, session_id: str): return templates.TemplateResponse("participant.html", {"request": request})

