Original prompt: Implement the approved Cambridge CEFR A1-B2 Vocabulary Arcade plan in this repo, using the Cambridge dictionary bundle to build a desktop-first solo-study web app with 6 modes: Hot Seat, Odd One Out, Fly Swatter, Bingo, Jeopardy, and Mystery Sound.

## Progress Log

- Initialized project scaffold for a Vite + vanilla JS app.
- Reserved `scripts/`, `src/`, and `public/data/` for the data pipeline and game client.
- Built the Cambridge reduction script and verified the reduced export: `5207` unique A1-B2 entries, `5036` with audio.
- Trimmed the runtime dataset to avoid shipping a duplicate lookup map.
- Wired the main client shell and started implementing all six game modes, shared progress persistence, and QA hooks.
- Added a queueable loading state so the app can accept mode-start clicks before the full dataset finishes hydrating.
- Added `window.render_game_to_text()` and `window.__arcade_debug__.getState()` for deterministic QA and browser automation.
- QA completed:
  - `Hot Seat`: correct answer flow, multi-round loop, and summary screen verified.
  - `Odd One Out`: correct-answer spelling flow verified.
  - `Fly Swatter`: timed board, correct click, score increase, and timer bonus verified.
  - `Bingo`: clue prompt, correct cell marking, and prompt advancement verified.
  - `Jeopardy`: board render, tile open, correct answer, and score update verified.
  - `Mystery Sound`: audio-choice round, replay control presence, and correct answer flow verified.
  - `Headwords Only Toggle`: reduced active pool from mixed entries to `4652` headwords and still launched audio mode correctly.
- Console cleanup: added a favicon so the browser console no longer logs a 404 on startup.
- QA artifacts saved under `output/` and `output/web-game/`.
- Added a macOS `.command` launcher that starts or reuses the local Vite server and opens the app in the browser.
- Remaining caveat: the initial view intentionally shows a queueable loading screen for roughly the first second or two while the full `game-data.json` payload hydrates.

## Learning Hub Extension

- Extended the reduced Cambridge export with learning-only fields: `partOfSpeech`, `guideword`, `usageCue`, and `memoryCue`.
- Added a separate persistent Learning store under `cambridge-cefr-learning-v1`.
- Implemented a new top-level `Learning` hub beside `Arcade`, with `Today`, `This Week`, `Calendar`, `Bonus Bank`, and `Learning Summary`.
- Built the deterministic 13-week, 5-day-per-week planner:
  - `65` weekday lessons
  - `60` entries per lesson
  - `3900` scheduled core entries
  - `1307` Bonus Bank entries
- Enforced the requested level progression:
  - all `A1`, `A2`, `B1`
  - top-priority `666` `B2` entries in the core path
  - remaining `B2` entries in the Bonus Bank
- Implemented the full lesson flow:
  - `12`-question pretest
  - `6` study groups of `10`
  - `30`-question exercise with `3-6` rotating microgame types by week band
  - retained day summary
- Added weekend rest/catch-up behavior and optional Bonus Bank drills that write records to the actual weekend date.
- Extended `window.render_game_to_text()` and `window.__arcade_debug__.getState()` so Learning exposes hub, view, date, week/day, phase, selected record, current question, and summary state.

## Learning QA

- Rebuilt the dataset and verified the app still exports `5207` entries and `5036` audio-enabled items.
- Production build passes with the Learning hub included.
- Browser QA completed for:
  - course onboarding and Monday start-date setup
  - 65-day course creation and calendar generation
  - locked future weekday behavior
  - day 1 pretest -> study -> exercise -> summary flow
  - persisted completed weekday record on `2026-03-16`
  - weekend Bonus Bank launch and completed record on `2026-03-21`
  - reload persistence for selected date and saved learning records
  - browser console error check: `0` errors
- Ran the required `web_game_playwright_client.js` capture loop after the Learning changes.

## Notes

- The web-game client captures the decorative canvas only, so DOM-heavy Learning screens were validated with Playwright browser snapshots and debug-state inspection rather than the canvas artifact alone.
- Calendar UI removed after follow-up request.
- Future-day locking removed after follow-up request; all 65 lesson days and weekend bonus slots are accessible immediately from the `All Weeks` browser.

## Numbered Learning Navigation Refactor

- Replaced visible date-based Learning labels with numbered lesson labels only:
  - `Current Day`
  - `Week N · Day 1-5`
  - `Week N · Bonus`
- Kept hidden internal dates only for persistence and legacy-record migration.
- Rebuilt persisted Learning UI state around:
  - `selectedLessonKey`
  - `selectedPhaseTab`
  - migrated legacy `selectedDate`
- Regenerated stored courses from `startDate` during Learning init so older saved plans receive:
  - `lessonKey`
  - `displayLabel`
  - `bonusSlots`
