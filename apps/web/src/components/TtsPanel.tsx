import { useEffect, useMemo, useRef, useState } from "react";
import type { TtsVoicesResponse, TtsVoice } from "@booktainer/shared";
import { AuthError, createTtsSpeakUrl, listTtsVoices } from "../api";

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

type TtsMode = "online" | "offline";

export default function TtsPanel({
  text,
  startOffset,
  startText,
  autoPlayKey,
  onEnd,
  onPhraseChange,
  onAuthError
}: {
  text: string;
  startOffset?: number | null;
  startText?: string | null;
  autoPlayKey?: number;
  onEnd?: () => void;
  onPhraseChange?: (phrase: string | null) => void;
  onAuthError?: () => void;
}) {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [mode, setMode] = useState<TtsMode>("offline");
  const [onlineVoices, setOnlineVoices] = useState<TtsVoice[]>([]);
  const [offlineVoices, setOfflineVoices] = useState<TtsVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [tiktokMode, setTiktokMode] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingVoices(true);
    listTtsVoices()
      .then((data: TtsVoicesResponse) => {
        if (!alive) return;
        const nextMode = data.defaultMode;
        setMode(nextMode);
        setOnlineVoices(data.online);
        setOfflineVoices(data.offline);
        const nextVoices = nextMode === "offline" ? data.offline : data.online;
        setVoiceId(data.defaultVoice || nextVoices[0]?.id || "");
      })
      .catch((err) => {
        if (err instanceof AuthError) {
          onAuthError?.();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load voices");
      })
      .finally(() => {
        if (alive) setLoadingVoices(false);
      });
    return () => {
      alive = false;
    };
  }, [onAuthError]);

  useEffect(() => {
    const next = splitIntoPhrases(text);
    setPhrases(next);
    setCurrentIndex(0);
    onPhraseChange?.(next[0] || null);
    stop();
  }, [text]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

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
    if (!phrases.length) return;
    play();
  }, [autoPlayKey]);

  useEffect(() => {
    onPhraseChange?.(phrases[currentIndex] || null);
  }, [currentIndex, phrases]);

  const currentPhrase = phrases[currentIndex] || "";

  const availableVoices = useMemo(
    () => (mode === "offline" ? offlineVoices : onlineVoices),
    [mode, onlineVoices, offlineVoices]
  );

  useEffect(() => {
    if (loadingVoices) return;
    if (availableVoices.length === 0) {
      setError(mode === "offline"
        ? "No offline voices installed."
        : "Online voices unavailable.");
    }
  }, [availableVoices, loadingVoices, mode]);

  useEffect(() => {
    if (!availableVoices.length) return;
    if (!voiceId || !availableVoices.some((voice) => voice.id === voiceId)) {
      setVoiceId(availableVoices[0].id);
    }
  }, [availableVoices, voiceId]);

  function stopAudio() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  const playPhrase = async (index: number) => {
    const phrase = phrases[index];
    if (!phrase) {
      setPlaying(false);
      setPaused(false);
      onEnd?.();
      return;
    }
    if (!voiceId) {
      setError("No voice selected.");
      return;
    }

    stopAudio();
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    activeIndexRef.current = index;

    try {
      const payload = {
        mode,
        voice: voiceId,
        rate,
        text: phrase
      };
      let useMediaSource = ("MediaSource" in window) && MediaSource.isTypeSupported("audio/mpeg");
      let audio: HTMLAudioElement;

      if (useMediaSource) {
        const res = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (res.status === 401) {
          onAuthError?.();
          return;
        }
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || "TTS request failed.");
        }
        const mime = (res.headers.get("content-type") || "audio/mpeg").split(";")[0];
        if (!MediaSource.isTypeSupported(mime)) {
          useMediaSource = false;
        } else {
          const mediaSource = new MediaSource();
          audio = new Audio();
          audioRef.current = audio;
          audio.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            const sourceBuffer = mediaSource.addSourceBuffer(mime);
            const reader = res.body!.getReader();
            const pump = () => {
              reader.read().then(({ done, value }) => {
                if (done) {
                  if (mediaSource.readyState === "open") {
                    mediaSource.endOfStream();
                  }
                  return;
                }
                const append = () => {
                  sourceBuffer.appendBuffer(value);
                  sourceBuffer.addEventListener("updateend", pump, { once: true });
                };
                if (sourceBuffer.updating) {
                  sourceBuffer.addEventListener("updateend", append, { once: true });
                } else {
                  append();
                }
              }).catch(() => null);
            };
            pump();
          }, { once: true });
          audio.onended = () => {
            if (activeIndexRef.current !== index) return;
            const nextIndex = index + 1;
            setCurrentIndex(nextIndex);
            playPhrase(nextIndex);
          };
          await audio.play();
          setPlaying(true);
          setPaused(false);
          return;
        }
      }

      const urlResponse = await createTtsSpeakUrl(payload);
      audio = new Audio(urlResponse.url);
      audioRef.current = audio;
      audio.onended = () => {
        if (activeIndexRef.current !== index) return;
        const nextIndex = index + 1;
        setCurrentIndex(nextIndex);
        playPhrase(nextIndex);
      };
      await audio.play();
      setPlaying(true);
      setPaused(false);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthError?.();
        return;
      }
      setPlaying(false);
      setPaused(false);
      setError(err instanceof Error ? err.message : "Playback failed");
    }
  };

  const play = () => {
    if (!phrases.length) return;
    if (paused && audioRef.current) {
      audioRef.current.play().catch(() => null);
      setPaused(false);
      setPlaying(true);
      return;
    }
    playPhrase(currentIndex);
  };

  const pause = () => {
    if (!playing || !audioRef.current) return;
    audioRef.current.pause();
    setPaused(true);
  };

  const stop = () => {
    stopAudio();
    setPlaying(false);
    setPaused(false);
    activeIndexRef.current = null;
  };

  const next = () => {
    if (!phrases.length) return;
    const nextIndex = Math.min(currentIndex + 1, phrases.length - 1);
    setCurrentIndex(nextIndex);
    if (playing || paused) {
      playPhrase(nextIndex);
    }
  };

  const onModeChange = (nextMode: TtsMode) => {
    setMode(nextMode);
    const nextVoices = nextMode === "offline" ? offlineVoices : onlineVoices;
    setVoiceId(nextVoices[0]?.id || "");
    setError(null);
    stop();
  };

  const onVoiceChange = (nextVoice: string) => {
    setVoiceId(nextVoice);
    setError(null);
    stop();
  };

  const isControlsDisabled = !phrases.length || loadingVoices || !voiceId;

  return (
    <div className="tts-panel">
      <div className="tts-controls">
        {loadingVoices && <span className="muted">Loading voices...</span>}
        {error && <span className="muted">{error}</span>}
        <button onClick={play} disabled={isControlsDisabled}>Play</button>
        {playing && !paused && <button onClick={pause}>Pause</button>}
        <button onClick={stop} disabled={!playing && !paused}>Stop</button>
        <button onClick={next} disabled={isControlsDisabled}>Next</button>
        <label>
          <span>Mode</span>
          <select value={mode} onChange={(e) => onModeChange(e.target.value as TtsMode)}>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
          </select>
        </label>
        <label>
          <span>Voice</span>
          <select value={voiceId} onChange={(e) => onVoiceChange(e.target.value)}>
            {availableVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
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
