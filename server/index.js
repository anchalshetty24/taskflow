const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new Database(process.env.DB_PATH || path.join(__dirname, "tasks.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','in_progress','done')),
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ---------- Helpers ----------
const STATUSES = ["todo", "in_progress", "done"];
const PRIORITIES = ["low", "medium", "high"];

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function validateTask(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) errors.push("Title is required.");
    else if (title.length > 100) errors.push("Title must be 100 characters or fewer.");
    else out.title = title;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") errors.push("Description must be text.");
    else if (body.description.length > 500) errors.push("Description must be 500 characters or fewer.");
    else out.description = body.description.trim();
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push(`Status must be one of: ${STATUSES.join(", ")}.`);
    else out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) errors.push(`Priority must be one of: ${PRIORITIES.join(", ")}.`);
    else out.priority = body.priority;
  }

  if (errors.length) throw new HttpError(400, "Validation failed", errors);
  return out;
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "Invalid task id.");
  return id;
}

// ---------- Middleware ----------
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------- Routes ----------
app.get("/api/health", (req, res) => res.json({ ok: true }));

// READ (list) with search, filter, pagination
app.get("/api/tasks", (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 50);
  const search = (req.query.search || "").trim();
  const { status, priority } = req.query;

  const where = [];
  const params = {};
  if (search) {
    where.push("(title LIKE @q OR description LIKE @q)");
    params.q = `%${search}%`;
  }
  if (status) {
    if (!STATUSES.includes(status)) throw new HttpError(400, "Invalid status filter.");
    where.push("status = @status");
    params.status = status;
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) throw new HttpError(400, "Invalid priority filter.");
    where.push("priority = @priority");
    params.priority = priority;
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM tasks ${clause}`).get(params).n;
  const data = db
    .prepare(`SELECT * FROM tasks ${clause} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset: (page - 1) * limit });

  res.json({ data, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// READ (one)
app.get("/api/tasks/:id", (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(parseId(req.params.id));
  if (!task) throw new HttpError(404, "Task not found.");
  res.json(task);
});

// CREATE
app.post("/api/tasks", (req, res) => {
  const t = validateTask(req.body || {});
  const info = db
    .prepare(
      `INSERT INTO tasks (title, description, status, priority)
       VALUES (@title, @description, @status, @priority)`
    )
    .run({ description: "", status: "todo", priority: "medium", ...t });
  const created = db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(created);
});

// UPDATE
app.put("/api/tasks/:id", (req, res) => {
  const id = parseId(req.params.id);
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!existing) throw new HttpError(404, "Task not found.");

  const changes = validateTask(req.body || {}, { partial: true });
  const merged = { ...existing, ...changes };
  db.prepare(
    `UPDATE tasks SET title=@title, description=@description, status=@status,
     priority=@priority, updated_at=datetime('now') WHERE id=@id`
  ).run(merged);
  res.json(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
});

// DELETE
app.delete("/api/tasks/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(parseId(req.params.id));
  if (info.changes === 0) throw new HttpError(404, "Task not found.");
  res.status(204).end();
});

// ---------- Error handling ----------
app.use("/api", (req, res, next) => next(new HttpError(404, "Route not found.")));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") err = new HttpError(400, "Invalid JSON body.");
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: status === 500 ? "Something went wrong on the server." : err.message,
    details: err.details,
  });
});

app.listen(PORT, () => console.log(`TaskFlow running on http://localhost:${PORT}`));
