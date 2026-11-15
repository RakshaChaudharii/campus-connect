import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from flask import Flask, current_app, jsonify, request, send_from_directory, session
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
ALLOWED_PAGES = {
    "index.html",
    "information.html",
    "ask-seniors.html",
    "seniors.html",
    "projects.html",
    "login.html",
    "register.html",
}
QUESTION_CATEGORIES = {"academics", "campus", "career", "projects"}
PROJECT_CATEGORIES = {"web", "ai", "design", "social"}
DEPARTMENTS = {
    "Computer Science and Engineering",
    "Information Science and Engineering",
    "Electronics and Communication",
    "Mechanical Engineering",
    "Electrical and Electronics",
    "Other",
}
YEARS = {"1st Year", "2nd Year", "3rd Year", "4th Year"}


@lru_cache(maxsize=4)
def mongo_client(uri):
    return MongoClient(uri, serverSelectionTimeoutMS=5000)


def serialize_user(user):
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "department": user.get("department", ""),
        "year": user.get("year", ""),
        "bio": user.get("bio", ""),
        "topics": user.get("topics", []),
        "created_at": user.get("created_at"),
    }


def serialize_senior(user):
    profile = serialize_user(user)
    profile.pop("email", None)
    return profile


def serialize_question(question):
    return {
        "id": str(question["_id"]),
        "title": question["title"],
        "body": question["body"],
        "category": question["category"],
        "status": question.get("status", "open"),
        "answer_count": question.get("answer_count", 0),
        "author": question.get("author_name", "Student"),
        "author_id": question["author_id"],
        "created_at": question["created_at"],
    }


def serialize_project(project):
    return {
        "id": str(project["_id"]),
        "title": project["title"],
        "description": project["description"],
        "category": project["category"],
        "url": project.get("url", ""),
        "author": project.get("author_name", "Student"),
        "created_at": project["created_at"],
    }


def api_error(message, status):
    return jsonify({"error": message}), status


def request_data():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def text_field(data, field, label, maximum, required=True):
    value = data.get(field, "")
    if not isinstance(value, str):
        return None, f"{label} must be text."
    value = value.strip()
    if required and not value:
        return None, f"{label} is required."
    if len(value) > maximum:
        return None, f"{label} must be {maximum} characters or fewer."
    return value, None


