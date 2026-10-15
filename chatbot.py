"""Local keyword-matching learning assistant backed by reviewed JSON content."""

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from nltk.tokenize import TreebankWordTokenizer

CONTENT_PATH = Path(__file__).with_name("learning_content.json")
_TOKENIZER = TreebankWordTokenizer()
_GENERIC_TERMS = {"data", "steps", "things", "basics", "help", "question", "topic", "learning"}
_FALLBACK = (
    "I don't have a confident match for that question yet. Try naming a topic such as AI, Python, IoT, cloud computing, data science, cybersecurity, or networking.",
    "I couldn't match that to a topic in my learning guide. Add a little more detail or choose a topic to explore.",
)


def _load_content() -> dict[str, Any]:
    with CONTENT_PATH.open(encoding="utf-8") as content_file:
        return json.load(content_file)


CONTENT = _load_content()
KNOWLEDGE_BASE = CONTENT["knowledge_base"]
QUIZZES = CONTENT["quizzes"]
ROADMAPS = CONTENT["roadmaps"]
TOPICS = [{"id": key, "title": value["title"]} for key, value in QUIZZES.items()]
_TOPIC_ALIASES = {
    "ai_ml": ("artificial intelligence", "machine learning", "generative ai", "deep learning", "neural network", "ai", "ml"),
    "python": ("python",), "iot": ("internet of things", "iot"),
    "cloud": ("cloud computing", "cloud"), "data_science": ("data science",),
    "cybersecurity": ("cybersecurity", "phishing", "malware", "encryption"),
    "networking": ("networking", "dns", "ip address", "router", "tcp"),
    "programming": ("algorithm", "variable", "conditional", "debugging", "database", "api", "git", "html", "javascript"),
    "study_skills": ("study plan", "study strategy", "learning roadmap"),
    "skillsbuild": ("ibm skillsbuild",),
}


def normalize(text: str) -> str:
    """Lowercase and tokenize user text without requiring downloaded NLTK data."""
    return " ".join(
        token.lower() for token in _TOKENIZER.tokenize(text)
        if re.search(r"\w", token)
    )


def _matches(normalized: str, phrase: str) -> bool:
    normalized_phrase = normalize(phrase)
    return bool(normalized_phrase) and f" {normalized_phrase} " in f" {normalized} "


def _entry_score(normalized: str, entry: dict[str, Any]) -> tuple[float, list[str]]:
    matched = [keyword for keyword in entry["keywords"] if _matches(normalized, keyword)]
    useful_tokens = {
        token
        for keyword in matched
        for token in normalize(keyword).split()
        if token not in _GENERIC_TERMS
    }
    if not useful_tokens:
        return 0.0, matched
    # Phrase matches and multiple distinct terms carry more evidence than a single broad word.
    phrase_bonus = max((0.8 for keyword in matched if len(normalize(keyword).split()) > 1), default=0.0)
    score = 3.0 + 1.25 * len(useful_tokens) + phrase_bonus + 0.25 * max(0, len(matched) - 1)
    return score, matched


