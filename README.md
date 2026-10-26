# ChatStage

**Every chatter gets a voice and a face.** A browser-only Twitch overlay that gives your community persistent little characters, local neural speech, phoneme lip sync, and karaoke-style captions. Designed for OBS at 1920 × 1080, with a transparent live background. No backend, API key, build step, framework, or per-character TTS fee.

Open `index.html` through an HTTP(S) static host. Try **Open full demo** to hear scripted multilingual chat without connecting to Twitch. Click **Start audio** once in a normal browser. Demo audio uses the actual neural engine, not prerecorded audio or OS voices.

## Run locally

Node 24 or later:

```sh
node --test
npm start
```

Open <http://localhost:4173>. `npm start` is a small **development-only** static server bound to localhost. It is not a TTS backend; speech stays in the browser. Application tests use only Node built-ins and need no installation. Optional `npm ci` installs the pinned TTS packages for source/API inspection; the website always loads its importmap from CDNs. Never open the HTML with `file://` because browsers restrict module imports and storage there.

## 60-second OBS setup

1. Open the setup page, enter a Twitch **login/channel name** (not a display name), and choose a language, audience, volume, and message length.
2. Click **Copy OBS URL**. In OBS, add a **Browser Source**, paste the URL, and set **Width 1920**, **Height 1080**. The normal live overlay is transparent; only the demo has a backdrop.
3. Check **Control audio via OBS** and set the source volume in the mixer. In Advanced Audio Properties, use **Monitor and Output** only if you also want to hear it yourself; select your monitoring device in OBS audio settings. Avoid routing the same audio through Desktop Audio twice.
4. Allow the first model download to finish. OBS usually permits autoplay. If the start gate appears, right-click the source → **Interact** → **Start audio**. Keep **Shutdown source when not visible** off if you want continuous chat and preferences.

Use the deployed HTTPS URL for a portable OBS source. A localhost URL works while the local server is running on the streaming PC. Close/mute other demo or preview tabs when broadcasting to avoid duplicate audio. The embedded setup preview defaults to **scripted demo**, independently of the live OBS URL; switch it to **My Twitch channel** to test your channel.

## Viewer commands

| Command | Behavior |
| --- | --- |
| `!voice 1` … `!voice 8` | Choose one of eight CSS10 pitch/speed presets. |
| `!voice random` | Choose and save a random preset. |
| `!lang en` | Sticky language override; takes precedence over detection. Codes: `en`, `ja`, `zh`, `ko`, `es`, `fr`, `pt`, `sv`. See language limitations below. |
| `!lang auto` | Reset the override. |
| `!quiet` / `!quiet on` | Toggle your own speech off/on, or explicitly opt out. Queued/current lines are removed when opting out. |
| `!quiet off` | Opt back in. Does not override a moderator mute. |

The user ID (login when absent) is hashed to a stable preset and character appearance. The Twitch color tag colors their character; missing colors get a deterministic palette color. Preferences persist in localStorage, per channel and per browser profile. Voice changes affect **future** lines. All eight presets use the CSS10 model, with distinct pitch values from 0.80 to 1.30 and independent speed values from 0.84 to 1.18; synthesis-length compensation preserves their chosen pace. Preset IDs and names remain stable for saved viewer preferences. Old `models=tsukuyomi`, `models=both`, or other model settings are safely ignored; new OBS URLs omit the model parameter.

| Preset | Pitch / playback rate | Speed |
| --- | --- | --- |
| 1 · Velvet | 0.80 | 0.88 |
| 2 · Peach | 1.08 | 1.06 |
| 3 · Pip | 1.30 | 1.13 |
| 4 · Moon | 0.94 | 0.84 |
| 5 · Cedar | 0.87 | 1.02 |
| 6 · Sunny | 1.15 | 0.96 |
| 7 · Pixel | 1.22 | 1.18 |
| 8 · Moss | 1.01 | 0.91 |

Use **Compare 8 voices** in the demo (or `overlay.html?demo=1&voices=1`) to audition the same English sentence across all eight presets. The wider pitch spread and varied pace provide separation without extreme pitch shifts; perceived naturalness and distinctness still require listening.

## Broadcaster and moderator commands

| Command | Behavior |
| --- | --- |
| `!skip` | Stop the current line; if synthesis is pending with nothing playing, drop that line. |
| `!pause` / `!resume` | Pause/resume actual audio and its lip-sync clock; queued lines retain FIFO order. |
| `!clear` | Stop audio, clear queued/prepared lines and stage characters, and remove the caption. |
| `!ttsmute login` / `!ttsunmute login` | Persistently mute/unmute a viewer locally; immediately remove muted viewers' current/queued lines. |

Authorization uses Twitch `mod=1` or `moderator`/`broadcaster` badges, never a display name. Twitch `CLEARCHAT` removes all current, prepared, and queued lines for a banned/timed-out user (or all lines for a channel clear). `CLEARMSG` removes a particular message. Deletion also removes its caption/character. Twitch bans/timeouts do **not** create a permanent local mute; after a timeout expires, a new permitted message may speak. A mod mute remains until `!ttsunmute`.

