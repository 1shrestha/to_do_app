import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];
const SORTS = [
  { value: "-createdAt", label: "Newest first" },
  { value: "createdAt", label: "Oldest first" },
  { value: "dueDate", label: "Due date" },
  { value: "-priority", label: "Priority" },
  { value: "title", label: "Title A to Z" },
];
const PRIORITIES = ["low", "medium", "high"];

const today = () => new Date().toISOString().slice(0, 10);

function formatDue(date) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ active: 0, completed: 0 });
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("-createdAt");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const params = { sort, search: debouncedSearch };
      if (filter === "active") params.completed = "false";
      if (filter === "completed") params.completed = "true";
      const [list, active, done] = await Promise.all([
        api.list(params),
        api.list({ completed: "false", limit: 1 }),
        api.list({ completed: "true", limit: 1 }),
      ]);
      setTasks(list.data);
      setStats({ active: active.total, completed: done.total });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, sort, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  // Runs an API call, then refreshes the list. Errors show in the banner.
  const act = async (fn) => {
    try {
      await fn();
      setError("");
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  const hasFilters = filter !== "all" || debouncedSearch !== "";

  return (
    <main className="shell">
      <header className="head">
        <h1>My tasks</h1>
        <p className="count" aria-live="polite">
          {stats.active === 0 && stats.completed === 0
            ? "Nothing here yet"
            : `${stats.active} to do, ${stats.completed} done`}
        </p>
      </header>

      <AddForm onAdd={(task) => act(() => api.create(task))} />

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Show tasks">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "tab on" : "tab"}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search tasks"
          aria-label="Search tasks"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="sort" aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button onClick={() => { setError(""); load(); }}>Try again</button>
        </div>
      )}

      {loading ? (
        <p className="note">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="note">
          {hasFilters ? "No tasks match this view. Change the tab or clear the search." : "Add your first task above."}
        </p>
      ) : (
        <ul className="list">
          {tasks.map((t) =>
            editingId === t.id ? (
              <EditRow
                key={t.id}
                task={t}
                onCancel={() => setEditingId(null)}
                onSave={async (fields) => {
                  const ok = await act(() => api.replace(t.id, { ...fields, completed: t.completed }));
                  if (ok) setEditingId(null);
                }}
              />
            ) : (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => act(() => api.patch(t.id, { completed: !t.completed }))}
                onEdit={() => setEditingId(t.id)}
                onDelete={() => act(() => api.remove(t.id))}
              />
            )
          )}
        </ul>
      )}

      {stats.completed > 0 && (
        <footer className="foot">
          <button className="ghost" onClick={() => act(() => api.clearCompleted())}>
            Clear {stats.completed} completed
          </button>
        </footer>
      )}
    </main>
  );
}

function AddForm({ onAdd }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd({ title, priority, dueDate: dueDate || null, description });
    setBusy(false);
    if (ok) {
      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");
      inputRef.current?.focus();
    }
  };

  return (
    <form className="add" onSubmit={submit}>
      <div className="add-main">
        <input
          ref={inputRef}
          className="title-input"
          placeholder="What needs doing?"
          aria-label="Task title"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!title.trim() || busy}>
          {busy ? "Adding..." : "Add task"}
        </button>
      </div>
      <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide details" : "Add details"}
      </button>
      {open && (
        <div className="add-more">
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="wide">
            Notes
            <input
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
      )}
    </form>
  );
}

function TaskRow({ task, onToggle, onEdit, onDelete }) {
  const overdue = !task.completed && task.dueDate && task.dueDate < today();
  return (
    <li className={`row p-${task.priority}${task.completed ? " done" : ""}`}>
      <label className="check">
        <input type="checkbox" checked={task.completed} onChange={onToggle} aria-label={`Mark "${task.title}" as ${task.completed ? "not done" : "done"}`} />
        <span className="box" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </span>
      </label>
      <div className="body">
        <p className="name">{task.title}</p>
        {task.description && <p className="desc">{task.description}</p>}
        <p className="meta">
          <span className="pri">{task.priority} priority</span>
          {task.dueDate && (
            <span className={overdue ? "due overdue" : "due"}>
              {overdue ? "Overdue: " : "Due "}
              {formatDue(task.dueDate)}
            </span>
          )}
        </p>
      </div>
      <div className="actions">
        <button className="ghost" onClick={onEdit} aria-label={`Edit "${task.title}"`}>Edit</button>
        <button className="ghost danger" onClick={onDelete} aria-label={`Delete "${task.title}"`}>Delete</button>
      </div>
    </li>
  );
}

function EditRow({ task, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    await onSave({ title, description, priority, dueDate: dueDate || null });
    setBusy(false);
  };

  return (
    <li className="row editing">
      <form className="edit" onSubmit={submit}>
        <label>
          Title
          <input autoFocus value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Notes
          <input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="edit-grid">
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <div className="edit-actions">
          <button className="primary" type="submit" disabled={!title.trim() || busy}>Save changes</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </li>
  );
}
