import json
import tempfile
import unittest
from pathlib import Path

from app import app
from chatbot import CONTENT, KNOWLEDGE_BASE, generate_answer, get_response


class ChatbotTests(unittest.TestCase):
    def test_content_catalog_is_structured_and_has_sources(self):
        self.assertGreaterEqual(len(KNOWLEDGE_BASE), 25)
        self.assertTrue(all(entry.get("id") and entry.get("topic") and entry.get("source") for entry in KNOWLEDGE_BASE))

    def test_supported_questions_include_topic_and_source(self):
        cases = {
            "What is AI?": "ai_ml",
            "What is Python?": "python",
            "Explain IoT sensors": "iot",
            "How does cloud computing work?": "cloud",
            "What is DNS?": "networking",
        }
        for question, topic in cases.items():
            with self.subTest(question=question):
                result = generate_answer(question)
                self.assertEqual(result["topic"], topic)
                self.assertTrue(result["response"])
                self.assertTrue(result["sources"])

    def test_greeting_and_unknown_question(self):
        self.assertIn("Hello", get_response("hello!"))
        result = generate_answer("What is the capital of Neptune?")
        self.assertIsNone(result["topic"])
        self.assertTrue(result["needs_clarification"])

    def test_ambiguous_question_requests_clarification(self):
        result = generate_answer("Tell me about Python and cloud computing.")
        self.assertTrue(result["needs_clarification"])
        self.assertGreaterEqual(len(result.get("suggested_topic_labels", [])), 2)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.temp_dir = tempfile.TemporaryDirectory()
        app.config["FEEDBACK_PATH"] = Path(self.temp_dir.name) / "feedback.jsonl"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_home_and_health(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertGreaterEqual(health.json["knowledge_entries"], 25)

    def test_chat_validation_and_metadata(self):
        self.assertEqual(self.client.post("/chat", json={"message": "  "}).status_code, 400)
        self.assertEqual(self.client.post("/chat", json={"message": "x" * 2001}).status_code, 400)
        self.assertEqual(self.client.post("/chat", data="no json").status_code, 415)
        response = self.client.post("/chat", json={"message": "What is Python?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["topic"], "python")
        self.assertTrue(response.json["sources"])

    def test_roadmap_and_quiz_endpoints(self):
        roadmaps = self.client.get("/api/roadmaps").json["roadmaps"]
        self.assertGreaterEqual(len(roadmaps), 5)
        self.assertTrue(roadmaps[0]["steps"])
        topics = self.client.get("/api/quiz/topics").json["topics"]
        self.assertGreaterEqual(len(topics), 7)
        quiz = self.client.get("/api/quiz?topic=python")
        self.assertEqual(quiz.status_code, 200)
        self.assertNotIn("answer", quiz.json["questions"][0])
        questions = quiz.json["questions"]
        answers = {question["id"]: 0 for question in questions}
        result = self.client.post("/api/quiz/submit", json={"topic": "python", "answers": answers})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json["score"], len(questions))
        self.assertEqual(self.client.get("/api/quiz?topic=missing").status_code, 404)
        self.assertEqual(self.client.post("/api/quiz/submit", json={"topic": "python", "answers": {}}).status_code, 400)

    def test_feedback_is_validated_and_stored_without_question_text(self):
        bad = self.client.post("/api/feedback", json={"rating": "maybe", "topic": "python"})
        self.assertEqual(bad.status_code, 400)
        good = self.client.post("/api/feedback", json={"rating": "up", "topic": "python"})
        self.assertEqual(good.status_code, 200)
        lines = app.config["FEEDBACK_PATH"].read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(lines), 1)
        record = json.loads(lines[0])
        self.assertEqual(record["topic"], "python")
        self.assertNotIn("message", record)


if __name__ == "__main__":
    unittest.main()
