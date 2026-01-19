import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import ePub from "epubjs";
import { getBookFileUrl } from "../api";

interface Props {
  bookId: string;
  initialLocation: Record<string, unknown> | null;
  onLocationChange: (location: Record<string, unknown>) => void;
  onTextChange: (text: string) => void;
  onTextSelect: (selection: { offset: number; text?: string }) => void;
  onControlsReady?: (controls: { next: () => void; prev: () => void }) => void;
  highlightPhrase?: string | null;
}

type PageBlocks = {
  left: string[];
  right: string[];
};

function getTextOffset(root: HTMLElement, node: Node, nodeOffset: number) {
  let offset = 0;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === node) {
      return offset + nodeOffset;
    }
    offset += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return offset;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReflowBlocks(doc: Document) {
  const parts: string[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.replace(/\s+/g, " ").trim();
    if (trimmed) {
      parts.push(DOMPurify.sanitize(`<p>${escapeHtml(trimmed)}</p>`));
    }
    buffer = "";
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "META", "LINK"].includes(tag)) {
      return;
    }
    if (tag === "IMG") {
      const src = el.getAttribute("src");
      const alt = el.getAttribute("alt") || "";
      flush();
      if (src) {
        parts.push(
          DOMPurify.sanitize(
            `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" /></figure>`
          )
        );
      }
      return;
    }
    if (tag.startsWith("H") && tag.length === 2) {
      flush();
      const text = el.textContent || "";
      parts.push(
        DOMPurify.sanitize(`<${tag.toLowerCase()}>${escapeHtml(text)}</${tag.toLowerCase()}>`)
      );
      return;
    }
    if (["P", "LI", "BLOCKQUOTE"].includes(tag)) {
      flush();
      const text = el.textContent || "";
      parts.push(DOMPurify.sanitize(`<p>${escapeHtml(text)}</p>`));
      return;
    }
    if (tag === "BR") {
      buffer += "\n";
      return;
    }
    Array.from(el.childNodes).forEach(visit);
    if (["DIV", "SECTION", "ARTICLE", "MAIN"].includes(tag)) {
      flush();
    }
  };

  Array.from(doc.body?.childNodes || []).forEach(visit);
  flush();
  return parts;
}

function extractHtml(output: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(output, "text/html");
  return buildReflowBlocks(doc);
}

function paginateBlocks(blocks: string[], container: HTMLDivElement) {
  if (!blocks.length) return [] as PageBlocks[];
  const style = window.getComputedStyle(container);
  const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const contentHeight = Math.max(container.clientHeight - paddingY, 120);
  const contentWidth = Math.max(container.clientWidth - paddingX, 0);
  const articleWidth = Math.min(940, contentWidth);

  const measureRoot = document.createElement("div");
  measureRoot.style.position = "absolute";
  measureRoot.style.visibility = "hidden";
  measureRoot.style.pointerEvents = "none";
  measureRoot.style.left = "-10000px";
  measureRoot.style.top = "0";
  measureRoot.style.width = `${articleWidth}px`;
  measureRoot.style.height = `${contentHeight}px`;

  const measureArticle = document.createElement("article");
  measureArticle.className = "epub-article";
  measureArticle.style.width = "100%";
  measureArticle.style.height = `${contentHeight}px`;
  measureArticle.style.overflow = "hidden";

  const leftCol = document.createElement("div");
  leftCol.className = "epub-column";
  leftCol.style.height = `${contentHeight}px`;
  leftCol.style.overflow = "hidden";
  const rightCol = document.createElement("div");
  rightCol.className = "epub-column";
  rightCol.style.height = `${contentHeight}px`;
  rightCol.style.overflow = "hidden";
  measureArticle.append(leftCol, rightCol);
  measureRoot.appendChild(measureArticle);
  document.body.appendChild(measureRoot);

  const pages: PageBlocks[] = [];
  let current: PageBlocks = { left: [], right: [] };

  const resetColumns = () => {
    leftCol.innerHTML = "";
    rightCol.innerHTML = "";
    current = { left: [], right: [] };
  };

  const pushPage = () => {
    if (current.left.length || current.right.length) {
      pages.push(current);
    }
  };

  const tryPlace = (column: HTMLDivElement, html: string) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    column.appendChild(wrapper);
    const fits = column.scrollHeight <= contentHeight + 1;
    if (!fits) {
      column.removeChild(wrapper);
    }
    return fits;
  };

  for (const block of blocks) {
    if (tryPlace(leftCol, block)) {
      current.left.push(block);
      continue;
    }

    if (!current.left.length && !current.right.length) {
      current.left.push(block);
      pages.push(current);
      resetColumns();
      continue;
    }

    if (tryPlace(rightCol, block)) {
      current.right.push(block);
      continue;
    }

    pushPage();
    resetColumns();

    if (tryPlace(leftCol, block)) {
      current.left.push(block);
    } else {
      current.left.push(block);
      pages.push(current);
      resetColumns();
    }
  }

  pushPage();
  measureRoot.remove();
  return pages.length ? pages : [{ left: [], right: [] }];
}

