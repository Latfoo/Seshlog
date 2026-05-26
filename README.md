# Pomodoro API

A REST API for tracking Pomodoro work sessions, built with FastAPI and PostgreSQL.

Sessions can be labelled, tagged, and filtered by tag, making it easy to see how you spend your time across different topics.

The repository also includes a browser-based demo UI (built with AI assistance) to interact with the API visually.

## Features

- User registration and login with JWT authentication
- Each user can only access their own sessions
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
| Auth | JWT (python-jose) + bcrypt |

## Running locally

**1. Clone and set up the environment**
```bash
git clone https://github.com/Latfoo/pomodoro-app
cd pomodoro-app
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**2. Set up PostgreSQL**

If you don't have PostgreSQL installed:
```bash
sudo apt install postgresql postgresql-contrib   # Ubuntu/Debian
brew install postgresql && brew services start postgresql  # macOS
```

Then create a database and user:
```bash
sudo -u postgres psql
```
```sql
CREATE USER your_user WITH PASSWORD 'your_password';
CREATE DATABASE pomodoro OWNER your_user;
\q
```

**3. Configure the database**

Create a `.env` file in the project root:
```
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=pomodoro
SECRET_KEY=your-secret-key
```

**4. Start the server**
```bash
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000` and the interactive docs are at `http://localhost:8000/docs`.

## API overview

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user, returns a JWT token |
| `POST` | `/auth/login` | Log in with email and password, returns a JWT token |

All session endpoints require the token in the `Authorization` header:
```
Authorization: Bearer <your-token>
```

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

**Register**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'
```

**Create a session**
```bash
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"task_label": "Write unit tests", "duration_minutes": 25, "tags": ["work", "backend"]}'
```

**List sessions filtered by tag**
```bash
curl http://localhost:8000/sessions?tag=backend \
  -H "Authorization: Bearer <your-token>"
```

**Mark a session as completed**
```bash
curl -X PATCH http://localhost:8000/sessions/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"status": "completed"}'
```

## Project structure

```
pomodoro-app/
├── app/
│   ├── api/
│   │   ├── auth.py           # register and login endpoints
│   │   ├── frontend.py       # serves the demo UI
│   │   ├── health.py         # health check endpoint
│   │   ├── sessions.py       # session CRUD endpoints
│   │   └── tags.py           # tags endpoint
│   ├── core/
│   │   ├── config.py         # environment/settings
│   │   ├── logging.py        # logging setup
│   │   └── security.py       # JWT creation, decoding, and auth dependency
│   ├── db/
│   │   └── schema.py         # database table definitions
│   ├── models/
│   │   ├── session.py        # session request/response models
│   │   ├── tag.py            # tag request/response models
│   │   ├── token.py          # TokenResponse model
│   │   └── user.py           # UserCreate and User models
│   ├── services/
│   │   ├── auth_service.py   # registration and login logic
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

**UserTable**: `id`, `email`, `hashed_password`

**PomodoroSession**: `id`, `user_id` (Foreign Key (FK) to UserTable), `task_label`, `duration_minutes`, `started_at`, `status`

**Tag**: `id`, `name`

**SessionTagLink** (join table): `session_id` (FK), `tag_id` (FK)

A user has many sessions. A session has many tags and a tag can belong to many sessions, linked through SessionTagLink. Tags are stored once and reused. Deleting a session automatically cleans up orphaned tag links.
