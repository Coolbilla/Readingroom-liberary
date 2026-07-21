import BookCard from "./BookCard.jsx";

function Shelf({ title, count, books, subjectByKey, onSelect }) {
  return (
    <section className="grid-section">
      {title && (
        <h3 className="grid-section__title">
          {title}
          {count > 1 && <span className="grid-section__count"> · {count} volumes</span>}
        </h3>
      )}
      <div className="book-grid">
        {books.map((book) => (
          <BookCard key={book.id} book={book} color={subjectByKey[book.subject]?.color} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

// Multi-part titles (manga volumes, etc.) share a `series` name — group those
// into their own labeled shelf, sorted by volume, instead of scattering them
// through the grid in whatever order they were added.
export default function BookGrid({ title, books, subjectByKey, onSelect }) {
  if (books.length === 0) return null;

  const seriesOrder = [];
  const seriesMap = new Map();
  const standalone = [];

  for (const book of books) {
    if (book.series) {
      if (!seriesMap.has(book.series)) {
        seriesMap.set(book.series, []);
        seriesOrder.push(book.series);
      }
      seriesMap.get(book.series).push(book);
    } else {
      standalone.push(book);
    }
  }

  for (const volumes of seriesMap.values()) {
    volumes.sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0));
  }

  return (
    <>
      {seriesOrder.map((series) => (
        <Shelf
          key={series}
          title={series}
          count={seriesMap.get(series).length}
          books={seriesMap.get(series)}
          subjectByKey={subjectByKey}
          onSelect={onSelect}
        />
      ))}
      {standalone.length > 0 && (
        <Shelf
          title={seriesOrder.length > 0 ? title || "More" : title}
          count={0}
          books={standalone}
          subjectByKey={subjectByKey}
          onSelect={onSelect}
        />
      )}
    </>
  );
}
