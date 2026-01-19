import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { BookRecord } from "@booktainer/shared";
import { AuthError, getBook, getProgress, saveProgress } from "../api";
import { useThrottle } from "../hooks/useThrottle";
import { useTheme } from "../hooks/useTheme";
import EpubReader from "../readers/EpubReader";
import EpubNativeReader from "../readers/EpubNativeReader";
import PdfReader from "../readers/PdfReader";
import TextReader from "../readers/TextReader";
import TtsPanel from "../components/TtsPanel";

export default function ReaderPage() {
  const { id } = useParams();
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLocation, setInitialLocation] = useState<Record<string, unknown> | null>(null);
  const [currentText, setCurrentText] = useState("");
  const [ttsOffset, setTtsOffset] = useState<number | null>(null);
  const [ttsStartText, setTtsStartText] = useState<string | null>(null);
  const [ttsAutoPlayKey, setTtsAutoPlayKey] = useState(0);
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null);
  const [epubMode, setEpubMode] = useState<"reflow" | "native">("reflow");
  const pendingAutoPlay = useRef(false);
  const epubControls = useRef<{ next: () => void; prev: () => void } | null>(null);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const loadBook = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getBook(id), getProgress(id)])
      .then(([bookData, progressData]) => {
        setBook(bookData);
        setInitialLocation(progressData.progress?.location || null);
        const stored = window.localStorage.getItem("booktainer-epub-mode");
        if (stored === "native" || stored === "reflow") {
          setEpubMode(stored);
        }
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load book");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBook();
  }, [id]);

  const toggleEpubMode = () => {
    const next = epubMode === "reflow" ? "native" : "reflow";
    setEpubMode(next);
    window.localStorage.setItem("booktainer-epub-mode", next);
  };

  const throttledSave = useThrottle((location: Record<string, unknown>) => {
    if (!id) return;
    saveProgress(id, location).catch((err) => {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
      }
    });
  }, 1500);

  const reader = useMemo(() => {
    if (!book) return null;
    const onLocation = (location: Record<string, unknown>) => {
      throttledSave(location);
    };

    if (book.canonicalFormat === "epub") {
      if (epubMode === "native") {
        return (
          <EpubNativeReader
            bookId={book.id}
            initialLocation={initialLocation}
            onLocationChange={onLocation}
            onTextChange={(text) => {
              setCurrentText(text);
              if (pendingAutoPlay.current) {
                pendingAutoPlay.current = false;
                setTtsOffset(0);
                setTtsAutoPlayKey((value) => value + 1);
              }
            }}
            onTextSelect={({ offset, text }) => {
              setTtsOffset(offset);
              setTtsStartText(text || null);
            }}
          />
        );
      }
      return (
        <EpubReader
          bookId={book.id}
          initialLocation={initialLocation}
          onLocationChange={onLocation}
          onTextChange={(text) => {
            setCurrentText(text);
            if (pendingAutoPlay.current) {
              pendingAutoPlay.current = false;
              setTtsOffset(0);
              setTtsAutoPlayKey((value) => value + 1);
            }
          }}
          onTextSelect={({ offset, text }) => {
            setTtsOffset(offset);
            setTtsStartText(text || null);
          }}
          highlightPhrase={currentPhrase}
          onControlsReady={(controls) => {
            epubControls.current = controls;
          }}
        />
      );
    }
    if (book.canonicalFormat === "pdf") {
      return (
        <PdfReader
          bookId={book.id}
          initialLocation={initialLocation}
          onLocationChange={onLocation}
          onTextChange={setCurrentText}
        />
      );
    }
    return (
      <TextReader
        bookId={book.id}
        format={book.canonicalFormat}
        initialLocation={initialLocation}
        onLocationChange={onLocation}
        onTextChange={(text) => {
          setCurrentText(text);
          if (pendingAutoPlay.current) {
            pendingAutoPlay.current = false;
            setTtsOffset(0);
            setTtsAutoPlayKey((value) => value + 1);
          }
        }}
        onTextSelect={({ offset, text }) => {
          setTtsOffset(offset);
          setTtsStartText(text || null);
        }}
        highlightPhrase={currentPhrase}
      />
    );
  }, [book, initialLocation, throttledSave]);

  if (loading) {
    return <div className="page">Loading reader...</div>;
  }

  if (error || !book) {
    return (
      <div className="page">
        <p className="alert">{error || "Missing book"}</p>
        <Link to="/" className="ghost">Back to library</Link>
      </div>
    );
  }

  if (book.status !== "ready") {
    return (
      <div className="page">
        <p className="alert">
          {book.status === "processing"
            ? "This book is still processing. Please wait and refresh."
            : book.errorMessage || "This book failed to process."}
        </p>
        <div className="reader-actions">
          <button className="ghost" onClick={loadBook}>Refresh</button>
          <Link to="/" className="ghost">Back to library</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="reader-page">
      <header className="reader-header">
        <div>
          <div className="reader-title">
            <Link to="/" className="ghost">Library</Link>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            {book.canonicalFormat === "epub" && (
              <button className="theme-toggle" onClick={toggleEpubMode}>
                {epubMode === "reflow" ? "Original" : "Reflow"}
              </button>
            )}
          </div>
          <h2>{book.title}</h2>
          <p>{book.author || "Unknown author"}</p>
        </div>
        <TtsPanel
          text={currentText}
          startOffset={ttsOffset}
          startText={ttsStartText}
          autoPlayKey={ttsAutoPlayKey}
          onPhraseChange={setCurrentPhrase}
          onEnd={() => {
            if (book.canonicalFormat === "epub") {
              pendingAutoPlay.current = true;
              epubControls.current?.next();
            }
          }}
        />
      </header>
      <main className="reader-shell">
        {reader}
      </main>
    </div>
  );
}
