import { useEffect, useMemo, useRef, useState } from "react";

function chunkLongPhrase(phrase: string, maxLen: number) {
  if (phrase.length <= maxLen) return [phrase];
  const chunks: string[] = [];
  let remaining = phrase;
  while (remaining.length > maxLen) {
    const breakpoint = Math.max(
      remaining.lastIndexOf(", ", maxLen),
      remaining.lastIndexOf("; ", maxLen),
      remaining.lastIndexOf(": ", maxLen)
    );
    const cut = breakpoint > maxLen * 0.6 ? breakpoint + 1 : maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitIntoPhrases(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const phrases: string[] = [];
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    if (trimmed.length > 140) {
      chunkLongPhrase(trimmed, 120).forEach((chunk) => phrases.push(chunk));
    } else {
      phrases.push(trimmed);
    }
  });
  return phrases.filter(Boolean);
}

export default function TtsPanel({
  text,
  startOffset,
  startText,
  autoPlayKey,
  onEnd,
  onPhraseChange
}: {
  text: string;
  startOffset?: number | null;
  startText?: string | null;
  autoPlayKey?: number;
  onEnd?: () => void;
  onPhraseChange?: (phrase: string | null) => void;
}) {
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [tiktokMode, setTiktokMode] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    const updateVoices = () => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      if (!voiceUri && list.length) {
        setVoiceUri(list[0].voiceURI);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceUri, isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    const next = splitIntoPhrases(text);
    setPhrases(next);
    setCurrentIndex(0);
    onPhraseChange?.(next[0] || null);
    stop();
  }, [text]);

  useEffect(() => {
    if (!phrases.length) return;
    if (playing || paused) return;
    const combined = phrases.join(" ");
    const clamped = startOffset == null ? null : Math.max(0, Math.min(startOffset, combined.length));
    if (startText) {
      let matchIndex = combined.indexOf(startText);
      if (clamped != null) {
        const prevIndex = combined.lastIndexOf(startText, clamped);
        if (prevIndex >= 0) {
          matchIndex = prevIndex;
        }
      }
      if (matchIndex >= 0) {
        let cursor = 0;
        for (let i = 0; i < phrases.length; i += 1) {
          const len = phrases[i].length;
          if (matchIndex <= cursor + len) {
            setCurrentIndex(i);
            return;
          }
          cursor += len + 1;
        }
      }
    }
    if (clamped == null) return;
    let cursor = 0;
    for (let i = 0; i < phrases.length; i += 1) {
      const len = phrases[i].length;
      if (clamped <= cursor + len) {
        setCurrentIndex(i);
        return;
      }
      cursor += len + 1;
    }
    setCurrentIndex(Math.max(phrases.length - 1, 0));
  }, [startOffset, startText, phrases, playing, paused]);

  useEffect(() => {
    if (autoPlayKey == null) return;
    if (!isSupported) return;
    if (!phrases.length) return;
    play();
  }, [autoPlayKey]);

  useEffect(() => {
    onPhraseChange?.(phrases[currentIndex] || null);
  }, [currentIndex, phrases]);

  const currentPhrase = phrases[currentIndex] || "";

  const selectedVoice = useMemo(() => {
    if (!voiceUri) return null;
    return voices.find((voice) => voice.voiceURI === voiceUri) || null;
  }, [voiceUri, voices]);

  const clearFallback = () => {
    if (fallbackTimer.current) {
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  const scheduleFallback = (index: number, phrase: string) => {
    clearFallback();
    const duration = Math.max(900, phrase.length * 60 / Math.max(rate, 0.4));
    fallbackTimer.current = window.setTimeout(() => {
      if (activeIndexRef.current !== index) return;
      const nextIndex = index + 1;
      setCurrentIndex(nextIndex);
      speakPhrase(nextIndex);
    }, duration);
  };

  const speakPhrase = (index: number) => {
    const phrase = phrases[index];
    if (!phrase) {
      setPlaying(false);
      setPaused(false);
      onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = rate;
    if (selectedVoice) utterance.voice = selectedVoice;
    activeIndexRef.current = index;

    utterance.onstart = () => {
      setPlaying(true);
      setPaused(false);
      scheduleFallback(index, phrase);
    };

    utterance.onend = () => {
      if (activeIndexRef.current !== index) return;
      clearFallback();
      const nextIndex = index + 1;
      setCurrentIndex(nextIndex);
      speakPhrase(nextIndex);
    };

    utterance.onerror = () => {
      clearFallback();
      setPlaying(false);
      setPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const play = () => {
    if (!isSupported) return;
    if (!phrases.length) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      scheduleFallback(currentIndex, currentPhrase);
      return;
    }
    window.speechSynthesis.cancel();
    speakPhrase(currentIndex);
  };

  const pause = () => {
    if (!isSupported) return;
    if (!playing) return;
    window.speechSynthesis.pause();
    setPaused(true);
    clearFallback();
  };

  const stop = () => {
    if (!isSupported) return;
    clearFallback();
    window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    activeIndexRef.current = null;
  };

  const next = () => {
    if (!phrases.length) return;
    const nextIndex = Math.min(currentIndex + 1, phrases.length - 1);
    setCurrentIndex(nextIndex);
    if (playing || paused) {
      window.speechSynthesis.cancel();
      speakPhrase(nextIndex);
    }
  };

  return (
    <div className="tts-panel">
      <div className="tts-controls">
        {!isSupported && <span className="muted">TTS not supported in this browser.</span>}
        <button onClick={play} disabled={!phrases.length || !isSupported}>Play</button>
        {playing && !paused && <button onClick={pause}>Pause</button>}
        <button onClick={stop} disabled={(!playing && !paused) || !isSupported}>Stop</button>
        <button onClick={next} disabled={!phrases.length || !isSupported}>Next</button>
        <label>
          <span>Rate</span>
          <input
            type="range"
            min="0.6"
            max="1.6"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Voice</span>
          <select value={voiceUri || ""} onChange={(e) => setVoiceUri(e.target.value)}>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={tiktokMode}
            onChange={(e) => setTiktokMode(e.target.checked)}
          />
          <span>TikTok mode</span>
        </label>
      </div>
      {tiktokMode && (
        <div className="tiktok-mode">
          <div className="pulse-border" />
          <div className="orbit" />
          <div className="spark spark-left" />
          <div className="spark spark-right" />
          <div className="beam beam-left" />
          <div className="beam beam-right" />
          <span className="caption">{currentPhrase || "Ready"}</span>
        </div>
      )}
    </div>
  );
}
