import { spawn } from "node:child_process";

export function convertMobiToEpub(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ebook-convert", [inputPath, outputPath], { stdio: "inherit" });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ebook-convert exited with code ${code}`));
    });
  });
}
