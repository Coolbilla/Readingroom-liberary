export default function SearchBar({ query, onQueryChange, resultCount, totalCount }) {
  return (
    <div className="search-bar">
      <svg className="search-bar__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        className="search-bar__input"
        placeholder="Search by title, author, or subject…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        autoComplete="off"
        aria-label="Search books"
      />
      <span className="search-bar__count">{query ? `${resultCount} of ${totalCount}` : `${totalCount} books`}</span>
    </div>
  );
}
