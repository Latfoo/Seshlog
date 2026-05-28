# Pomodoro App

A Pomodoro timer with user accounts and session history. You can start work sessions, tag them by topic, pause and resume them, and later filter your history by tag to see where your time went.

The backend is a REST API built with FastAPI and PostgreSQL. Authentication uses JWT stored in HttpOnly cookies with bcrypt password hashing. A TypeScript frontend is included.

## Features

- User registration, login, and logout
- Each user can only access their own sessions
- Create, update, and delete work sessions
- Assign multiple tags to a session (many-to-many)
- Filter session history by tag
- Session statuses: `in_progress`, `paused`, `completed`
- Pause duration tracking (`paused_at`, `total_paused_seconds`)
- Input validation on all endpoints (length limits, allowed characters, value ranges)
- Security headers middleware
- Auto-generated interactive API docs at `/docs`

## Tech stack

| Layer         | Technology                     |
| ------------- | ------------------------------ |
| API           | FastAPI                        |
| ORM           | SQLModel (built on SQLAlchemy) |
| Database      | PostgreSQL                     |
| Validation    | Pydantic v2                    |
| Auth          | JWT (python-jose) + bcrypt     |
| Rate limiting | slowapi                        |
| Frontend      | TypeScript                     |

## API overview

### Auth

| Method | Endpoint         | Description                                         |
| ------ | ---------------- | --------------------------------------------------- |
| `POST` | `/auth/register` | Register a new user, sets an auth cookie            |
| `POST` | `/auth/login`    | Log in with email and password, sets an auth cookie |
| `POST` | `/auth/logout`   | Log out, clears the auth cookie                     |

Authentication is cookie-based. After login or register, the server sets an HttpOnly cookie (`access_token`) that is sent automatically with subsequent requests.

### Sessions

| Method   | Endpoint         | Description                                 |
| -------- | ---------------- | ------------------------------------------- |
| `POST`   | `/sessions`      | Create a new session                        |
| `GET`    | `/sessions`      | List all sessions (optional `?tag=` filter) |
| `GET`    | `/sessions/{id}` | Get a single session                        |
| `PATCH`  | `/sessions/{id}` | Update status or tags                       |
| `DELETE` | `/sessions/{id}` | Delete a session                            |

### Tags

| Method | Endpoint | Description                                  |
| ------ | -------- | -------------------------------------------- |
| `GET`  | `/tags`  | List all tags that have at least one session |

## Data model

**UserTable**: `id`, `email`, `hashed_password`

**PomodoroSession**: `id`, `user_id` (FK to UserTable), `duration_minutes`, `started_at`, `status`, `paused_at`, `total_paused_seconds`

**Tag**: `id`, `name`

**SessionTagLink** (join table): `session_id` (FK), `tag_id` (FK)

A user has many sessions. A session has many tags and a tag can belong to many sessions, linked through SessionTagLink. Tags are stored once and reused. Deleting a session automatically cleans up orphaned tag links.

## Project structure

```text
pomodoro-app/
├── app/
│   ├── api/
│   │   ├── auth.py             # register, login, and logout endpoints
│   │   ├── frontend.py         # serves the demo UI
│   │   ├── health.py           # health check endpoint
│   │   ├── sessions.py         # session CRUD endpoints
│   │   └── tags.py             # tags endpoint
│   ├── core/
│   │   ├── config.py           # environment/settings
│   │   ├── limiter.py          # rate limiter setup
│   │   ├── logging.py          # logging setup
│   │   └── security.py         # JWT creation, decoding, and auth dependency
│   ├── db/
│   │   └── schema.py           # database table definitions
│   ├── models/
│   │   ├── session.py          # session request/response models
│   │   ├── tag.py              # tag request/response models
│   │   ├── token.py            # TokenResponse model
│   │   └── user.py             # UserCreate and User models
│   ├── services/
│   │   ├── auth_service.py     # registration and login logic
│   │   ├── session_service.py  # session business logic
│   │   └── tag_service.py      # tag business logic
│   └── main.py                 # app entry point, middleware setup
├── frontend/
│   ├── src/
│   │   └── app.ts              # TypeScript source for the demo UI
│   ├── static/
│   │   ├── index.html          # demo UI HTML
│   │   ├── app.js              # compiled frontend JS
│   │   └── styles.css          # demo UI styles
│   ├── package.json
│   └── tsconfig.json
├── .env                        # local environment variables (not committed)
├── requirements.txt
└── README.md
```

## Running locally

### 1. Clone and set up the environment

```bash
git clone https://github.com/Latfoo/pomodoro-app
cd pomodoro-app
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Set up PostgreSQL

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

### 3. Configure the environment

Create a `.env` file in the project root:

```env
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=pomodoro
SECRET_KEY=your-secret-key
APP_ENV=development
```

`APP_ENV=development` disables the `Secure` flag on the auth cookie so it works over plain HTTP on localhost. Leave it out (or set it to `production`) when deploying over HTTPS.

### 4. Start the server

```bash
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000` and the interactive docs are at `http://localhost:8000/docs`.

## Example requests

### Register

```bash
curl -c cookies.txt -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'
```

### Create a session

```bash
curl -b cookies.txt -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"duration_minutes": 25, "tags": ["work", "backend"]}'
```

### List sessions filtered by tag

```bash
curl -b cookies.txt http://localhost:8000/sessions?tag=backend
```

### Mark a session as completed

```bash
curl -b cookies.txt -X PATCH http://localhost:8000/sessions/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```
