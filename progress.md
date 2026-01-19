## Next Iteration Notes

- Verify iOS playback stability across longer sessions (auto-advance + pause/resume).
- Consider larger phrase chunking to reduce Piper request count and latency.
- Add a TTS cache eviction policy (size cap or LRU) for `/data/tts-cache`.
- Add per-session TTS cost tracking for online OpenAI usage.
- Extend smoke tests to cover offline Piper install + playback on iOS.
