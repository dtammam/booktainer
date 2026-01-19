import path from "node:path";
import { env } from "./env";

export const dataPaths = {
  root: env.dataDir,
  library: path.join(env.dataDir, "library"),
  covers: path.join(env.dataDir, "covers"),
  tmp: path.join(env.dataDir, "tmp"),
  ttsCache: path.join(env.dataDir, "tts-cache"),
  dbFile: path.join(env.dataDir, "booktainer.db")
};
