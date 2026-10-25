# Team Simulation Platform

FastAPI research platform for **organizational team studies** with AI-only teams and **human-in-the-loop (HITL)** sessions. Researchers configure study design in step-by-step builders, launch batch simulations or participant sessions, and review dashboards, transcripts, and exports.

## What you can do

### Pure AI batch studies (`/pure-ai`)

- Multi-step study builder: research design, task interdependence, task library or custom prompt, team composition, simulation settings, LLM configuration, review and launch
- Batch runs with configurable replications, concurrency, and optional random seed
- Live progress polling, stop, results dashboard, per-run viewer, CSV/JSON downloads
- Experiment history (browser local storage on builder pages; server listing via `/api/experiments`)

### Human + AI studies (`/hitl`)

- Same core design steps plus **human intervention rules** (participant role, message recipients, instructions)
- Participant intervention at the **end of each round** (fixed in the current UI)
- Participant link (`/participant/{session_id}`), researcher HITL dashboard, WebSocket-driven team flow with pause and targeted messaging

### Reference pages

| Route | Purpose |
| --- | --- |
| `/` | Overview and experiment history |
| `/task-library` | Research task catalog |
| `/research-capabilities` | Platform capabilities summary |
| `/interdependence` | Animated interdependence structure diagrams |

## Architecture

