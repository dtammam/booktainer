import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { getBookFileUrl } from "../api";

interface Props {
  bookId: string;
  initialLocation: Record<string, unknown> | null;
  onLocationChange: (location: Record<string, unknown>) => void;
  onTextChange: (text: string) => void;
  onTextSelect: (selection: { offset: number; text?: string }) => void;
}

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

export default function EpubNativeReader({
  bookId,
  initialLocation,
  onLocationChange,
  onTextChange,
  onTextSelect
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<ReturnType<ReturnType<typeof ePub>["renderTo"]> | null>(null);
  const [ready, setReady] = useState(false);
  const [pageInfo, setPageInfo] = useState<{ page: number; total: number; percent: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    let book: ReturnType<typeof ePub> | null = null;
    let rendition: ReturnType<ReturnType<typeof ePub>["renderTo"]> | null = null;

    const load = async () => {
      const res = await fetch(getBookFileUrl(bookId));
      const buffer = await res.arrayBuffer();
      if (destroyed || !containerRef.current) return;

      book = ePub(buffer);
      rendition = book.renderTo(containerRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "auto"
      });
      renditionRef.current = rendition;

      const startCfi = initialLocation && typeof initialLocation.cfi === "string" ? initialLocation.cfi : undefined;
      await rendition.display(startCfi || undefined);
      setReady(true);

      rendition.on("relocated", (location: { start: { cfi: string; percentage: number; displayed: { page: number; total: number } } }) => {
        onLocationChange({ cfi: location.start.cfi, percentage: location.start.percentage });
        setPageInfo({
          page: location.start.displayed.page,
          total: location.start.displayed.total,
          percent: location.start.percentage
        });
      });

      rendition.on("rendered", (_section: unknown, contents: { document: Document }) => {
        const text = contents.document.body?.innerText || "";
        onTextChange(text);
        const clickHandler = (event: MouseEvent) => {
          try {
            const doc = contents.document;
            const x = event.clientX;
            const y = event.clientY;
            let range: Range | null = null;
            const selection = doc.getSelection();
            if (selection && selection.rangeCount) {
              range = selection.getRangeAt(0);
            }
            if ("caretPositionFromPoint" in doc && typeof doc.caretPositionFromPoint === "function") {
              const pos = doc.caretPositionFromPoint(x, y);
              if (pos) {
                range = doc.createRange();
                range.setStart(pos.offsetNode, pos.offset);
              }
            } else if ("caretRangeFromPoint" in doc && typeof doc.caretRangeFromPoint === "function") {
              range = doc.caretRangeFromPoint(x, y);
            }
            if (range && doc.body) {
              const offset = getTextOffset(doc.body, range.startContainer, range.startOffset);
              const selectedText = selection?.toString().trim();
              onTextSelect({ offset, text: selectedText || undefined });
            }
          } catch {
            return;
          }
        };
        contents.document.addEventListener("click", clickHandler);
        contents.document.addEventListener("mouseup", clickHandler);
      });
    };

    load();

    return () => {
      destroyed = true;
      if (rendition) {
        rendition.destroy();
      }
      renditionRef.current = null;
      if (book) {
        book.destroy();
      }
      setReady(false);
      setPageInfo(null);
    };
  }, [bookId]);

  return (
    <div className="reader epub">
      <div className="epub-controls">
        <button onClick={() => renditionRef.current?.prev()} disabled={!ready}>Prev</button>
        {pageInfo && (
          <div className="page-metrics">
            <span className="page-count">Page {pageInfo.page} / {pageInfo.total}</span>
            <span className="page-count">{Math.round(pageInfo.percent * 100)}%</span>
          </div>
        )}
        <button onClick={() => renditionRef.current?.next()} disabled={!ready}>Next</button>
      </div>
      <div className="epub-canvas" ref={containerRef} />
    </div>
  );
}
