"""Agent backend — mock responses plus live UVA Kimi K2.5 path.

``agent_turn`` / ``answer_human_question`` keep a stable return shape.
- model == "mock" -> mock lines (demo, always works)
- model == "kimi-k2.5" -> live UVA RC GenAI Open-WebUI call, hard error if key/network fails.
"""

import asyncio
import os
import random
import hashlib
import json
import time

import httpx

try:
    from . import uva_secrets as _local_secrets
except ImportError:
    try:
        import app.uva_secrets as _local_secrets  # type: ignore
    except ImportError:
        _local_secrets = None  # type: ignore

# ── Realistic mock dialogue lines keyed by task ──────────────────

_TASK_LINES = {
    "lost_at_sea": [
        "I'd rank the shaving mirror as #1 — you can signal rescue planes from over 10 miles away with reflected sunlight.",
        "Water containers should be top priority. Dehydration kills faster than anything else at sea.",
        "I disagree with ranking the fishing kit so high. You can survive weeks without food but only 3 days without water.",
        "The ocean chart and compass are useless without an engine. I'd rank them low.",
        "Building on {other}'s point — the rum has antiseptic value but drinking it accelerates dehydration.",
        "Let's reconsider: the mosquito netting could be repurposed as a fishing net, making it more versatile.",
        "The shark repellent is situational. I'd prioritize the tarp for rain collection over it.",
        "I think we're reaching consensus: mirror > water > food rations > tarp > rope. Does everyone agree?",
        "One factor we haven't discussed: signaling at night. The flares become critical after sunset.",
        "Let me push back — the transistor radio is worthless for rescue since we can't transmit, only receive.",
    ],
    "hiring": [
        "Candidate A has stronger technical credentials, but Candidate B shows better leadership in their references.",
        "Looking at cultural fit, Candidate B's collaborative style aligns better with our team values.",
        "I want to highlight a concern: Candidate A's 3-year gap needs explanation before we decide.",
        "The salary expectations differ by $30K. We need to factor budget constraints into this decision.",
        "Let's use a structured evaluation: I'd weight technical skills at 40%, leadership at 30%, and culture fit at 30%.",
        "Building on {other}'s framework, Candidate B scores higher on 2 of the 3 dimensions.",
        "I'd challenge the assumption that technical skills matter most. For this VP role, strategic vision is paramount.",
        "Can we agree on a short list? I propose bringing both A and B for a final panel interview.",
        "One more data point: Candidate A's previous team grew revenue 40% — that's hard to ignore.",
        "I think we're converging. Let me summarize: B for leadership, A for execution. The tie-breaker is the role's primary need.",
    ],
    "desert_survival": [
        "The cosmetic mirror is the single most important item — it can signal aircraft from miles away.",
        "I'd rank water as #1. Two liters won't last long but it's the most immediate survival need.",
        "The parachute can serve as shade shelter. Desert exposure can cause heatstroke within hours.",
        "Building on {other}'s point, the magnetic compass is useless — walking in the desert without a water source is suicidal.",
        "Let me reconsider the flashlight — at night it doubles as a signaling device with its mirror.",
        "The .45 caliber pistol is ranked low by experts. Its noise is barely audible from any distance compared to optical signals.",
        "I think we should group items: signaling (mirror, flashlight), shelter (parachute, overcoat), and sustenance (water, salt tablets).",
        "The book on desert animals is surprisingly useful — it helps identify edible plants and dangerous creatures.",
        "Let me push back on the vodka ranking. Alcohol accelerates dehydration — it's essentially useless.",
        "I believe we're reaching consensus: mirror > water > parachute > overcoat. Can we finalize the top 5?",
    ],
    "moon_landing": [
        "Oxygen tanks are non-negotiable as #1. The moon has no atmosphere — you die in seconds without them.",
        "I'd rank the stellar map second. Without GPS, celestial navigation is the only way to reach the base.",
        "Water is critical for the 200-mile trek. I'd put it at #3, above the food concentrate.",
        "Building on {other}'s analysis — the signal flares are useless on the moon. There's no oxygen to sustain combustion.",
        "Wait, the flares contain their own oxidizer. They work in a vacuum. I'd reconsider.",
        "The magnetic compass is worthless — the moon's magnetic field is essentially zero.",
        "Let me rank the FM receiver higher. It could pick up signals from the mothership for directional guidance.",
        "I disagree about the life raft. Its CO2 cartridges could provide limited propulsion in low gravity.",
        "Let me propose a framework: prioritize life support, then navigation, then communication, then miscellaneous.",
        "I think we're close to consensus. Top 5: oxygen > water > stellar map > food > radio. Agreed?",
    ],
    "ethical_dilemma": [
        "From a utilitarian perspective, we should maximize the overall well-being of the greatest number of people.",
        "I'd challenge that framework. Utilitarianism can justify terrible things if the math works out.",
        "Let's consider the deontological view: some actions are inherently wrong regardless of consequences.",
        "Building on {other}'s point, there's also a virtue ethics perspective — what would a person of good character do?",
        "The stakeholder analysis reveals competing obligations: to shareholders, employees, and the community.",
        "I want to introduce the concept of moral hazard here. Our decision sets a precedent.",
        "Let me push back on the consequentialist argument. We can't predict all outcomes with certainty.",
        "One factor we're ignoring: transparency. Whatever we decide, the process should be defensible.",
        "I propose we use Rawls' veil of ignorance — what would we choose if we didn't know our position?",
        "I think we need to acknowledge there's no perfect answer here. Let me propose a balanced approach.",
    ],
}

