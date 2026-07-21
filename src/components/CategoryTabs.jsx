export default function CategoryTabs({ subjects, activeSubject, onChange }) {
  return (
    <div className="tabs" role="group" aria-label="Filter by subject">
      <button type="button" className="tab" data-active={activeSubject === "all" || undefined} onClick={() => onChange("all")}>
        All
      </button>
      {subjects.map((s) => (
        <button
          key={s.key}
          type="button"
          className="tab"
          data-active={activeSubject === s.key || undefined}
          onClick={() => onChange(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
