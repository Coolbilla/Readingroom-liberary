import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import SearchBar from "./components/SearchBar.jsx";
import CategoryTabs from "./components/CategoryTabs.jsx";
import BookGrid from "./components/BookGrid.jsx";
import BookModal from "./components/BookModal.jsx";
import FullScreenReader from "./components/FullScreenReader.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import BookCard from "./components/BookCard.jsx";
import { SECTIONS, CATEGORIES_BY_SECTION, R2_BASE_URL, fetchBooks } from "./data/books.js";
import { getProgress, getAllProgress } from "./utils/progress.js";

const categoryByKey = Object.fromEntries(
  Object.values(CATEGORIES_BY_SECTION)
    .flat()
    .map((c) => [c.key, c])
);

const SECTION_COPY = {
  "reference-classbooks": {
    title: "Find your reference book",
    subtitle: "Search the class shelf, read it in your browser, or download the PDF.",
  },
  "novels-otherbooks": {
    title: "Find your next read",
    subtitle: "Novels and other books, outside the syllabus.",
  },
  "comics-manga": {
    title: "Browse comics & manga",
    subtitle: "For whenever you need a break from the syllabus.",
  },
};

// Two client-side routes:
//   /read/<bookId>/page/<n> — the reader, a real shareable/bookmarkable URL
//   /admin                  — the catalog admin panel
function parseRoute(pathname, books) {
  if (pathname === "/admin") return { kind: "admin" };
  const match = pathname.match(/^\/read\/([^/]+)(?:\/page\/(\d+))?\/?$/);
  if (!match) return null;
  const bookId = match[1];
  if (!books.some((b) => b.id === bookId)) return null;
  return { kind: "read", bookId, page: match[2] ? Math.max(1, Number(match[2])) : 1 };
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [books, setBooks] = useState([]);
  const [booksError, setBooksError] = useState("");
  const [route, setRoute] = useState(null);

  function refreshBooks() {
    fetchBooks()
      .then((data) => {
        setBooks(data);
        setRoute((r) => r ?? parseRoute(window.location.pathname, data));
      })
      .catch((e) => setBooksError(e.message));
  }

  useEffect(refreshBooks, []);

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname, books));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [books]);

  function openReader(bookId, page) {
    const targetPage = page ?? getProgress(bookId)?.page ?? 1;
    window.history.pushState(null, "", `/read/${bookId}/page/${targetPage}`);
    setRoute({ kind: "read", bookId, page: targetPage });
    setSelectedId(null);
  }

  function goHome() {
    window.history.pushState(null, "", "/");
    setRoute(null);
  }

  function changeSection(section) {
    setActiveSection(section);
    setActiveCategory("all");
  }

  const normalizedQuery = query.trim().toLowerCase();
  const categories = CATEGORIES_BY_SECTION[activeSection] ?? [];

  const matches = useMemo(() => {
    return books.filter((book) => {
      if ((book.section || "reference-classbooks") !== activeSection) return false;
      if (activeCategory !== "all" && book.subject !== activeCategory) return false;
      if (!normalizedQuery) return true;
      const haystack = `${book.title} ${book.author} ${book.callNumber} ${categoryByKey[book.subject]?.label ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [books, activeSection, activeCategory, normalizedQuery]);

  // Recomputed whenever books load or the reader opens/closes — that's exactly
  // when saved progress in localStorage is worth re-checking.
  const continueReading = useMemo(() => {
    const progress = getAllProgress();
    return books
      .map((book) => ({ book, progress: progress[book.id] }))
      .filter(({ progress: p }) => p && p.page > 1 && (!p.numPages || p.page < p.numPages))
      .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, route]);

  const selectedBook = books.find((b) => b.id === selectedId) ?? null;
  const selectedColor = selectedBook ? categoryByKey[selectedBook.subject]?.color : null;
  const selectedCategoryLabel = selectedBook ? categoryByKey[selectedBook.subject]?.label : null;

  const readingBook = route?.kind === "read" ? books.find((b) => b.id === route.bookId) : null;

  if (route?.kind === "admin") {
    return <AdminPanel onBooksChanged={refreshBooks} onClose={goHome} />;
  }

  const copy = SECTION_COPY[activeSection];

  return (
    <div className="app">
      <Navbar
        volumeCount={books.length}
        sections={SECTIONS}
        activeSection={activeSection}
        onSectionChange={changeSection}
      />

      <section className="hero">
        <h1 className="hero__title">{copy.title}</h1>
        <p className="hero__subtitle">{copy.subtitle}</p>
        <SearchBar query={query} onQueryChange={setQuery} resultCount={matches.length} totalCount={books.length} />
        <CategoryTabs subjects={categories} activeSubject={activeCategory} onChange={setActiveCategory} />
      </section>

      <main className="content">
        {continueReading.length > 0 && (
          <section className="grid-section">
            <h3 className="grid-section__title">Continue Reading</h3>
            <div className="book-grid">
              {continueReading.map(({ book, progress }) => (
                <BookCard
                  key={book.id}
                  book={book}
                  color={categoryByKey[book.subject]?.color}
                  onSelect={() => openReader(book.id)}
                  progressText={`Page ${progress.page}${progress.numPages ? ` of ${progress.numPages}` : ""}`}
                />
              ))}
            </div>
          </section>
        )}

        {booksError ? (
          <p className="empty-state">Couldn't load the catalog — {booksError}</p>
        ) : matches.length > 0 ? (
          <BookGrid books={matches} subjectByKey={categoryByKey} onSelect={setSelectedId} />
        ) : (
          <p className="empty-state">
            {books.length === 0 ? "The shelf is empty — add a book from /admin." : `No books match "${query}".`}
          </p>
        )}
      </main>

      <footer className="footer">Reading Room — a class reference library.</footer>

      {selectedBook && (
        <BookModal
          book={selectedBook}
          color={selectedColor}
          subjectLabel={selectedCategoryLabel}
          onClose={() => setSelectedId(null)}
          onRead={(id) => openReader(id)}
        />
      )}

      {readingBook && (
        <FullScreenReader
          book={readingBook}
          fileUrl={`${R2_BASE_URL}/${readingBook.file}`}
          initialPage={route.page}
          onClose={goHome}
        />
      )}
    </div>
  );
}