High-level flow from study design through simulation runtime to review. Diagram generated with [gitdiagram.com](https://gitdiagram.com); node labels map to this repository.

```mermaid
flowchart TD

subgraph group_study_design["Study design"]
  node_study_builders["Study builders<br/>[pure_ai.html, hitl_setup.html]"]
  node_builder_logic["Builder UI logic<br/>[pure_ai.html, hitl_setup.html, app.js]"]
  node_task_library["Task library<br/>[task_library.html]"]
  node_participant_ui["Participant interface<br/>[participant.html]"]
end

subgraph group_simulation["Simulation runtime"]
  node_batch_orchestrator["Batch orchestration<br/>[main.py]"]
  node_team_rounds["Team structure rounds<br/>[main.py]"]
  node_agent_backend["Agent backend<br/>[agents.py]"]
  node_llm_service["Live model service<br/>[LiteLLM + gateway]"]
  node_hitl_session["HITL session runtime<br/>[main.py]"]
end

subgraph group_review["Review and reference"]
  node_researcher_dashboards["Researcher dashboards"]
  node_experiment_history["Experiment history<br/>[experiments.html]"]
  node_interdependence_viz["Interdependence diagrams<br/>[interdependence.js]"]
  node_result_exports["Result exports<br/>[storage.py]"]
end

subgraph group_platform["Platform services"]
  node_web_routes["Web and API routes<br/>[main.py]"]
  node_researcher_auth["Researcher auth<br/>[auth.py]"]
  node_persistence[("JSONL and config storage<br/>[storage.py]")]
end

node_researcher(("Researcher"))
node_participant(("Participant"))

node_researcher -->|"configures studies"| node_study_builders
node_study_builders -.->|"uses"| node_builder_logic
node_builder_logic -->|"submits studies"| node_web_routes
node_researcher -->|"browses tasks"| node_task_library
node_web_routes -->|"checks access"| node_researcher_auth
node_web_routes -->|"starts batches"| node_batch_orchestrator
node_batch_orchestrator -->|"runs simulations"| node_team_rounds
node_team_rounds -->|"requests turns"| node_agent_backend
node_agent_backend -.->|"calls live models"| node_llm_service
node_batch_orchestrator -->|"logs results"| node_persistence
node_web_routes -->|"creates sessions"| node_hitl_session
node_hitl_session -->|"requests turns"| node_agent_backend
node_hitl_session -->|"logs events"| node_persistence
node_participant -->|"joins session"| node_participant_ui
node_participant_ui -->|"intervenes"| node_hitl_session
node_researcher -->|"reviews results"| node_researcher_dashboards
node_researcher_dashboards -.->|"requests results"| node_web_routes
node_web_routes -.->|"reads records"| node_persistence
node_researcher -->|"views history"| node_experiment_history
node_persistence -->|"provides records"| node_result_exports
node_researcher -->|"downloads exports"| node_result_exports
node_researcher -->|"views diagrams"| node_interdependence_viz

classDef toneNeutral fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
classDef toneBlue fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
classDef toneAmber fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
classDef toneMint fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
classDef toneRose fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
classDef toneIndigo fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
class node_study_builders,node_builder_logic,node_task_library,node_participant_ui toneBlue
class node_batch_orchestrator,node_team_rounds,node_agent_backend,node_llm_service,node_hitl_session toneAmber
class node_researcher_dashboards,node_experiment_history,node_interdependence_viz,node_result_exports toneMint
class node_web_routes,node_researcher_auth,node_persistence toneRose
class node_researcher,node_participant toneIndigo
```

**Source files (quick links):** [templates](https://github.com/mughesh03/Team-Simulation-Platform/tree/main/app/templates) · [main.py](https://github.com/mughesh03/Team-Simulation-Platform/blob/main/app/main.py) · [agents.py](https://github.com/mughesh03/Team-Simulation-Platform/blob/main/app/agents.py) · [storage.py](https://github.com/mughesh03/Team-Simulation-Platform/blob/main/app/storage.py) · [interdependence.js](https://github.com/mughesh03/Team-Simulation-Platform/blob/main/app/static/interdependence.js)

## Task interdependence (backend)

Structures map to orchestration in `app/main.py`:

| UI label | Backend `team_structure` | Behavior (summary) |
| --- | --- | --- |
| Pooled | `pooled` | Independent member contributions, aggregated output |
| Sequential | `sequential` | Handoffs through a fixed pipeline |
| Reciprocal — Chain | `reciprocal_chain` | Bidirectional exchange with immediate neighbors |
| Team — Comprehensive | `reciprocal_comprehensive` | Full mutual adjustment within the team |

Legacy labels (`team`, `parallel`, `reciprocal`) may still appear in older configs or logs.

## Agent / LLM backend

`app/agents.py` implements:

- **Mock backend** — task-aware canned dialogue, timing suitable for local demos (no API key)
- **Live models** — via LiteLLM when a model is not `mock` and an API key is supplied (UI or env)

For **Kimi K2.5** (`kimi-k2.5`), set an OpenAI-compatible gateway:

1. Copy `app/llm_secrets.example.py` → `app/llm_secrets.py` (git-ignored)
2. Set `INSTITUTION_GENAI_API` and `KIMI_BASE_URL` (or use `.env` — see `.env.example`)

Public configs and exports **strip API keys**. Use **Mock Backend (Demo)** in the builder to run without credentials.

Core agent API (stable seam for extensions):

```python
await agent_turn(agent_name, turn_number, history, params)
await answer_human_question(agent_name, question, history, params)
```

## Run locally

Python 3.11+ recommended.

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

Open **https://team-simulation-platform.onrender.com/**

Optional researcher login: set `RESEARCHER_PASSWORD` in `.env` (default documented in `.env.example`).

Mock runs work offline after dependencies are installed.

## Project layout

```text
app/
├── main.py              # Routes, batch orchestration, HITL sessions, WebSockets
├── agents.py            # Mock + live LLM turns
├── storage.py           # JSON/JSONL persistence, CSV export
├── llm_secrets.example.py
├── templates/           # Study builders, participant UI, dashboards
└── static/              # CSS, JS, interdependence visuals

data/
├── batches/             # Pure AI job configs + JSONL results
└── sessions/            # HITL session configs + JSONL events

run.py                   # Uvicorn entry (127.0.0.1:8000)
```

## Storage

Batch and session **configs** are JSON; **runtime events and turns** append to JSONL. Dashboards and downloads read from these files when present.

On **Vercel**, filesystem persistence is limited and background tasks do not survive after the HTTP response; Pure AI mock batches are designed to complete in-request. Long-running local servers use background tasks for progressive status updates. HITL WebSockets require a persistent host (local or a long-running VM), not serverless-only deploys.

## Human intervention event types (HITL JSONL)

```text
HUMAN_INFORMATION
HUMAN_TEAM_MESSAGE
HUMAN_QUERY
AGENT_REPLY_TO_HUMAN
PAUSE_REQUESTED
SESSION_PAUSED
RESUME
```

## Current limitations

- In-memory job/session registries: restarts lose in-progress work (JSONL on disk remains).
- WebSocket clients do not automatically replay full history on reconnect.
- Pause applies at round/safe boundaries; an in-flight LLM call is not cancelled mid-stream.
- Production hardening (auth beyond simple researcher password, consent flows, treatment randomization) is not complete.

## License / attribution

See repository settings on GitHub for license and contribution notes.
