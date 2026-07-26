import { useEffect, useState } from "react";
import {
  SECTIONS,
  CATEGORIES_BY_SECTION,
  fetchBooks,
  updateBook,
  deleteBook,
  syncLibrary,
  uploadBook,
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
  chapters: null,
  series: "",
  volume: "",
  recent: false,
  pdfFile: null,
  posterFile: null,
  chapterFiles: [],
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
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

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

  async function handleSync() {
    setSyncing(true);
    setSyncStatus("");
    setError("");
    try {
      const { added, postersFilled } = await syncLibrary();
      setSyncStatus(
        added === 0 && postersFilled === 0
          ? "No new books found — everything's already in the catalog."
          : `Added ${added} new book${added === 1 ? "" : "s"}, filled in ${postersFilled} poster${postersFilled === 1 ? "" : "s"}.`
      );
      refresh();
      onBooksChanged?.();
    } catch (e) {
      setError(e.message);
      if (!getAdminToken()) setAuthed(false);
    } finally {
      setSyncing(false);
    }
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
      chapters: book.chapters || null,
      series: book.series || "",
      volume: book.volume ?? "",
      recent: book.recent,
      pdfFile: null,
      posterFile: null,
      chapterFiles: [],
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
      if (editingId) {
        const payload = { ...form, volume: form.volume ? Number(form.volume) : null, series: form.series || null };
        await updateBook(editingId, payload);
      } else {
        if (!form.pdfFile && form.chapterFiles.length === 0) {
          throw new Error("Choose a PDF file (or chapter files) to upload.");
        }
        const data = new FormData();
        for (const key of ["title", "author", "edition", "section", "subject", "callNumber", "description", "series", "volume"]) {
          if (form[key]) data.set(key, form[key]);
        }
        data.set("recent", form.recent ? "true" : "false");
        if (form.pdfFile) data.set("pdf", form.pdfFile);
        if (form.posterFile) data.set("poster", form.posterFile);
        for (const f of form.chapterFiles) data.append("chapters", f);
        await uploadBook(data);
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

  // Subject/genre is free text — this just powers the <datalist> autocomplete
  // with the built-in defaults plus whatever's already used in this section.
  const subjectOptions = [
    ...new Set([
      ...CATEGORIES_BY_SECTION[form.section].map((c) => c.key),
      ...books.filter((b) => (b.section || "reference-classbooks") === form.section).map((b) => b.subject),
    ]),
  ];

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
          <>
            <div className="admin__sync">
              <div>
                <h2 className="admin__form-title">Scan library folders</h2>
                <p className="admin__note admin__note--tight">
                  Drop a folder into R2 as <code>books/&lt;section&gt;/Book_Name_With_Underscores/</code>, with a{" "}
                  <code>poster/</code> subfolder for the cover and PDFs named <code>1.pdf</code>, <code>2.pdf</code>,
                  etc. (one PDF = a standalone book, several = volumes of a series). Scan picks up new folders
                  automatically — you still add author, description, and subject/genre here afterward.
                </p>
              </div>
              <button type="button" className="btn btn--secondary" onClick={handleSync} disabled={syncing}>
                {syncing ? "Scanning…" : "Scan Library"}
              </button>
            </div>
            {syncStatus && <p className="admin__note">{syncStatus}</p>}

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
                <input
                  list="subject-options"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Type an existing one or a new one"
                  required
                />
                <datalist id="subject-options">
                  {subjectOptions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
              {editingId ? (
                <>
                  <label className="admin__field-wide">
                    PDF file
                    <span className="admin__file-readonly">
                      <code>{form.file}</code> — re-upload isn't supported from Edit yet; delete and re-add to
                      replace the file.
                    </span>
                  </label>
                  {form.poster && (
                    <label className="admin__field-wide">
                      Poster
                      <span className="admin__file-readonly">
                        <code>{form.poster}</code>
                      </span>
                    </label>
                  )}
                  {form.chapters && (
                    <label className="admin__field-wide">
                      Chapters
                      <span className="admin__file-readonly">
                        {form.chapters.map((c) => c.label).join(", ")} — re-upload isn't supported from Edit yet.
                      </span>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label className="admin__field-wide">
                    PDF file {form.chapterFiles.length > 0 && "(optional — chapters below already cover it)"}
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setForm({ ...form, pdfFile: e.target.files[0] || null })}
                    />
                  </label>
                  <label className="admin__field-wide">
                    Chapters (optional — for a book split across several PDFs, pick them all here instead of the
                    single PDF field above; each becomes a chapter you can pick from in the reader)
                    <input
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={(e) => setForm({ ...form, chapterFiles: Array.from(e.target.files) })}
                    />
                  </label>
                  <label className="admin__field-wide">
                    Poster image (optional)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setForm({ ...form, posterFile: e.target.files[0] || null })}
                    />
                  </label>
                </>
              )}
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
                {saving ? (editingId ? "Saving…" : "Uploading…") : editingId ? "Save changes" : "Add book"}
              </button>
              {editingId && (
                <button type="button" className="btn btn--secondary" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
            </form>
          </>
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
                    {book.series && ` · ${book.series} Vol. ${book.volume}`}
                    {book.chapters && ` · ${book.chapters.length} chapters`} · <code>{book.file}</code>
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
