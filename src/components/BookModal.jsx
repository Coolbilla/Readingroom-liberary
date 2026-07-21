import { useEffect, useRef, useState } from "react";
import { R2_BASE_URL } from "../data/books.js";
import { getProgress } from "../utils/progress.js";

function usePdfAvailability(url) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setStatus("checking");
    fetch(url, { method: "HEAD" })
      .then((res) => !cancelled && setStatus(res.ok ? "available" : "missing"))
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return status;
}

const CLAMP_THRESHOLD = 220;

export default function BookModal({ book, color, subjectLabel, onClose, onRead }) {
  const closeRef = useRef(null);
  const fileUrl = book ? `${R2_BASE_URL}/${book.file}` : null;
  const pdfStatus = usePdfAvailability(fileUrl);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setExpanded(false);
  }, [book?.id]);

  if (!book) return null;

  const available = pdfStatus === "available";
  const progress = getProgress(book.id);
  const resuming = progress && progress.page > 1 && (!progress.numPages || progress.page < progress.numPages);
  const description = book.description || "";
  const needsClamp = description.length > CLAMP_THRESHOLD;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal__top">
          <span className="modal__cover" style={{ "--cover-color": color }}>
            {book.poster ? (
              <img className="modal__poster" src={book.poster} alt="" />
            ) : (
              <span className="modal__cover-title">{book.title}</span>
            )}
          </span>

          <div className="modal__info">
            <span className="modal__badge" style={{ "--badge-color": color }}>{subjectLabel}</span>
            <h2 id="modal-title" className="modal__title">{book.title}</h2>
            <p className="modal__meta">{book.author} · {book.edition}</p>
            <div className="modal__actions">
              <button type="button" className="btn btn--primary" disabled={!available} onClick={() => onRead(book.id)}>
                {resuming ? `Continue — page ${progress.page}` : "Read in browser"}
              </button>
              <a
                className="btn btn--secondary"
                href={fileUrl}
                download
                aria-disabled={!available}
                onClick={(e) => !available && e.preventDefault()}
              >
                Download PDF
              </a>
            </div>
            {description && (
              <>
                <p className={`modal__description ${needsClamp && !expanded ? "modal__description--clamped" : ""}`}>
                  {description}
                </p>
                {needsClamp && (
                  <button type="button" className="modal__read-more" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show less" : "Read more"}
                  </button>
                )}
              </>
            )}
            {pdfStatus === "missing" && (
              <p className="modal__note">
                Not added yet — upload it to R2 at <code>{book.file}</code> to make it readable.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
