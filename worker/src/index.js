const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function rowToBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    edition: row.edition,
    section: row.section,
    subject: row.subject,
    callNumber: row.call_number,
    description: row.description,
    file: row.file,
    poster: row.poster,
    series: row.series,
    volume: row.volume,
    chapters: row.chapters ? JSON.parse(row.chapters) : null,
    recent: Boolean(row.recent),
  };
}

// "08_Calc1_Chapter5w.pdf" -> "Chapter5w" -> "Chapter5w" (strip numeric
// prefix + extension, swap separators for spaces; good enough, book naming
// noise like a trailing "w" is left as-is rather than guessed at).
function chapterLabel(filename) {
  const stripped = filename.replace(/\.pdf$/i, "").replace(/^\d+[\s_-]*/, "").replace(/[_-]+/g, " ").trim();
  return stripped || filename;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isAuthorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${env.ADMIN_PASSWORD}`;
}

// Mirrors src/data/books.js — the Worker can't import frontend code, so the
// first category of each section's taxonomy is duplicated here as the
// default `subject` for auto-discovered books (the column is NOT NULL).
const DEFAULT_SUBJECT = {
  "reference-classbooks": "programming",
  "novels-otherbooks": "fiction",
  "comics-manga": "superhero",
};
const SECTION_KEYS = Object.keys(DEFAULT_SUBJECT);
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;
const PUBLIC_BASE = "https://pub-06db2505c6fc4a1e86dace21db2e4709.r2.dev";

async function listAllObjects(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const res = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...res.objects);
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor);
  return objects;
}

// Groups objects under books/<section>/ by their book-folder name, collecting
// the PDFs directly inside each folder and the first poster image found
// under <folder>/poster/. See the folder convention docs in the plan.
async function scanSection(bucket, section) {
  const prefix = `books/${section}/`;
  const objects = await listAllObjects(bucket, prefix);
  const folders = new Map();

  for (const obj of objects) {
    const rest = obj.key.slice(prefix.length);
    const parts = rest.split("/");
    if (parts.length < 2 || !parts[0]) continue;
    const folderName = parts[0];
    if (!folders.has(folderName)) folders.set(folderName, { pdfs: [], poster: null });
    const entry = folders.get(folderName);

    if (parts.length === 2 && /\.pdf$/i.test(parts[1])) {
      entry.pdfs.push({ key: obj.key, name: parts[1] });
    } else if (parts.length === 3 && parts[1].toLowerCase() === "poster" && IMAGE_RE.test(parts[2])) {
      entry.poster = entry.poster || obj.key;
    }
  }

  return folders;
}

async function syncLibrary(env) {
  let added = 0;
  let postersFilled = 0;

  for (const section of SECTION_KEYS) {
    const folders = await scanSection(env.BUCKET, section);

    for (const [folderName, { pdfs, poster }] of folders) {
      if (pdfs.length === 0) continue;
      pdfs.sort((a, b) => (parseInt(a.name, 10) || 0) - (parseInt(b.name, 10) || 0));

      const title = folderName.replace(/_/g, " ");
      const posterUrl = poster ? `${PUBLIC_BASE}/${poster}` : null;
      const isSeries = pdfs.length > 1;
      const baseSlug = slugify(title);

      for (const pdf of pdfs) {
        const n = parseInt(pdf.name, 10) || null;
        const id = isSeries ? `${baseSlug}-vol-${n}` : baseSlug;
        const bookTitle = isSeries ? `${title} Vol. ${n}` : title;

        const existing = await env.DB.prepare("SELECT id, poster FROM books WHERE file = ?").bind(pdf.key).first();

        if (!existing) {
          let insertId = id;
          if (await env.DB.prepare("SELECT id FROM books WHERE id = ?").bind(insertId).first()) {
            insertId = `${insertId}-${Math.random().toString(36).slice(2, 6)}`;
          }
          await env.DB.prepare(
            `INSERT INTO books (id, title, author, edition, section, subject, call_number, description, file, poster, series, volume, recent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              insertId,
              bookTitle,
              "",
              null,
              section,
              DEFAULT_SUBJECT[section],
              null,
              "",
              pdf.key,
              posterUrl,
              isSeries ? title : null,
              isSeries ? n : null,
              0
            )
            .run();
          added++;
        } else if (!existing.poster && posterUrl) {
          await env.DB.prepare("UPDATE books SET poster = ? WHERE file = ?").bind(posterUrl, pdf.key).run();
          postersFilled++;
        }
      }
    }
  }

  return { added, postersFilled };
}

// Creates the id/title for a book record, matching the conventions already
// used by syncLibrary() — series entries get "<title> Vol. <n>" and an
// "-vol-n" id suffix, standalone books just use the plain slug.
async function resolveIdAndTitle(env, title, series, volume) {
  const baseSlug = slugify(title);
  const isSeries = Boolean(series);
  let id = isSeries ? `${baseSlug}-vol-${volume}` : baseSlug;
  if (await env.DB.prepare("SELECT id FROM books WHERE id = ?").bind(id).first()) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const bookTitle = isSeries ? `${title} Vol. ${volume}` : title;
  return { id, bookTitle };
}

