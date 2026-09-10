"""Mock agent backend — realistic demo responses for prototype.

Replace ``agent_turn`` with the real LLM/agent implementation later.  The
rest of the web application only depends on the return shape documented here.
"""

import asyncio
import random
import hashlib
import json
import time

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


def make_agent_names(num_agents: int) -> list[str]:
    return [f"Agent_{i}" for i in range(1, num_agents + 1)]


async def agent_turn(agent_name: str, turn_number: int, history: list[dict], params: dict) -> dict:
    """Produce one agent turn with realistic mock responses."""
    start = time.time()
    await asyncio.sleep(random.uniform(0.15, 0.45))
    elapsed_ms = round((time.time() - start) * 1000)

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

    # Pick task-appropriate lines
    task_type = params.get("task_type", "lost_at_sea")
    lines = _TASK_LINES.get(task_type, _GENERIC_LINES)
    text = rng.choice(lines).format(opt=rng.choice(["A", "B", "C"]), other=other)

    # Determine assigned LLM model
    models = params.get("selected_models") or [params.get("provider_model", "mock")]
    try:
        agent_idx = int(agent_name.split("_")[-1]) - 1 if "_" in agent_name else 0
    except ValueError:
        agent_idx = 0
    assigned_model = models[agent_idx % len(models)]

    # Simulate token counts
    input_tokens = rng.randint(180, 650)
    output_tokens = rng.randint(40, 180)

    return {
        "agent": agent_name,
        "turn": turn_number,
        "round": turn_number,
        "text": text,
        "model": assigned_model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "latency_ms": elapsed_ms,
    }


async def answer_human_question(agent_name: str, question: str, history: list[dict], params: dict) -> dict:
    """Mock direct response to a human question."""
    await asyncio.sleep(random.uniform(0.15, 0.35))
    task_type = params.get("task_type", "lost_at_sea")
    responses = {
        "lost_at_sea": f"That's a great question. Based on our survival analysis, I believe the key factor is signal visibility. The items that maximize our chance of rescue should be prioritized.",
        "hiring": f"Thank you for asking. Considering the role requirements and both candidates' profiles, I'd emphasize the alignment between the candidate's track record and our strategic goals.",
        "desert_survival": f"Good question. In desert conditions, the primary threats are dehydration and heat exposure. Our rankings should reflect time-to-death for each risk factor.",
        "ethical_dilemma": f"That's a nuanced point. I think we need to weigh the immediate consequences against the long-term precedent this sets for similar situations.",
    }
    text = responses.get(task_type, f"Thank you for the input. Let me integrate your question into our analysis and provide a more thorough response.")
    return {
        "agent": agent_name,
        "turn": -1,
        "text": text,
        "model": params.get("provider_model", "mock"),
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
