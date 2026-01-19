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
  stream: NodeJS.ReadableStream;
  contentType: string;
};

export interface TtsProvider {
  listVoices(): Promise<TtsVoice[]>;
  speak(input: TtsSpeakRequest): Promise<TtsSpeakResponse>;
}
