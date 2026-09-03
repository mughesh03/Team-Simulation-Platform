# Team Simulation Platform — Combined MVP

A single FastAPI application combining the strongest parts of two prototypes for a research platform supporting:

1. **AI-only batch simulations**
2. **Human + AI team experiments**

There is **no real LLM backend** in this version. `app/agents.py` contains mock asynchronous agents and is the intended seam for your real Python agent code.

## What was merged

- Async/concurrent batch execution with a configurable concurrency limit
- Live batch progress monitoring
- WebSocket-driven human + AI sessions where agents advance automatically
- Pause/resume controls
- Configurable number of agents
- Sequential, parallel, and simple hierarchical placeholder team structures
- Three distinct human interventions:
  - information injection
  - team contribution
  - direct question to an individual agent
- JSON config + JSONL logs for both batch and interactive flows
- CSV export
- Optional random seed
- GitHub-friendly project structure and `.gitignore`

## Run locally

Python 3.11+ recommended.

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open:

```text
http://127.0.0.1:8000
```

After the Python dependencies are installed, this mock version runs offline.

## Storage

```text
data/
├── batches/
│   ├── <job_id>.config.json
│   └── <job_id>.jsonl
└── sessions/
    ├── <session_id>.config.json
    └── <session_id>.jsonl
```

Configs are static experiment parameters. Runtime state/actions live in append-only JSONL events/results.

## Main code seams

```text
app/
├── main.py       # FastAPI routes, batch orchestration, WebSockets
├── agents.py     # mock agents; replace with real LLM/agent backend
├── storage.py    # JSON/JSONL persistence + CSV export
├── templates/    # researcher and participant HTML
└── static/
```

The agent backend currently exposes:

```python
await agent_turn(agent_name, turn_number, history, params)
await answer_human_question(agent_name, question, history, params)
```

A future refactor can move coordination logic out of `main.py` into a dedicated experiment engine with team classes such as `SequentialTeam`, `ParallelTeam`, and `HierarchicalTeam`.

## Human intervention event types

The interactive flow distinguishes:

```text
HUMAN_INFORMATION
HUMAN_TEAM_MESSAGE
HUMAN_QUERY
AGENT_REPLY_TO_HUMAN
PAUSE_REQUESTED
SESSION_PAUSED
RESUME
```

This makes the JSONL log more useful for later process analysis.

## Current MVP limitations

- Active batch/session objects still live in process memory. JSONL survives a restart, but in-progress jobs are not automatically reconstructed.
- WebSocket reconnection does not yet replay prior events to the browser.
- Team structures are intentionally simple placeholders rather than full research-grade orchestration algorithms.
- Pause takes effect at the next safe boundary; it does not cancel an already-running mock/LLM call.
- No authentication, participant assignment, consent flow, treatment randomization, or production deployment hardening yet.

Those are appropriate next steps after the real agent engine is connected.
