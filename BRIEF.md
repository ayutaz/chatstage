# ChatStage — brief for the Codex x TwitchCon Hackathon

Hackathon rules (summary): build an interactive experience for Twitch streamers and their community **with OpenAI Codex**. Must connect to Twitch (e.g. chat). Judged on Innovation, Potential Impact (useful/entertaining for streamers and chat), Technological implementation, and Design (easy to use, fun to watch). Submission deadline: Nov 2, 2026 14:00 PST. All materials in English.

## Concept

**ChatStage: every chatter gets a voice and a face.**
A browser-only overlay (OBS Browser Source) that turns Twitch chat into a little stage show. Each message is spoken aloud by a lip-synced character that belongs to the chatter: their own consistent voice, their Twitch name color, and a mouth that moves phoneme by phoneme. It speaks 8 languages (ja/en/zh/ko/es/fr/pt/sv) and runs **entirely in the browser** with the open-source `piper-plus` neural TTS (WebAssembly + ONNX Runtime Web). No server, no API key, no per-character TTS fees, chat text never leaves the streamer's PC.

Why it matters: chat TTS today is either robotic (OS voices), paid per character (cloud TTS), or English-first. Japanese and multilingual streams are poorly served, and nothing gives each viewer a persistent on-stream "self".

## Tech constraints

- Static site, **no build step**: vanilla ES modules + an importmap, deployable as-is to GitHub Pages. Keep pure logic in small modules that can be unit-tested with `node --test` (Node 24 is available).
- TTS: npm package `piper-plus@0.8.2` + `onnxruntime-web@1.30.0`. Read its README.npm.md and `types/index.d.ts` (install it locally with npm to inspect, e.g. into `node_modules`, but the site itself loads it via importmap). Load `piper-plus` from **unpkg** (its G2P WASM is ~60 MB and jsDelivr refuses files >50 MB); `@piper-plus/g2p@0.4.2` and `onnxruntime-web` from jsDelivr, as the README shows. Models: `tsukuyomi` (`ayousanz/piper-plus-tsukuyomi-chan`) and `css10` (`ayousanz/piper-plus-css10-ja-6lang`); both single-speaker, multilingual. Use the phoneme timing (`result.timing.phonemes`, `hasTimingInfo`) for lip sync and karaoke captions. Check the real API (what `synthesize` returns, sample rate, options such as speed/lengthScale, `language`) from the package source instead of guessing.
- Twitch chat: anonymous read-only IRC over WebSocket (`wss://irc-ws.chat.twitch.tv:443`, `CAP REQ :twitch.tv/tags twitch.tv/commands`, `PASS SCHMOOPIIE`, `NICK justinfan<random>`, `JOIN #channel`, answer `PING`). Verified working on 2026-10-26. No OAuth, no client ID needed. Reconnect with backoff.

## Features (MVP, in priority order)

1. **Overlay** (`overlay.html`, transparent background, 1920x1080 friendly) reading chat from `?channel=<name>`.
2. **Per-chatter voice**: deterministic preset from a hash of the user id/login (model + pitch + speed). Implement pitch by synthesizing slower/faster and compensating with `AudioBufferSourceNode.playbackRate` (or another approach that works) so viewers get distinct voices from 2 models. Viewer commands: `!voice <1-8>` / `!voice random`, `!lang <code>` (sticky language override), `!quiet` (opt out of being read). State persists in localStorage.
3. **Stage + lip sync**: up to ~5 recent speakers are on stage as simple, charming characters (SVG/CSS, colored with the chatter's Twitch `color` tag, name tag). The active speaker's mouth shape follows phoneme timing (viseme mapping for ja + a sensible mapping for other languages), synced to actual audio playback time. A speech bubble shows the message with karaoke-style highlighting. Idle animation for others, enter/leave transitions. It must look good on stream.
4. **Clean text before speaking**: remove Twitch emotes using the `emotes` tag ranges (indices are UTF-16? check: Twitch counts Unicode code points), URLs → "link", collapse long repeats (`wwwwwww`, `888888`, `草草草草`), drop emoji, cap length (configurable), skip messages starting with `!` (other bots' commands) except ChatStage commands.
5. **Moderation-aware**: honor `CLEARCHAT` (ban/timeout → drop that user's queued and current lines), `CLEARMSG` (drop that message), and mod/broadcaster commands `!skip`, `!pause`, `!resume`, `!clear`, `!ttsmute <user>`, `!ttsunmute <user>` (detect via `badges` / `mod` tags). Optional allow-list modes: everyone / subs / vips+mods.
6. **Language**: auto-detect per message (kana → ja, hangul → ko, Han without kana → zh, Latin → en, plus simple heuristics for es/fr/pt/sv when confident; else the user's sticky `!lang`; else the channel default).
7. **Queue**: FIFO with max length (drop oldest when overloaded, show a "+N" counter), synthesize the next message while the current one plays.
8. **Setup page** (`index.html`): enter channel name, pick options (default language, read names on/off, max length, volume, who can be read, model set), live preview of the overlay, and a "Copy OBS URL" button. Clear steps for OBS (Browser Source, size, "Control audio via OBS").
9. **Demo mode** `?demo=1`: a scripted multilingual fake chat (including emotes, a URL, spam, a mod `!skip`, a ban) so judges can try it without a live channel. Also a first-run "click to start audio" gate for normal browsers (OBS doesn't need it).
10. Loading screen with progress while models download (first time only; cached in IndexedDB afterwards).

## Quality bar

- Unit tests (`node --test`) for: IRC line parsing (tags, badges, emotes, CLEARCHAT/CLEARMSG), text cleaning, language detection, voice assignment determinism, command handling, viseme mapping, queue behavior.
- `README.md` in English: what it is, 60-second OBS setup, viewer & mod commands, privacy (all local), how it was built with Codex, credits & licenses (piper-plus MIT; check each voice model's Hugging Face model card for its license/credit requirements and reproduce the required credit in README and on the setup page).
- A GitHub Actions workflow that runs the tests and deploys the static site to GitHub Pages.
- Keep the code readable; no framework needed. Do not commit node_modules.

Work autonomously. Commit in small logical steps with clear messages. When done, summarize what you built, what you tested, and anything you could not verify (e.g. audio playback, which needs a real browser).
