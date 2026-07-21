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
    recent: Boolean(row.recent),
  };
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
    if (url.pathname.startsWith("/api/books") && !isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // POST /api/books — create a book.
    if (request.method === "POST" && url.pathname === "/api/books") {
      const body = await request.json();
      if (!body.title || !body.author || !body.subject || !body.file) {
        return json({ error: "title, author, subject, and file are required" }, 400);
      }
      let id = slugify(body.title);
      const existing = await env.DB.prepare("SELECT id FROM books WHERE id = ?").bind(id).first();
      if (existing) id = `${id}-${Math.random().toString(36).slice(2, 6)}`;

      await env.DB.prepare(
        `INSERT INTO books (id, title, author, edition, section, subject, call_number, description, file, poster, series, volume, recent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
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
          body.recent ? 1 : 0
        )
        .run();

      const row = await env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).first();
      return json(rowToBook(row), 201);
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