- Collapsed old weekend/date bonus selection into one weekly bonus slot per week for the UI while preserving prior saved bonus records by week-level migration.
- Removed the visible start-date picker from onboarding and replaced it with one-click course creation.
- Reworked `All Weeks` to show:
  - five numbered lesson cards per week
  - one weekly Bonus card per week
- Turned the `Day Structure` blocks into clickable phase controls:
  - `Pretest`
  - `Study`
  - `Exercise`
  - `Summary`
- Added a phase-detail panel under the Day Structure controls.
- Added direct phase entry behavior:
  - completed pretests open recap
  - completed exercises open recap
  - completed study decks reopen as a full 60-card review pass
- Updated Learning session headers and summaries to remove all visible date strings.
- Extended `window.render_game_to_text()` Learning payload with:
  - `selectedLessonKey`
  - `displayLabel`
  - `selectedPhaseTab`
  - `bonusDisplayLabel`
  - `bonusStatus`

## Numbered Navigation QA

- `npm run build` passes after the refactor.
- Browser-QA verified:
  - onboarding shows no dates
  - course creation is one-click
  - `Current Day` shows `Week 1 · Day 1`
  - `Day Structure` cards are clickable buttons
  - locked phase cards show locked detail copy and notice text
  - `All Weeks` shows numbered lesson cards plus weekly Bonus cards
  - `Week 13 · Day 5` opens directly from `All Weeks`
  - `Bonus Bank` shows `Week 13 · Bonus` with no dates
  - reload preserves `W13-D5`
  - browser console errors remain at `0`
- The external `web_game_playwright_client.js` still cannot launch its bundled Chromium headless shell in this sandbox due macOS permission failure, so Learning QA for this pass used Playwright MCP snapshots plus `window.render_game_to_text()` instead.

## Learning Chinese Meanings

- Extended the reduced Cambridge export with Learning-only Chinese fields:
  - `cnDefinition`
  - `cnExamples`
- Parsed both fields directly from the Cambridge HTML already bundled in `web_ready_dict_data/full`.
- Kept Chinese text scoped to Learning only, so Arcade gameplay remains unchanged.
- Added `中文释义` under the English definition on Learning study cards.
- Added `中文例句` under each English example in the study deck when a paired Chinese example exists.
- Added Chinese meanings to Bonus Bank preview cards.
- Added post-answer Chinese meaning feedback to Learning pretest/exercise questions without revealing it inside the prompt itself.

## Chinese Meaning QA

- `npm run build:data` passes and the exported dataset now includes `cnDefinition` / `cnExamples`.
- `npm run build` passes after the Learning UI update.
- Browser-QA verified:
  - Learning pretest feedback shows `中文释义` only after answer resolution
  - study cards show both English definition and Chinese meaning
  - study examples show `中文例句` under the English example when available
  - Bonus Bank preview cards show Chinese meanings

## Focused Learning Session Mode

- Added a Learning presentation split between:
  - `dashboard`
  - `focus`
- Active Learning work now opens in a stripped-down focus shell that hides the dashboard sidebar, stats, hero canvas, and week browsers.
- Added a sticky dashboard resume bar whenever a live Learning session is minimized.
- Replaced destructive “Back to Learning Hub” behavior with `Back to Dashboard`, which preserves the exact live session object for resume.
- Persisted live Learning sessions and the new `presentation` flag inside `cambridge-cefr-learning-v1`.
- Added guarded lesson/bonus replacement flow:
  - reopening the same target resumes the exact session
  - opening a different target from the dashboard shows an in-app keep-or-replace dialog
- Updated `window.render_game_to_text()` so Learning now reports:
  - `presentation`
  - `hasActiveSession`
  - `sessionMinimized`
  - `resumeLabel`
  - live session progress labels

## Focus Mode QA

- `npm run build` passes after the focus-mode refactor.
- Browser-QA verified:
  - pretest, study, review, and summary open in focus mode with only session UI visible
  - `Back to Dashboard` preserves exact pretest/study progress
  - reloading a minimized study session restores the dashboard resume bar and resumable state
  - `Keep Current Session` returns to the exact live session
  - `Replace With New Selection` discards the live session and opens the requested lesson phase
- Cleaned up stale dashboard notices so old replacement messages no longer leak into focused session screens.

## Standalone A1-B2 Review HTML

- Added a standalone build path at `npm run build:standalone`.
- Added `scripts/build-standalone-html.mjs` plus a dedicated `standalone/` source set:
  - `template.html`
  - `styles.css`
  - `app.js`
- The generated output is `dist/cambridge-a1-b2-review.html`.
- The standalone file inlines:
  - CSS
  - JS
  - reduced A1-B2 vocab data
- The standalone experience includes:
  - Dashboard
  - Study New
  - Review Due
  - Browse
  - localStorage-backed progress and resumable session state
