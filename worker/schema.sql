CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  edition TEXT,
  section TEXT NOT NULL DEFAULT 'reference-classbooks',
  subject TEXT NOT NULL,
  series TEXT,
  volume INTEGER,
  call_number TEXT,
  description TEXT,
  file TEXT NOT NULL,
  poster TEXT,
  chapters TEXT, -- JSON array of {label, file}, for a book split across multiple PDFs
  recent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
