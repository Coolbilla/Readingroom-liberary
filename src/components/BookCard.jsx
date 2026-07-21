export default function BookCard({ book, color, onSelect, progressText }) {
  return (
    <button type="button" className="book-card" onClick={() => onSelect(book.id)}>
      <span className="book-card__cover" style={{ "--cover-color": color }}>
        {book.recent && <span className="book-card__badge">New</span>}
        {book.volume != null && <span className="book-card__volume">Vol. {book.volume}</span>}
        {book.poster ? (
          <img className="book-card__poster" src={book.poster} alt="" loading="lazy" />
        ) : (
          <>
            <span className="book-card__cover-title">{book.title}</span>
            <span className="book-card__cover-author">{book.author}</span>
          </>
        )}
      </span>
      <span className="book-card__title">{book.title}</span>
      <span className="book-card__author">{progressText || book.author}</span>
    </button>
  );
}