def create_app(test_config=None):
    load_dotenv(ROOT / ".env")
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "local-development-key-change-me"),
        MONGO_URI=os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017"),
        MONGO_DB_NAME=os.getenv("MONGO_DB_NAME", "campus_connect"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.getenv("FLASK_ENV") == "production",
    )
    if test_config:
        app.config.update(test_config)

    def get_db():
        return mongo_client(app.config["MONGO_URI"])[app.config["MONGO_DB_NAME"]]

    def current_user():
        user_id = session.get("user_id")
        if not user_id:
            return None
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            session.clear()
            return None
        user = get_db().users.find_one({"_id": object_id}, {"password_hash": 0})
        if user is None:
            session.clear()
            return None
        return serialize_user(user)

    def require_user():
        user = current_user()
        if user is None:
            return None, api_error("Please log in to continue.", 401)
        return user, None

    @app.after_request
    def set_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.errorhandler(PyMongoError)
    def database_error(_exception):
        app.logger.exception("MongoDB request failed")
        return api_error(
            "The database is unavailable. Check MONGO_URI and confirm MongoDB is reachable.",
            503,
        )

    @app.errorhandler(404)
    def not_found(_exception):
        return api_error("The requested resource was not found.", 404)

    @app.get("/")
    def home():
        return send_from_directory(ROOT, "index.html")

    @app.get("/<page>")
    def page(page):
        if page not in ALLOWED_PAGES:
            return api_error("Page not found.", 404)
        return send_from_directory(ROOT, page)

    @app.get("/style.css")
    def stylesheet():
        return send_from_directory(ROOT, "style.css")

    @app.get("/app.js")
    def javascript():
        return send_from_directory(ROOT, "app.js")

    @app.get("/api/health")
    def health():
        get_db().command("ping")
        return jsonify({"status": "ok", "database": "connected"})

    @app.post("/api/auth/register")
    def register():
        data = request_data()
        name, problem = text_field(data, "name", "Name", 80)
        if problem:
            return api_error(problem, 400)
        email, problem = text_field(data, "email", "Email", 254)
        if problem:
            return api_error(problem, 400)
        email = email.lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            return api_error("Enter a valid email address.", 400)
        password = data.get("password", "")
        if not isinstance(password, str) or not password:
            return api_error("Password is required.", 400)
        if len(password) < 8 or len(password) > 128:
            return api_error("Password must be between 8 and 128 characters.", 400)

        role = data.get("role", "junior")
        if not isinstance(role, str) or role not in {"junior", "senior"}:
            return api_error("Choose junior or senior as your account type.", 400)
        department = data.get("department", "")
        year = data.get("year", "")
        if not isinstance(department, str) or department not in DEPARTMENTS:
            return api_error("Choose a valid department.", 400)
        if not isinstance(year, str) or year not in YEARS:
            return api_error("Choose a valid year of study.", 400)
        bio, problem = text_field(data, "bio", "Bio", 500, required=False)
        if problem:
            return api_error(problem, 400)
        topics = data.get("topics", [])
        if not isinstance(topics, list) or len(topics) > 10 or any(
            not isinstance(topic, str) or len(topic.strip()) > 40 for topic in topics
        ):
            return api_error("Enter up to 10 mentoring topics, each 40 characters or fewer.", 400)
        topics = [topic.strip() for topic in topics if topic.strip()]

        user = {
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": role,
            "department": department,
            "year": year,
            "bio": bio,
            "topics": topics,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            db = get_db()
            db.users.create_index("email", unique=True)
            result = db.users.insert_one(user)
        except DuplicateKeyError:
            return api_error("An account with this email already exists.", 409)
        session.clear()
        session["user_id"] = str(result.inserted_id)
        user["_id"] = result.inserted_id
        return jsonify({"user": serialize_user(user)}), 201

    @app.post("/api/auth/login")
    def login():
        data = request_data()
        email = data.get("email", "")
        password = data.get("password", "")
        if not isinstance(email, str) or not isinstance(password, str):
            return api_error("Email and password are required.", 400)
        if not email.strip() or len(email) > 254 or not password or len(password) > 128:
            return api_error("Enter a valid email address and password.", 400)
        user = get_db().users.find_one({"email": email.strip().lower()})
        if user is None or not check_password_hash(user["password_hash"], password):
            return api_error("Email or password is incorrect.", 401)
        session.clear()
        session["user_id"] = str(user["_id"])
        return jsonify({"user": serialize_user(user)})

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    @app.get("/api/me")
    def me():
        return jsonify({"user": current_user()})

    @app.get("/api/questions")
    def list_questions():
        query = {}
        category = request.args.get("category", "all")
        status = request.args.get("status", "all")
        search = request.args.get("search", "").strip()
        if category != "all":
            query["category"] = category
        if status != "all":
            query["status"] = status
        if search:
            pattern = re.escape(search[:100])
            query["$or"] = [
                {"title": {"$regex": pattern, "$options": "i"}},
                {"body": {"$regex": pattern, "$options": "i"}},
            ]
        questions = get_db().questions.find(query).sort("created_at", -1).limit(100)
        return jsonify({"questions": [serialize_question(item) for item in questions]})

    @app.post("/api/questions")
    def create_question():
        user, response = require_user()
        if response:
            return response
        data = request_data()
        title, problem = text_field(data, "title", "Title", 160)
        if problem:
            return api_error(problem, 400)
        body, problem = text_field(data, "body", "Question", 5000)
        if problem:
            return api_error(problem, 400)
        category = data.get("category")
        if not isinstance(category, str) or category not in QUESTION_CATEGORIES:
            return api_error("Choose a valid question category.", 400)
        question = {
            "title": title,
            "body": body,
            "category": category,
            "status": "open",
            "answer_count": 0,
            "author_id": user["id"],
            "author_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = get_db().questions.insert_one(question)
        question["_id"] = result.inserted_id
        return jsonify({"question": serialize_question(question)}), 201

    @app.get("/api/questions/<question_id>")
    def get_question(question_id):
        try:
            object_id = ObjectId(question_id)
        except InvalidId:
            return api_error("Question not found.", 404)
        db = get_db()
        question = db.questions.find_one({"_id": object_id})
        if question is None:
            return api_error("Question not found.", 404)
        answers = db.answers.find({"question_id": question_id}).sort("created_at", 1)
        return jsonify({
            "question": serialize_question(question),
            "answers": [
                {
                    "id": str(answer["_id"]),
                    "body": answer["body"],
                    "author": answer["author_name"],
                    "created_at": answer["created_at"],
                }
                for answer in answers
            ],
        })

    @app.post("/api/questions/<question_id>/answers")
    def create_answer(question_id):
        user, response = require_user()
        if response:
            return response
        if user["role"] != "senior":
            return api_error("Only senior accounts can respond to questions.", 403)
        try:
            object_id = ObjectId(question_id)
        except InvalidId:
            return api_error("Question not found.", 404)
        db = get_db()
        if db.questions.find_one({"_id": object_id}) is None:
            return api_error("Question not found.", 404)
        body, problem = text_field(request_data(), "body", "Response", 5000)
        if problem:
            return api_error(problem, 400)
        db.answers.insert_one({
            "question_id": question_id,
            "body": body,
            "author_id": user["id"],
            "author_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        db.questions.update_one(
            {"_id": object_id},
            {"$inc": {"answer_count": 1}, "$set": {"status": "answered"}},
        )
        return jsonify({"ok": True}), 201

    @app.get("/api/seniors")
    def list_seniors():
        users = get_db().users.find(
            {"role": "senior"}, {"password_hash": 0}
        ).sort("name", 1).limit(100)
        return jsonify({"seniors": [serialize_senior(user) for user in users]})

    @app.get("/api/projects")
    def list_projects():
        category = request.args.get("category", "all")
        query = {} if category == "all" else {"category": category}
        projects = get_db().projects.find(query).sort("created_at", -1).limit(100)
        return jsonify({"projects": [serialize_project(project) for project in projects]})

    @app.post("/api/projects")
    def create_project():
        user, response = require_user()
        if response:
            return response
        data = request_data()
        title, problem = text_field(data, "title", "Title", 120)
        if problem:
            return api_error(problem, 400)
        description, problem = text_field(data, "description", "Description", 2000)
        if problem:
            return api_error(problem, 400)
        category = data.get("category")
        if not isinstance(category, str) or category not in PROJECT_CATEGORIES:
            return api_error("Choose a valid project category.", 400)
        url, problem = text_field(data, "url", "Project link", 2048, required=False)
        if problem:
            return api_error(problem, 400)
        if url and not re.fullmatch(r"https?://\S+", url):
            return api_error("Project link must start with http:// or https://.", 400)
        project = {
            "title": title,
            "description": description,
            "category": category,
            "url": url,
            "author_id": user["id"],
            "author_name": user["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = get_db().projects.insert_one(project)
        project["_id"] = result.inserted_id
        return jsonify({"project": serialize_project(project)}), 201

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
    )