Audience choices: everyone; subscribers/founders + mods/broadcaster; or VIPs + mods/broadcaster. Viewer preference commands work regardless of audience. Other `!` commands are never spoken. Message IDs are deduplicated in a bounded in-memory window.

## Language support: runtime vs. voice model

The **pinned runtime supports eight G2P languages**, but the **CSS10 model config contains six language IDs**: `ja`, `en`, `zh`, `es`, `fr`, `pt`. Its model card advertises six languages. ChatStage synthesizes these six with Piper. Korean and Swedish are detected and their language preferences are accepted, but speech is **skipped with an explicit notice**, rather than supplying a nonexistent model input, silently using English, or transmitting text to another service. Full eight-language speech needs compatible trained models and is an upstream limitation of the CSS10 model. No cloud/OS fallback is used.

Automatic detection prioritizes kana → Japanese; Hangul → Korean; Han without kana → Chinese. Confident lexical/diacritic hints identify Spanish, French, Portuguese, and Swedish; other Latin text defaults to English. Numbers/punctuation fall back to the channel language. `!lang` overrides all detection, including ambiguous Han-only Japanese. This is a small heuristic, not a general language classifier.

## Audio, timing, and queue

- Uses **`piper-plus@0.8.2`**, **`@piper-plus/g2p@0.4.2`**, **`onnxruntime-web@1.30.0`**. Piper is loaded from **unpkg** because its approximately 60 MB G2P WASM exceeds jsDelivr's file limit; G2P JS and ORT come from jsDelivr, as the package README prescribes. The WASM module URL is explicitly absolute to avoid ambiguity in dynamic-import resolution.
- Only `css10` is downloaded from Hugging Face and initialized before chat starts, with model and phonemizer progress. Initialization creates one inference session and downloads one voice model, avoiding a second model download and session startup. Piper caches model/config data in IndexedDB; WASM uses the browser HTTP cache. First use needs internet and can download well over 100 MB. Cache eviction/private browsing can require another download. No claim of fully offline startup is made: CDN modules and model metadata may still require the network.
- Single-thread ORT WASM works on GitHub Pages without COOP/COEP/SharedArrayBuffer. Piper can attempt GPU acceleration and fall back to WASM. Long synthesis can still be CPU-intensive; keep the message limit modest.
- `synthesize()` returns an `AudioResult`; ChatStage consumes its actual `Float32Array samples`, `sampleRate`, `hasTimingInfo`, and `timing.phonemes` (`start_ms` / `end_ms`). It disables SSML parsing for chat text (`ssml: false`). No HTML from chat is inserted into the document.
- Pitch is changed with `AudioBufferSourceNode.playbackRate`; synthesis uses `lengthScale = 1.5 × pitch / speed` so pitch changes are compensated for pace. No speaker IDs are invented for this single-speaker model.
- Mouth shapes follow Japanese/IPA phonemes on `AudioContext.currentTime`, multiplied by the playback rate. Pausing freezes this clock. Missing timing closes the mouth; the app does not manufacture phoneme data. Caption highlighting estimates character position from phoneme boundaries; Piper supplies no word/character alignment. Timing may inherit upstream trimming/alignment imperfections, especially on very short inputs.
- A bounded FIFO queue drops the oldest **waiting** entry when full, counts dropped lines as `+N`, and prepares one next entry while current audio plays. Moderation invalidates pending synthesis and prepared audio before they can play. There is at most one synthesis operation in flight.
- Cleans Twitch emote ranges using **Unicode code-point positions**, before text normalization; replaces URLs with “link”; strips emoji/control characters; collapses repeats; caps code-point length. Twitch ranges are inclusive. The astral-emoji regression test distinguishes this from JavaScript UTF-16 indexing.

## Privacy and storage

Twitch chat arrives directly from `wss://irc-ws.chat.twitch.tv:443` using an anonymous read-only IRC connection (`justinfan…`, `PASS SCHMOOPIIE`, tags/commands capabilities). The app replies to `PING`, reconnects with capped exponential backoff and jitter, and never sends a `PRIVMSG`, OAuth credential, or chat transcript. Chat text never goes to a TTS service or ChatStage server. CDNs/Hugging Face receive asset-download requests and ordinary connection metadata. There is no analytics or message logging.

Pending chat/audio lives in memory; the **last spoken caption remains visible** until another line or a clear/moderation event. Viewer settings and moderator mute logins persist in localStorage, capped at 2,000 viewer settings per channel. Setup options persist separately. Models/configs are cached by Piper in IndexedDB. OBS storage is separate from your normal browser; clearing site data resets caches and preferences. Anonymous IRC is an existing Twitch behavior, not a guarantee of future service availability.

## Demo and development layout

