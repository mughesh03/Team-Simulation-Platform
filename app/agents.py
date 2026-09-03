"""Mock agent backend.

Replace ``agent_turn`` with the real LLM/agent implementation later.  The
rest of the web application only depends on the return shape documented here.
"""

import asyncio
import random
import hashlib
import json

_CANNED_LINES = [
    "I think we should prioritize option {opt}.",
    "Building on what {other} said, I'd flag a risk we haven't covered.",
    "I disagree — the evidence points a different way.",
    "Let's compare the assumptions behind the alternatives before deciding.",
    "Can we get more context before deciding?",
    "I agree with the direction so far, but we should test one more assumption.",
    "The human input changes the evidence set; let's factor it into the decision.",
]


def make_agent_names(num_agents: int) -> list[str]:
    return [f"Agent_{i}" for i in range(1, num_agents + 1)]


async def agent_turn(agent_name: str, turn_number: int, history: list[dict], params: dict) -> dict:
    """Produce one mock agent turn.

    A real backend can build a prompt from ``history`` + ``params`` and call an
    LLM here. Keep the returned mapping compatible with::

        {"agent": str, "turn": int, "text": str}
    """
    await asyncio.sleep(random.uniform(0.20, 0.55))
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
    text = rng.choice(_CANNED_LINES).format(
        opt=rng.choice(["A", "B", "C"]), other=other
    )
    return {"agent": agent_name, "turn": turn_number, "text": text}


async def answer_human_question(agent_name: str, question: str, history: list[dict], params: dict) -> dict:
    """Mock direct response to a human question."""
    await asyncio.sleep(random.uniform(0.15, 0.35))
    return {
        "agent": agent_name,
        "turn": -1,
        "text": f"You asked me: '{question}'. In the real platform, {agent_name} would answer using its LLM context.",
    }


def summarize_transcript(transcript: list[dict], agent_names: list[str], seed: int | None = None) -> dict:
    agent_turns = [t for t in transcript if t.get("agent") in agent_names]
    human_turns = [t for t in transcript if t.get("actor_type") == "human" or t.get("agent") == "Human"]
    return {
        "num_turns": len(transcript),
        "num_agent_turns": len(agent_turns),
        "num_human_events": len(human_turns),
        "toy_agreement_score": round(
            random.Random(int(hashlib.sha256((json.dumps(transcript, sort_keys=True) + str(seed)).encode("utf-8")).hexdigest()[:16], 16)).uniform(0, 1), 2
        ),
    }
