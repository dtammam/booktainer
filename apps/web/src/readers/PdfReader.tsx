import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { getBookFileUrl } from "../api";

GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  bookId: string;
  initialLocation: Record<string, unknown> | null;
  onLocationChange: (location: Record<string, unknown>) => void;
  onTextChange: (text: string) => void;
}

export default function PdfReader({ bookId, initialLocation, onLocationChange, onTextChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState<number>(() => {
    const pageNum = initialLocation?.page;
    return typeof pageNum === "number" && pageNum > 0 ? pageNum : 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const doc = await getDocument(getBookFileUrl(bookId)).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        setTotalPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      }
    };
    load();
    return () => {
      cancelled = true;
      pdfRef.current?.destroy();
      pdfRef.current = null;
    };
  }, [bookId]);

  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;
    const render = async () => {
      try {
        const pageInstance = await pdf.getPage(page);
        const baseViewport = pageInstance.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth || baseViewport.width;
        const scale = Math.max(0.5, Math.min(2, containerWidth / baseViewport.width));
        const outputScale = window.devicePixelRatio || 1;
        const viewport = pageInstance.getViewport({ scale: scale * outputScale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`;
        canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`;
        await pageInstance.render({ canvasContext: context, viewport }).promise;
        const textContent = await pageInstance.getTextContent();
        const text = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        if (!cancelled) {
          onTextChange(text);
          onLocationChange({ page });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render PDF");
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [page, bookId]);

  return (
    <div className="reader pdf">
      <div className="pdf-controls">
        <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span>{page} / {totalPages}</span>
        <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
          Next
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="pdf-canvas" ref={containerRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