def generate_answer(message: str) -> dict[str, Any]:
    """Return an answer plus its topic, match confidence, and learning references."""
    normalized = normalize(message)
    if not normalized:
        return {
            "response": "Please enter a question or topic you'd like to learn about.",
            "topic": None, "topic_label": None, "confidence": 0.0,
            "matched_terms": [], "sources": [], "needs_clarification": True,
            "suggested_topics": [],
        }

    if normalized in {"hi", "hello", "hey", "hiya", "howdy", "good morning", "good afternoon", "good evening"}:
        return {
            "response": "Hello! I'm your SkillsBuild Learning Assistant. What would you like to learn about today?",
            "topic": "general", "topic_label": "Getting started", "confidence": 1.0,
            "matched_terms": [], "sources": [], "needs_clarification": False,
            "suggested_topics": [],
        }
    if normalized in {"help", "what can you do", "who are you"}:
        return {
            "response": "I can explain foundational technology topics, suggest a learning roadmap, and give you a short topic quiz. Choose a topic or ask a question to get started.",
            "topic": "general", "topic_label": "Getting started", "confidence": 1.0,
            "matched_terms": [], "sources": [], "needs_clarification": False,
            "suggested_topics": [],
        }
    if normalized in {"thanks", "thank you", "thanks assistant"}:
        return {
            "response": "You're welcome! Keep learning, and ask me whenever you need a hand.",
            "topic": "general", "topic_label": "Getting started", "confidence": 1.0,
            "matched_terms": [], "sources": [], "needs_clarification": False,
            "suggested_topics": [],
        }

    ranked: dict[str, dict[str, Any]] = {}
    for entry in KNOWLEDGE_BASE:
        score, matched = _entry_score(normalized, entry)
        if score <= 0:
            continue
        topic = entry["topic"]
        current = ranked.get(topic)
        if current is None:
            ranked[topic] = {"score": score, "entry": entry, "matched": matched}
        else:
            current["score"] = max(current["score"], score) + (0.15 if matched else 0)
            current["matched"] = sorted(set(current["matched"]) | set(matched))

    if not ranked:
        return {
            "response": _FALLBACK[0], "topic": None, "topic_label": None,
            "confidence": 0.0, "matched_terms": [], "sources": [],
            "needs_clarification": True,
            "suggested_topics": [item["id"] for item in TOPICS[:5]],
        }

    ordered = sorted(ranked.items(), key=lambda item: item[1]["score"], reverse=True)
    topic, match = ordered[0]
    top_score = match["score"]
    confidence = round(min(0.97, 0.48 + 0.055 * (top_score - 3)), 2)
    explicit_topics = [
        topic_id for topic_id, aliases in _TOPIC_ALIASES.items()
        if any(_matches(normalized, alias) for alias in aliases)
    ]
    ambiguous = len(explicit_topics) > 1 or (len(ordered) > 1 and top_score - ordered[1][1]["score"] < 0.6)
    if confidence < 0.55 or ambiguous:
        choices = explicit_topics[:3] if len(explicit_topics) > 1 else [key for key, _ in ordered[:3]]
        labels = [item["title"] for item in TOPICS if item["id"] in choices]
        question = "I found a couple of possible topics. Which one did you mean?" if ambiguous else _FALLBACK[1]
        return {
            "response": question, "topic": None, "topic_label": None,
            "confidence": confidence, "matched_terms": match["matched"],
            "sources": [], "needs_clarification": True,
            "suggested_topics": choices, "suggested_topic_labels": labels,
        }

    entry = match["entry"]
    return {
        "response": entry["responses"][0],
        "topic": topic,
        "topic_label": entry["topic_label"],
        "confidence": confidence,
        "matched_terms": match["matched"][:5],
        "sources": [entry["source"]] if entry.get("source") else [],
        "needs_clarification": False,
        "suggested_topics": [],
    }


def get_response(message: str) -> str:
    """Compatibility helper returning only the answer text."""
    return generate_answer(message)["response"]


class GroqAPIError(RuntimeError):
    """Safe, user-facing error from the optional Groq provider."""


def groq_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def generate_groq_answer(message: str) -> dict[str, Any]:
    """Generate one answer with Groq; send only this prompt, never saved history."""
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise GroqAPIError("Groq is not configured.")

    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b").strip()
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the IBM SkillsBuild Learning Assistant. Give clear, accurate, "
                    "beginner-friendly explanations about technology and digital skills. "
                    "Use concise paragraphs, define jargon, and say when you are uncertain. "
                    "Do not invent citations or claim to have checked current information. "
                    "If a question is outside these learning topics, say so and offer a related topic."
                ),
            },
            {"role": "user", "content": message},
        ],
        "max_completion_tokens": 700,
    }
    request = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise GroqAPIError("Groq rejected the API key. Check the rotated key in GROQ_API_KEY.") from None
        if error.code == 429:
            raise GroqAPIError("Groq rate limit reached. Please wait and try again.") from None
        raise GroqAPIError("Groq could not complete the request (HTTP " + str(error.code) + ").") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        raise GroqAPIError("Groq could not be reached. Showing the local learning guide instead.") from None

    try:
        answer = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise GroqAPIError("Groq returned an unexpected response. Showing the local learning guide instead.") from None
    if not isinstance(answer, str) or not answer.strip():
        raise GroqAPIError("Groq returned an empty answer. Showing the local learning guide instead.")

    result = generate_answer(message)
    result["response"] = answer.strip()
    result["provider"] = "groq"
    result["model"] = model
    return result