// POST /api/upload — accepts the actual PDF (+ optional poster, + optional
// multiple chapter PDFs) as files, uploads them to R2 under the same folder
// convention syncLibrary() expects, and creates the D1 record immediately.
// A book split across several PDFs (chapters of one book, not separate
// volumes) uploads all of them here as "chapters" instead of each becoming
// its own catalog card — that's what series/volume is for instead.
async function uploadBook(request, env) {
  const form = await request.formData();
  const title = form.get("title");
  const author = form.get("author");
  const section = form.get("section") || "reference-classbooks";
  const subject = form.get("subject");
  const pdf = form.get("pdf");
  const chapterFiles = form.getAll("chapters").filter((f) => f instanceof File && f.size > 0);
  const hasPdf = pdf instanceof File && pdf.size > 0;

  if (!title || !author || !subject || (!hasPdf && chapterFiles.length === 0)) {
    return json({ error: "title, author, subject, and a PDF file (or chapter files) are required" }, 400);
  }

  const series = form.get("series") || null;
  const volume = form.get("volume") ? parseInt(form.get("volume"), 10) : null;
  const folderName = (series || title).replace(/\s+/g, "_");

  let chapters = null;
  if (chapterFiles.length > 0) {
    chapters = [];
    for (const file of chapterFiles) {
      const key = `books/${section}/${folderName}/chapters/${file.name}`;
      await env.BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      chapters.push({ label: chapterLabel(file.name), file: key });
    }
  }

  let pdfKey;
  if (hasPdf) {
    pdfKey = `books/${section}/${folderName}/${volume || 1}.pdf`;
    await env.BUCKET.put(pdfKey, await pdf.arrayBuffer(), {
      httpMetadata: { contentType: "application/octet-stream" },
    });
  } else {
    pdfKey = chapters[0].file; // no standalone PDF — default to the first chapter
  }

  let posterUrl = null;
  const poster = form.get("poster");
  if (poster instanceof File && poster.size > 0) {
    const ext = (poster.name.match(/\.[^.]+$/) || [".jpg"])[0];
    const posterKey = `books/${section}/${folderName}/poster/cover${ext}`;
    await env.BUCKET.put(posterKey, await poster.arrayBuffer(), {
      httpMetadata: { contentType: poster.type || "image/jpeg" },
    });
    posterUrl = `${PUBLIC_BASE}/${posterKey}`;
  }

  const { id, bookTitle } = await resolveIdAndTitle(env, title, series, volume);

  await env.DB.prepare(
    `INSERT INTO books (id, title, author, edition, section, subject, call_number, description, file, poster, series, volume, chapters, recent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      bookTitle,
      author,
      form.get("edition") || null,
      section,
      subject,
      form.get("callNumber") || null,
      form.get("description") || "",
      pdfKey,
      posterUrl,
      series,
      volume,
      chapters ? JSON.stringify(chapters) : null,
      form.get("recent") === "true" ? 1 : 0
    )
    .run();

  const row = await env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first();
  return json(rowToBook(row), 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // GET /api/books — public, powers the library grid.
    if (request.method === "GET" && url.pathname === "/api/books") {
      const { results } = await env.DB.prepare("SELECT * FROM books ORDER BY created_at DESC").all();
      return json(results.map(rowToBook));
    }

    // Everything past this point manages the catalog and requires the admin password.
    if (
      (url.pathname.startsWith("/api/books") || url.pathname === "/api/sync" || url.pathname === "/api/upload") &&
      !isAuthorized(request, env)
    ) {
      return json({ error: "Unauthorized" }, 401);
    }

    // POST /api/sync — scan R2 for new book folders and add them to the catalog.
    if (request.method === "POST" && url.pathname === "/api/sync") {
      const result = await syncLibrary(env);
      return json(result);
    }

    // POST /api/upload — upload a PDF (+ optional poster) directly and create its record.
    if (request.method === "POST" && url.pathname === "/api/upload") {
      return uploadBook(request, env);
    }

    // PUT /api/books/:id — update a book.
    const putMatch = url.pathname.match(/^\/api\/books\/([^/]+)$/);
    if (request.method === "PUT" && putMatch) {
      const id = putMatch[1];
      const body = await request.json();
      const existing = await env.DB.prepare("SELECT id FROM books WHERE id = ?").bind(id).first();
      if (!existing) return json({ error: "Not found" }, 404);

      await env.DB.prepare(
        `UPDATE books SET title = ?, author = ?, edition = ?, section = ?, subject = ?, call_number = ?,
         description = ?, file = ?, poster = ?, series = ?, volume = ?, recent = ? WHERE id = ?`
      )
        .bind(
          body.title,
          body.author,
          body.edition || null,
          body.section || "reference-classbooks",
          body.subject,
          body.callNumber || null,
          body.description || null,
          body.file,
          body.poster || null,
          body.series || null,
          body.volume || null,
          body.recent ? 1 : 0,
          id
        )
        .run();

      const row = await env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first();
      return json(rowToBook(row));
    }

    // DELETE /api/books/:id
    const deleteMatch = url.pathname.match(/^\/api\/books\/([^/]+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      await env.DB.prepare("DELETE FROM books WHERE id = ?").bind(deleteMatch[1]).run();
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
};
