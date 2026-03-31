# Cambridge CEFR Vocabulary Arcade

A desktop-first vocabulary web app built from the Cambridge Advanced Learner's Dictionary A1-B2 dataset.

It combines two main experiences:

- `Learning`: a structured 13-week course with numbered lessons, pretests, study decks, mixed exercises, Chinese meanings, and resumable progress
- `Arcade`: six replayable vocabulary game modes built from the same reduced Cambridge dataset

## Live Links

- Live app: [cambridge-cefr-vocabulary-arcade.vercel.app](https://cambridge-cefr-vocabulary-arcade.vercel.app)
- GitHub repo: [MacApex/cambridge-cefr-vocabulary-arcade](https://github.com/MacApex/cambridge-cefr-vocabulary-arcade)
- Figma file: [Cambridge CEFR Vocabulary Arcade](https://www.figma.com/design/ONDvSOPDlHZoXPohOCRErI)
- Reduced dataset: [game-data.json](https://cambridge-cefr-vocabulary-arcade.vercel.app/data/game-data.json)

## What It Includes

- `5207` unique A1-B2 Cambridge entries in the reduced runtime dataset
- `5036` entries with audio support
- A focused Learning mode with:
  - `65` numbered lesson days
  - `60` entries per lesson
  - `12`-question pretest
  - `6` study groups of `10`
  - `30`-question mixed exercise
  - Bonus Bank access
- Six Arcade modes:
  - `Hot Seat`
  - `Odd One Out`
  - `Fly Swatter`
  - `Bingo`
  - `Jeopardy`
  - `Mystery Sound`
- Chinese meanings and paired Chinese example support in Learning views
- Persistent local progress for both Learning and Arcade
- Deterministic QA hooks:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Local Development

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

There is also a macOS launcher at:

- [Open Cambridge CEFR Vocabulary Arcade.command](/Users/macapex/Desktop/Edu/IELTS%20Vocab%20Web%20Game%20(A1-B2)%20_%20Qin/Open%20Cambridge%20CEFR%20Vocabulary%20Arcade.command)

## Build Commands

```bash
npm run build:data
npm run build
npm run preview
```

Additional build targets:

```bash
npm run build:standalone
npm run build:portable
```

## Data Layout

Raw local Cambridge source bundle:

- [web_ready_dict_data/full](/Users/macapex/Desktop/Edu/IELTS%20Vocab%20Web%20Game%20(A1-B2)%20_%20Qin/web_ready_dict_data/full)

Reduced app-ready runtime data:

- [public/data/game-data.json](/Users/macapex/Desktop/Edu/IELTS%20Vocab%20Web%20Game%20(A1-B2)%20_%20Qin/public/data/game-data.json)

Deployable referenced audio subset:

- [public/audio](/Users/macapex/Desktop/Edu/IELTS%20Vocab%20Web%20Game%20(A1-B2)%20_%20Qin/public/audio)

The deploy pipeline keeps the reduced dataset shape intact and only packages the audio files actually referenced by `game-data.json`.

## Project Structure

```text
src/                     App UI, state, learning flow, arcade modes
scripts/                 Data reduction and build helpers
public/data/             Reduced runtime dataset
public/audio/            Deployable referenced audio subset
standalone/              Standalone review-app source files
portable/                Portable bundle helpers and launchers
progress.md              Implementation log
```

## Deployment Notes

- The app is deployed on Vercel as a static Vite app.
- The raw Cambridge source bundle is not deployed.
- `.vercelignore` excludes large local-only folders such as `web_ready_dict_data/`, `output/`, `portable/`, and `standalone/`.

## Notes

- Learning uses numbered navigation such as `Week 3 · Day 2` rather than visible date labels.
- Active Learning sessions can return to the dashboard without losing exact progress.
- The deployed site exposes the reduced runtime dataset and referenced audio, not the full raw dictionary archive.
