# pomodoro-app

## Database

The app uses a single PostgreSQL database with three tables.

**Why three tables?**

Sessions and tags have a many-to-many relationship. A session can have multiple tags, and a tag can belong to multiple sessions. Relational databases cannot express this directly, so a third table (`SessionTagLink`) acts as a bridge that records which sessions are connected to which tags.

```
┌─────────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   PomodoroSession   │         │  SessionTagLink  │         │     Tag     │
├─────────────────────┤         ├──────────────────┤         ├─────────────┤
│ id                  │◄────────│ session_id       │         │ id          │
│ task_label          │         │ tag_id           │────────►│ name        │
│ duration_minutes    │         └──────────────────┘         └─────────────┘
│ started_at          │
│ completed           │
└─────────────────────┘
```

The bridge table only stores IDs. Each row means "this session is connected to this tag". Example:

```
session 1 -- link (session_id=1, tag_id=2) -- tag "work"
session 1 -- link (session_id=1, tag_id=3) -- tag "study"
session 2 -- link (session_id=2, tag_id=2) -- tag "work"
```

Session 1 has two tags. "work" is shared between session 1 and session 2, stored as a single row in the Tag table, not a duplicate.
