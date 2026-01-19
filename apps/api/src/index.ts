import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { extension as mimeExtension, lookup as lookupMime } from "mime-types";
import { v4 as uuidv4 } from "uuid";
import { getProgress, insertBook, setProgress, updateBookCover, updateBookMetadata, updateBookStatus } from "./db";
import { env } from "./env";
import { dataPaths } from "./paths";
import { convertMobiToEpub } from "./mobi";
import type { BookProgressResponse } from "@booktainer/shared";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerBookRoutes } from "./modules/books/routes";
import { getBook } from "./modules/books/repo";
import { toBookRecord } from "./modules/books/service";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty"
    }
  }
});

async function ensureDataDirs() {
  await fsp.mkdir(dataPaths.library, { recursive: true });
  await fsp.mkdir(dataPaths.covers, { recursive: true });
  await fsp.mkdir(dataPaths.tmp, { recursive: true });
}

function normalizeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  return ext;
}

function formatFromExtension(ext: string) {
  if (ext === "pdf" || ext === "epub" || ext === "mobi" || ext === "txt" || ext === "md") {
    return ext;
  }
  return null;
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

app.register(multipart, {
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024
  }
});

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.register(fastifyStatic, {
    root: webDist,
    prefix: "/"
  });
}

registerHealthRoutes(app);
registerBookRoutes(app);


app.get("/api/books/:id/file", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const row = getBook(id);
  if (!row) {
    return reply.code(404).send({ error: "Not found" });
  }
  const filePath = row.filePathCanonical || row.filePathOriginal;
  const mime = lookupMime(filePath) || "application/octet-stream";
  const stat = await fsp.stat(filePath);
  const range = request.headers.range;
  reply.header("Accept-Ranges", "bytes");

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d+)?/);
    if (match) {
      const start = Number.parseInt(match[1], 10);
      const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      reply.code(206);
      reply.header("Content-Type", mime);
      reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      reply.header("Content-Length", chunkSize.toString());
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }
  }

  reply.header("Content-Type", mime);
  reply.header("Content-Length", stat.size.toString());
  return reply.send(fs.createReadStream(filePath));
});

app.get("/api/books/:id/cover", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const row = getBook(id);
  if (!row || !row.coverPath) {
    return reply.code(404).send({ error: "Not found" });
  }
  const mime = lookupMime(row.coverPath) || "application/octet-stream";
  reply.header("Content-Type", mime);
  return reply.send(fs.createReadStream(row.coverPath));
});

app.get("/api/books/:id/progress", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const progress = getProgress(id);
  const response: BookProgressResponse = {
    progress: progress
      ? {
          bookId: progress.bookId,
          location: JSON.parse(progress.locationJson) as Record<string, unknown>,
          updatedAt: progress.updatedAt
        }
      : null
  };
  return reply.send(response);
});

app.post("/api/books/:id/progress", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const body = request.body as { location?: Record<string, unknown> };
  if (!body?.location) {
    return reply.code(400).send({ error: "Missing location" });
  }
  const updatedAt = new Date().toISOString();
  setProgress(id, JSON.stringify(body.location), updatedAt);
  return reply.send({ ok: true });
});

app.post("/api/books/upload", async (request, reply) => {
  if (!env.allowUpload) {
    return reply.code(403).send({ error: "Uploads disabled" });
  }
  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ error: "Missing file" });
  }
  const ext = normalizeExtension(data.filename);
  const format = formatFromExtension(ext);
  if (!format) {
    return reply.code(400).send({ error: "Unsupported file format" });
  }

  const id = uuidv4();
  const bookDir = path.join(dataPaths.library, id);
  await fsp.mkdir(bookDir, { recursive: true });
  const originalPath = path.join(bookDir, `original.${ext}`);

  await pipeline(data.file, fs.createWriteStream(originalPath));

  let title = path.basename(data.filename, path.extname(data.filename)) || data.filename;
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
  return reply.send(toBookRecord(row));
});

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    return reply.code(404).send({ error: "Not found" });
  }
  if (fs.existsSync(webDist)) {
    const indexPath = path.join(webDist, "index.html");
    return reply.type("text/html").send(fs.createReadStream(indexPath));
  }
  return reply.code(404).send({ error: "Not found" });
});

async function start() {
  await ensureDataDirs();
  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`Server listening on ${env.port}`);
}

start().catch((err) => {
  app.log.error(err, "Failed to start server");
  process.exit(1);
});
