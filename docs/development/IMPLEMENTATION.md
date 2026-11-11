# Reliability and games update

This update implements the security and reliability fixes from the project review and expands the games. It does not claim physical-device certification or unlimited-format compatibility.

## Implemented

1. Imported HTML passes a normalized URL allowlist and DOMPurify. External document images are blocked by default and can be enabled in Settings.
2. SheetJS migrated to its patched vendor distribution, locked with integrity metadata. Tooling dependencies refreshed; npm audit reports zero advisories at verification.
3. IndexedDB writes wait for transaction completion. Document patches read the latest record inside the write transaction. File, cover and document imports commit atomically; deletion spans the relevant stores in one transaction.
4. Storage startup failures show retry/recovery UI instead of a blank screen. Settings exposes persistence requests and derived-cache cleanup.
5. Preferences persist immediately. Notes serialize writes, retain recoverable drafts, and save on Back/Done/backgrounding. Failed saves remain visible as unsaved.
6. Complete versioned backups of stored documents, files, annotations, settings, days and private kv data. Optional AES-GCM encryption uses PBKDF2 with a fresh salt/IV. Restore validates before replacing records in one transaction. Linked Android originals are not copied into backups; they must remain accessible. Restore explicitly warns before replacing the current library.
7. Deletion removes document conversations and related data; a ten-second in-memory undo restores the removed records. Legacy answer caches without ownership are also purged. Temporary undo data is never written to disk.
8. Removed automatic catalogue prefetch, automatic studio-voice download/retry and automatic sample-book insertion. Voices and samples are explicit Settings actions. AI consent names the title and conversation history that are sent.
9. Updated canonical in-app URLs to the renamed repository. Account-level hosting work remains blocked; see below.
10. Added install manifest, versioned offline application shell, same-origin asset caching and an update prompt. Offline reload and a saved reader are exercised against the production build. PDF/OCR resources are cached as used rather than promising every tool is ready before its first use.
11. Added import/archive/download limits, spreadsheet worker isolation and timeout, link-download cancellation/deadlines, and media blob fast paths. DOM-dependent EPUB/Word parsing still runs on the main thread within size limits.
12. Removed deliberate mobile shrinking and disabled-zoom viewport settings. Enabled native WebView zoom without its floating controls.
13. Shared sheets now move/contain/restore focus and have a fallback accessible name. Toast actions support the keyboard and live announcements. Focus indicators and reduced-motion notification styles added.
14. Added browser regression CI, dependency checks, build checks and game tests. Android CI emits a debug test APK when no key is configured; publishable releases require signing. Device/emulator coverage remains outstanding.
15. Froggy refreshes passages before each question, fingerprints content and full recent history for caching, treats excerpts as untrusted context, shows source excerpts and can find the passage in the reader.
16. Split optional screens and the library tab header; main JS fell from approximately 1.81 MB to approximately 1.57 MB before compression at the initial measurement. Device latency profiling remains outstanding.
17. Replaced global DOM rewriting with explicit translations in React components. Language changes rerender the app; document content remains untouched. Phrase fallback remains English where translations have not yet been supplied.
18. Fixed longest-streak continuity across consecutive frozen days, covered by a regression test.
19. Added a direct “Open my first document” onboarding action and accurate browser file-storage wording. Samples are optional. The extended introduction remains available.
20. Added pinned books, editable tags/collections, duplicate-aware imports for files up to 10 MB, and local shelf search over cached text and annotations. Text is indexed as documents are opened/rendered, capped at 250,000 characters per document. This is not a full-library PDF index or a result-to-page search engine.

## Games

- Sling: gentler initial climb, longer grip windows, bounded difficulty progression, keyboard aim/grab controls, practice mode without bees and a shorter goal.
- Deep Cuts: longer, more forgiving practice mode; pausing preserves the prompt and timer.
- Both: pause/resume, automatic pause when hidden, Back pauses before leaving, elapsed active time, saved win/run totals and guarded completion/rewards.
- Pond Pairs: a new twelve-card, six-pair memory game with repeatable daily decks, keyboard-accessible cards, two limited peeks, move counts and no time pressure. Practice completion cannot grant a daily block.
- Daily reward limits continue to apply across all games. Practice never advances the level or earns a reward.

## Deletion-message fix

Translations no longer mutate text nodes behind React's back. Notifications use an isolated `frogity-toast` class, render through a portal, have constrained dimensions and translate their string explicitly. Regression coverage checks deletion with French enabled, private-data cleanup, and undo.

## Remaining work / external blockers

- GitHub Pages remains configured to publish `ccr-2ab94055-hhv6b8:/docs`. Updating it to `main:/docs` returned HTTP 403 (“Resource not accessible by integration”). A repository administrator must change this in Pages settings. URL fixes alone do not change hosting configuration.
- The separate `frogity-web` Vercel project previously failed while `financely` succeeded. Its account settings/build logs are not available through the current connection. Consolidation needs hosting-account access; no project was deleted.
- No Android device/emulator is available here. Camera/OCR quality, TalkBack, file-provider grants, widgets, screen-off audio, incoming calls/headphones and installation/update signing require device validation.
- Broader corpus tests, full-text indexing with precise page navigation, more parser worker isolation, complete translation coverage, exhaustive accessibility checks and measured low-end-device performance remain extensions of the original large proposals. These are not represented as finished.

## Verification

Run `npm run build`, `npm test` (after installing Playwright Chromium), and `npm audit`. The browser suite covers unsafe markup, concurrent patches, settings, storage denial, note navigation, deletion/undo, encrypted backup, frozen streaks, modal focus, translated messages, all three games, physics bounds, spreadsheet parsing limits, transaction rollback, duplicate imports and production offline reopening. Representative parser fixtures also cover TXT, Markdown, HTML, RTF, Frogity notes, CSV, TSV, JSON, PDF, XLSX, DOCX and EPUB; malformed PDF and DOCX reject safely.
