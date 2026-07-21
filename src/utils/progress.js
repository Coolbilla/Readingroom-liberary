// Tracks how far you've read into each book, per browser (localStorage only —
// no account system, so this doesn't follow you across devices).
const KEY = "reading-room-progress";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function getProgress(bookId) {
  return readAll()[bookId] ?? null;
}

export function setProgress(bookId, page, numPages) {
  const all = readAll();
  all[bookId] = { page, numPages, updatedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearProgress(bookId) {
  const all = readAll();
  delete all[bookId];
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getAllProgress() {
  return readAll();
}
