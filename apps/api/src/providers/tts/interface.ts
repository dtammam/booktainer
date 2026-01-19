export type TtsVoice = {
  id: string;
  name: string;
  locale?: string;
};

export type TtsSpeakRequest = {
  text: string;
  voice: string;
  rate: number;
};

export type TtsSpeakResponse = {
  stream?: NodeJS.ReadableStream;
  filePath?: string;
  contentType: string;
  contentLength?: number;
  cacheFile?: boolean;
};

export interface TtsProvider {
  listVoices(): Promise<TtsVoice[]>;
  speak(input: TtsSpeakRequest): Promise<TtsSpeakResponse>;
}