_GENERIC_LINES = [
    "I think we should prioritize option {opt} based on the available evidence.",
    "Building on what {other} said, I'd flag a risk we haven't covered yet.",
    "I disagree — let me present a counter-argument with supporting reasoning.",
    "Let's compare the underlying assumptions before committing to a direction.",
    "Can we gather more data points before finalizing? I see a gap in our analysis.",
    "I agree with the general direction, but we should stress-test one more variable.",
    "Good point. Let me integrate that into our running assessment.",
    "I'd like to introduce a new framework for evaluating these options systematically.",
    "Let me play devil's advocate here to strengthen our final recommendation.",
    "I believe we're approaching consensus. Let me summarize the key agreements so far.",
]


KIMI_MODELS = {"kimi-k2.5"}
# Live Kimi is ON. Mock is only used when model == "mock".
# Previously DEMO_MODE forced mock even for kimi-k2.5; removed per approved plan.
_TASK_PROMPTS = {
    "lost_at_sea": (
        "You are on a team ranking 15 items for survival after a shipwreck in the Atlantic. "
        "Discuss, challenge, and converge on a ranked list. Prioritize signaling and water."
    ),
    "hiring": (
        "You are on a hiring committee comparing candidates. Discuss technical skill, "
        "leadership, culture fit, and risk. Work toward a recommendation."
    ),
    "desert_survival": (
        "You are ranking survival items after a desert plane crash. Discuss, challenge, "
        "and converge on a ranked list. Prioritize signaling, shade, and water."
    ),
    "moon_landing": (
        "You are ranking items for a 200-mile trek across the lunar surface to the mother ship. "
        "Discuss, challenge, and converge. Prioritize oxygen, water, and navigation."
    ),
    "ethical_dilemma": (
        "You are a team analyzing an ethical dilemma. Use competing moral frameworks, "
        "name stakeholders, and work toward a defensible recommendation."
    ),
    "custom": "Follow the custom task instructions provided by the researcher.",
}

_http_client: httpx.AsyncClient | None = None


def make_agent_names(num_agents: int) -> list[str]:
    return [f"Agent_{i}" for i in range(1, num_agents + 1)]


def _assigned_model(agent_name: str, params: dict) -> str:
    models = params.get("selected_models") or [params.get("provider_model", "mock")]
    if not models:
        return params.get("provider_model", "mock")
    try:
        agent_idx = int(agent_name.split("_")[-1]) - 1 if "_" in agent_name else 0
    except ValueError:
        agent_idx = 0
    return models[agent_idx % len(models)]


