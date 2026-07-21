import { useEffect, useState } from "react";
import {
  SECTIONS,
  CATEGORIES_BY_SECTION,
  fetchBooks,
  createBook,
  updateBook,
  deleteBook,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "../data/books.js";

const EMPTY_FORM = {
  title: "",
  author: "",
  edition: "",
  section: SECTIONS[0].key,
  subject: CATEGORIES_BY_SECTION[SECTIONS[0].key][0].key,
  callNumber: "",
  description: "",
  file: "",
  poster: "",
  series: "",
  volume: "",
  recent: false,
};

export default function AdminPanel({ onBooksChanged, onClose }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(() => Boolean(getAdminToken()));
  const [passwordInput, setPasswordInput] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function refresh() {
    setLoading(true);
    fetchBooks()
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function unlock(e) {
    e.preventDefault();
    setAdminToken(passwordInput);
    setAuthed(true);
    setPasswordInput("");
    setError("");
  }

  function lock() {
    clearAdminToken();
    setAuthed(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(book) {
    setEditingId(book.id);
    setForm({
      title: book.title,
      author: book.author,
      edition: book.edition || "",
      section: book.section || SECTIONS[0].key,
      subject: book.subject,
      callNumber: book.callNumber || "",
      description: book.description || "",
      file: book.file,
      poster: book.poster || "",
      series: book.series || "",
      volume: book.volume ?? "",
      recent: book.recent,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, volume: form.volume ? Number(form.volume) : null, series: form.series || null };
      if (editingId) {
        await updateBook(editingId, payload);
      } else {
        await createBook(payload);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      refresh();
      onBooksChanged?.();
    } catch (e) {
      setError(e.message);
      if (!getAdminToken()) setAuthed(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(book) {
    if (!window.confirm(`Remove "${book.title}" from the catalog?`)) return;
    setError("");
    try {
      await deleteBook(book.id);
      refresh();
      onBooksChanged?.();
    } catch (e) {
      setError(e.message);
      if (!getAdminToken()) setAuthed(false);
    }
  }

  return (
    <div className="admin">
      <div className="admin__bar">
        <button type="button" className="reader__close" onClick={onClose}>
          ← Back to library
        </button>
        <h1 className="admin__title">Admin</h1>
        {authed && (
          <button type="button" className="btn btn--secondary" onClick={lock}>
            Lock
          </button>
        )}
      </div>

      <div className="admin__content">
        {error && <p className="admin__error">{error}</p>}

        {!authed ? (
          <form className="admin__unlock" onSubmit={unlock}>
            <label htmlFor="admin-password">Admin password</label>
            <div className="admin__unlock-row">
              <input
                id="admin-password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
              />
              <button type="submit" className="btn btn--primary">
                Unlock
              </button>
            </div>
          </form>
        ) : (
          <form className="admin__form" onSubmit={handleSubmit}>
            <h2 className="admin__form-title">{editingId ? "Edit book" : "Add a book"}</h2>
            <div className="admin__grid">
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Author
                <input
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  required
                />
              </label>
              <label>
                Edition
                <input value={form.edition} onChange={(e) => setForm({ ...form, edition: e.target.value })} />
              </label>
              <label>
                Section
                <select
                  value={form.section}
                  onChange={(e) => {
                    const section = e.target.value;
                    setForm({ ...form, section, subject: CATEGORIES_BY_SECTION[section][0].key });
                  }}
                >
                  {SECTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {form.section === "reference-classbooks" ? "Subject" : "Genre"}
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  {CATEGORIES_BY_SECTION[form.section].map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Call number
                <input
                  value={form.callNumber}
                  onChange={(e) => setForm({ ...form, callNumber: e.target.value })}
                  placeholder="CS·101·T"
                />
              </label>
              <label>
                Series (optional)
                <input
                  value={form.series}
                  onChange={(e) => setForm({ ...form, series: e.target.value })}
                  placeholder="One Piece"
                />
              </label>
              <label>
                Volume / chapter #
                <input
                  type="number"
                  min="1"
                  value={form.volume}
                  onChange={(e) => setForm({ ...form, volume: e.target.value })}
                  disabled={!form.series}
                  placeholder="1"
                />
              </label>
              <label className="admin__checkbox">
                <input
                  type="checkbox"
                  checked={form.recent}
                  onChange={(e) => setForm({ ...form, recent: e.target.checked })}
                />
                Mark as recently added
              </label>
              <label className="admin__field-wide">
                PDF file key (R2)
                <input
                  value={form.file}
                  onChange={(e) => setForm({ ...form, file: e.target.value })}
                  placeholder={`books/${form.section}/your-file.pdf`}
                  required
                />
              </label>
              <label className="admin__field-wide">
                Poster image URL
                <input
                  value={form.poster}
                  onChange={(e) => setForm({ ...form, poster: e.target.value })}
                  placeholder={`https://pub-....r2.dev/books/${form.section}/posters-cover-page/your-cover.jpg`}
                />
              </label>
              <label className="admin__field-wide">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </label>
            </div>
            <div className="admin__form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add book"}
              </button>
              {editingId && (
                <button type="button" className="btn btn--secondary" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        <h2 className="admin__form-title">Catalog ({books.length})</h2>
        {loading ? (
          <p className="admin__note">Loading…</p>
        ) : (
          <ul className="admin__list">
            {books.map((book) => (
              <li key={book.id} className="admin__row">
                <div>
                  <p className="admin__row-title">{book.title}</p>
                  <p className="admin__row-meta">
                    {book.author} · {SECTIONS.find((s) => s.key === book.section)?.label ?? book.section} · {book.subject}
                    {book.series && ` · ${book.series} Vol. ${book.volume}`} · <code>{book.file}</code>
                  </p>
                </div>
                {authed && (
                  <div className="admin__row-actions">
                    <button type="button" className="btn btn--secondary" onClick={() => startEdit(book)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => handleDelete(book)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
