export const env = {
  port: Number.parseInt(process.env.PORT || "8080", 10),
  dataDir: process.env.DATA_DIR || "/data",
  allowUpload: (process.env.ALLOW_UPLOAD || "true").toLowerCase() === "true",
  maxUploadMb: Number.parseInt(process.env.MAX_UPLOAD_MB || "500", 10),
  sessionSecret: process.env.SESSION_SECRET || "",
  sessionTtlDays: Number.parseInt(process.env.SESSION_TTL_DAYS || "30", 10),
  sessionCookieSecure: (process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || ""
};