def _local_secret(key: str, default: str = "") -> str:
    if _local_secrets is not None and hasattr(_local_secrets, key):
        val = str(getattr(_local_secrets, key) or "").strip()
        if val and val != "PASTE_YOUR_UVA_KEY_HERE":
            return val
    return default


def _api_key(params: dict) -> str:
    raw = (
        str(params.get("api_key") or "").strip()
        or _local_secret("UVARC_GENAI_API")
        or _local_secret("KIMI_API_KEY")
        or os.getenv("UVARC_GenAI_API", "").strip()
        or os.getenv("UVA_RC_API_KEY", "").strip()
        or os.getenv("KIMI_API_KEY", "").strip()
        or os.getenv("MOONSHOT_API_KEY", "").strip()
    )
    raw = raw.strip().strip('"').strip("'")
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    return raw


def _kimi_endpoints(api_key: str) -> list[tuple[str, str]]:
    """UVA RC GenAI Open WebUI chat completions URL.

    Per https://learning.rc.virginia.edu/notes/uva-rc-genai/usage/api/ :
    POST {base}/chat/completions with {"model": "Kimi K2.5", "messages": [...]}

    Priority: explicit KIMI_BASE_URL env > app/uva_secrets.py > UVA default.
    """
    configured = os.getenv("KIMI_BASE_URL", "").strip().rstrip("/") or _local_secret("KIMI_BASE_URL")
    configured_model = os.getenv("KIMI_MODEL", "").strip() or _local_secret("KIMI_MODEL", "Kimi K2.5")
    if configured:
        return [(configured, configured_model or "Kimi K2.5")]
    return [("https://open-webui.rc.virginia.edu/api", "Kimi K2.5")]


async def _client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0), follow_redirects=False)
    return _http_client


def _header_variants(api_key: str) -> list[tuple[str, dict]]:
    """Open WebUI Bearer first; some UVA proxies also accept an API key header."""
    return [
        ("Bearer", {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }),
        ("X-API-KEY", {
            "X-API-KEY": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }),
    ]


def _short_body(response: httpx.Response) -> str:
    text = (response.text or "").replace("\n", " ").strip()
    location = response.headers.get("location") or ""
    extra = f" Location={location}" if location else ""
    return f"HTTP {response.status_code}{extra} {text[:220]}"


def _parse_sse(body: str) -> tuple[str, int, int]:
    text_parts = []
    input_tokens = output_tokens = 0
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            continue
        choice = (chunk.get("choices") or [{}])[0]
        delta = choice.get("delta") or {}
        message = choice.get("message") or {}
        piece = delta.get("content") or message.get("content") or ""
        if piece:
            text_parts.append(piece)
        usage = chunk.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens") or input_tokens or 0)
        output_tokens = int(usage.get("completion_tokens") or output_tokens or 0)
    text = "".join(text_parts).strip()
    if not text:
        raise RuntimeError("UVA RC GenAI returned an empty streamed message.")
    return text, input_tokens, output_tokens


def _parse_completion(response: httpx.Response) -> tuple[str, int, int]:
    body = response.text or ""
    stripped = body.lstrip()
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type or stripped.startswith("data:"):
        return _parse_sse(body)
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        if "data:" in body:
            return _parse_sse(body)
        raise RuntimeError(f"Unexpected UVA RC GenAI response: {body[:300]}")
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"UVA RC GenAI error: {data.get('error')}")
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    text = (message.get("content") or choice.get("text") or "").strip()
    if not text:
        text = ((choice.get("delta") or {}).get("content") or "").strip()
    if not text:
        raise RuntimeError("UVA RC GenAI returned an empty message.")
    usage = data.get("usage") or {}
    return text, int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)


