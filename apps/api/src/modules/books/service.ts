import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { extension as mimeExtension, lookup as lookupMime } from "mime-types";
import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { BookRecord, BooksListResponse } from "@booktainer/shared";
import { convertMobiToEpub } from "../../mobi";
import { dataPaths } from "../../paths";
import { deleteBook, getBook, insertBook, listBooks, updateBookAuthor, updateBookCover, updateBookMetadata, updateBookStatus, updateBookTitle } from "./repo";

function toBookRecord(row: ReturnType<typeof getBook>): BookRecord {
  if (!row) {
    throw new Error("Book not found");
  }
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format as BookRecord["format"],
    canonicalFormat: row.canonicalFormat as BookRecord["canonicalFormat"],
    dateAdded: row.dateAdded,
    coverUrl: row.coverPath ? `/api/books/${row.id}/cover` : null,
    status: row.status as BookRecord["status"],
    errorMessage: row.errorMessage
  };
}

export function listBookRecords(sort: "dateAdded" | "title" | "author", query: string | null): BooksListResponse {
  const rows = listBooks(sort, query);
  const items = rows.map((row) => toBookRecord(row));
  return { items };
}

export function getBookRecord(id: string): BookRecord | null {
  const row = getBook(id);
  if (!row) {
    return null;
  }
  return toBookRecord(row);
}

export function updateBookRecord(id: string, title?: string, author?: string | null): BookRecord | null {
  const row = getBook(id);
  if (!row) {
    return null;
  }
  if (title !== undefined) {
    updateBookTitle(id, title);
  }
  if (author !== undefined) {
    const nextAuthor = author?.trim();
    updateBookAuthor(id, nextAuthor ? nextAuthor : null);
  }
  const updated = getBook(id);
  return updated ? toBookRecord(updated) : null;
}

export async function removeBook(id: string): Promise<boolean> {
  const row = getBook(id);
  if (!row) {
    return false;
  }
  const bookDir = path.dirname(row.filePathOriginal);
  await fsp.rm(bookDir, { recursive: true, force: true });
  deleteBook(id);
  return true;
}

type RangeResult = {
  start: number;
  end: number;
  chunkSize: number;
};

function parseRangeHeader(range: string | undefined, size: number): RangeResult | null {
  if (!range) return null;
  const match = range.match(/bytes=(\d+)-(\d+)?/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  return { start, end, chunkSize: end - start + 1 };
}

export async function getBookFileStream(id: string, rangeHeader?: string) {
  const row = getBook(id);
  if (!row) {
    return null;
  }
  const filePath = row.filePathCanonical || row.filePathOriginal;
  const mime = lookupMime(filePath) || "application/octet-stream";
  const stat = await fsp.stat(filePath);
  const range = parseRangeHeader(rangeHeader, stat.size);
  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);
  return {
    mime,
    stat,
    range,
    stream
  };
}

export function getBookCoverStream(id: string) {
  const row = getBook(id);
  if (!row || !row.coverPath) {
    return null;
  }
  const mime = lookupMime(row.coverPath) || "application/octet-stream";
  return {
    mime,
    stream: fs.createReadStream(row.coverPath)
  };
}

type EpubPackage = {
  zip: JSZip;
  opfPath: string;
  opfDir: string;
  metadata: Record<string, unknown>;
  manifest: Array<Record<string, unknown>>;
};

async function loadEpubPackage(filePath: string): Promise<EpubPackage | null> {
  const buffer = await fsp.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) return null;
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const container = parser.parse(containerXml) as {
    container?: { rootfiles?: { rootfile?: { "full-path"?: string } | Array<{ "full-path"?: string }> } };
  };
  const rootfile = container?.container?.rootfiles?.rootfile;
  const opfPath = Array.isArray(rootfile) ? rootfile[0]?.["full-path"] : rootfile?.["full-path"];
  if (!opfPath) return null;
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) return null;
  const opf = parser.parse(opfXml) as {
    package?: { metadata?: Record<string, unknown>; manifest?: { item?: Record<string, unknown> | Array<Record<string, unknown>> } };
  };
  const metadata = opf?.package?.metadata || {};
  const manifestItems = opf?.package?.manifest?.item;
  const manifest = Array.isArray(manifestItems) ? manifestItems : manifestItems ? [manifestItems] : [];
  return {
    zip,
    opfPath,
    opfDir: path.posix.dirname(opfPath),
    metadata,
    manifest
  };
}

