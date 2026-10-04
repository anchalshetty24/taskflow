# TaskFlow – Full-Stack Task Tracker

A full-stack CRUD application for managing tasks. Built for the YR NOVATECH internship (Task 5).

**Live URL:** https://taskflow-ljyp.onrender.com/

## Features
- Create, read, update and delete tasks
- Search by title/description (debounced) and filter by status and priority
- Server-side pagination
- Loading spinner, friendly error messages, empty state and form validation errors
- SQLite database for persistence

## Tech Stack
| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | HTML, CSS, vanilla JavaScript       |
| Backend  | Node.js + Express                   |
| Database | SQLite (via `better-sqlite3`)       |

## Setup Instructions
Requirements: Node.js 18 or newer.

```bash
git clone <your-repo-url>
cd taskflow
npm install
npm start
```
Open http://localhost:3000.

Environment variables (optional): `PORT` (default 3000), `DB_PATH` (default `server/tasks.db`).

## Architecture Overview
```
Browser (public/)  ──fetch JSON──▶  Express API (server/index.js)  ──SQL──▶  SQLite (tasks.db)
```
- **public/** – static single-page UI. `app.js` keeps UI state (page, search, filters), calls the API, and re-renders the task list.
- **server/index.js** – REST API plus static file hosting. Handles validation, pagination and centralized error handling.
- **Database** – one `tasks` table with CHECK constraints on `status` and `priority`.

### API Endpoints
| Method | Endpoint           | Description                                              |
|--------|--------------------|----------------------------------------------------------|
| GET    | `/api/tasks`       | List tasks. Query: `search`, `status`, `priority`, `page`, `limit` |
| GET    | `/api/tasks/:id`   | Get one task                                             |
| POST   | `/api/tasks`       | Create a task                                            |
| PUT    | `/api/tasks/:id`   | Update a task                                            |
| DELETE | `/api/tasks/:id`   | Delete a task                                            |

Errors return JSON: `{ "error": "message", "details": [...] }` with a proper HTTP status (400, 404, 500).

## Deployment (Render)
1. Push the repo to GitHub.
2. On render.com create a **Web Service** from the repo.
3. Build command: `npm install`  |  Start command: `npm start`
4. Note: on Render's free tier the filesystem is ephemeral, so SQLite data resets on redeploy. Attach a persistent disk and set `DB_PATH` to its mount path to keep data.