`overlay.html?demo=1` runs a repeating scripted show through the real IRC parser and controller. It includes six spoken languages, an astral emoji before a Twitch emote, a URL, repeated characters, a voice change, mod pause/resume/skip, and a timeout that deletes queued/current lines. No live Twitch connection is made in demo mode. The setup preview displays idle sample characters before audio is started; their mouths move only when actual synthesized audio has timing.

| Path | Purpose |
| --- | --- |
| `index.html`, `src/setup.js`, `assets/setup.css` | Setup, preview, settings, URL copy, instructions and credits |
| `overlay.html`, `src/overlay.js`, `src/stage.js` | Transparent overlay, audio gate, progress, SVG cast and captions |
| `src/irc.js`, `src/twitch.js` | IRC parser/framing, anonymous WebSocket and reconnect |
| `src/controller.js`, `src/preferences.js` | Commands, authorization, moderation, deduplication and persistence |
| `src/queue.js`, `src/tts.js` | Cancellable prefetch queue, verified Piper API adapter and audio clock |
| `src/text.js`, `src/language.js`, `src/voices.js`, `src/visemes.js` | Small testable pure modules |
| `test/` | Node built-in unit and integration tests |
| `scripts/serve.js` | Local static preview server (not deployed) |

## GitHub Pages

The included `.github/workflows/pages.yml` runs `node --test` on pull requests and `main` pushes. After successful main tests it uploads **only** HTML, source modules, CSS/SVG, README, and license, and deploys with the official GitHub Pages actions. No build command, npm installation, node_modules, developer logs, or private files go into the site artifact. In repository **Settings → Pages → Source**, select **GitHub Actions**. Push to `main` or run the workflow manually. Relative URLs support `https://owner.github.io/repository/` paths.

All application HTML assets, ES-module imports, setup links, and overlay links use relative paths. OBS URLs are resolved from the current page location, so opening `https://ayutaz.github.io/chatstage/` or its `index.html` generates `https://ayutaz.github.io/chatstage/overlay.html?...`. Pinned external CDN/runtime/model URLs remain absolute.

To reproduce the project path locally in PowerShell:

```powershell
$env:PORT = "4174"
$env:BASE_PATH = "/chatstage/"
npm start
```

Then open <http://localhost:4174/chatstage/>. Tests traverse the served HTML asset/module graph under that prefix and verify URL generation against the actual GitHub Pages origin.

Deployment configuration is included; publishing requires a writable Git repository and a GitHub Pages-enabled remote. Actual OBS playback, output routing, language intelligibility, and production deployment need separate confirmation in those environments.

## Built with Codex

This project was implemented with OpenAI Codex from `BRIEF.md`: package-source inspection before integration, Node test-first chat/queue logic, vanilla browser modules and original SVG characters, browser checks, and static-site delivery. Codex was used to write and verify the app; it is not part of the runtime and no OpenAI API is called. The pinned package's `README.npm.md`, `types/index.d.ts`, and implementation were inspected for real API shapes, options, imports, and timing units.

## Credits, licenses, and voice-use terms

ChatStage code and original SVG characters: **MIT**, see [LICENSE](LICENSE). Voice models/data have **separate** terms and are not re-licensed by the app's MIT license. They are downloaded at runtime, not redistributed in this repository. The character art is original.

The Tsukuyomi-chan model is intentionally not used because its [corpus terms](https://tyc.rei-yumesaki.net/material/corpus/) require prior consultation for voicing other characters.

- [Piper Plus](https://github.com/ayutaz/piper-plus) and `@piper-plus/g2p`: MIT. [ONNX Runtime](https://github.com/microsoft/onnxruntime): MIT. Piper TTS: [rhasspy/piper](https://github.com/rhasspy/piper). MB-iSTFT-VITS: [Kawamura et al.](https://arxiv.org/abs/2210.15975). See the runtime packages for bundled dictionary/dependency notices.
- [CSS10 Japanese model by ayousanz](https://huggingface.co/ayousanz/piper-plus-css10-ja-6lang): model card says **CSS10 public-domain dataset terms** (`license: other`, `license_name: css10-public-domain`) and refers to [CSS10](https://github.com/Kyubyong/css10). Dataset: **Kyubyong Park and Thomas Mulc**, “CSS10: A Collection of Single Speaker Speech Datasets for 10 Languages” (Interspeech, 2019). Japanese audiobook: *Meian* by Natsume Sōseki, read by **ekzemplaro**, LibriVox. CSS10 repository **code** is Apache-2.0; that is distinct from dataset/voice terms. [LibriVox's public-domain statement](https://librivox.org/pages/public-domain/) applies in the USA and asks users elsewhere to check local copyright status.

The CSS10 model card/config and the project owner’s voice-licensing correction were reviewed on **2026-10-26**. The CSS10 alias resolves upstream files, so future repository changes may alter downloads or model behavior even though JS packages are pinned.
