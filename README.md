# Pomodoro API

A REST API for tracking Pomodoro work sessions, built with FastAPI and PostgreSQL.

Sessions can be labelled, tagged, and filtered by tag, making it easy to see how you spend your time across different topics.

The repository also includes a browser-based demo UI (built with AI assistance) to interact with the API visually.

## Features

- Create, update, and delete work sessions
- Assign multiple tags to a session (many-to-many)
- Filter session history by tag
- Session statuses: `in_progress`, `paused`, `completed`
- Input validation on all endpoints (length limits, allowed characters, value ranges)
- Auto-generated interactive API docs at `/docs`

## Tech stack

| Layer | Technology |
|-------|------------|
| API | FastAPI |
| ORM | SQLModel (built on SQLAlchemy) |
| Database | PostgreSQL |
| Validation | Pydantic v2 |

## Running locally

**1. Clone and set up the environment**
```bash
git clone <repo-url>
cd pomodoro-app
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**2. Configure the database**

Create a `.env` file in the project root:
```
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=pomodoro
```

**3. Start the server**
```bash
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000` and the interactive docs are at `http://localhost:8000/docs`.

## API overview

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create a new session |
| `GET` | `/sessions` | List all sessions (optional `?tag=` filter) |
| `GET` | `/sessions/{id}` | Get a single session |
| `PATCH` | `/sessions/{id}` | Update label, duration, status, or tags |
| `DELETE` | `/sessions/{id}` | Delete a session |

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tags` | List all tags that have at least one session |

## Example requests

**Create a session**
```bash
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"task_label": "Write unit tests", "duration_minutes": 25, "tags": ["work", "backend"]}'
```

**List sessions filtered by tag**
```bash
curl http://localhost:8000/sessions?tag=backend
```

**Mark a session as completed**
```bash
curl -X PATCH http://localhost:8000/sessions/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

## Project structure

```
pomodoro-app/
├── app/
│   ├── api/
│   │   ├── frontend.py       # serves the demo UI
│   │   ├── health.py         # health check endpoint
│   │   ├── sessions.py       # session CRUD endpoints
│   │   └── tags.py           # tags endpoint
│   ├── core/
│   │   ├── config.py         # environment/settings
│   │   └── logging.py        # logging setup
│   ├── db/
│   │   └── schema.py         # database table definitions
│   ├── models/
│   │   ├── session.py        # session request/response models
│   │   └── tag.py            # tag request/response models
│   ├── services/
│   │   ├── session_service.py  # session business logic
│   │   └── tag_service.py      # tag business logic
│   └── main.py               # app entry point
├── frontend/
│   └── src/
│       └── app.ts            # TypeScript source for the demo UI
├── static/
│   ├── index.html            # demo UI HTML
│   ├── app.js                # compiled frontend JS
│   └── styles.css            # demo UI styles
├── .env                      # local environment variables (not committed)
├── requirements.txt
└── README.md
```

## Data model

Three tables with a many-to-many relationship between sessions and tags:

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   PomodoroSession   │         │  SessionTagLink  │         │     Tag     │
├─────────────────────┤         ├──────────────────┤         ├─────────────┤
│ id                  │◄────────│ session_id       │         │ id          │
│ task_label          │         │ tag_id           │────────►│ name        │
│ duration_minutes    │         └──────────────────┘         └─────────────┘
│ started_at          │
│ status              │
└─────────────────────┘
```

Tags are stored once and reused across sessions. Deleting a session automatically cleans up any orphaned tags.
