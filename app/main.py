"""Combined MVP for AI-only and human+AI team research experiments.

Flow 1: configurable concurrent batch simulations with progress + JSONL logs.
Flow 2: autonomous mock-agent conversation over WebSocket with pause/resume,
        information injection, human team messages, and direct questions.

No LLM backend is included. Replace functions in ``app/agents.py`` later.
"""

import asyncio
import random
import uuid
from pathlib import Path
from typing import Dict, Literal, Optional

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from .agents import agent_turn, answer_human_question, make_agent_names, summarize_transcript
from . import storage

BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Team Simulation Platform - Combined MVP")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


@app.on_event("startup")
def startup():
    storage.init_storage()


BATCH_JOBS: Dict[str, dict] = {}
SESSIONS: Dict[str, "HumanLoopSession"] = {}


class ExperimentParams(BaseModel):
    num_agents: int = Field(3, ge=1, le=12)
    num_rounds: int = Field(6, ge=1, le=100)
    team_structure: Literal["sequential", "parallel", "hierarchical"] = "sequential"
    random_seed: Optional[int] = None


class BatchParams(ExperimentParams):
    num_simulations: int = Field(20, ge=1, le=5000)
    concurrency: int = Field(5, ge=1, le=100)


class SessionParams(ExperimentParams):
    num_rounds: int = Field(10, ge=1, le=100)


def _agent_order(agent_names: list[str], team_structure: str, round_idx: int) -> list[str]:
    if team_structure == "parallel":
        return agent_names
    if team_structure == "hierarchical":
        # Simple placeholder: leader opens/closes each round around one rotating member.
        if len(agent_names) == 1:
            return agent_names
        leader = agent_names[0]
        member = agent_names[1 + (round_idx % (len(agent_names) - 1))]
        return [member, leader]
    return [agent_names[round_idx % len(agent_names)]]


async def _run_round(history: list[dict], agent_names: list[str], params: dict, round_idx: int) -> list[dict]:
    order = _agent_order(agent_names, params["team_structure"], round_idx)
    if params["team_structure"] == "parallel":
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
async def run_single_simulation(job_id: str, sim_id: int, params: BatchParams) -> dict:
    agent_names = make_agent_names(params.num_agents)
    p = params.model_dump()
    p["rng_seed"] = None if params.random_seed is None else params.random_seed + sim_id
    history: list[dict] = []
    for round_idx in range(params.num_rounds):
        history.extend(await _run_round(history, agent_names, p, round_idx))
    result = {
        "sim_id": sim_id,
        "config": {"num_agents": params.num_agents, "num_rounds": params.num_rounds, "team_structure": params.team_structure},
        "transcript": history,
        "summary": summarize_transcript(history, agent_names, p.get("rng_seed")),
    }
    await storage.log_batch_result(job_id, result)
    return result


async def run_batch(job_id: str, params: BatchParams):
    job = BATCH_JOBS[job_id]
    sem = asyncio.Semaphore(params.concurrency)
    results: list[Optional[dict]] = [None] * params.num_simulations

    async def worker(i: int):
        async with sem:
            results[i] = await run_single_simulation(job_id, i + 1, params)
            job["completed"] += 1

    try:
        await asyncio.gather(*(worker(i) for i in range(params.num_simulations)))
        job["results"] = results
        job["status"] = "done"
    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)


@app.post("/api/batch/start")
async def start_batch(params: BatchParams):
    job_id = uuid.uuid4().hex
    BATCH_JOBS[job_id] = {"status": "running", "completed": 0, "total": params.num_simulations, "results": None}
    storage.save_batch_config(job_id, params.model_dump())
    asyncio.create_task(run_batch(job_id, params))
    return {"job_id": job_id}


@app.get("/api/batch/{job_id}/status")
async def batch_status(job_id: str):
    job = BATCH_JOBS.get(job_id)
    return job if job else {"error": "job not found"}


@app.get("/api/batch/{job_id}/results")
async def batch_results(job_id: str):
    job = BATCH_JOBS.get(job_id)
    if not job or job.get("status") != "done":
        return {"error": "not ready"}
    summaries = [r["summary"] for r in job["results"] if r]
    avg = round(sum(s["toy_agreement_score"] for s in summaries) / len(summaries), 3) if summaries else None
    return {"summaries": summaries, "avg_agreement": avg}