- SRS implemented with deterministic stages `0-6` and intervals `0, 1, 3, 7, 14, 30, 60` days.
- No audio is included in the standalone file.
- Added a data-URI favicon so the self-contained HTML does not emit a favicon 404 during local-server QA.

## Standalone QA

- `npm run build:standalone` passes.
- Generated HTML has no external script tag, no external stylesheet link, no `fetch`, and no app asset URLs.
- Browser-QA verified over a local static server for the generated file:
  - first paint with all `5207` entries present
  - `Study New` session creation
  - current-session persistence across reload
  - `Again` rating makes a card due immediately
  - `Review Due` picks up the due card
  - `Easy` rating removes the card from today’s due queue
  - `Browse` detail actions for `Mark Due Today` and `Reset Word Progress`
  - persistence after closing and reopening the page
  - browser console errors remain at `0`
- Limitation: Playwright MCP blocks direct `file://` navigation, so interactive QA used `http://127.0.0.1:4211/cambridge-a1-b2-review.html` while preserving the same self-contained HTML payload.

## Portable Cross-Computer Folder

- Added a portable bundle source set under `portable/`:
  - `README.txt`
  - `portable_server.py`
  - `Open Cambridge A1-B2 Review.command`
  - `Open Cambridge A1-B2 Review.bat`
  - `open-cambridge-a1-b2-review.sh`
- Extended `scripts/build-standalone-html.mjs` so every standalone build now also assembles:
  - `output/cambridge-a1-b2-review-portable/`
- Added `npm run build:portable` as an alias for the portable bundle workflow.
- The portable folder now includes the standalone HTML plus local-server launch helpers for macOS, Windows, and Linux.
- The portable folder is intentionally outside `dist/` so a normal Vite build does not wipe it.

## Portable QA

- `npm run build:portable` passes.
- Verified generated bundle contents and executable permissions for the macOS/Linux launchers.
- `portable_server.py` syntax verified with `py_compile` using a temp cache prefix.
- Interactive browser QA loaded the copied bundle from its own portable folder over a local static server.
- Limitation: this sandbox blocks custom Python socket binding for `portable_server.py`, so runtime validation of that exact launcher-backed server had to be approximated with `python3 -m http.server` against the same portable folder contents.

## Editorial Redesign + Deploy Packaging

- Reworked the app’s visual language in `src/styles.css` toward a warmer editorial study aesthetic:
  - ivory-paper surfaces
  - serif-led headings with cleaner hierarchy
  - calmer teal/coral/brass accents
  - upgraded cards, buttons, chips, dialogs, summaries, and focus-mode shell
- Preserved existing gameplay and learning logic:
  - no changes to `window.render_game_to_text()`
  - no changes to `window.advanceTime(ms)`
  - no changes to localStorage semantics or learning/arcade flow
- Replaced the data build pipeline in `scripts/build-data.mjs` so deployable builds now:
  - keep the existing `public/data/game-data.json` schema intact
  - rewrite referenced audio to `/audio/...`
  - copy only the referenced A1-B2 audio subset into `public/audio/`
  - fall back to the already-generated public dataset when raw Cambridge source files are unavailable
- Verified deployable asset reduction:
  - raw source asset tree: `795M`
  - deployable referenced subset: `9195` files in `public/audio/`
  - deployable subset size: about `76M` on disk in this workspace
- Added a deployment-safe `.gitignore` that excludes the raw Cambridge asset tree while keeping generated `public/data/` and `public/audio/` in scope for publishing.

## Figma Source File

- Created a dedicated redesign file in Figma:
  - [Cambridge CEFR Vocabulary Arcade](https://www.figma.com/design/ONDvSOPDlHZoXPohOCRErI)
- Starter-plan limits prevented using 5 separate pages, so the requested design work was mapped into 3 pages:
  - `Foundations`
  - `Learning Views`
  - `Arcade + Responsive`
- Added source-of-truth boards for:
  - palette and typography foundations
  - buttons, chips, status, and card treatments
  - Learning dashboard
  - Learning focus mode
  - Arcade lobby
  - responsive tablet/mobile checks
- Validation note:
  - metadata validation succeeded
  - screenshot validation hit the Figma Starter MCP rate limit after the boards were created

## Redesign QA

- `npm run build:data` passes with the deployable subset packaging flow.
- `npm run build` passes after the redesign changes.
- Browser QA over `http://127.0.0.1:4173/` verified:
  - Learning dashboard loads with the redesigned visuals
  - Learning focus mode opens from `Start Pretest`
  - `Back to Dashboard` minimizes without interrupting session state
  - sticky `Resume` restores the exact live session
  - `All Weeks` remains accessible while a session is minimized
  - Arcade lobby still loads and `Start Hot Seat` still starts a round
  - browser console errors remain at `0`
- Tooling note:
  - Playwright’s higher-level screenshot/click helpers were blocked by sandbox path issues around `/.playwright-mcp`, so QA used direct Playwright page execution plus `window.render_game_to_text()` for verification.
