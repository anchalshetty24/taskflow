const $ = (id) => document.getElementById(id);
const state = { page: 1, limit: 6, search: "", status: "", priority: "", totalPages: 1 };
let editingId = null;

// ---------- API helper ----------
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Check your connection.");
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Request failed.");
    err.details = body.details;
    throw err;
  }
  return body;
}

// ---------- UI helpers ----------
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}
const label = (s) => ({ todo: "To do", in_progress: "In progress", done: "Done" }[s] || s);

// ---------- Load & render ----------
async function loadTasks() {
  $("loading").hidden = false;
  $("error").hidden = true;
  $("empty").hidden = true;
  $("list").innerHTML = "";

  const params = new URLSearchParams({ page: state.page, limit: state.limit });
  if (state.search) params.set("search", state.search);
  if (state.status) params.set("status", state.status);
  if (state.priority) params.set("priority", state.priority);

  try {
    const res = await api(`/tasks?${params}`);
    // If the current page no longer exists (e.g. after a delete), go back one page
    if (res.data.length === 0 && state.page > 1) {
      state.page = res.totalPages;
      return loadTasks();
    }
    state.totalPages = res.totalPages;
    render(res);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  } finally {
    $("loading").hidden = true;
  }
}

function render({ data, page, totalPages, total }) {
  $("empty").hidden = data.length > 0;
  $("list").innerHTML = data
    .map(
      (t) => `
    <article class="card ${t.status === "done" ? "done" : ""}">
      <h3>${esc(t.title)}</h3>
      ${t.description ? `<p>${esc(t.description)}</p>` : ""}
      <div class="badges">
        <span class="badge ${t.status === "done" ? "done" : ""}">${label(t.status)}</span>
        <span class="badge ${t.priority}">${esc(t.priority)}</span>
      </div>
      <div class="actions">
        <button class="btn" data-edit="${t.id}">Edit</button>
        <button class="btn danger" data-delete="${t.id}">Delete</button>
      </div>
    </article>`
    )
    .join("");

  $("pageInfo").textContent = `Page ${page} of ${totalPages} (${total} task${total === 1 ? "" : "s"})`;
  $("prev").disabled = page <= 1;
  $("next").disabled = page >= totalPages;
  window.__tasks = Object.fromEntries(data.map((t) => [t.id, t]));
}

// ---------- Events ----------
let debounce;
$("search").addEventListener("input", (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadTasks();
  }, 300);
});
$("statusFilter").addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; loadTasks(); });
$("priorityFilter").addEventListener("change", (e) => { state.priority = e.target.value; state.page = 1; loadTasks(); });
$("prev").addEventListener("click", () => { if (state.page > 1) { state.page--; loadTasks(); } });
$("next").addEventListener("click", () => { if (state.page < state.totalPages) { state.page++; loadTasks(); } });

$("list").addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.delete;
  if (editId) openDialog(window.__tasks[editId]);
  if (delId && confirm("Delete this task?")) {
    e.target.disabled = true;
    try {
      await api(`/tasks/${delId}`, { method: "DELETE" });
      toast("Task deleted");
      loadTasks();
    } catch (err) {
      e.target.disabled = false;
      $("error").textContent = err.message;
      $("error").hidden = false;
    }
  }
});

// ---------- Create / edit dialog ----------
function openDialog(task = null) {
  editingId = task ? task.id : null;
  $("dialogTitle").textContent = task ? "Edit Task" : "New Task";
  $("title").value = task?.title || "";
  $("description").value = task?.description || "";
  $("status").value = task?.status || "todo";
  $("priority").value = task?.priority || "medium";
  $("formError").hidden = true;
  $("dialog").showModal();
  $("title").focus();
}
$("addBtn").addEventListener("click", () => openDialog());
$("cancel").addEventListener("click", () => $("dialog").close());

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: $("title").value,
    description: $("description").value,
    status: $("status").value,
    priority: $("priority").value,
  };
  $("save").disabled = true;
  $("save").textContent = "Saving...";
  $("formError").hidden = true;
  try {
    if (editingId) await api(`/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/tasks", { method: "POST", body: JSON.stringify(payload) });
    $("dialog").close();
    toast(editingId ? "Task updated" : "Task created");
    if (!editingId) state.page = 1;
    loadTasks();
  } catch (err) {
    const list = err.details?.length ? `<ul>${err.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "";
    $("formError").innerHTML = esc(err.message) + list;
    $("formError").hidden = false;
  } finally {
    $("save").disabled = false;
    $("save").textContent = "Save";
  }
});

loadTasks();