@app.get("/api/batch/{job_id}/results.csv")
async def batch_results_csv(job_id: str):
    return Response(storage.batch_results_to_csv(job_id), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{job_id}_batch_results.csv"'})


# ---------------- Flow 2: Human + AI interactive sessions ----------------
class HumanLoopSession:
    def __init__(self, session_id: str, params: SessionParams):
        self.session_id = session_id
        self.params = params
        self.agent_names = make_agent_names(params.num_agents)
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
                reply = await answer_human_question(recipient, content, self.history, {**self.params.model_dump(), "agent_names": self.agent_names})
                self.history.append(reply)
                await storage.log_session_event(self.session_id, recipient, "AGENT_REPLY_TO_HUMAN", reply["text"], {"recipient": "human"})
                await self.send({"type": "message", **reply, "event_type": "AGENT_REPLY_TO_HUMAN"})

    async def run(self):
        await storage.log_session_event(self.session_id, "system", "SESSION_STARTED", "Agent team started")
        try:
            for round_idx in range(self.params.num_rounds):
                await self.running_gate.wait()
                await self.flush_interventions()
                await self.running_gate.wait()
                live_params = self.params.model_dump()
                live_params["rng_seed"] = self.params.random_seed
                results = await _run_round(self.history, self.agent_names, live_params, round_idx)
                for result in results:
                    self.history.append(result)
                    await storage.log_session_event(self.session_id, result["agent"], "AGENT_MESSAGE", result["text"], {"round": round_idx})
                    await self.send({"type": "message", **result, "event_type": "AGENT_MESSAGE"})
                await self.flush_interventions()

            summary = summarize_transcript(self.history, self.agent_names, self.params.random_seed)
            await storage.log_session_event(self.session_id, "system", "SESSION_COMPLETED", "Session completed", summary)
            await self.send({"type": "done", "summary": summary})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await storage.log_session_event(self.session_id, "system", "SESSION_ERROR", str(exc))
            await self.send({"type": "error", "text": str(exc)})


@app.post("/api/session/start")
async def start_session(params: SessionParams):
    session_id = uuid.uuid4().hex
    session = HumanLoopSession(session_id, params)
    SESSIONS[session_id] = session
    storage.save_session_config(session_id, {"mode": "human_ai", "mock_backend": True, **params.model_dump(), "agent_names": session.agent_names})
    await storage.log_session_event(session_id, "system", "SESSION_CREATED", "Interactive session created")
    return {"session_id": session_id, "agent_names": session.agent_names}


@app.websocket("/ws/session/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = SESSIONS.get(session_id)
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
                await storage.log_session_event(session_id, "human", "PAUSE_REQUESTED", "Human requested pause")
                session.running_gate.clear()
                await storage.log_session_event(session_id, "system", "SESSION_PAUSED", "Paused before next agent round/turn")
                await session.send({"type": "status", "text": "paused"})
            elif action == "resume":
                session.running_gate.set()
                await storage.log_session_event(session_id, "human", "RESUME", "Human resumed the AI team")
                await session.send({"type": "status", "text": "resumed"})
            elif action in {"inject_info", "team_message", "ask_agent"}:
                text = str(data.get("text", "")).strip()
                if not text:
                    continue
                mapping = {"inject_info": "HUMAN_INFORMATION", "team_message": "HUMAN_TEAM_MESSAGE", "ask_agent": "HUMAN_QUERY"}
                await session.interventions.put({"event_type": mapping[action], "content": text, "recipient": data.get("recipient")})
                await session.send({"type": "status", "text": "human input queued"})
    except WebSocketDisconnect:
        # Keep the live experiment object rather than deleting/cancelling it.
        # It can finish in memory and its JSONL log remains available.
        session.websocket = None


@app.get("/api/session/{session_id}/events.csv")
async def session_events_csv(session_id: str):
    return Response(storage.session_events_to_csv(session_id), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{session_id}_events.csv"'})


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
async def runs_page(request: Request, id: str): return templates.TemplateResponse("run_viewer.html", {"request": request})

@app.get("/participant/{session_id}", response_class=HTMLResponse)
async def participant_page(request: Request, session_id: str): return templates.TemplateResponse("participant.html", {"request": request})
