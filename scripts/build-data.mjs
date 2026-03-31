import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_ROOT = path.join(ROOT, "web_ready_dict_data", "full");
const SOURCE_AUDIO_ROOT = path.join(DATA_ROOT, "assets");
const OUTPUT_ROOT = path.join(ROOT, "public", "data");
const OUTPUT_AUDIO_ROOT = path.join(ROOT, "public", "audio");
const OUTPUT_DATA_FILE = path.join(OUTPUT_ROOT, "game-data.json");
const LEVELS = ["A1", "A2", "B1", "B2"];
const LEVEL_RANK = new Map(LEVELS.map((level, index) => [level, index]));

function exists(filePath) {
  return fs.existsSync(filePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(filePath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function stripTags(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function shortText(text, maxLength = 88) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFirstMatch(html, pattern) {
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : undefined;
}

function extractTextsByClass(html, className, limit = 2) {
  const matches = [...html.matchAll(new RegExp(`<span class="${className}">([\\s\\S]*?)<\\/span>`, "g"))];
  const texts = [];

  for (const match of matches) {
    const text = stripTags(match[1]);
    if (text && !texts.includes(text)) {
      texts.push(text);
    }
    if (texts.length >= limit) {
      break;
    }
  }

  return texts;
}

function extractExamples(html) {
  return extractTextsByClass(html, "en_example", 2);
}

function extractChineseExamples(html) {
  return extractTextsByClass(html, "cn_example", 2);
}

function extractAudio(html, region) {
  const pattern = new RegExp(
    `<a class="${region}" href="sound:\\/\\/([^"]+\\.mp3)"`,
    "i"
  );
  const match = html.match(pattern);
  if (!match) {
    return undefined;
  }
  return `/audio/${match[1]}`;
}

function extractPartOfSpeech(html) {
  return extractFirstMatch(html, /<span class="pos">([\s\S]*?)<\/span>/i);
}

function extractGuideword(html) {
  return extractFirstMatch(html, /<span class="guideword">([\s\S]*?)<\/span>/i);
}

function extractChineseDefinition(html) {
  return extractFirstMatch(html, /<span class="cn_def">([\s\S]*?)<\/span>/i);
}

function maskHeadword(text, headword) {
  const pattern = new RegExp(escapeRegExp(headword), "ig");
  return text.replace(pattern, "_____");
}

function buildUsageCue(entry, examples) {
  if (examples[0]) {
    return shortText(maskHeadword(examples[0], entry.headword), 92);
  }
  return shortText(entry.previewText, 92);
}

function buildMemoryCue(entry, partOfSpeech, guideword, hasAudio) {
  const posLabel = partOfSpeech ? partOfSpeech.toLowerCase() : entry.entryKind;
  const guideLabel = guideword
    ? guideword.toLowerCase().replace(/\s+/g, " ")
    : entry.previewText.split(" ").slice(0, 5).join(" ");
  const soundCue = hasAudio ? "say it once aloud" : "use it in one short sentence";
  return shortText(`${entry.primaryLevel} ${posLabel}. Think “${guideLabel}”; ${soundCue}.`, 92);
}

function computePrimaryLevel(levels) {
  return [...levels].sort((left, right) => LEVEL_RANK.get(left) - LEVEL_RANK.get(right))[0];
}

function collectReferencedAudio(entries) {
  const relativePaths = new Set();

  for (const entry of entries) {
    for (const filePath of [entry.audioUk, entry.audioUs]) {
      if (filePath?.startsWith("/audio/")) {
        relativePaths.add(filePath.slice("/audio/".length));
      }
    }
  }

  return [...relativePaths].sort();
}

function syncAudioSubset(relativePaths) {
  if (!exists(SOURCE_AUDIO_ROOT)) {
    return {
      reusedExisting: exists(OUTPUT_AUDIO_ROOT),
      copiedCount: 0,
      referencedCount: relativePaths.length,
      missingCount: 0
    };
  }

  fs.rmSync(OUTPUT_AUDIO_ROOT, { recursive: true, force: true });

  let copiedCount = 0;
  let missingCount = 0;

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(SOURCE_AUDIO_ROOT, relativePath);
    const destinationPath = path.join(OUTPUT_AUDIO_ROOT, relativePath);

    if (!exists(sourcePath)) {
      missingCount += 1;
      continue;
    }

    ensureDir(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
    copiedCount += 1;
  }

  return {
    reusedExisting: false,
    copiedCount,
    referencedCount: relativePaths.length,
    missingCount
  };
}

function buildDataset() {
  const cefrIndex = readJson(path.join(DATA_ROOT, "cefr_index.json"));
  const selected = new Map();

  for (const level of LEVELS) {
    for (const entry of cefrIndex[level] ?? []) {
      const effectiveLevels = entry.cefr_levels.filter((candidate) => LEVEL_RANK.has(candidate));
      if (effectiveLevels.length === 0) {
        continue;
      }
      if (!selected.has(entry.lookup_id)) {
        selected.set(entry.lookup_id, {
          id: entry.lookup_id,
          headword: entry.headword,
          normalizedHeadword: entry.normalized_headword,
          entryKind: entry.entry_kind,
          bucket: entry.bucket,
          cefrLevels: effectiveLevels.sort((left, right) => LEVEL_RANK.get(left) - LEVEL_RANK.get(right)),
          primaryLevel: computePrimaryLevel(effectiveLevels),
          previewText: entry.preview_text,
          examples: [],
          cnDefinition: undefined,
          cnExamples: [],
          partOfSpeech: undefined,
          guideword: undefined,
          usageCue: undefined,
          memoryCue: undefined,
          audioUk: undefined,
          audioUs: undefined
        });
      }
    }
  }

  const bucketCache = new Map();
  for (const entry of selected.values()) {
    if (!bucketCache.has(entry.bucket)) {
      const bucketPath = path.join(DATA_ROOT, "chunks", `${entry.bucket}.jsonl`);
      const lines = fs.readFileSync(bucketPath, "utf8").trim().split("\n");
      const parsed = new Map(lines.map((line) => {
        const item = JSON.parse(line);
        return [item.lookup_id, item];
      }));
      bucketCache.set(entry.bucket, parsed);
    }

    const details = bucketCache.get(entry.bucket).get(entry.id);
    if (!details) {
      continue;
    }

    entry.examples = extractExamples(details.body_html).map((example) => shortText(example, 140));
    entry.cnDefinition = shortText(extractChineseDefinition(details.body_html) || "", 120) || undefined;
    entry.cnExamples = extractChineseExamples(details.body_html).map((example) => shortText(example, 140));
    entry.partOfSpeech = extractPartOfSpeech(details.body_html);
    entry.guideword = extractGuideword(details.body_html);
    entry.audioUk = extractAudio(details.body_html, "uk");
    entry.audioUs = extractAudio(details.body_html, "us");
    entry.usageCue = buildUsageCue(entry, entry.examples);
    entry.memoryCue = buildMemoryCue(entry, entry.partOfSpeech, entry.guideword, Boolean(entry.audioUk || entry.audioUs));
  }

  const entries = [...selected.values()].sort((left, right) => {
    const levelDelta = LEVEL_RANK.get(left.primaryLevel) - LEVEL_RANK.get(right.primaryLevel);
    if (levelDelta !== 0) {
      return levelDelta;
    }
    return left.normalizedHeadword.localeCompare(right.normalizedHeadword);
  });

  const byLevel = Object.fromEntries(
    LEVELS.map((level) => [level, entries.filter((entry) => entry.cefrLevels.includes(level)).map((entry) => entry.id)])
  );

  const withAudio = entries.filter((entry) => entry.audioUk || entry.audioUs).map((entry) => entry.id);
  const headwordsOnly = entries.filter((entry) => entry.entryKind === "headword").map((entry) => entry.id);
  const stats = {
    entryCount: entries.length,
    headwordCount: headwordsOnly.length,
    phraseCount: entries.filter((entry) => entry.entryKind === "phrase").length,
    idiomCount: entries.filter((entry) => entry.entryKind === "idiom").length,
    audioCount: withAudio.length,
    levelCounts: Object.fromEntries(LEVELS.map((level) => [level, byLevel[level].length]))
  };

  return { generatedAt: new Date().toISOString(), levels: LEVELS, stats, entries, byLevel, withAudio, headwordsOnly };
}

function writeOutputs(dataset) {
  writeJson(OUTPUT_DATA_FILE, dataset);
}

function logSummary(dataset, audioSummary = {}) {
  console.log(
    JSON.stringify(
      {
        file: "public/data/game-data.json",
        entryCount: dataset.stats.entryCount,
        audioCount: dataset.stats.audioCount,
        levelCounts: dataset.stats.levelCounts,
        audioFilesReferenced: audioSummary.referencedCount ?? 0,
        audioFilesCopied: audioSummary.copiedCount ?? 0,
        audioFilesMissing: audioSummary.missingCount ?? 0,
        reusedExistingAssets: Boolean(audioSummary.reusedExisting)
      },
      null,
      2
    )
  );
}

function reuseExistingBuild() {
  if (!exists(OUTPUT_DATA_FILE)) {
    throw new Error("Cambridge source data is missing and no prebuilt public/data/game-data.json exists.");
  }

  const dataset = readJson(OUTPUT_DATA_FILE);
  logSummary(dataset, {
    referencedCount: collectReferencedAudio(dataset.entries).length,
    copiedCount: 0,
    missingCount: 0,
    reusedExisting: true
  });
}

if (!exists(DATA_ROOT)) {
  reuseExistingBuild();
} else {
  const dataset = buildDataset();
  writeOutputs(dataset);
  const audioSummary = syncAudioSubset(collectReferencedAudio(dataset.entries));
  logSummary(dataset, audioSummary);
}
