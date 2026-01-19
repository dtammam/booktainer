import { z } from "zod";

export const ttsSpeakSchema = z.object({
  mode: z.enum(["online", "offline"]),
  voice: z.string().min(1),
  rate: z.number().min(0.5).max(2.0).optional(),
  text: z.string().min(1).max(4000)
});

export const ttsInstallVoiceSchema = z.object({
  voice: z.string().min(1)
});
