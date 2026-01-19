import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { getBookFileUrl } from "../api";

interface Props {
  bookId: string;
  format: "txt" | "md";
  initialLocation: Record<string, unknown> | null;
  onLocationChange: (location: Record<string, unknown>) => void;
  onTextChange: (text: string) => void;
  onTextSelect: (selection: { offset: number; text?: string }) => void;
  highlightPhrase?: string | null;
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

export default function TextReader({
  bookId,
  format,
  initialLocation,
  onLocationChange,
  onTextChange,
  onTextSelect,
  highlightPhrase
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const load = async () => {
      const res = await fetch(getBookFileUrl(bookId));
      const content = await res.text();
      setText(content);
    };
    load();
  }, [bookId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const percent = typeof initialLocation?.percent === "number" ? initialLocation.percent : 0;
    container.scrollTop = (container.scrollHeight - container.clientHeight) * percent;
  }, [text]);

  useEffect(() => {
    if (!articleRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      onTextChange(articleRef.current?.innerText || "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [text, format]);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
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
          return;
        }
        node = walker.nextNode();
      }
    } catch {
      return;
    }
  }, [highlightPhrase]);


  const html = useMemo(() => {
    if (format === "md") {
      return DOMPurify.sanitize(marked.parse(text) as string);
    }
    return DOMPurify.sanitize(text.replace(/\n/g, "<br />"));
  }, [format, text]);

  const onScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const percent = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
    onLocationChange({ percent });
  };

  const emitSelection = (event: MouseEvent<HTMLElement>) => {
    const root = articleRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const x = event.clientX;
    const y = event.clientY;
    let range: Range | null = null;
    if ("caretPositionFromPoint" in doc && typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if ("caretRangeFromPoint" in doc && typeof doc.caretRangeFromPoint === "function") {
      range = doc.caretRangeFromPoint(x, y);
    }
    if (range) {
      const offset = getTextOffset(root, range.startContainer, range.startOffset);
      const selection = doc.getSelection();
      const selectedText = selection?.toString().trim();
      onTextSelect({ offset, text: selectedText || undefined });
    }
  };

  return (
    <div className="reader text" ref={containerRef} onScroll={onScroll}>
      <article
        ref={articleRef}
        onClick={emitSelection}
        onMouseUp={emitSelection}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
