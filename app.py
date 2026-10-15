"""Flask routes for the local IBM SkillsBuild Learning Assistant."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re

from flask import Flask, jsonify, render_template, request

from chatbot import (
    CONTENT, QUIZZES, ROADMAPS, TOPICS, GroqAPIError,
    generate_answer, generate_groq_answer, groq_configured,
)

def _load_local_env_file():
    """Load only the provider settings from the ignored project .env file."""
    env_file = Path(__file__).with_name(".env")
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.strip().partition("=")
        if not separator or key not in {"GROQ_API_KEY", "GROQ_MODEL"}:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
            value = value[1:-1]
        if value and not os.environ.get(key):
            os.environ[key] = value


_load_local_env_file()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
app.config["FEEDBACK_PATH"] = Path(__file__).with_name("data") / "feedback.jsonl"


def _json_object():
    if not request.is_json:
        return None, (jsonify(error="Request body must be JSON."), 415)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, (jsonify(error="Request body must be a JSON object."), 400)
    return payload, None


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(
        status="ok",
        knowledge_entries=len(CONTENT["knowledge_base"]),
        ai_provider="groq" if groq_configured() else "local",
        model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b") if groq_configured() else None,
    )


@app.post("/chat")
def chat():
    payload, error = _json_object()
    if error:
        return error
    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        return jsonify(error="Please enter a message."), 400
    if len(message) > 2000:
        return jsonify(error="Messages must be 2,000 characters or fewer."), 400
    clean_message = message.strip()
    if groq_configured():
        try:
            return jsonify(generate_groq_answer(clean_message))
        except GroqAPIError as error:
            app.logger.warning("Groq request failed: %s", error)
            fallback = generate_answer(clean_message)
            fallback["provider"] = "local"
            fallback["provider_message"] = str(error)
            return jsonify(fallback)
    result = generate_answer(clean_message)
    result["provider"] = "local"
    return jsonify(result)


@app.get("/api/roadmaps")
def roadmaps():
    return jsonify(roadmaps=ROADMAPS)


@app.get("/api/quiz/topics")
def quiz_topics():
    return jsonify(topics=TOPICS)


@app.get("/api/quiz")
def quiz():
    topic = request.args.get("topic", "").strip()
    quiz_data = QUIZZES.get(topic) if isinstance(topic, str) else None
    if quiz_data is None:
        return jsonify(error="Choose a valid quiz topic."), 404
    public_questions = [
        {"id": q["id"], "prompt": q["prompt"], "options": q["options"]}
        for q in quiz_data["questions"]
    ]
    return jsonify(topic=topic, title=quiz_data["title"], questions=public_questions)


@app.post("/api/quiz/submit")
def quiz_submit():
    payload, error = _json_object()
    if error:
        return error
    topic = payload.get("topic")
    answers = payload.get("answers")
    quiz_data = QUIZZES.get(topic) if isinstance(topic, str) else None
    if quiz_data is None or not isinstance(answers, dict):
        return jsonify(error="A valid topic and answers object are required."), 400
    if len(answers) != len(quiz_data["questions"]):
        return jsonify(error="Submit one answer for every question."), 400
    results = []
    score = 0
    for question in quiz_data["questions"]:
        answer = answers.get(question["id"])
        if not isinstance(answer, int) or isinstance(answer, bool) or not 0 <= answer < len(question["options"]):
            return jsonify(error="Each answer must be a valid option index."), 400
        correct = answer == question["answer"]
        score += int(correct)
        results.append({
            "id": question["id"], "correct": correct,
            "answer": question["answer"], "explanation": question["explanation"],
        })
    return jsonify(score=score, total=len(results), results=results)


@app.post("/api/feedback")
def feedback():
    payload, error = _json_object()
    if error:
        return error
    rating = payload.get("rating")
    topic = payload.get("topic", "general")
    if not isinstance(rating, str) or rating not in {"up", "down"}:
        return jsonify(error="Rating must be 'up' or 'down'."), 400
    if not isinstance(topic, str) or not re.fullmatch(r"[a-z0-9_-]{1,40}", topic):
        return jsonify(error="Topic is invalid."), 400
    record = {"rating": rating, "topic": topic, "created_at": datetime.now(timezone.utc).isoformat()}
    feedback_path = Path(app.config["FEEDBACK_PATH"])
    feedback_path.parent.mkdir(parents=True, exist_ok=True)
    with feedback_path.open("a", encoding="utf-8") as feedback_file:
        feedback_file.write(json.dumps(record, ensure_ascii=False) + "\n")
    return jsonify(message="Thanks for your feedback.")


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="Request is too large."), 413


if __name__ == "__main__":
    app.run(
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
    )
