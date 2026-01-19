import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthError, deleteBook, listBooks, renameBook, updateAuthor, uploadBook } from "../api";
import type { BookRecord } from "@booktainer/shared";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";

const sortOptions = [
  { value: "dateAdded", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" }
];

export default function LibraryPage() {
  const [items, setItems] = useState<BookRecord[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("dateAdded");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBooks({ sort, q });
      setItems(data);
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [sort, q]);

  const onUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await uploadBook(file);
      await fetchItems();
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      event.target.value = "";
    }
  };

  const onRename = async (event: React.MouseEvent, book: BookRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTitle = window.prompt("Rename book", book.title);
    if (!nextTitle || nextTitle.trim() === book.title) return;
    try {
      await renameBook(book.id, nextTitle.trim());
      await fetchItems();
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const onSetAuthor = async (event: React.MouseEvent, book: BookRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const nextAuthor = window.prompt("Set author", book.author || "");
    if (nextAuthor === null) return;
    try {
      await updateAuthor(book.id, nextAuthor.trim() ? nextAuthor.trim() : null);
      await fetchItems();
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Author update failed");
    }
  };

  const onDelete = async (event: React.MouseEvent, book: BookRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const ok = window.confirm(`Delete "${book.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteBook(book.id);
      await fetchItems();
    } catch (err) {
      if (err instanceof AuthError) {
        navigate("/login", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const filteredItems = useMemo(() => items, [items]);

  return (
    <div className="page">
      <header className="library-header">
        <div>
          <div className="header-row">
            <p className="eyebrow">Booktainer</p>
            <div className="header-actions">
              {user && <span className="user-chip">{user.email}</span>}
              <button className="theme-toggle" onClick={toggleTheme}>
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button className="theme-toggle" onClick={onLogout}>Logout</button>
            </div>
          </div>
          <h1>Library</h1>
          <p className="subhead">Your private stack of PDF, EPUB, MOBI, TXT, and Markdown.</p>
        </div>
        <div className="controls">
          <label className="search">
            <span>Search</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title or author"
            />
          </label>
          <label className="search">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="upload">
            <input type="file" onChange={onUpload} accept=".pdf,.epub,.mobi,.txt,.md" />
            <span>Upload</span>
          </label>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}

      {loading ? (
        <div className="state">Loading library...</div>
      ) : filteredItems.length === 0 ? (
        <div className="state">Drop your first book in to begin.</div>
      ) : (
        <section className="grid">
          {filteredItems.map((book) => (
            <Link key={book.id} to={`/book/${book.id}`} className="book-card">
              <div className="cover">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} />
                ) : (
                  <div className="cover-placeholder">
                    <span>{book.title.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="meta">
                <span className="format-pill">{book.canonicalFormat.toUpperCase()}</span>
                <div className="card-actions">
                  <button onClick={(event) => onRename(event, book)}>Rename</button>
                  <button onClick={(event) => onSetAuthor(event, book)}>Author</button>
                  <button className="danger" onClick={(event) => onDelete(event, book)}>Delete</button>
                </div>
                <h3>{book.title}</h3>
                <p>{book.author || "Unknown author"}</p>
                <div className={`status ${book.status}`}>
                  <span>{book.status}</span>
                  {book.errorMessage && <small>{book.errorMessage}</small>}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
