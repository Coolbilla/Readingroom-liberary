export default function Navbar({ volumeCount, sections, activeSection, onSectionChange }) {
  return (
    <header className="navbar">
      <div className="navbar__brand">
        <span className="navbar__logo">📚</span>
        <div>
          <p className="navbar__title">Reading Room</p>
          <p className="navbar__subtitle">MPSTME Reference Library</p>
        </div>
      </div>

      <div className="navbar__sections" role="group" aria-label="Switch library section">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            className="navbar__section-btn"
            data-active={activeSection === s.key || undefined}
            onClick={() => onSectionChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="navbar__right">
        <span className="navbar__count">{volumeCount} books available</span>
      </div>
    </header>
  );
}
