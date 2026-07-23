// Book PDFs live on Cloudflare R2 (bucket "reading-room"); book records (title,
// author, description, poster, etc.) live in a Cloudflare D1 database behind
// the "reading-room-api" Worker. Add/edit/remove titles from /admin — this
// file only holds the fixed things that don't change per-book.
export const R2_BASE_URL = "https://pub-06db2505c6fc4a1e86dace21db2e4709.r2.dev";
export const API_BASE_URL = "https://reading-room-api.ishaangarg0904.workers.dev";

export const SECTIONS = [
  { key: "reference-classbooks", label: "Reference Books" },
  { key: "novels-otherbooks", label: "Novels & Other Books" },
  { key: "comics-manga", label: "Comics & Manga" },
];

export const SUBJECTS = [
  { key: "programming", label: "Programming & CS", color: "#C7A250" },
  { key: "math", label: "Mathematics", color: "#4C7A96" },
  { key: "electronics", label: "Electronics & Circuits", color: "#3E8074" },
  { key: "mechanical", label: "Core & Mechanical", color: "#A6432D" },
  { key: "ai", label: "AI & Data Science", color: "#7A5C7E" },
  { key: "comm", label: "Communication & Ethics", color: "#5B6B7A" },
];

export const GENRES = [
  { key: "fiction", label: "Fiction", color: "#A6432D" },
  { key: "nonfiction", label: "Non-Fiction", color: "#4C7A96" },
  { key: "biography", label: "Biography", color: "#7A5C7E" },
  { key: "selfhelp", label: "Self-Help", color: "#3E8074" },
  { key: "other", label: "Other", color: "#5B6B7A" },
];

export const COMIC_GENRES = [
  { key: "superhero", label: "Superhero", color: "#C7A250" },
  { key: "manga", label: "Manga", color: "#4C7A96" },
  { key: "graphic-novel", label: "Graphic Novel", color: "#7A5C7E" },
  { key: "webtoon", label: "Webtoon", color: "#3E8074" },
  { key: "other", label: "Other", color: "#5B6B7A" },
];

export const CATEGORIES_BY_SECTION = {
  "reference-classbooks": SUBJECTS,
  "novels-otherbooks": GENRES,
  "comics-manga": COMIC_GENRES,
};

const TOKEN_KEY = "reading-room-admin-token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function handleAuthedResponse(res) {
  if (res.status === 401) {
    clearAdminToken();
    throw new Error("Wrong password — try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Something went wrong.");
  }
  return res.json();
}

async function authedFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken()}`,
      ...options.headers,
    },
  });
  return handleAuthedResponse(res);
}

export async function fetchBooks() {
  const res = await fetch(`${API_BASE_URL}/api/books`);
  if (!res.ok) throw new Error("Couldn't load the catalog.");
  return res.json();
}

export function updateBook(id, book) {
  return authedFetch(`/api/books/${id}`, { method: "PUT", body: JSON.stringify(book) });
}

export function deleteBook(id) {
  return authedFetch(`/api/books/${id}`, { method: "DELETE" });
}

// Scans R2 for book folders (see the folder convention in the admin panel)
// and adds any new ones to the catalog. Safe to re-run — already-known files
// are left alone except for backfilling a poster that was added later.
export function syncLibrary() {
  return authedFetch("/api/sync", { method: "POST" });
}

// Uploads the PDF (+ optional poster) directly and creates the book record in
// one step. Doesn't go through authedFetch — a FormData body needs the browser
// to set its own multipart Content-Type header, not "application/json".
export async function uploadBook(formData) {
  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAdminToken()}` },
    body: formData,
  });
  return handleAuthedResponse(res);
}
