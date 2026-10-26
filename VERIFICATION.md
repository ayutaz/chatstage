# ChatStage verification — live-mode startup fix, 2026-10-26

## Root causes reproduced

1. **Browser timer receiver:** `TwitchChat` stored the native `setTimeout` / `clearTimeout` functions and called them as `this.schedule(...)` / `this.cancel(...)`. Chromium requires the Window receiver. A real Chrome invocation threw **`TypeError: Illegal invocation` at `TwitchChat.connect`**, when scheduling the join watchdog. The WebSocket had been constructed, but its open/message/close handlers had not yet been installed; no authentication frames were sent, and Twitch closed the unauthenticated connection. Node timers and the arrow-function timer fakes used by earlier tests did not enforce this browser-specific receiver requirement.
2. **Startup error/state ownership:** the overlay's single `try/catch` covered both successful Piper initialization and subsequent Twitch startup. The chat exception therefore displayed **“The voices need another try”** even though Piper was ready. `started` had already been set to true before the exception, so the retry button took the resume-only branch and never started chat or the queue again. Demo mode skipped the Twitch branch and could not expose this fault. Automatic OBS-style startup also exercised this path with the start button correctly hidden; a missing user gesture was not the failure.

The owner's original `.artifacts/live-repro.mjs` was run against the deployed site before the fix: Piper initialized, the WebSocket opened/closed without IRC replies, the status remained “Connecting,” and the misleading voice-error card appeared. A separate real-Chrome direct call isolated the exact thrown stack at the watchdog scheduling line. `fps_shaka` was confirmed live through DecAPI (uptime **3 hours, 54 minutes** at the initial check).

## Fixes

- Native timer defaults are bound to `globalThis`, including reconnect and cleanup. Socket handlers are installed before scheduling the watchdog. Stale open/watchdog callbacks cannot operate on a replaced/disconnected socket, repeated `connect()` calls do not create parallel sockets, and `366` plus `ROOMSTATE` produce only one joined notification per connection.
- `src/session.js` separates audio readiness, pending startup, and chat readiness. OBS autoplay and click-to-start use the same preparation path. A chat failure leaves the ready CSS10 engine available, displays a chat-specific retry, and retries chat without downloading/reinitializing speech. A genuine audio/model failure retries audio preparation. Navigation during loading cannot start a late socket/queue.
- Unexpected audio/chat startup failures now log their phase and exception stack to the console. Normal chat text is not logged.
- CSS10-only voices, model selection restrictions, package pins, and project-subpath URL handling remain in place.

## Automated regression checks

Node **v24.15.0**, `node --test`: **37 passed, 0 failed/skipped**. `git diff --check` also passes.

New tests first reproduced the timer failure with receiver-enforcing host timer doubles, then passed after binding. The startup tests cover no-gesture OBS startup, click-required audio, concurrent starts, real audio preparation failure/retry, chat failure/retry without reinitializing audio, and leaving during asynchronous preparation. Existing tests retain IRC/moderation/commands, Unicode cleaning, preferences, deterministic CSS10 presets, timing, queue cancellation/prefetch/pause, and project-subpath coverage. Joined-status deduplication is also checked.

## Real Chrome live-channel checks

Chrome **155.0.8059.85**, viewport **1920 × 1080**, actual CSS10/WASM/ORT downloads and actual anonymous Twitch connections to **`#fps_shaka`**. No fake chat or speech engine was used. The harness counts received IRC/PRIVMSG frames and observes real PCM AudioBufferSource starts, RMS, AudioContext state, and ended events. It does not save chat transcripts.

| Scenario | Chat joined | First speech | Received PRIVMSGs | Speech buffers / ended events | Result |
| --- | --- | --- | --- | --- | --- |
| Local `/chatstage/`, OBS-style autoplay, **zero clicks** | 22.320 s | 23.764 s | 3 | 2 / 1 | Pass |
| Local `/chatstage/`, document activation required, **Start audio clicked** | 26.798 s | 27.467 s | 2 | 2 / 1 | Pass |
| Deployed Pages origin, **local patched modules intercepted**, OBS-style autoplay, zero clicks | 20.722 s | 40.929 s | 2 | 2 / 1 | Pass |
| Local demo, OBS-style autoplay, zero clicks | 22.943 s (demo ready) | 23.302 s | 0 (expected) | 1 / 1 | Pass |

Each passing run captured **zero browser/page errors, warnings, or failed requests**. Live status reached **“Listening to #fps_shaka”**, with the gate/loading UI hidden. PCM was non-silent (RMS approximately **0.047–0.067**) at **22050 Hz**, and sources started in a **running** AudioContext. Only CSS10 model requests were observed. The gesture-required check confirmed the gate was visible before clicking. The demo made no Twitch connection.

A separate native-browser reconnect check forced the first real socket to close, then observed **connecting → connected → reconnecting → connecting → connected** with two distinct joins, **24 IRC messages**, followed by clean disconnect. No PRIVMSG arrived during that short reconnect-only observation; real message/audio receipt is established by the longer live checks above.

These are individual cold-start observations, not performance benchmarks. Download timing and waiting for the next eligible live message vary.

## Reproduce and inspect evidence

The repeatable optional harness is **`scripts/check-live.mjs`**. The normal Node tests still need no browser dependency. Install Playwright locally for browser checks:

```sh
npm install --prefix .artifacts --no-save --package-lock=false playwright@1.56.1
```

Start the development server with port 4175 and the project prefix (PowerShell):

```powershell
$env:PORT = '4175'
$env:BASE_PATH = '/chatstage/'
npm start
```

Then:

```sh
node scripts/check-live.mjs fps_shaka http://localhost:4175/chatstage/
node scripts/check-live.mjs fps_shaka http://localhost:4175/chatstage/ --gesture
node scripts/check-live.mjs fps_shaka http://localhost:4175/chatstage/ --demo
node scripts/check-live.mjs fps_shaka https://ayutaz.github.io/chatstage/ --patched
```

The default launch uses `--autoplay-policy=no-user-gesture-required` and never clicks. `--gesture` uses `--autoplay-policy=document-user-activation-required` and clicks the gate. This distinction matters for current Chromium's Web Audio policy; the older `user-gesture-required` flag did not keep the AudioContext suspended in this environment. See the [Chrome autoplay/Web Audio documentation](https://developer.chrome.com/blog/autoplay/).

Ignored local evidence:

- `.artifacts/local-obs-autoplay.json` / `.png`
- `.artifacts/local-click.json` / `.png`
- `.artifacts/pages-origin-patched.json` / `.png`
- `.artifacts/local-demo-autoplay.json` / `.png`
- `.artifacts/live-reconnect.json`

## Deployment and remaining boundaries

**No commit, push, or deployment was attempted.** The site is already deployed by the owner; the fixed workspace modules still need the owner's external publication workflow. The Pages-origin check used Playwright request interception for this workspace's `src/` modules; the HTML, origin, CDN assets/models, and Twitch service were real. It establishes compatibility at the deployed origin **without claiming that the publicly deployed code has been updated**.

Actual OBS application/mixer routing and human listening/intelligibility were not assessed. Browser playback is established by actual non-silent buffers, a running context, and ended events. CSS10 still supports only ja/en/zh/es/fr/pt; Korean/Swedish speech is skipped with an explicit notice. Captions remain an estimate from phoneme boundaries rather than word alignment.
