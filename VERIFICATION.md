# ChatStage verification — CSS10-only follow-up, 2026-10-26

## Changes verified

- All eight presets use **CSS10**. Their IDs/names stay stable, with eight different pitch/playback rates spanning **0.80–1.30** and independently varied speeds **0.84–1.18**. Synthesis length compensates for pitch changes so the selected pace is retained.
- The speech adapter has one fixed `PiperPlus.initialize({ model: 'css10', ... })` path and one engine. It does not select or initialize another voice model, even when an obsolete caller passes a different model setting. This removes the extra voice-model download and inference-session initialization; no controlled wall-clock speedup measurement was made.
- Model selection is removed from setup/configuration and generated URLs. Legacy `models` URL or saved-setup fields are ignored safely. The old model's UI credits/terms and stage attribution are removed; the CSS10 credits remain. README contains the project owner's requested short licensing explanation.
- Application-owned asset, module, preview, navigation, and overlay URLs are relative. OBS URLs resolve from the current page location. External CDN/model URLs remain absolute as required by the pinned runtime.

## Automated checks

- Node **v24.15.0**, `node --test`: **31 tests passed**, no failures/skips.
- New regression coverage verifies all eight presets use CSS10, have different pitches within the requested bounds, and retain pitch/pace compensation; obsolete model settings cannot affect voices or enter newly generated OBS URLs; concurrent initialization plus all eight syntheses initialize only one CSS10 engine; removed UI content stays absent; and the same-sentence audition routes all eight presets through the actual IRC parser/controller.
- The project-subpath HTTP test mounts the real site at **`/chatstage/`**, follows both HTML entry points and their local asset/module graph, verifies successful responses, rejects root-relative references, and checks the directory redirect. OBS URL tests cover **`https://ayutaz.github.io/chatstage/`** and its `index.html` URL with query/hash values.
- Existing coverage remains for IRC tags/escapes/badges/emotes/moderation, Unicode code-point cleaning, language detection, commands/authorization, persistence, deduplication, visemes/audio clock, queue overload/prefetch/cancellation/errors/pause/resume, PCM sample rate, plain-text synthesis, and private-path rejection.
- `git diff --check` passes. No commits or other Git writes were attempted, as requested by the project owner; the prior implementation was committed externally.

## Chrome checks for this follow-up

- Served the actual application at **`http://localhost:4174/chatstage/`** using the development server's project-prefix mount. The setup page, styles, characters, modules, and embedded overlay loaded correctly.
- Entering a channel and clicking **Copy OBS URL** succeeded. The resulting URL began with **`http://localhost:4174/chatstage/overlay.html`**, preserved the configured options, and contained no model parameter. The removed model selector and voice attribution were absent; CSS10 credits were visible.
- Opened **`/chatstage/overlay.html?demo=1&models=tsukuyomi`** to exercise a legacy URL. Loading identified **CSS10**, then the multilingual demo ran with real neural audio/timing. The queue progressed, `PHONEME SYNC` appeared, and the captured browser console showed no warnings/errors. Only-CSS10 initialization is established by the adapter implementation and spy-based test; a browser network trace was not available in the browser tool.
- Opened the **Compare 8 voices** link under the same prefix. Its **`?demo=1&voices=1`** audition plays the same English sentence with each preset, making pitch/pace comparisons reproducible. It reached preset **8 · Moss**, with the final caption completed, an empty queue, phoneme timing, and no captured browser warnings/errors. A screenshot is retained at `.artifacts/chatstage-css10.jpg` (ignored by Git).

## Evidence retained from the initial implementation

- The setup page was inspected at 390 CSS px without horizontal overflow, and the desktop overlay at 1920 CSS px width.
- Browser **Pause → Clear stage → Resume** removed the cast/caption and allowed subsequent speech. This transport behavior also has a regression test.
- The application `TwitchChat` client previously connected anonymously to `#twitchdev`, received the room-joined status, and disconnected without sending or logging chat messages. That live check was not repeated for this voice-only follow-up; the connection code is unchanged.

## Limits

- CSS10 contains only **ja/en/zh/es/fr/pt** language IDs. Korean/Swedish are detected and their preferences are saved, but synthesis is skipped with a clear notice. There is no cloud/OS fallback.
- The widened preset parameters and real synthesis/playback progression were checked. **Human listening quality, pronunciation, perceived naturalness/distinctness, exact lip-sync quality, and real OBS audio routing were not independently scored.** The audition is provided for direct listening comparison.
- Caption character highlighting remains an estimate from phoneme boundaries, not word alignment.
- The GitHub Pages project path was reproduced locally and checked against the intended HTTPS URL in unit tests. **No production deployment was performed or verified in this follow-up.**
