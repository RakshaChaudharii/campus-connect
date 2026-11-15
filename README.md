# Campus Connect

Campus Connect is a student knowledge-sharing platform built with HTML, CSS,
vanilla JavaScript, Flask, and MongoDB. Juniors can post discussion threads;
senior accounts can respond. Students can browse senior profiles and publish
projects.

## Features

- Junior and senior registration with password hashing and session login.
- Searchable, filterable question threads and senior responses.
- Senior directory with department and topic filters.
- Student project showcase with optional project links.
- MongoDB-backed users, questions, answers, and projects.
- Responsive interface and API error messages.

## Run locally

1. Install Python 3.10 or newer.
2. From this folder, create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Install dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

4. Create a `.env` file using `.env.example` as a template. Set `SECRET_KEY`
   and `MONGO_URI`. Keep `.env` private and do not commit it.
5. Start the server:

   ```powershell
   python app.py
   ```

6. Open <http://127.0.0.1:5000>. Do not open the HTML files directly or use a
   static Live Server; the frontend calls the Flask API.

Visit `/api/health` to check the MongoDB connection. The app uses the
`campus_connect` database by default; set `MONGO_DB_NAME` to change it.

## Configuration

- `SECRET_KEY`: long, random value used to sign login sessions.
- `MONGO_URI`: MongoDB connection string.
- `MONGO_DB_NAME`: database name (defaults to `campus_connect`).
- `HOST`, `PORT`: server bind address and port.
- `FLASK_DEBUG`: set to `true` only during local development.

Create a senior account by selecting the senior role during registration.
Senior bio and comma-separated mentoring topics are optional.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/me`, `GET /api/health`
- `GET /api/questions`, `POST /api/questions`
- `GET /api/questions/<id>`, `POST /api/questions/<id>/answers`
- `GET /api/seniors`
- `GET /api/projects`, `POST /api/projects`

MongoDB stores data in the `users`, `questions`, `answers`, and `projects`
collections.
