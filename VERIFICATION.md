# ChatStage verification — 2026-10-26

## Automated

- Node **v24.15.0**, `node --test`: **26 tests passed**, no failures/skips.
- Tests cover IRC tags/escapes/badges/emote ranges and moderation messages; UTF-32/code-point emote cleaning after an astral emoji; URL/emoji/repeat/control cleanup; eight-language detection and sticky overrides; deterministic voices/pitch compensation; bounded preference persistence; viewer/mod commands and authorization; deduplication; queue overload, prefetch, cancellation, pause/resume, failures, and the clear-while-paused transport regression.
- Adapter tests verify the real Piper API contract (`samples`, `sampleRate`, timing, `language`, `lengthScale`, and `ssml: false`), explicit unsupported model language handling, PCM sample rate, gain/playback rate, and actual audio-clock elapsed time.
- Static HTTP integration checks serve the real HTML/ES modules with correct MIME types and reject private/developer paths. Importmap pins and demo emote/moderation fixtures are checked.
- `npm install --package-lock-only --ignore-scripts` reported **0 vulnerabilities** for the pinned dependency graph at the time of installation. Tests do not require these dependencies.

## Real environment checks

- **Chrome, actual CDN modules and real neural models:** both Piper models initialized successfully. A complete scripted demo cycle ran. Captions reported `PHONEME SYNC` from actual timing, the queue advanced through generated audio, and no warnings/errors appeared in the captured browser console.
- **Browser UI:** entering a channel generated the expected overlay URL and **Copy OBS URL** reported success. Preferences were restored on reload. The demo's **Pause → Clear stage → Resume** sequence cleared the cast/caption and resumed subsequent Japanese speech with phoneme timing.
- **Responsive setup:** inspected at 390 CSS px; document width did not exceed the viewport. Desktop demo inspected at 1920 CSS px width. The live overlay background is transparent by CSS; demo has a distinct dark backdrop.
- **Real Twitch endpoint:** the application `TwitchChat` client connected anonymously to `#twitchdev`, received the room-joined status, and disconnected. No chat messages were sent or logged.

## Boundaries and remaining limitations

- **Six spoken languages, eight detected languages:** both supplied Hugging Face configs were fetched and contain only `ja/en/zh/es/fr/pt` language IDs. Korean/Swedish speech requires compatible models. The app saves those preferences but skips synthesis with a clear notice. No cloud or OS fallback disguises the limitation.
- Browser playback progression and timing were observed; **human listening quality, pronunciation, perceived voice distinctness, exact lip-sync quality, and real OBS audio routing were not independently assessed**.
- Full live broadcaster chat/moderation was covered with IRC fixtures and unit/integration tests; the live Twitch check confirms anonymous connectivity, not every moderation event in production.
- Caption character highlighting is an estimate from phoneme timing, not word alignment.
- GitHub Actions/Pages files are provided, but no remote repository is configured here and **no deployment was performed**.
- A requested logical commit was attempted after the first 19 passing tests. Git staging and commit both failed with **`.git/index.lock: Permission denied`** because the session exposes `.git` read-only. No commits could be created. The original brief and runner log remain intact; logs and dependencies are ignored. Commit the workspace from a session with Git metadata write access.

## Suggested logical commits when Git writes are available

```sh
git add .gitignore .prettierrc.json BRIEF.md package.json package-lock.json src/config.js src/irc.js src/text.js src/language.js src/voices.js src/preferences.js src/controller.js src/visemes.js src/queue.js test/core.test.js test/queue.test.js
git commit -m "Build tested chat processing and cancellable speech queue"
git add index.html overlay.html assets src/setup.js src/overlay.js src/stage.js src/demo.js src/tts.js src/twitch.js scripts test/integration.test.js test/site.test.js
git commit -m "Add local neural speech, Twitch overlay, demo, and setup"
git add README.md LICENSE VERIFICATION.md .github/workflows/pages.yml
git commit -m "Document voice terms and verification and deploy with Pages"
```

Run `node --test` before committing. Publishing is separate from these local commits.