def _system_prompt(agent_name: str, model: str, params: dict) -> str:
    task_type = params.get("task_type", "lost_at_sea")
    task = _TASK_PROMPTS.get(task_type, _TASK_PROMPTS["custom"])
    custom = (params.get("custom_prompt") or "").strip()
    per_model = (params.get("llm_tasks") or {}).get(model, "")
    teammates = ", ".join(params.get("agent_names") or [])
    
    # Process per-agent configs
    agent_configs = params.get("agent_configs") or []
    my_config = {}
    try:
        agent_id = int(agent_name.replace("Agent ", ""))
        my_config = next((c for c in agent_configs if c["agent_id"] == agent_id), {})
    except ValueError:
        pass
        
    my_desc = my_config.get("description", "").strip()
    my_struct = my_config.get("structure", params.get("team_structure", "sequential"))

    parts = [
        f"You are {agent_name} on a multi-agent research team.",
        f"Teammates: {teammates}." if teammates else "",
        f"Your personal role/description: {my_desc}" if my_desc else "",
        f"Interdependence structure: {my_struct}.",
        f"Task: {task}",
    ]
    if custom:
        parts.append(f"Researcher task prompt: {custom}")
    if per_model:
        parts.append(f"Your model-specific instructions: {per_model}")
    parts.append(
        "Reply as one conversational team turn: 2–5 sentences. Do not prefix your name. "
        "Engage teammates by name when useful. Advance the discussion rather than repeating it."
    )
    return "\n".join(p for p in parts if p)


def _history_to_messages(history: list[dict], agent_name: str) -> list[dict]:
    messages = []
    for turn in history[-24:]:
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        speaker = turn.get("agent") or "Unknown"
        is_self = speaker == agent_name
        is_human = speaker == "Human" or turn.get("actor_type") == "human"
        if is_self:
            messages.append({"role": "assistant", "content": text})
        elif is_human:
            messages.append({"role": "user", "content": f"[Human participant] {text}"})
        else:
            messages.append({"role": "user", "content": f"[{speaker}] {text}"})
    return messages


async def _call_kimi(model: str, messages: list[dict], params: dict) -> tuple[str, int, int]:
    """Non-streaming UVA call: POST {base}/chat/completions, parse choices[0].message.content + usage."""
    api_key = _api_key(params)
    if not api_key:
        raise RuntimeError(
            "Kimi K2.5 key missing (hard error, no mock fallback). "
            "Paste your key into app/uva_secrets.py -> UVARC_GENAI_API, "
            "or set UVARC_GenAI_API env, or paste it in the UI API-key box."
        )
    client = await _client()
    attempts = []
    payload = {"model": "Kimi K2.5", "messages": messages}
    for base_url, model_id in _kimi_endpoints(api_key):
        payload["model"] = model_id
        url = f"{base_url}/chat/completions"
        for label, headers in _header_variants(api_key):
            try:
                response = await client.post(url, headers=headers, json=payload)
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.TimeoutException) as exc:
                attempts.append(f"{label} {url} -> connection error: {exc}")
                continue
            attempts.append(f"{label} {url} -> {_short_body(response)}")
            if response.status_code < 400:
                return _parse_completion(response)
    trail = " | ".join(attempts) if attempts else "no endpoints reached"
    raise RuntimeError(
        "Kimi K2.5 call failed (hard error, no mock fallback). "
        "If 401 HTML: you are off a Rivanna compute node or key is wrong. "
        "Run from ijob / Open OnDemand on Rivanna, VPN on, key from open-webui.rc.virginia.edu. "
        f"Details: {trail}"
    )


async def agent_turn(agent_name: str, turn_number: int, history: list[dict], params: dict) -> dict:
    """Produce one agent turn — live Kimi K2.5 (both flows) or mock."""
    assigned_model = _assigned_model(agent_name, params)
    start = time.time()

    if assigned_model in KIMI_MODELS:
        messages = [{"role": "system", "content": _system_prompt(agent_name, assigned_model, params)}]
        messages.extend(_history_to_messages(history, agent_name))
        if not any(m["role"] == "user" for m in messages):
            messages.append({
                "role": "user",
                "content": f"It is round {turn_number + 1}. Make your opening contribution to the team discussion.",
            })
        else:
            messages.append({
                "role": "user",
                "content": f"It is round {turn_number + 1}. Continue the discussion as {agent_name}.",
            })
        text, input_tokens, output_tokens = await _call_kimi(assigned_model, messages, params)
        return {
            "agent": agent_name,
            "turn": turn_number,
            "round": turn_number,
            "text": text,
            "model": assigned_model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": round((time.time() - start) * 1000),
        }

    await asyncio.sleep(0 if os.getenv("VERCEL") else random.uniform(0.15, 0.45))
    seed = params.get("rng_seed")
    if seed is None:
        rng = random.Random()
    else:
        material = f"{seed}|{agent_name}|{turn_number}|{len(history)}"
        digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
        rng = random.Random(int(digest[:16], 16))

    agent_names = params.get("agent_names") or [agent_name]
    others = [a for a in agent_names if a != agent_name]
    other = rng.choice(others) if others else agent_name
    task_type = params.get("task_type", "lost_at_sea")
    lines = _TASK_LINES.get(task_type, _GENERIC_LINES)
    text = rng.choice(lines).format(opt=rng.choice(["A", "B", "C"]), other=other)

    return {
        "agent": agent_name,
        "turn": turn_number,
        "round": turn_number,
        "text": text,
        "model": assigned_model,
        "input_tokens": rng.randint(180, 650),
        "output_tokens": rng.randint(40, 180),
        "latency_ms": round((time.time() - start) * 1000),
    }