export default function EpubReader({
  bookId,
  initialLocation,
  onLocationChange,
  onTextChange,
  onTextSelect,
  onControlsReady,
  highlightPhrase
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const bookRef = useRef<ReturnType<typeof ePub> | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [sectionCount, setSectionCount] = useState(0);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [pages, setPages] = useState<PageBlocks[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appliedInitialRef = useRef(false);
  const [bookReady, setBookReady] = useState(false);
  const pendingPageRef = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        setLoading(true);
        const res = await fetch(getBookFileUrl(bookId));
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const book = ePub(buffer, { replacements: "blobUrl" });
        await book.ready;
        await book.replacements();
        bookRef.current = book;
        const total = book.spine?.items?.length || 0;
        setSectionCount(total);
        const initialSection = typeof initialLocation?.sectionIndex === "number" ? initialLocation.sectionIndex : 0;
        setSectionIndex(Math.min(Math.max(0, initialSection), Math.max(total - 1, 0)));
        setBookReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load EPUB");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
  }, [bookId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const book = bookRef.current;
    if (!book || !bookReady) return;
    let cancelled = false;

    const loadSection = async () => {
      try {
        setLoading(true);
        const section = book.spine.get(sectionIndex) || book.spine.items?.[sectionIndex];
        if (!section) return;
        let raw = "";
        if (book.archived && book.archive?.getText) {
          raw = await book.archive.getText(section.url);
        } else {
          raw = await fetch(section.url).then((res) => res.text());
        }
        const substituted = book.resources ? book.resources.substitute(raw, section.url) : raw;
        if (cancelled) return;
        const htmlBlocks = extractHtml(substituted);
        setBlocks(htmlBlocks);
        setPageIndex(0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render section");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSection();
    return () => {
      cancelled = true;
    };
  }, [sectionIndex]);

  const emitSelection = (event: MouseEvent<HTMLElement>) => {
    const root = articleRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const x = event.clientX;
    const y = event.clientY;
    let range: Range | null = null;
    const selection = doc.getSelection();
    if (selection && selection.rangeCount) {
      range = selection.getRangeAt(0);
    }
    if (!range && "caretPositionFromPoint" in doc && typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if (!range && "caretRangeFromPoint" in doc && typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(x, y);
    }
    if (range) {
      const offset = getTextOffset(root, range.startContainer, range.startOffset);
      const selectedText = selection?.toString().trim();
      onTextSelect({ offset, text: selectedText || undefined });
    }
  };

  useEffect(() => {
    if (!articleRef.current) return;
    const root = articleRef.current;
    const existing = root.querySelectorAll(".tts-highlight");
    existing.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent || ""), el);
      parent.normalize();
    });
    if (!highlightPhrase) return;
    try {
      const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const textNode = node.textContent || "";
        const index = textNode.indexOf(highlightPhrase);
        if (index >= 0) {
          const range = root.ownerDocument.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + highlightPhrase.length);
          const mark = root.ownerDocument.createElement("mark");
          mark.className = "tts-highlight";
          range.surroundContents(mark);
          mark.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        node = walker.nextNode();
      }
    } catch {
      return;
    }
  }, [highlightPhrase, pages, pageIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !blocks.length || !containerSize.height) return;
    const frame = window.requestAnimationFrame(() => {
      const nextPages = paginateBlocks(blocks, container);
      setPages(nextPages);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [blocks, containerSize.width, containerSize.height]);

  useEffect(() => {
    if (!pages.length) return;
    let nextIndex = pageIndex;
    if (pendingPageRef.current) {
      nextIndex = pendingPageRef.current === "last" ? pages.length - 1 : 0;
      pendingPageRef.current = null;
    } else if (!appliedInitialRef.current) {
      const initialMatches = typeof initialLocation?.sectionIndex === "number" && initialLocation.sectionIndex === sectionIndex;
      if (initialMatches) {
        if (typeof initialLocation?.pageIndex === "number") {
          nextIndex = Math.min(Math.max(0, initialLocation.pageIndex), pages.length - 1);
        } else if (typeof initialLocation?.percent === "number") {
          nextIndex = Math.round((pages.length - 1) * initialLocation.percent);
        }
        appliedInitialRef.current = true;
      }
    } else if (pageIndex >= pages.length) {
      nextIndex = pages.length - 1;
    }
    if (nextIndex !== pageIndex) {
      setPageIndex(nextIndex);
    }
  }, [pages, sectionIndex, pageIndex, initialLocation]);

  useEffect(() => {
    if (!pages.length) return;
    const frame = window.requestAnimationFrame(() => {
      if (!articleRef.current) return;
      onTextChange(articleRef.current.innerText || "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pages, pageIndex]);

  useEffect(() => {
    const pageCount = pages.length || 1;
    const percent = pageCount > 1 ? pageIndex / (pageCount - 1) : 0;
    onLocationChange({
      sectionIndex,
      pageIndex,
      pageCount,
      percent
    });
  }, [pageIndex, pages.length, sectionIndex]);

  const currentPage = pages[pageIndex] || { left: [], right: [] };

  const controls = useMemo(() => {
    const next = () => {
      if (sectionIndex >= sectionCount - 1 && pageIndex >= pages.length - 1) return;
      if (pageIndex < pages.length - 1) {
        setPageIndex((prev) => Math.min(prev + 1, Math.max(pages.length - 1, 0)));
      } else {
        pendingPageRef.current = "first";
        setSectionIndex((prev) => Math.min(prev + 1, Math.max(sectionCount - 1, 0)));
      }
    };
    const prev = () => {
      if (sectionIndex <= 0 && pageIndex <= 0) return;
      if (pageIndex > 0) {
        setPageIndex((prev) => Math.max(0, prev - 1));
      } else if (sectionIndex > 0) {
        pendingPageRef.current = "last";
        setSectionIndex((prev) => Math.max(0, prev - 1));
      }
    };
    return { next, prev };
  }, [pageIndex, pages.length, sectionCount, sectionIndex]);

  useEffect(() => {
    onControlsReady?.(controls);
  }, [controls, onControlsReady]);

  return (
    <div className="reader epub">
      <div className="epub-controls">
        <button onClick={controls.prev} disabled={sectionIndex <= 0 && pageIndex <= 0}>Prev</button>
        <div className="page-metrics">
          <span className="page-count">Page {pageIndex + 1} / {pages.length || 1}</span>
          <span className="page-count">Section {sectionIndex + 1} / {sectionCount || 1}</span>
          <span className="page-count">
            {Math.round(
              ((sectionIndex + (pages.length ? (pageIndex + 1) / pages.length : 1)) / Math.max(sectionCount, 1)) * 100
            )}%
          </span>
        </div>
        <button onClick={controls.next} disabled={sectionIndex >= sectionCount - 1 && pageIndex >= pages.length - 1}>Next</button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="epub-reflow" ref={containerRef}>
        {loading && <div className="state">Loading section...</div>}
        <article ref={articleRef} className="epub-article" onClick={emitSelection} onMouseUp={emitSelection}>
          <div className="epub-column">
            {currentPage.left.map((block, index) => (
              <div key={`left-${index}`} dangerouslySetInnerHTML={{ __html: block }} />
            ))}
          </div>
          <div className="epub-column">
            {currentPage.right.map((block, index) => (
              <div key={`right-${index}`} dangerouslySetInnerHTML={{ __html: block }} />
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
