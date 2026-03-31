import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STANDALONE_ROOT = path.join(ROOT, "standalone");
const PORTABLE_ROOT = path.join(ROOT, "portable");
const DATA_FILE = path.join(ROOT, "public", "data", "game-data.json");
const DIST_DIR = path.join(ROOT, "dist");
const DIST_OUTPUT_FILE = path.join(DIST_DIR, "cambridge-a1-b2-review.html");
const PORTABLE_OUTPUT_DIR = path.join(ROOT, "output", "cambridge-a1-b2-review-portable");
const PORTABLE_OUTPUT_FILE = path.join(PORTABLE_OUTPUT_DIR, "cambridge-a1-b2-review.html");

const REQUIRED_FIELDS = [
  "id",
  "headword",
  "normalizedHeadword",
  "entryKind",
  "primaryLevel",
  "cefrLevels",
  "previewText",
  "examples",
  "cnDefinition",
  "cnExamples",
  "partOfSpeech",
  "guideword",
  "usageCue",
  "memoryCue"
];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function copyFile(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function setExecutable(filePath) {
  fs.chmodSync(filePath, 0o755);
}

function pickEntryFields(entry) {
  return REQUIRED_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = entry[field];
    return accumulator;
  }, {});
}

function buildSlimDataset(source) {
  const entries = source.entries.map(pickEntryFields);
  const levelCounts = source.levels.reduce((accumulator, level) => {
    accumulator[level] = entries.filter((entry) => entry.primaryLevel === level).length;
    return accumulator;
  }, {});
  const entryKindCounts = entries.reduce((accumulator, entry) => {
    accumulator[entry.entryKind] = (accumulator[entry.entryKind] || 0) + 1;
    return accumulator;
  }, {});

  return {
    generatedAt: source.generatedAt,
    levels: source.levels,
    stats: {
      totalEntries: entries.length,
      levelCounts,
      entryKindCounts
    },
    entries
  };
}

function serializeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/-->/g, "--\\>");
}

function buildHtml({ template, styles, app, dataset }) {
  return template
    .replace("__INLINE_CSS__", styles)
    .replace("__INLINE_DATA__", serializeJson(dataset))
    .replace("__INLINE_APP__", app);
}

function buildPortableBundle(html) {
  fs.rmSync(PORTABLE_OUTPUT_DIR, { recursive: true, force: true });
  writeText(PORTABLE_OUTPUT_FILE, html);

  const assetFiles = [
    "README.txt",
    "portable_server.py",
    "Open Cambridge A1-B2 Review.command",
    "Open Cambridge A1-B2 Review.bat",
    "open-cambridge-a1-b2-review.sh"
  ];

  for (const fileName of assetFiles) {
    const sourcePath = path.join(PORTABLE_ROOT, fileName);
    const destinationPath = path.join(PORTABLE_OUTPUT_DIR, fileName);
    copyFile(sourcePath, destinationPath);
  }

  setExecutable(path.join(PORTABLE_OUTPUT_DIR, "Open Cambridge A1-B2 Review.command"));
  setExecutable(path.join(PORTABLE_OUTPUT_DIR, "open-cambridge-a1-b2-review.sh"));
}

const template = readText(path.join(STANDALONE_ROOT, "template.html"));
const styles = readText(path.join(STANDALONE_ROOT, "styles.css"));
const app = readText(path.join(STANDALONE_ROOT, "app.js"));
const sourceDataset = JSON.parse(readText(DATA_FILE));
const slimDataset = buildSlimDataset(sourceDataset);
const html = buildHtml({
  template,
  styles,
  app,
  dataset: slimDataset
});

writeText(DIST_OUTPUT_FILE, html);
buildPortableBundle(html);

console.log(
  JSON.stringify(
    {
      distFile: path.relative(ROOT, DIST_OUTPUT_FILE),
      portableFolder: path.relative(ROOT, PORTABLE_OUTPUT_DIR),
      portableHtml: path.relative(ROOT, PORTABLE_OUTPUT_FILE),
      totalEntries: slimDataset.stats.totalEntries,
      levelCounts: slimDataset.stats.levelCounts,
      entryKindCounts: slimDataset.stats.entryKindCounts
    },
    null,
    2
  )
);
