# IBM SkillsBuild Learning Assistant

A Flask learning companion for foundational AI, machine learning, Python, IoT, cloud computing, data science, cybersecurity, networking, and programming. It uses the reviewed local catalog by default and can use Groq chat completions when a key is configured.

## Features

- Responsive chat with topic detection, ambiguity clarification, confidence hints, related topic suggestions, and curated source links.
- Conversation history saved in the browser, with search, rename, reopen, delete, copy, export, and light/dark themes.
- Topic quizzes with explanations and score summaries.
- Guided learning paths with step-by-step progress saved in the browser.
- Helpful/not-helpful answer feedback, stored locally by the Flask app without saving the question text.
- Keyboard and screen-reader support, mobile navigation, and accessible dialogs.
- JSON API validation, health endpoint, structured content catalog, and automated unit tests.

## Requirements and setup

- Python 3.9 or newer
- pip

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Optional: copy .env.example to .env and enter a newly rotated GROQ_API_KEY locally.
python app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000). No NLTK corpus download is required. Flask debug mode is off by default; set `FLASK_DEBUG=1` only for local development. The built-in Flask server is not intended for production deployment.

## Checks

Run the automated suite with:

```powershell
python -m unittest discover -v
```

## API

- `POST /chat` with `{"message": "What is cloud computing?"}` returns an answer with topic, confidence, matched terms, and sources.
- `GET /api/health` reports application readiness.
- `GET /api/roadmaps` returns learning paths.
- `GET /api/quiz/topics` lists quiz topics.
- `GET /api/quiz?topic=python` returns questions without answer keys.
- `POST /api/quiz/submit` evaluates submitted answers and returns explanations.
- `POST /api/feedback` records a rating, topic, and timestamp in `data/feedback.jsonl`; it does not record question text.

Conversation history, theme, and learning-path progress are saved in browser local storage on this device. Feedback is stored in a local file and should be treated as project data.

## Content scope

Without `GROQ_API_KEY`, answers use the curated content in `learning_content.json`. With a key, the current chat prompt is sent to Groq at `api.groq.com` for generation; saved browser history is not included. Never commit `.env`, and revoke keys that have been pasted into chats or source files. Quiz questions and roadmap content remain local.
