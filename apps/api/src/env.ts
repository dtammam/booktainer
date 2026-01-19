export const env = {
  port: Number.parseInt(process.env.PORT || "8080", 10),
  dataDir: process.env.DATA_DIR || "/data",
  allowUpload: (process.env.ALLOW_UPLOAD || "true").toLowerCase() === "true",
  maxUploadMb: Number.parseInt(process.env.MAX_UPLOAD_MB || "500", 10)
};