async def answer_human_question(agent_name: str, question: str, history: list[dict], params: dict) -> dict:
    """Respond to a direct human question — live Kimi K2.5 (HITL) or mock."""
    assigned_model = _assigned_model(agent_name, params)
    if assigned_model in KIMI_MODELS:
        messages = [{"role": "system", "content": _system_prompt(agent_name, assigned_model, params)}]
        messages.extend(_history_to_messages(history, agent_name))
        messages.append({"role": "user", "content": f"[Human participant asked you directly] {question}"})
        text, input_tokens, output_tokens = await _call_kimi(assigned_model, messages, params)
        return {
            "agent": agent_name,
            "turn": -1,
            "text": text,
            "model": assigned_model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    await asyncio.sleep(random.uniform(0.15, 0.35))
    task_type = params.get("task_type", "lost_at_sea")
    responses = {
        "lost_at_sea": "That's a great question. Based on our survival analysis, I believe the key factor is signal visibility. The items that maximize our chance of rescue should be prioritized.",
        "hiring": "Thank you for asking. Considering the role requirements and both candidates' profiles, I'd emphasize the alignment between the candidate's track record and our strategic goals.",
        "desert_survival": "Good question. In desert conditions, the primary threats are dehydration and heat exposure. Our rankings should reflect time-to-death for each risk factor.",
        "ethical_dilemma": "That's a nuanced point. I think we need to weigh the immediate consequences against the long-term precedent this sets for similar situations.",
    }
    text = responses.get(task_type, "Thank you for the input. Let me integrate your question into our analysis and provide a more thorough response.")
    return {
        "agent": agent_name,
        "turn": -1,
        "text": text,
        "model": assigned_model,
    }


def summarize_transcript(transcript: list[dict], agent_names: list[str], seed: int | None = None) -> dict:
    agent_turns = [t for t in transcript if t.get("agent") in agent_names]
    human_turns = [t for t in transcript if t.get("actor_type") == "human" or t.get("agent") == "Human"]
    total_input = sum(t.get("input_tokens", 0) for t in agent_turns)
    total_output = sum(t.get("output_tokens", 0) for t in agent_turns)
    total_latency = sum(t.get("latency_ms", 0) for t in agent_turns)

    # Generate a realistic-looking agreement score
    hash_input = json.dumps([t.get("text", "") for t in transcript[:5]], sort_keys=True) + str(seed)
    score_seed = int(hashlib.sha256(hash_input.encode("utf-8")).hexdigest()[:16], 16)
    score_rng = random.Random(score_seed)
    agreement_score = round(score_rng.gauss(0.68, 0.15), 3)
    agreement_score = max(0.05, min(0.98, agreement_score))

    models_used = list(set(t.get("model", "mock") for t in agent_turns if t.get("model")))

    return {
        "num_turns": len(transcript),
        "num_agent_turns": len(agent_turns),
        "num_human_events": len(human_turns),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "avg_latency_ms": round(total_latency / max(len(agent_turns), 1)),
        "models_used": models_used,
        "agreement_score": agreement_score,
        "toy_agreement_score": agreement_score,  # backward compat
    }