function normalizeValue(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return normalizeValue(value[0]);
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "object") {
    const text = (value as { "#text"?: string })["#text"];
    if (text) return text.trim() || null;
  }
  return null;
}

async function extractEpubMetadata(filePath: string) {
  const pkg = await loadEpubPackage(filePath);
  if (!pkg) return null;
  const metadata = pkg.metadata;
  const title = normalizeValue(metadata["dc:title"]);
  const creator = normalizeValue(metadata["dc:creator"]);
  return {
    title,
    author: creator
  };
}

async function extractEpubCover(filePath: string, bookId: string) {
  const pkg = await loadEpubPackage(filePath);
  if (!pkg) return null;
  const metadata = pkg.metadata;
  const manifest = pkg.manifest;

  let coverId: string | null = null;
  const meta = metadata["meta"];
  const metaList = Array.isArray(meta) ? meta : meta ? [meta] : [];
  for (const entry of metaList) {
    const name = (entry as { name?: string }).name;
    const content = (entry as { content?: string }).content;
    if (name === "cover" && content) {
      coverId = content;
      break;
    }
  }

  let coverItem: Record<string, unknown> | undefined;
  if (coverId) {
    coverItem = manifest.find((item) => (item as { id?: string }).id === coverId);
  }
  if (!coverItem) {
    coverItem = manifest.find((item) => {
      const props = (item as { properties?: string }).properties || "";
      return props.split(" ").includes("cover-image");
    });
  }
  if (!coverItem) return null;

  const href = (coverItem as { href?: string }).href;
  if (!href) return null;
  const mediaType = (coverItem as { "media-type"?: string })["media-type"] || "";
  const coverPath = path.posix.normalize(path.posix.join(pkg.opfDir, href));
  const file = pkg.zip.file(coverPath);
  if (!file) return null;
  const data = await file.async("uint8array");
  const ext = (mimeExtension(mediaType) || path.extname(href).replace(".", "") || "jpg").toLowerCase();
  const targetPath = path.join(dataPaths.covers, `${bookId}.${ext}`);
  await fsp.writeFile(targetPath, Buffer.from(data));
  return targetPath;
}

export async function uploadBook(file: { filename: string; file: NodeJS.ReadableStream }, format: string, ext: string) {
  const id = uuidv4();
  const bookDir = path.join(dataPaths.library, id);
  await fsp.mkdir(bookDir, { recursive: true });
  const originalPath = path.join(bookDir, `original.${ext}`);

  await pipeline(file.file, fs.createWriteStream(originalPath));

  let title = path.basename(file.filename, path.extname(file.filename)) || file.filename;
  let author: string | null = null;
  if (format === "epub") {
    const meta = await extractEpubMetadata(originalPath);
    if (meta?.title) title = meta.title;
    if (meta?.author) author = meta.author;
  }
  const dateAdded = new Date().toISOString();
  const status = format === "mobi" ? "processing" : "ready";
  const canonicalFormat = format === "mobi" ? "epub" : format;

  insertBook({
    id,
    title,
    author,
    format,
    canonicalFormat,
    dateAdded,
    filePathOriginal: originalPath,
    filePathCanonical: null,
    coverPath: null,
    status,
    errorMessage: null
  });

  if (format === "mobi") {
    const canonicalPath = path.join(bookDir, "canonical.epub");
    try {
      await convertMobiToEpub(originalPath, canonicalPath);
      const meta = await extractEpubMetadata(canonicalPath);
      if (meta?.title || meta?.author) {
        updateBookMetadata(id, meta?.title || title, meta?.author || null);
      }
      const coverPath = await extractEpubCover(canonicalPath, id);
      if (coverPath) {
        updateBookCover(id, coverPath);
      }
      updateBookStatus(id, "ready", null, canonicalPath);
    } catch (error) {
      updateBookStatus(id, "error", error instanceof Error ? error.message : "Conversion failed", null);
    }
  } else if (format === "epub") {
    const coverPath = await extractEpubCover(originalPath, id);
    if (coverPath) {
      updateBookCover(id, coverPath);
    }
  }

  const row = getBook(id);
  return toBookRecord(row);
}

export { toBookRecord };
