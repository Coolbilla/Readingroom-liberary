import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { setProgress } from "../utils/progress.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// R2 supports HTTP range requests, so pdf.js only needs to fetch the bytes for
// pages actually being viewed instead of buffering the whole file in memory —
// critical for large scanned books (one reference book here is 1365 pages/21MB).
const PDF_OPTIONS = { disableAutoFetch: true };

const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const BASE_WIDTH = 720;
// Scroll mode only ever mounts pages within this many slots of the current
// page — rendering hundreds of full-page canvases at once is what was making
// long books lag phones and laptops.
const SCROLL_RENDER_WINDOW = 2;
const MODES = [
  { key: "single", label: "Page" },
  { key: "scroll", label: "Scroll" },
  { key: "spread", label: "Spread" },
];

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

// Rendered with pdf.js instead of a bare <iframe>/<a target="_blank"> so reading
// never depends on the visitor's browser PDF settings — some browsers are set to
// download PDFs rather than open them, which would hijack the "read" action.
// Books are served from R2 with Content-Type: application/octet-stream rather
// than application/pdf — browsers intercept fetch() of PDF-typed responses and
// silently empty the body, which would otherwise break pdf.js here.
export default function FullScreenReader({ book, fileUrl, currentFile, onSelectChapter, initialPage, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPage ?? 1);
  const [pageDraft, setPageDraft] = useState(String(initialPage ?? 1));
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState(() => localStorage.getItem("reader-mode") || "single");
  const [loadError, setLoadError] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(BASE_WIDTH);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageAspect, setPageAspect] = useState(1.294); // ISO-A-ish default until the first page reports its real size
  const viewportRef = useRef(null);
  const closeRef = useRef(null);
  const pageRefs = useRef([]);
  const scrolledInitial = useRef(false);
  const pinch = useRef({ active: false, startDist: 0, startScale: 1 });

  if (numPages && pageRefs.current.length !== numPages) {
    pageRefs.current = new Array(numPages).fill(null);
  }

  const spreadLeft = pageNumber === 1 ? 1 : pageNumber % 2 === 0 ? pageNumber : pageNumber - 1;
  const spreadRight = spreadLeft === 1 ? null : Math.min(spreadLeft + 1, numPages ?? spreadLeft + 1);

  // Fit-to-viewport width first, *then* apply scale — clamping scale into the
  // fit width (the old order) meant zoom had no visible effect on any screen
  // narrower than BASE_WIDTH, i.e. every phone.
  const singleWidth = Math.round(Math.min(viewportWidth - 32, BASE_WIDTH) * scale);
  const spreadWidth = Math.round(Math.min((viewportWidth - 48) / 2, BASE_WIDTH / 1.4) * scale);
  const pageWidth = mode === "spread" ? spreadWidth : singleWidth;

  useEffect(() => {
    localStorage.setItem("reader-mode", mode);
  }, [mode]);

  function goToPage(n) {
    if (!numPages) return;
    const clamped = clamp(n, 1, numPages);
    setPageDraft(String(clamped));
    if (mode === "scroll") {
      pageRefs.current[clamped - 1]?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    setPageNumber(clamped);
  }

  function step(delta) {
    goToPage(pageNumber + (mode === "spread" ? delta * 2 : delta));
  }

  useEffect(() => {
    closeRef.current?.focus();

    function measure() {
      if (!viewportRef.current) return;
      setViewportWidth(viewportRef.current.clientWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Two-finger pinch to zoom. touchmove needs a non-passive native listener
  // (React's JSX touch handlers are passive by default) so preventDefault()
  // can actually stop the browser's own page-zoom/scroll while pinching.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinch.current = { active: true, startDist: touchDistance(e.touches), startScale: scale };
      }
    }

    function onTouchMove(e) {
      if (!pinch.current.active || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = touchDistance(e.touches) / pinch.current.startDist;
      setScale(clamp(pinch.current.startScale * ratio, MIN_SCALE, MAX_SCALE));
    }

    function onTouchEnd(e) {
      if (e.touches.length < 2) pinch.current.active = false;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Keeps the URL shareable and bookmarkable — reloading or sending the link
  // reopens this exact book at this exact page. Also remembers your spot so
  // reopening the book later (without a specific page in the link) resumes here.
  useEffect(() => {
    window.history.replaceState(null, "", `/read/${book.id}/page/${pageNumber}`);
    setProgress(book.id, pageNumber, numPages);
  }, [book.id, pageNumber, numPages]);

  // Scroll mode: track which page is on screen via IntersectionObserver, and
  // jump to the initial page once (deep-linked page, or the page you were on
  // before switching into scroll mode).
  useEffect(() => {
    if (mode !== "scroll" || !numPages || !viewportRef.current) return;

    if (!scrolledInitial.current) {
      scrolledInitial.current = true;
      pageRefs.current[pageNumber - 1]?.scrollIntoView({ block: "start" });
    }

    const ratios = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);
        let best = null;
        let bestRatio = 0;
        for (const [el, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = el;
          }
        }
        if (best) {
          const n = pageRefs.current.indexOf(best) + 1;
          if (n > 0) {
            setPageNumber(n);
            setPageDraft(String(n));
          }
        }
      },
      { root: viewportRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    for (const el of pageRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, numPages]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "Escape") (menuOpen ? setMenuOpen(false) : onClose());
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.2, MAX_SCALE));
      if (e.key === "-") setScale((s) => Math.max(s - 0.2, MIN_SCALE));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, pageNumber, mode, menuOpen, onClose]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${book.title} — page ${pageNumber}`, url });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="reader">
      <div className="reader__bar">
        <button ref={closeRef} type="button" className="reader__close" onClick={onClose} aria-label="Close reader">
          ← Back
        </button>
        <span className="reader__title">{book.title}</span>

        <div className="reader__controls">
          {numPages && (
            <div className="reader__pager">
              <button
                type="button"
                className="reader__page-btn"
                onClick={() => step(-1)}
                disabled={pageNumber <= 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              <form
                className="reader__page-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  goToPage(Number(pageDraft) || pageNumber);
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  className="reader__page-input"
                  value={pageDraft}
                  onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => goToPage(Number(pageDraft) || pageNumber)}
                  aria-label="Page number"
                />
                <span className="reader__page-total">of {numPages}</span>
              </form>
              <button
                type="button"
                className="reader__page-btn"
                onClick={() => step(1)}
                disabled={pageNumber >= numPages}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}

          <button
            type="button"
            className="reader__hamburger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          {menuOpen && <div className="reader__menu-backdrop" onClick={() => setMenuOpen(false)} />}

          <div className="reader__extra" data-open={menuOpen || undefined}>
            {book.chapters && book.chapters.length > 0 && (
              <select
                className="reader__chapter-select"
                aria-label="Chapter"
                value={currentFile}
                onChange={(e) => {
                  onSelectChapter(e.target.value);
                  setMenuOpen(false);
                }}
              >
                {book.chapters.map((ch) => (
                  <option key={ch.file} value={ch.file}>
                    {ch.label}
                  </option>
                ))}
              </select>
            )}

            <div className="reader__modes" role="group" aria-label="View mode">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className="reader__mode-btn"
                  data-active={mode === m.key || undefined}
                  onClick={() => {
                    setMode(m.key);
                    setMenuOpen(false);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="reader__zoom">
              <button
                type="button"
                className="reader__page-btn"
                onClick={() => setScale((s) => Math.max(s - 0.2, MIN_SCALE))}
                disabled={scale <= MIN_SCALE}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="reader__zoom-level">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                className="reader__page-btn"
                onClick={() => setScale((s) => Math.min(s + 0.2, MAX_SCALE))}
                disabled={scale >= MAX_SCALE}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="btn btn--secondary reader__share"
              onClick={() => {
                handleShare();
                setMenuOpen(false);
              }}
            >
              {copied ? "Link copied" : "Share this page"}
            </button>
            <a className="btn btn--secondary reader__download" href={fileUrl} download>
              Download
            </a>
          </div>
        </div>
      </div>

      <div
        className="reader__viewport"
        ref={viewportRef}
        style={{ justifyContent: scale > 1 ? "flex-start" : "center" }}
      >
        {loadError ? (
          <p className="reader__error">
            Couldn't open this PDF. Try <a href={fileUrl} download>downloading it</a> instead.
          </p>
        ) : (
          <Document
            file={fileUrl}
            options={PDF_OPTIONS}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setLoadError(true)}
            loading={<p className="reader__status">Loading book…</p>}
          >
            {mode === "single" && <Page pageNumber={pageNumber} width={pageWidth} renderAnnotationLayer={false} />}

            {mode === "spread" && (
              <div className="reader__spread">
                <Page pageNumber={spreadLeft} width={pageWidth} renderAnnotationLayer={false} />
                {spreadRight && <Page pageNumber={spreadRight} width={pageWidth} renderAnnotationLayer={false} />}
              </div>
            )}

            {mode === "scroll" &&
              numPages &&
              Array.from({ length: numPages }, (_, i) => {
                const n = i + 1;
                const inWindow = Math.abs(n - pageNumber) <= SCROLL_RENDER_WINDOW;
                return (
                  <div key={i} className="reader__scroll-page" ref={(el) => (pageRefs.current[i] = el)}>
                    {inWindow ? (
                      <Page
                        pageNumber={n}
                        width={pageWidth}
                        renderAnnotationLayer={false}
                        onLoadSuccess={(page) => n === 1 && setPageAspect(page.height / page.width)}
                      />
                    ) : (
                      <div
                        className="reader__scroll-placeholder"
                        style={{ width: pageWidth, height: Math.round(pageWidth * pageAspect) }}
                      />
                    )}
                  </div>
                );
              })}
          </Document>
        )}
      </div>
    </div>
  );
}
