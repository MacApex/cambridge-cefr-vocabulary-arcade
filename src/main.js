import "./styles.css";

const LEVELS = ["A1", "A2", "B1", "B2"];
const ENTRY_KINDS = ["headword", "phrase", "idiom"];
const STORAGE_KEY = "cambridge-cefr-arcade-progress-v1";
const LEARNING_STORAGE_KEY = "cambridge-cefr-learning-v1";
const HUBS = {
  learning: {
    label: "Learning",
    subtitle: "13-week guided program"
  },
  arcade: {
    label: "Arcade",
    subtitle: "Free-play vocabulary games"
  }
};
const LEARNING_VIEWS = ["current", "week", "bonus", "summary"];
const LEARNING_PHASE_TABS = ["pretest", "study", "exercise", "summary"];
const LEARNING_PRESENTATIONS = ["dashboard", "focus"];
const TOTAL_WEEKS = 13;
const STUDY_DAYS_PER_WEEK = 5;
const DAILY_ENTRIES = 60;
const DAILY_PRETEST_SIZE = 12;
const DAILY_EXERCISE_SIZE = 30;
const TOTAL_CORE_ENTRIES = TOTAL_WEEKS * STUDY_DAYS_PER_WEEK * DAILY_ENTRIES;
const CORE_B2_COUNT = 666;
const LEARNING_GAME_TYPES = [
  "definition-match",
  "usage-choice",
  "audio-choice",
  "spelling-check",
  "clue-ladder",
  "speed-grid"
];
const LEARNING_WEEKLY_ALLOCATION = [
  { A1: 180, A2: 120, B1: 0, B2: 0 },
  { A1: 180, A2: 120, B1: 0, B2: 0 },
  { A1: 120, A2: 150, B1: 30, B2: 0 },
  { A1: 90, A2: 150, B1: 60, B2: 0 },
  { A1: 54, A2: 126, B1: 120, B2: 0 },
  { A1: 0, A2: 90, B1: 180, B2: 30 },
  { A1: 0, A2: 75, B1: 195, B2: 30 },
  { A1: 0, A2: 75, B1: 195, B2: 30 },
  { A1: 0, A2: 45, B1: 180, B2: 75 },
  { A1: 0, A2: 30, B1: 180, B2: 90 },
  { A1: 0, A2: 26, B1: 165, B2: 109 },
  { A1: 0, A2: 0, B1: 149, B2: 151 },
  { A1: 0, A2: 0, B1: 149, B2: 151 }
];
const MODE_META = {
  "hot-seat": {
    label: "Hot Seat",
    subtitle: "Clue ladder + text entry",
    description: "Start with the Cambridge definition, unlock example and first-letter clues only when you need them."
  },
  "odd-one-out": {
    label: "Odd One Out",
    subtitle: "Spelling pressure",
    description: "Spot the one spelling that matches the Cambridge entry while three impostors try to fool you."
  },
  "fly-swatter": {
    label: "Fly Swatter",
    subtitle: "60-second click rush",
    description: "Race the timer and swat the correct word from a 3x4 grid before the next prompt lands."
  },
  bingo: {
    label: "Bingo",
    subtitle: "4x4 mastery card",
    description: "Fill a line by matching Cambridge clues to a mixed-level bingo board built from your active filters."
  },
  jeopardy: {
    label: "Jeopardy",
    subtitle: "20-tile solo review board",
    description: "Clear the board across Definition, Audio, Example, Spelling, and Mixed categories."
  },
  "mystery-sound": {
    label: "Mystery Sound",
    subtitle: "Pronunciation challenge",
    description: "Listen to UK or US pronunciation and pick the matching Cambridge entry. One replay per round."
  }
};

const appRoot = document.querySelector("#app");
const state = {
  status: "loading",
  hub: "learning",
  data: null,
  entryMap: new Map(),
  filters: {
    levels: new Set(LEVELS),
    entryKinds: new Set(ENTRY_KINDS)
  },
  progress: loadProgress(),
  learning: loadLearningStore(),
  session: null,
  summary: null,
  currentModeId: null,
  pendingStartModeId: null,
  notice: "",
  pendingAudioPath: null,
  lastManualAdvanceAt: 0,
  clock: {
    lastNow: performance.now(),
    lastTimerBucket: -1
  },
  effects: {
    time: 0,
    flash: 0,
    pulses: []
  }
};

let fxCanvas = null;
let fxContext = null;
let audioPlayer = null;

boot();

async function boot() {
  bindGlobalEvents();
  render();

  try {
    const response = await fetch("/data/game-data.json");
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const data = await response.json();
    state.data = data;
    state.entryMap = new Map(data.entries.map((entry) => [entry.id, entry]));
    state.status = "ready";
    initializeLearningUi();
    const queuedModeId = state.pendingStartModeId;
    state.pendingStartModeId = null;
    if (queuedModeId) {
      state.hub = "arcade";
      startMode(queuedModeId);
    } else {
      render();
    }
    startAnimationLoop();
  } catch (error) {
    state.status = "error";
    state.notice = error instanceof Error ? error.message : String(error);
    render();
  }
}

function bindGlobalEvents() {
  appRoot.addEventListener("click", handleClick);
  appRoot.addEventListener("submit", handleSubmit);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("fullscreenchange", () => {
    render();
  });
  window.addEventListener("resize", resizeCanvas);

  window.render_game_to_text = () => JSON.stringify(buildTextSnapshot());
  window.advanceTime = (ms) => {
    state.lastManualAdvanceAt = performance.now();
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let index = 0; index < steps; index += 1) {
      advanceWorld(ms / steps, true);
    }
    render();
  };
}

function loadLearningStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNING_STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      const rawView = parsed.ui?.view === "today" ? "current" : parsed.ui?.view;
      return {
        course: parsed.course ?? null,
        records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
        ui: {
          view: LEARNING_VIEWS.includes(rawView) ? rawView : "current",
          selectedLessonKey: parsed.ui?.selectedLessonKey ?? null,
          selectedPhaseTab: LEARNING_PHASE_TABS.includes(parsed.ui?.selectedPhaseTab) ? parsed.ui.selectedPhaseTab : "pretest",
          presentation: LEARNING_PRESENTATIONS.includes(parsed.ui?.presentation) ? parsed.ui.presentation : "dashboard",
          pendingTarget: null,
          selectedDate: parsed.ui?.selectedDate ?? null
        },
        session: parsed.session && typeof parsed.session === "object" ? parsed.session : null
      };
    }
  } catch {
    // Ignore corrupt local state and rebuild it.
  }

  return {
    course: null,
    records: {},
    ui: {
      view: "current",
      selectedLessonKey: null,
      selectedPhaseTab: "pretest",
      presentation: "dashboard",
      pendingTarget: null,
      selectedDate: null
    },
    session: null
  };
}

function persistLearningStore() {
  localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify({
    course: state.learning.course,
    records: state.learning.records,
    ui: {
      view: state.learning.ui.view,
      selectedLessonKey: state.learning.ui.selectedLessonKey,
      selectedPhaseTab: state.learning.ui.selectedPhaseTab,
      presentation: state.learning.ui.presentation
    },
    session: state.learning.session
  }));
}

function initializeLearningUi() {
  if (!state.learning.course) {
    state.learning.ui.view = LEARNING_VIEWS.includes(state.learning.ui.view) ? state.learning.ui.view : "current";
    state.learning.ui.selectedLessonKey = null;
    state.learning.ui.selectedPhaseTab = LEARNING_PHASE_TABS.includes(state.learning.ui.selectedPhaseTab)
      ? state.learning.ui.selectedPhaseTab
      : "pretest";
    state.learning.ui.presentation = "dashboard";
    state.learning.ui.pendingTarget = null;
    state.learning.session = null;
    persistLearningStore();
    return;
  }

  state.learning.course = rebuildLearningCourse(state.learning.course);
  state.learning.records = migrateLearningRecords(state.learning.course, state.learning.records);
  state.learning.session = rehydrateLearningSession(state.learning.session);
  state.learning.ui.view = LEARNING_VIEWS.includes(state.learning.ui.view) ? state.learning.ui.view : "current";
  const preferredLesson = resolvePreferredLearningLesson(state.learning.course);
  const selectedLesson = getLearningLessonByKey(state.learning.ui.selectedLessonKey)
    || resolveLearningLessonFromLegacyDate(state.learning.course, state.learning.ui.selectedDate)
    || (state.learning.session?.kind === "lesson" ? getLearningLessonByKey(state.learning.session.lessonKey) : null)
    || preferredLesson
    || state.learning.course.lessonDays[0]
    || null;
  state.learning.ui.selectedLessonKey = selectedLesson?.lessonKey ?? null;
  state.learning.ui.selectedPhaseTab = LEARNING_PHASE_TABS.includes(state.learning.ui.selectedPhaseTab)
    ? state.learning.ui.selectedPhaseTab
    : getDefaultPhaseTabForLesson(selectedLesson);
  state.learning.ui.presentation = state.learning.session
    ? (LEARNING_PRESENTATIONS.includes(state.learning.ui.presentation) ? state.learning.ui.presentation : "focus")
    : "dashboard";
  state.learning.ui.pendingTarget = null;
  state.learning.ui.selectedDate = null;
  if (state.learning.session) {
    syncLearningUiToSession(state.learning.session);
  }
  persistLearningStore();
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function dateFromIso(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

function toIsoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function differenceInDays(dateA, dateB) {
  return Math.round((dateFromIso(dateA).getTime() - dateFromIso(dateB).getTime()) / 86400000);
}

function addDays(dateString, offset) {
  const date = dateFromIso(dateString);
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

function weekdayIndex(dateString) {
  const day = dateFromIso(dateString).getDay();
  return day === 0 ? 7 : day;
}

function isMonday(dateString) {
  return weekdayIndex(dateString) === 1;
}

function getNextMonday(referenceDate) {
  const date = dateFromIso(referenceDate);
  const current = weekdayIndex(referenceDate);
  const delta = current === 1 ? 0 : (8 - current) % 7;
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

function monthKey(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function getMonthLabel(dateString) {
  const date = dateFromIso(dateString);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function startOfMonth(dateString) {
  const date = dateFromIso(dateString);
  date.setDate(1);
  return toIsoDate(date);
}

function endOfMonth(dateString) {
  const date = dateFromIso(dateString);
  date.setMonth(date.getMonth() + 1, 0);
  return toIsoDate(date);
}

function startOfWeek(dateString) {
  return addDays(dateString, -(weekdayIndex(dateString) - 1));
}

function endOfWeek(dateString) {
  return addDays(startOfWeek(dateString), 6);
}

function formatLongDate(dateString) {
  return dateFromIso(dateString).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatCompactDate(dateString) {
  return dateFromIso(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function isCourseDate(course, dateString) {
  if (!course || !dateString) {
    return false;
  }
  return dateString >= course.startDate && dateString <= course.endDate;
}

function makeLessonKey(week, dayInWeek) {
  return `W${String(week).padStart(2, "0")}-D${dayInWeek}`;
}

function makeBonusKey(week) {
  return `W${String(week).padStart(2, "0")}-BONUS`;
}

function getLessonDisplayLabel(week, dayInWeek) {
  return `Week ${week} · Day ${dayInWeek}`;
}

function getBonusDisplayLabel(week) {
  return `Week ${week} · Bonus`;
}

function getLearningSessionPhaseKey(phase) {
  if (phase === "pretest-review") {
    return "pretest";
  }
  if (phase === "exercise-review") {
    return "exercise";
  }
  return phase;
}

function getLearningSessionTitle(session) {
  if (!session) {
    return "Learning Session";
  }
  if (session.kind === "bonus") {
    if (session.phase === "bonus") {
      return "Bonus Drill";
    }
    return "Bonus Summary";
  }
  if (session.phase === "pretest") {
    return "Diagnostic Pretest";
  }
  if (session.phase === "study") {
    return "Study Cards";
  }
  if (session.phase === "exercise") {
    return "30-Question Exercise";
  }
  if (session.phase === "pretest-review") {
    return "Pretest Recap";
  }
  if (session.phase === "exercise-review") {
    return "Exercise Recap";
  }
  return "Day Summary";
}

function getLearningSessionProgressLabel(session) {
  if (!session) {
    return "";
  }
  if (session.phase === "study") {
    return `Card ${session.groupIndex * 10 + session.cardIndex + 1}/${DAILY_ENTRIES}`;
  }
  if (session.questions?.length) {
    return `Question ${Math.min(session.index + 1, session.questions.length)}/${session.questions.length}`;
  }
  return getLearningSessionTitle(session);
}

function getLearningSessionResumeLabel(session) {
  if (!session) {
    return "";
  }
  return `${session.displayLabel || "Learning"} · ${getLearningSessionTitle(session)} · ${getLearningSessionProgressLabel(session)}`;
}

function rebuildLearningCourse(course) {
  if (!course?.startDate) {
    return null;
  }
  return createLearningCourse(course.startDate);
}

function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      return {
        entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
        meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : defaultMeta()
      };
    }
  } catch {
    // Ignore corrupt local state and rebuild it.
  }

  return {
    entries: {},
    meta: defaultMeta()
  };
}

function defaultMeta() {
  return {
    sessionsPlayed: 0,
    modeStats: {}
  };
}

function persistProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function hashString(value) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

function createSeededRandom(seedValue) {
  const seedFactory = hashString(seedValue);
  let seed = seedFactory();
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let output = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    output ^= output + Math.imul(output ^ (output >>> 7), 61 | output);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedValue) {
  const random = createSeededRandom(seedValue);
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function deterministicPickIds(ids, count, seedValue) {
  return seededShuffle(ids, seedValue).slice(0, count);
}

function getEntryKindRank(kind) {
  return ENTRY_KINDS.indexOf(kind);
}

function compareAlphabetical(left, right) {
  return left.normalizedHeadword.localeCompare(right.normalizedHeadword);
}

function compareB2Priority(left, right) {
  const leftSupport = Number(Boolean(left.audioUk || left.audioUs)) + Number(left.examples.length > 0);
  const rightSupport = Number(Boolean(right.audioUk || right.audioUs)) + Number(right.examples.length > 0);
  if (leftSupport !== rightSupport) {
    return rightSupport - leftSupport;
  }

  const kindDelta = getEntryKindRank(left.entryKind) - getEntryKindRank(right.entryKind);
  if (kindDelta !== 0) {
    return kindDelta;
  }

  return compareAlphabetical(left, right);
}

function getLearningCoreAndBonusEntries() {
  const grouped = {
    A1: [],
    A2: [],
    B1: [],
    B2: []
  };

  for (const entry of state.data.entries) {
    grouped[entry.primaryLevel].push(entry);
  }

  grouped.A1.sort(compareAlphabetical);
  grouped.A2.sort(compareAlphabetical);
  grouped.B1.sort(compareAlphabetical);
  grouped.B2.sort(compareB2Priority);

  const core = {
    A1: grouped.A1,
    A2: grouped.A2,
    B1: grouped.B1,
    B2: grouped.B2.slice(0, CORE_B2_COUNT)
  };

  return {
    core,
    bonus: grouped.B2.slice(CORE_B2_COUNT)
  };
}

function allocateWeekToDays(levelTotals) {
  const remaining = { ...levelTotals };
  const days = [];

  for (let dayIndex = 0; dayIndex < STUDY_DAYS_PER_WEEK; dayIndex += 1) {
    const remainingDays = STUDY_DAYS_PER_WEEK - dayIndex;
    const dayCounts = {};
    let assigned = 0;
    const fractions = [];

    for (const level of LEVELS) {
      const raw = remaining[level] / remainingDays;
      const base = Math.floor(raw);
      dayCounts[level] = base;
      assigned += base;
      fractions.push({
        level,
        fraction: raw - base,
        remaining: remaining[level] - base
      });
    }

    let extra = DAILY_ENTRIES - assigned;
    fractions.sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction;
      }
      return LEVELS.indexOf(left.level) - LEVELS.indexOf(right.level);
    });

    while (extra > 0) {
      const next = fractions.find((item) => item.remaining > 0);
      if (!next) {
        break;
      }
      dayCounts[next.level] += 1;
      next.remaining -= 1;
      extra -= 1;
      fractions.sort((left, right) => {
        if (right.fraction !== left.fraction) {
          return right.fraction - left.fraction;
        }
        return LEVELS.indexOf(left.level) - LEVELS.indexOf(right.level);
      });
    }

    for (const level of LEVELS) {
      remaining[level] -= dayCounts[level];
    }

    days.push(dayCounts);
  }

  return days;
}

function interleaveDayBuckets(dayBuckets) {
  const queues = LEVELS.map((level) => [...(dayBuckets[level] || [])]);
  const ordered = [];

  while (queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (queue.length > 0) {
        ordered.push(queue.shift());
      }
    }
  }

  return ordered;
}

function getLearningGameTypeCount(week) {
  if (week <= 3) {
    return 3;
  }
  if (week <= 6) {
    return 4;
  }
  if (week <= 10) {
    return 5;
  }
  return 6;
}

function pickLearningGameTypes(week, dateString) {
  return seededShuffle(LEARNING_GAME_TYPES, `${dateString}:types`).slice(0, getLearningGameTypeCount(week));
}

function createLearningCourse(startDate) {
  const { core, bonus } = getLearningCoreAndBonusEntries();
  const queues = Object.fromEntries(LEVELS.map((level) => [level, core[level].map((entry) => entry.id)]));
  const lessonDays = [];
  const bonusSlots = [];

  for (let weekIndex = 0; weekIndex < TOTAL_WEEKS; weekIndex += 1) {
    const dayAllocations = allocateWeekToDays(LEARNING_WEEKLY_ALLOCATION[weekIndex]);
    for (let weekday = 1; weekday <= STUDY_DAYS_PER_WEEK; weekday += 1) {
      const date = addDays(startDate, weekIndex * 7 + (weekday - 1));
      const dayBuckets = {};
      for (const level of LEVELS) {
        const count = dayAllocations[weekday - 1][level];
        dayBuckets[level] = queues[level].splice(0, count);
      }

      const lessonEntryIds = interleaveDayBuckets(dayBuckets);
      const pretestEntryIds = deterministicPickIds(lessonEntryIds, DAILY_PRETEST_SIZE, `${date}:pretest`);
      const exerciseEntryIds = deterministicPickIds(lessonEntryIds, DAILY_EXERCISE_SIZE, `${date}:exercise`);

      lessonDays.push({
        date,
        week: weekIndex + 1,
        weekday,
        dayInWeek: weekday,
        lessonKey: makeLessonKey(weekIndex + 1, weekday),
        displayLabel: getLessonDisplayLabel(weekIndex + 1, weekday),
        lessonEntryIds,
        pretestEntryIds,
        exerciseEntryIds,
        exerciseGameTypes: pickLearningGameTypes(weekIndex + 1, date)
      });
    }

    bonusSlots.push({
      week: weekIndex + 1,
      bonusKey: makeBonusKey(weekIndex + 1),
      displayLabel: getBonusDisplayLabel(weekIndex + 1),
      date: addDays(startDate, weekIndex * 7 + 5)
    });
  }

  return {
    startDate,
    endDate: addDays(startDate, TOTAL_WEEKS * 7 - 1),
    totalWeeks: TOTAL_WEEKS,
    studyDaysPerWeek: STUDY_DAYS_PER_WEEK,
    lessonDays,
    bonusSlots,
    bonusEntryIds: bonus.map((entry) => entry.id)
  };
}

function getLearningLessonByDate(dateString) {
  return state.learning.course?.lessonDays.find((day) => day.date === dateString) || null;
}

function getLearningLessonByKey(lessonKey) {
  return state.learning.course?.lessonDays.find((day) => day.lessonKey === lessonKey) || null;
}

function getLearningBonusSlotByWeek(week) {
  return state.learning.course?.bonusSlots?.find((slot) => slot.week === week) || null;
}

function rehydrateLearningSession(rawSession) {
  if (!rawSession || typeof rawSession !== "object") {
    return null;
  }

  if (rawSession.kind === "lesson") {
    const plan = getLearningLessonByKey(rawSession.lessonKey) || getLearningLessonByDate(rawSession.date);
    if (!plan) {
      return null;
    }
    const questions = Array.isArray(rawSession.questions) ? rawSession.questions : undefined;
    const groups = Array.isArray(rawSession.groups) ? rawSession.groups : undefined;
    return {
      ...rawSession,
      date: plan.date,
      lessonKey: plan.lessonKey,
      displayLabel: plan.displayLabel,
      plan,
      questions,
      groups,
      index: Number.isFinite(rawSession.index) ? rawSession.index : 0,
      answeredCount: Number.isFinite(rawSession.answeredCount) ? rawSession.answeredCount : 0,
      correct: Number.isFinite(rawSession.correct) ? rawSession.correct : 0,
      groupIndex: Number.isFinite(rawSession.groupIndex) ? rawSession.groupIndex : 0,
      cardIndex: Number.isFinite(rawSession.cardIndex) ? rawSession.cardIndex : 0
    };
  }

  if (rawSession.kind === "bonus") {
    const slot = getLearningBonusSlotByWeek(rawSession.week) || state.learning.course?.bonusSlots?.find((item) => item.date === rawSession.date);
    if (!slot) {
      return null;
    }
    const questions = Array.isArray(rawSession.questions) ? rawSession.questions : undefined;
    return {
      ...rawSession,
      date: slot.date,
      week: slot.week,
      displayLabel: slot.displayLabel,
      questions,
      index: Number.isFinite(rawSession.index) ? rawSession.index : 0,
      answeredCount: Number.isFinite(rawSession.answeredCount) ? rawSession.answeredCount : 0,
      correct: Number.isFinite(rawSession.correct) ? rawSession.correct : 0
    };
  }

  return null;
}

function normalizeLearningRecord(record, defaultStatus = "available") {
  return {
    status: record?.status || defaultStatus,
    pretestScore: Number.isFinite(record?.pretestScore) ? record.pretestScore : null,
    studyGroupsCompleted: Math.max(0, Math.min(6, Number(record?.studyGroupsCompleted) || 0)),
    exerciseScore: Number.isFinite(record?.exerciseScore) ? record.exerciseScore : null,
    completedAt: record?.completedAt || null,
    pretestAnswers: Array.isArray(record?.pretestAnswers) ? record.pretestAnswers : [],
    exerciseAnswers: Array.isArray(record?.exerciseAnswers) ? record.exerciseAnswers : [],
    bonusEntryIds: Array.isArray(record?.bonusEntryIds) ? record.bonusEntryIds : []
  };
}

function mergeLearningRecords(existing, incoming, defaultStatus = "available") {
  const left = normalizeLearningRecord(existing, defaultStatus);
  const right = normalizeLearningRecord(incoming, defaultStatus);
  return {
    status: statusPriority(right.status) >= statusPriority(left.status) ? right.status : left.status,
    pretestScore: Number.isFinite(right.pretestScore) ? right.pretestScore : left.pretestScore,
    studyGroupsCompleted: Math.max(left.studyGroupsCompleted, right.studyGroupsCompleted),
    exerciseScore: Number.isFinite(right.exerciseScore) ? right.exerciseScore : left.exerciseScore,
    completedAt: [left.completedAt, right.completedAt].filter(Boolean).sort().at(-1) || null,
    pretestAnswers: right.pretestAnswers.length >= left.pretestAnswers.length ? right.pretestAnswers : left.pretestAnswers,
    exerciseAnswers: right.exerciseAnswers.length >= left.exerciseAnswers.length ? right.exerciseAnswers : left.exerciseAnswers,
    bonusEntryIds: right.bonusEntryIds.length >= left.bonusEntryIds.length ? right.bonusEntryIds : left.bonusEntryIds
  };
}

function statusPriority(status) {
  const priorities = {
    available: 0,
    "in-progress": 1,
    pretested: 2,
    studied: 3,
    completed: 4,
    rest: 0,
    "bonus-completed": 4
  };
  return priorities[status] ?? 0;
}

function migrateLearningRecords(course, records) {
  const migrated = {};
  const lessonDateSet = new Set(course.lessonDays.map((lesson) => lesson.date));

  for (const [dateKey, rawRecord] of Object.entries(records || {})) {
    if (lessonDateSet.has(dateKey)) {
      migrated[dateKey] = mergeLearningRecords(migrated[dateKey], rawRecord, "available");
      continue;
    }
    if (!isCourseDate(course, dateKey)) {
      continue;
    }
    const weekIndex = Math.floor(differenceInDays(dateKey, course.startDate) / 7);
    const slot = course.bonusSlots[weekIndex];
    if (slot) {
      migrated[slot.date] = mergeLearningRecords(migrated[slot.date], rawRecord, "available");
      if (migrated[slot.date].status === "rest") {
        migrated[slot.date].status = "available";
      }
    }
  }

  return migrated;
}

function resolveLearningLessonFromLegacyDate(course, dateString) {
  if (!course || !dateString || !isCourseDate(course, dateString)) {
    return null;
  }
  const lesson = course.lessonDays.find((day) => day.date === dateString);
  if (lesson) {
    return lesson;
  }
  const week = Math.floor(differenceInDays(dateString, course.startDate) / 7) + 1;
  return course.lessonDays.find((day) => day.week === week && day.dayInWeek === 1) || null;
}

function resolvePreferredLearningLesson(course) {
  return course.lessonDays.find((lesson) => state.learning.records[lesson.date]?.status !== "completed")
    || course.lessonDays[course.lessonDays.length - 1]
    || null;
}

function getLearningDayStatus(day) {
  const record = state.learning.records[day.date];
  if (day.type === "bonus") {
    if (record?.status === "bonus-completed") {
      return "completed";
    }
    if ((record?.exerciseAnswers?.length || 0) > 0) {
      return "in-progress";
    }
    return "available";
  }
  if (record?.status) {
    return record.status;
  }
  return "available";
}

function ensureLearningRecord(dateString, dayType = "lesson") {
  if (!state.learning.records[dateString]) {
    state.learning.records[dateString] = {
      status: dayType === "bonus" ? "available" : "available",
      pretestScore: null,
      studyGroupsCompleted: 0,
      exerciseScore: null,
      completedAt: null,
      pretestAnswers: [],
      exerciseAnswers: [],
      bonusEntryIds: []
    };
  }
  return state.learning.records[dateString];
}

function setLearningView(view) {
  state.learning.ui.view = view;
  persistLearningStore();
  render();
}

function setLearningSelectedLesson(lessonKey, nextView = null) {
  state.learning.ui.selectedLessonKey = lessonKey;
  const lesson = getLearningLessonByKey(lessonKey);
  if (lesson) {
    state.learning.ui.selectedPhaseTab = getDefaultPhaseTabForLesson(lesson);
  }
  if (nextView) {
    state.learning.ui.view = nextView;
  }
  persistLearningStore();
  render();
}

function setLearningSelectedWeek(week, nextView = null) {
  const lesson = state.learning.course?.lessonDays.find((item) => item.week === week && item.dayInWeek === 1);
  if (lesson) {
    setLearningSelectedLesson(lesson.lessonKey, nextView);
  }
}

function setLearningPhaseTab(phase) {
  state.learning.ui.selectedPhaseTab = LEARNING_PHASE_TABS.includes(phase) ? phase : "pretest";
  persistLearningStore();
  render();
}

function getSelectedLearningContext() {
  const course = state.learning.course;
  const selectedLesson = course
    ? getLearningLessonByKey(state.learning.ui.selectedLessonKey) || resolvePreferredLearningLesson(course)
    : null;
  const selectedDate = selectedLesson?.date || null;
  const selectedWeek = selectedLesson?.week || 1;
  const selectedDay = selectedLesson ? { type: "lesson", date: selectedLesson.date, week: selectedLesson.week, lesson: selectedLesson } : null;
  const selectedBonusSlot = course ? getLearningBonusSlotByWeek(selectedWeek) : null;
  const selectedStatus = selectedDay ? getLearningDayStatus(selectedDay) : null;
  const selectedRecord = selectedDate ? state.learning.records[selectedDate] || null : null;
  const selectedBonusStatus = selectedBonusSlot ? getLearningDayStatus({ type: "bonus", date: selectedBonusSlot.date, week: selectedBonusSlot.week }) : null;
  const selectedBonusRecord = selectedBonusSlot ? state.learning.records[selectedBonusSlot.date] || null : null;
  return {
    course,
    selectedLessonKey: selectedLesson?.lessonKey || null,
    selectedDate,
    selectedDay,
    selectedLesson,
    selectedWeek,
    selectedBonusSlot,
    selectedBonusStatus,
    selectedBonusRecord,
    selectedStatus,
    selectedRecord
  };
}

function isLearningFocusMode() {
  return state.learning.ui.presentation === "focus" && Boolean(state.learning.session);
}

function syncLearningUiToSession(session) {
  if (!session) {
    return;
  }
  if (session.kind === "lesson") {
    state.learning.ui.selectedLessonKey = session.lessonKey;
    state.learning.ui.selectedPhaseTab = getLearningSessionPhaseKey(session.phase);
    return;
  }
  const lesson = state.learning.course?.lessonDays.find((item) => item.week === session.week && item.dayInWeek === 1);
  if (lesson) {
    state.learning.ui.selectedLessonKey = lesson.lessonKey;
  }
  state.learning.ui.view = "bonus";
}

function activateLearningSession(session) {
  state.learning.session = session;
  state.learning.ui.presentation = "focus";
  state.learning.ui.pendingTarget = null;
  state.notice = "";
  syncLearningUiToSession(session);
  const next = getCurrentLearningQuestion();
  if (next?.audioPath) {
    state.pendingAudioPath = next.audioPath;
  }
  persistLearningStore();
  render();
}

function minimizeLearningSession(nextView = null) {
  if (nextView) {
    state.learning.ui.view = nextView;
  }
  if (state.learning.session) {
    syncLearningUiToSession(state.learning.session);
  }
  state.learning.ui.presentation = "dashboard";
  state.learning.ui.pendingTarget = null;
  persistLearningStore();
  render();
}

function resumeLearningSession() {
  if (!state.learning.session) {
    return;
  }
  state.notice = "";
  state.learning.ui.presentation = "focus";
  state.learning.ui.pendingTarget = null;
  syncLearningUiToSession(state.learning.session);
  persistLearningStore();
  render();
}

function buildLearningTarget(phase = state.learning.ui.selectedPhaseTab) {
  const { selectedLesson, selectedBonusSlot } = getSelectedLearningContext();
  if (state.learning.ui.view === "bonus") {
    if (!selectedBonusSlot) {
      return null;
    }
    return {
      kind: "bonus",
      week: selectedBonusSlot.week,
      phase: getLearningDayStatus({ type: "bonus", date: selectedBonusSlot.date, week: selectedBonusSlot.week }) === "completed" ? "summary" : "bonus",
      displayLabel: selectedBonusSlot.displayLabel,
      phaseTitle: getLearningDayStatus({ type: "bonus", date: selectedBonusSlot.date, week: selectedBonusSlot.week }) === "completed" ? "Bonus Summary" : "Bonus Drill"
    };
  }
  if (!selectedLesson) {
    return null;
  }
  const phaseKey = LEARNING_PHASE_TABS.includes(phase) ? phase : getDefaultPhaseTabForLesson(selectedLesson);
  return {
    kind: "lesson",
    lessonKey: selectedLesson.lessonKey,
    phase: phaseKey,
    displayLabel: selectedLesson.displayLabel,
    phaseTitle: phaseKey === "pretest"
      ? "Diagnostic Pretest"
      : phaseKey === "study"
        ? "Study Cards"
        : phaseKey === "exercise"
          ? "30-Question Exercise"
          : "Day Summary"
  };
}

function getLearningSessionTarget(session) {
  if (!session) {
    return null;
  }
  if (session.kind === "bonus") {
    return {
      kind: "bonus",
      week: session.week,
      phase: session.phase === "summary" ? "summary" : "bonus",
      displayLabel: session.displayLabel,
      phaseTitle: getLearningSessionTitle(session)
    };
  }
  return {
    kind: "lesson",
    lessonKey: session.lessonKey,
    phase: getLearningSessionPhaseKey(session.phase),
    displayLabel: session.displayLabel,
    phaseTitle: getLearningSessionTitle(session)
  };
}

function isSameLearningTarget(left, right) {
  if (!left || !right || left.kind !== right.kind || left.phase !== right.phase) {
    return false;
  }
  if (left.kind === "bonus") {
    return left.week === right.week;
  }
  return left.lessonKey === right.lessonKey;
}

function shouldOpenLearningTarget(target) {
  if (!target || !state.learning.session) {
    return true;
  }
  if (state.learning.ui.presentation !== "dashboard") {
    return true;
  }
  const activeTarget = getLearningSessionTarget(state.learning.session);
  if (isSameLearningTarget(activeTarget, target)) {
    resumeLearningSession();
    return false;
  }
  state.learning.ui.pendingTarget = target;
  render();
  return false;
}

function cancelLearningSessionReplacement() {
  state.learning.ui.pendingTarget = null;
  resumeLearningSession();
}

function confirmLearningSessionReplacement() {
  const target = state.learning.ui.pendingTarget;
  if (!target) {
    return;
  }
  state.learning.ui.pendingTarget = null;
  state.notice = "";
  if (target.kind === "bonus") {
    openSelectedBonusFlow(true);
    return;
  }
  openSelectedLearningPhase(target.phase, true);
}

function countLevelsForEntryIds(entryIds = []) {
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const entryId of entryIds) {
    const entry = state.entryMap.get(entryId);
    if (entry) {
      counts[entry.primaryLevel] += 1;
    }
  }
  return counts;
}

function renderLevelPills(counts) {
  return LEVELS.filter((level) => counts[level] > 0).map((level) => `
    <span class="pill">${level}: ${counts[level]}</span>
  `).join("");
}

function getLearningStatusLabel(status) {
  const labels = {
    available: "Available",
    "in-progress": "In Progress",
    locked: "Locked",
    pretested: "Pretested",
    studied: "Studied",
    completed: "Completed",
    "bonus-completed": "Bonus Done"
  };
  return labels[status] || toTitle(status);
}

function renderStatusPill(status) {
  return `<span class="status-pill is-${status}">${escapeHtml(getLearningStatusLabel(status))}</span>`;
}

function getWeekLessons(week) {
  return state.learning.course?.lessonDays.filter((day) => day.week === week) || [];
}

function getWeekCompletion(week) {
  const lessons = getWeekLessons(week);
  const completed = lessons.filter((lesson) => state.learning.records[lesson.date]?.status === "completed").length;
  return {
    completed,
    total: lessons.length
  };
}

function getDefaultPhaseTabForLesson(lesson) {
  if (!lesson) {
    return "pretest";
  }
  const record = normalizeLearningRecord(state.learning.records[lesson.date], "available");
  if (record.pretestAnswers.length < DAILY_PRETEST_SIZE) {
    return "pretest";
  }
  if (record.studyGroupsCompleted < 6) {
    return "study";
  }
  if (record.exerciseAnswers.length < DAILY_EXERCISE_SIZE) {
    return "exercise";
  }
  return "summary";
}

function getLearningPhaseState(lesson, phase) {
  const record = normalizeLearningRecord(state.learning.records[lesson.date], "available");
  const activeSession = state.learning.session?.kind === "lesson" && state.learning.session?.date === lesson.date
    ? state.learning.session
    : null;
  const pretestDone = record.pretestAnswers.length >= DAILY_PRETEST_SIZE || ["pretested", "studied", "completed"].includes(record.status);
  const studyDone = record.studyGroupsCompleted >= 6 || ["studied", "completed"].includes(record.status);
  const exerciseDone = record.exerciseAnswers.length >= DAILY_EXERCISE_SIZE || record.status === "completed";

  if (phase === "pretest") {
    const inProgress = activeSession?.phase === "pretest" || (record.pretestAnswers.length > 0 && !pretestDone);
    return {
      status: pretestDone ? "completed" : inProgress ? "in-progress" : "available",
      locked: false,
      title: "Diagnostic Pretest",
      short: pretestDone
        ? `${record.pretestScore ?? 0}% baseline saved`
        : inProgress ? `${record.pretestAnswers.length}/${DAILY_PRETEST_SIZE} answered` : `${DAILY_PRETEST_SIZE} questions ready`,
      actionLabel: pretestDone ? "Open Pretest Recap" : inProgress ? "Resume Pretest" : "Start Pretest"
    };
  }

  if (phase === "study") {
    const inProgress = activeSession?.phase === "study" || (record.studyGroupsCompleted > 0 && !studyDone);
    return {
      status: studyDone ? "completed" : inProgress ? "in-progress" : "available",
      locked: !pretestDone,
      title: "Study Deck",
      short: studyDone
        ? "All 60 cards reviewed"
        : inProgress ? `${record.studyGroupsCompleted}/6 groups retained` : "6 groups of 10 cards",
      actionLabel: studyDone ? "Reopen Study Deck" : inProgress ? "Resume Study" : "Open Study Deck",
      lockedReason: "Finish the pretest first."
    };
  }

  if (phase === "exercise") {
    const inProgress = activeSession?.phase === "exercise" || (record.exerciseAnswers.length > 0 && !exerciseDone);
    return {
      status: exerciseDone ? "completed" : inProgress ? "in-progress" : "available",
      locked: !studyDone,
      title: "Mixed Exercise",
      short: exerciseDone
        ? `${record.exerciseScore ?? 0}% saved`
        : inProgress ? `${record.exerciseAnswers.length}/${DAILY_EXERCISE_SIZE} answered` : `${DAILY_EXERCISE_SIZE} mixed questions`,
      actionLabel: exerciseDone ? "Open Exercise Recap" : inProgress ? "Resume Exercise" : "Start Exercise",
      lockedReason: "Finish all 6 study groups first."
    };
  }

  return {
    status: exerciseDone ? "completed" : "locked",
    locked: !exerciseDone,
    title: "Day Summary",
    short: exerciseDone ? "Scores and retained record" : "Unlocks after the exercise",
    actionLabel: "Open Day Summary",
    lockedReason: "Finish the exercise first."
  };
}

function getLearningSummaryStats() {
  const course = state.learning.course;
  if (!course) {
    return {
      completedDays: 0,
      remainingDays: 0,
      averagePretest: 0,
      averageExercise: 0,
      bonusSessions: 0
    };
  }

  const records = Object.entries(state.learning.records);
  const lessonRecords = records.filter(([date]) => Boolean(getLearningLessonByDate(date))).map(([, record]) => record);
  const completedDays = lessonRecords.filter((record) => record.status === "completed").length;
  const pretestScores = lessonRecords.map((record) => record.pretestScore).filter((score) => Number.isFinite(score));
  const exerciseScores = lessonRecords.map((record) => record.exerciseScore).filter((score) => Number.isFinite(score));
  const bonusSessions = records.filter(([, record]) => record.status === "bonus-completed").length;

  return {
    completedDays,
    remainingDays: course.lessonDays.length - completedDays,
    averagePretest: pretestScores.length ? Math.round(pretestScores.reduce((sum, score) => sum + score, 0) / pretestScores.length) : 0,
    averageExercise: exerciseScores.length ? Math.round(exerciseScores.reduce((sum, score) => sum + score, 0) / exerciseScores.length) : 0,
    bonusSessions
  };
}

function getProgressRecord(entryId) {
  if (!state.progress.entries[entryId]) {
    state.progress.entries[entryId] = {
      seenCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastSeenAt: null,
      lastMode: null,
      masteryScore: 0
    };
  }

  return state.progress.entries[entryId];
}

function computeMasteryScore(record) {
  if (!record.seenCount) {
    return 0;
  }
  const accuracy = record.correctCount / Math.max(1, record.seenCount);
  const exposure = Math.min(1, record.seenCount / 6);
  return Number((accuracy * 0.7 + exposure * 0.3).toFixed(3));
}

function updateEntryProgress(entryId, wasCorrect, modeId) {
  const record = getProgressRecord(entryId);
  record.seenCount += 1;
  record.lastSeenAt = new Date().toISOString();
  record.lastMode = modeId;

  if (wasCorrect) {
    record.correctCount += 1;
  } else {
    record.wrongCount += 1;
  }

  record.masteryScore = computeMasteryScore(record);
  persistProgress();
}

function incrementModePlay(modeId) {
  const bucket = state.progress.meta.modeStats[modeId] || { plays: 0, bestScore: 0 };
  bucket.plays += 1;
  state.progress.meta.modeStats[modeId] = bucket;
  state.progress.meta.sessionsPlayed += 1;
  persistProgress();
}

function recordModeBest(modeId, score) {
  const bucket = state.progress.meta.modeStats[modeId] || { plays: 0, bestScore: 0 };
  bucket.bestScore = Math.max(bucket.bestScore || 0, score);
  state.progress.meta.modeStats[modeId] = bucket;
  persistProgress();
}

function getFilteredEntries(options = {}) {
  if (!state.data) {
    return [];
  }

  const { requireAudio = false, requireExamples = false } = options;
  return state.data.entries.filter((entry) => {
    const levelMatch = entry.cefrLevels.some((level) => state.filters.levels.has(level));
    const kindMatch = state.filters.entryKinds.has(entry.entryKind);
    const audioMatch = !requireAudio || Boolean(entry.audioUk || entry.audioUs);
    const exampleMatch = !requireExamples || entry.examples.length > 0;
    return levelMatch && kindMatch && audioMatch && exampleMatch;
  });
}

function getModePool(modeId) {
  if (modeId === "mystery-sound") {
    return getFilteredEntries({ requireAudio: true });
  }

  return getFilteredEntries();
}

function getGlobalStats() {
  const filteredEntries = getFilteredEntries();
  const progressEntries = Object.values(state.progress.entries);
  const totalCorrect = progressEntries.reduce((sum, record) => sum + record.correctCount, 0);
  const totalWrong = progressEntries.reduce((sum, record) => sum + record.wrongCount, 0);
  const touched = progressEntries.filter((record) => record.seenCount > 0).length;
  const mastered = progressEntries.filter((record) => record.masteryScore >= 0.85 && record.seenCount >= 4).length;

  return {
    filteredCount: filteredEntries.length,
    audioCount: filteredEntries.filter((entry) => entry.audioUk || entry.audioUs).length,
    touched,
    mastered,
    totalCorrect,
    totalWrong,
    accuracy: totalCorrect + totalWrong === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
  };
}

function getEntryWeight(entry) {
  const record = getProgressRecord(entry.id);
  if (!record.seenCount) {
    return 6;
  }
  const mastery = record.masteryScore || 0;
  return Math.max(0.45, 5.25 - mastery * 4.2);
}

function weightedPick(entries, weightFn = getEntryWeight) {
  const weighted = entries.map((entry) => ({ entry, weight: Math.max(0.01, weightFn(entry)) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let threshold = Math.random() * total;

  for (const item of weighted) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.entry;
    }
  }

  return weighted[weighted.length - 1]?.entry;
}

function sampleEntries(pool, count, options = {}) {
  const {
    excludeIds = new Set(),
    requireAudio = false,
    requireExamples = false,
    sameLevelAs = null,
    sameLengthAs = null,
    weightFn = getEntryWeight
  } = options;

  let candidates = pool.filter((entry) => {
    if (excludeIds.has(entry.id)) {
      return false;
    }
    if (requireAudio && !(entry.audioUk || entry.audioUs)) {
      return false;
    }
    if (requireExamples && entry.examples.length === 0) {
      return false;
    }
    if (sameLevelAs && entry.primaryLevel !== sameLevelAs.primaryLevel) {
      return false;
    }
    if (sameLengthAs && Math.abs(entry.headword.length - sameLengthAs.headword.length) > 5) {
      return false;
    }
    return true;
  });

  if (candidates.length < count && sameLevelAs) {
    candidates = pool.filter((entry) => !excludeIds.has(entry.id));
  }

  if (candidates.length < count && sameLengthAs) {
    candidates = pool.filter((entry) => !excludeIds.has(entry.id));
  }

  const result = [];
  const takenIds = new Set(excludeIds);

  while (result.length < count && candidates.length > 0) {
    const picked = weightedPick(candidates, weightFn);
    result.push(picked);
    takenIds.add(picked.id);
    candidates = candidates.filter((entry) => !takenIds.has(entry.id));
  }

  return result;
}

function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shuffle(items) {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function randomOf(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function selectAudioPath(entry) {
  if (entry.audioUk && entry.audioUs) {
    return Math.random() > 0.5 ? entry.audioUk : entry.audioUs;
  }
  return entry.audioUk || entry.audioUs || null;
}

function maskHeadword(example, headword) {
  const pattern = new RegExp(escapeRegExp(headword), "ig");
  const masked = example.replace(pattern, "_____");
  return masked === example ? example : masked;
}

function makeHeadwordHint(headword) {
  const compact = headword.replace(/\s+/g, " ");
  return `Starts with “${compact[0]}” and spans ${compact.length} characters.`;
}

function buildDefinitionPrompt(entry) {
  return {
    type: "definition",
    label: "Definition",
    text: entry.previewText
  };
}

function buildExamplePrompt(entry) {
  const example = entry.examples[0] || entry.previewText;
  return {
    type: "example",
    label: "Example",
    text: maskHeadword(example, entry.headword)
  };
}

function buildAudioPrompt(entry) {
  return {
    type: "audio",
    label: "Audio",
    text: "Listen to the pronunciation and identify the entry.",
    audioPath: selectAudioPath(entry)
  };
}

function renderLearningTranslation(text, label = "中文释义", className = "learning-translation") {
  if (!text) {
    return "";
  }
  return `
    <p class="${className}">
      <span class="translation-label">${escapeHtml(label)}</span>
      <span>${escapeHtml(text)}</span>
    </p>
  `;
}

function buildLearningResolvedFeedback(question, wasCorrect) {
  const entry = state.entryMap.get(question.entryId);
  return {
    text: wasCorrect
      ? "Correct."
      : `Correct answer: ${entry?.headword || question.correctValue}`,
    meaning: entry?.cnDefinition || ""
  };
}

function buildChoiceOptions(targetEntry, pool, count = 4) {
  const distractors = sampleEntries(pool, count - 1, {
    excludeIds: new Set([targetEntry.id]),
    sameLevelAs: targetEntry,
    sameLengthAs: targetEntry,
    weightFn: () => 1
  });

  return shuffle([targetEntry, ...distractors]).map((entry) => ({
    id: entry.id,
    label: entry.headword
  }));
}

function mutateWord(word) {
  const base = word.trim();
  if (base.length < 3) {
    return `${base}${base.at(-1) || ""}`;
  }

  const variations = [];
  const mid = Math.max(1, Math.floor(base.length / 2));
  variations.push(`${base.slice(0, mid)}${base[mid + 1] || ""}${base[mid]}${base.slice(mid + 2)}`);
  variations.push(`${base.slice(0, mid)}${base[mid]}${base[mid]}${base.slice(mid + 1)}`);
  variations.push(`${base.slice(0, mid)}${base.slice(mid + 1)}`);

  if (base.includes(" ")) {
    const words = base.split(" ");
    const targetIndex = words.findIndex((token) => token.length > 2);
    if (targetIndex >= 0) {
      const token = words[targetIndex];
      words[targetIndex] = `${token.slice(0, -1)}${token.slice(-1).repeat(2)}`;
      variations.push(words.join(" "));
    }
  }

  return randomOf(variations.filter((candidate) => candidate && candidate !== base)) || `${base}e`;
}

function buildSpellingChoices(headword) {
  const choices = new Set([headword]);
  let guard = 0;
  while (choices.size < 4 && guard < 20) {
    choices.add(mutateWord(headword));
    guard += 1;
  }

  return shuffle([...choices]).map((label) => ({
    label,
    correct: label === headword
  }));
}

function makeHotSeatRound(entry) {
  const clues = [entry.previewText];
  if (entry.examples[0]) {
    clues.push(entry.examples[0]);
  }
  clues.push(makeHeadwordHint(entry.headword));

  return {
    entryId: entry.id,
    clues,
    clueStage: 0,
    resolved: false,
    wasCorrect: false,
    message: "",
    revealedAnswer: false
  };
}

function createHotSeatSession(pool) {
  const queue = sampleEntries(pool, 10);
  return {
    modeId: "hot-seat",
    score: 0,
    correct: 0,
    wrong: 0,
    roundIndex: 0,
    totalRounds: queue.length,
    queue,
    round: makeHotSeatRound(queue[0])
  };
}

function createOddOneOutSession(pool) {
  const queue = sampleEntries(pool.filter((entry) => entry.headword.length >= 2), 12);
  const current = buildOddRound(queue[0], pool);
  return {
    modeId: "odd-one-out",
    score: 0,
    correct: 0,
    wrong: 0,
    roundIndex: 0,
    totalRounds: queue.length,
    queue,
    round: current
  };
}

function buildOddRound(entry) {
  return {
    entryId: entry.id,
    prompt: buildDefinitionPrompt(entry),
    choices: buildSpellingChoices(entry.headword),
    resolved: false,
    wasCorrect: false,
    selectedLabel: null,
    message: ""
  };
}

function createFlySwatterSession(pool) {
  return {
    modeId: "fly-swatter",
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    timeLeft: 60,
    boardMistake: false,
    board: buildFlyBoard(pool),
    pool
  };
}

function buildFlyBoard(pool) {
  const target = weightedPick(pool);
  const distractors = sampleEntries(pool, 11, {
    excludeIds: new Set([target.id]),
    sameLevelAs: target,
    sameLengthAs: target,
    weightFn: () => 1
  });
  const options = shuffle([target, ...distractors]);
  const promptRoll = Math.random();
  let prompt = buildDefinitionPrompt(target);
  if (target.examples.length > 0 && promptRoll > 0.55 && promptRoll <= 0.82) {
    prompt = buildExamplePrompt(target);
  } else if ((target.audioUk || target.audioUs) && promptRoll > 0.82) {
    prompt = buildAudioPrompt(target);
  }

  return {
    targetId: target.id,
    prompt,
    options,
    mistakeRecorded: false,
    promptKey: `${target.id}:${prompt.type}`
  };
}

function createBingoSession(pool) {
  const cardEntries = sampleEntries(pool, 16);
  const prompts = shuffle(cardEntries).map((entry) => ({
    targetId: entry.id,
    prompt: (entry.audioUk || entry.audioUs) && Math.random() > 0.62 ? buildAudioPrompt(entry) : buildDefinitionPrompt(entry),
    resolved: false
  }));

  return {
    modeId: "bingo",
    score: 0,
    correct: 0,
    wrong: 0,
    cardEntries,
    markedIds: [],
    promptIndex: 0,
    prompts,
    message: ""
  };
}

function createJeopardySession(pool) {
  const categories = ["Definition", "Audio", "Example", "Spelling", "Mixed"];
  const usedIds = new Set();
  const tiles = [];

  LEVELS.forEach((level, rowIndex) => {
    categories.forEach((category) => {
      let levelPool = pool.filter((entry) => entry.cefrLevels.includes(level) && !usedIds.has(entry.id));
      if (category === "Audio") {
        levelPool = levelPool.filter((entry) => entry.audioUk || entry.audioUs);
      }
      if (category === "Example") {
        levelPool = levelPool.filter((entry) => entry.examples.length > 0);
      }

      if (levelPool.length === 0) {
        levelPool = pool.filter((entry) => !usedIds.has(entry.id));
      }

      const entry = weightedPick(levelPool);
      usedIds.add(entry.id);
      tiles.push({
        id: `${category}-${level}`,
        level,
        category,
        value: (rowIndex + 1) * 100,
        entryId: entry.id,
        answered: false,
        activePrompt: null,
        wasCorrect: false
      });
    });
  });

  return {
    modeId: "jeopardy",
    score: 0,
    correct: 0,
    wrong: 0,
    tiles,
    activeTileId: null
  };
}

function createMysterySoundSession(pool) {
  const queue = sampleEntries(pool, 12, { requireAudio: true });
  return {
    modeId: "mystery-sound",
    score: 0,
    correct: 0,
    wrong: 0,
    roundIndex: 0,
    totalRounds: queue.length,
    queue,
    round: buildMysteryRound(queue[0], pool)
  };
}

function buildMysteryRound(entry, pool) {
  return {
    entryId: entry.id,
    prompt: buildAudioPrompt(entry),
    choices: buildChoiceOptions(entry, pool),
    replayLeft: 1,
    resolved: false,
    wasCorrect: false,
    selectedId: null,
    message: ""
  };
}

function ensurePoolSize(modeId, pool) {
  const minimums = {
    "hot-seat": 10,
    "odd-one-out": 12,
    "fly-swatter": 12,
    bingo: 16,
    jeopardy: 20,
    "mystery-sound": 12
  };
  return pool.length >= minimums[modeId];
}

function startMode(modeId) {
  const pool = getModePool(modeId);
  if (!ensurePoolSize(modeId, pool)) {
    state.notice = `Not enough entries match the current filters for ${MODE_META[modeId].label}.`;
    render();
    return;
  }

  state.notice = "";
  state.summary = null;
  state.currentModeId = modeId;
  incrementModePlay(modeId);

  if (modeId === "hot-seat") {
    state.session = createHotSeatSession(pool);
  } else if (modeId === "odd-one-out") {
    state.session = createOddOneOutSession(pool);
  } else if (modeId === "fly-swatter") {
    state.session = createFlySwatterSession(pool);
  } else if (modeId === "bingo") {
    state.session = createBingoSession(pool);
  } else if (modeId === "jeopardy") {
    state.session = createJeopardySession(pool);
  } else if (modeId === "mystery-sound") {
    state.session = createMysterySoundSession(pool);
    state.pendingAudioPath = state.session.round.prompt.audioPath;
  }

  render();
}

function finishSession(extra = {}) {
  const session = state.session;
  if (!session) {
    return;
  }

  recordModeBest(session.modeId, session.score);
  state.summary = {
    modeId: session.modeId,
    score: session.score,
    correct: session.correct,
    wrong: session.wrong,
    total: session.correct + session.wrong,
    note: extra.note || "",
    badge: extra.badge || ""
  };
  state.session = null;
  render();
}

function advanceRound() {
  const session = state.session;
  if (!session) {
    return;
  }

  if (session.modeId === "hot-seat") {
    session.roundIndex += 1;
    if (session.roundIndex >= session.totalRounds) {
      finishSession({ badge: "Clue ladder complete" });
      return;
    }
    session.round = makeHotSeatRound(session.queue[session.roundIndex]);
  }

  if (session.modeId === "odd-one-out") {
    session.roundIndex += 1;
    if (session.roundIndex >= session.totalRounds) {
      finishSession({ badge: "Spelling sprint complete" });
      return;
    }
    session.round = buildOddRound(session.queue[session.roundIndex]);
  }

  if (session.modeId === "mystery-sound") {
    session.roundIndex += 1;
    if (session.roundIndex >= session.totalRounds) {
      finishSession({ badge: "Sound set complete" });
      return;
    }
    session.round = buildMysteryRound(session.queue[session.roundIndex], getModePool("mystery-sound"));
    state.pendingAudioPath = session.round.prompt.audioPath;
  }

  render();
}

function buildJeopardyPrompt(tile, pool) {
  const entry = state.entryMap.get(tile.entryId);
  const category = tile.category;

  if (category === "Definition") {
    return {
      type: "multiple-choice",
      prompt: buildDefinitionPrompt(entry),
      choices: buildChoiceOptions(entry, pool),
      answerId: entry.id
    };
  }

  if (category === "Audio") {
    return {
      type: "multiple-choice",
      prompt: buildAudioPrompt(entry),
      choices: buildChoiceOptions(entry, pool),
      answerId: entry.id
    };
  }

  if (category === "Example") {
    return {
      type: "multiple-choice",
      prompt: buildExamplePrompt(entry),
      choices: buildChoiceOptions(entry, pool),
      answerId: entry.id
    };
  }

  if (category === "Spelling") {
    const choices = buildSpellingChoices(entry.headword);
    return {
      type: "spelling",
      prompt: {
        type: "definition",
        label: "Spelling",
        text: entry.previewText
      },
      choices,
      answerLabel: entry.headword
    };
  }

  const mixedPrompt = (entry.audioUk || entry.audioUs) && Math.random() > 0.6 ? buildAudioPrompt(entry) : buildExamplePrompt(entry);
  return {
    type: "multiple-choice",
    prompt: mixedPrompt,
    choices: buildChoiceOptions(entry, pool),
    answerId: entry.id
  };
}

function openJeopardyTile(tileId) {
  const session = state.session;
  if (!session || session.modeId !== "jeopardy") {
    return;
  }

  const tile = session.tiles.find((item) => item.id === tileId);
  if (!tile || tile.answered) {
    return;
  }

  tile.activePrompt = buildJeopardyPrompt(tile, getFilteredEntries());
  session.activeTileId = tileId;
  if (tile.activePrompt.prompt.audioPath) {
    state.pendingAudioPath = tile.activePrompt.prompt.audioPath;
  }
  render();
}

function resolveJeopardyAnswer(choiceValue) {
  const session = state.session;
  if (!session || session.modeId !== "jeopardy") {
    return;
  }

  const tile = session.tiles.find((item) => item.id === session.activeTileId);
  if (!tile || !tile.activePrompt || tile.answered) {
    return;
  }

  let wasCorrect = false;
  if (tile.activePrompt.type === "spelling") {
    wasCorrect = choiceValue === tile.activePrompt.answerLabel;
  } else {
    wasCorrect = choiceValue === tile.activePrompt.answerId;
  }

  tile.answered = true;
  tile.wasCorrect = wasCorrect;
  tile.resultLabel = choiceValue;
  tile.activePrompt.result = wasCorrect;

  if (wasCorrect) {
    session.score += tile.value;
    session.correct += 1;
    updateEntryProgress(tile.entryId, true, session.modeId);
    pushPulse("#2d936c");
  } else {
    session.score = Math.max(0, session.score - Math.round(tile.value / 2));
    session.wrong += 1;
    updateEntryProgress(tile.entryId, false, session.modeId);
    pushPulse("#cc444b");
  }

  if (session.tiles.every((item) => item.answered)) {
    finishSession({ badge: "Board cleared" });
    return;
  }

  render();
}

function continueJeopardy() {
  const session = state.session;
  if (!session || session.modeId !== "jeopardy") {
    return;
  }

  session.activeTileId = null;
  render();
}

function resolveHotSeat(answer) {
  const session = state.session;
  if (!session || session.modeId !== "hot-seat") {
    return;
  }

  const round = session.round;
  if (round.resolved) {
    return;
  }

  const entry = state.entryMap.get(round.entryId);
  const isCorrect = normalizeAnswer(answer) === normalizeAnswer(entry.headword);

  if (isCorrect) {
    round.resolved = true;
    round.wasCorrect = true;
    round.message = `Correct. ${entry.headword} stays in your active rotation with a score bonus for solving at clue ${round.clueStage + 1}.`;
    session.correct += 1;
    session.score += Math.max(1, 3 - round.clueStage);
    updateEntryProgress(entry.id, true, session.modeId);
    pushPulse("#2d936c");
  } else if (round.clueStage < round.clues.length - 1) {
    round.clueStage += 1;
    round.message = `Not quite. Clue ${round.clueStage + 1} is now unlocked.`;
    pushPulse("#f4a261");
  } else {
    round.resolved = true;
    round.wasCorrect = false;
    round.revealedAnswer = true;
    round.message = `The Cambridge entry was “${entry.headword}”.`;
    session.wrong += 1;
    updateEntryProgress(entry.id, false, session.modeId);
    pushPulse("#cc444b");
  }

  render();
}

function skipHotSeatRound() {
  const session = state.session;
  if (!session || session.modeId !== "hot-seat") {
    return;
  }

  const round = session.round;
  if (round.resolved) {
    return;
  }

  const entry = state.entryMap.get(round.entryId);
  round.resolved = true;
  round.wasCorrect = false;
  round.revealedAnswer = true;
  round.message = `Skipped. The answer was “${entry.headword}”.`;
  session.wrong += 1;
  updateEntryProgress(entry.id, false, session.modeId);
  pushPulse("#cc444b");
  render();
}

function resolveOddChoice(label) {
  const session = state.session;
  if (!session || session.modeId !== "odd-one-out") {
    return;
  }

  const round = session.round;
  if (round.resolved) {
    return;
  }

  const entry = state.entryMap.get(round.entryId);
  round.selectedLabel = label;
  round.resolved = true;
  round.wasCorrect = label === entry.headword;
  round.message = round.wasCorrect
    ? `Correct. “${entry.headword}” is the only Cambridge-approved spelling in this set.`
    : `Not this time. The correct spelling was “${entry.headword}”.`;

  if (round.wasCorrect) {
    session.score += 1;
    session.correct += 1;
    updateEntryProgress(entry.id, true, session.modeId);
    pushPulse("#2d936c");
  } else {
    session.wrong += 1;
    updateEntryProgress(entry.id, false, session.modeId);
    pushPulse("#cc444b");
  }

  render();
}

function resolveFlyChoice(entryId) {
  const session = state.session;
  if (!session || session.modeId !== "fly-swatter") {
    return;
  }

  const board = session.board;
  const wasCorrect = entryId === board.targetId;
  if (wasCorrect) {
    const target = state.entryMap.get(board.targetId);
    session.correct += 1;
    session.score += 2 + Math.floor(session.streak / 3);
    session.streak += 1;
    session.timeLeft = Math.min(75, session.timeLeft + 1.4);
    updateEntryProgress(target.id, !board.mistakeRecorded, session.modeId);
    pushPulse("#2d936c");
    session.board = buildFlyBoard(session.pool);
    state.pendingAudioPath = session.board.prompt.audioPath || null;
  } else {
    session.score = Math.max(0, session.score - 1);
    session.streak = 0;
    if (!board.mistakeRecorded) {
      board.mistakeRecorded = true;
      session.wrong += 1;
    }
    pushPulse("#cc444b");
  }

  render();
}

function resolveBingoCell(entryId) {
  const session = state.session;
  if (!session || session.modeId !== "bingo") {
    return;
  }

  const promptBundle = session.prompts[session.promptIndex];
  if (!promptBundle) {
    return;
  }

  const targetId = promptBundle.targetId;
  if (entryId === targetId && !session.markedIds.includes(entryId)) {
    session.markedIds.push(entryId);
    session.correct += 1;
    session.score += 2;
    updateEntryProgress(entryId, true, session.modeId);
    session.message = `Marked “${state.entryMap.get(entryId).headword}”.`;
    pushPulse("#2d936c");

    if (hasBingo(session.markedIds, session.cardEntries)) {
      session.score += 8;
      finishSession({ badge: "Bingo line complete", note: "You completed a row, column, or diagonal." });
      return;
    }

    session.promptIndex += 1;
    if (session.promptIndex >= session.prompts.length) {
      finishSession({ badge: "Full card reviewed", note: "You exhausted the 16-card deck." });
      return;
    }

    state.pendingAudioPath = session.prompts[session.promptIndex].prompt.audioPath || null;
  } else {
    session.wrong += 1;
    session.message = `That cell does not match the current clue.`;
    pushPulse("#cc444b");
  }

  render();
}

function hasBingo(markedIds, cardEntries) {
  const ids = new Set(markedIds);
  const matrix = [];
  for (let row = 0; row < 4; row += 1) {
    matrix.push(cardEntries.slice(row * 4, row * 4 + 4).map((entry) => ids.has(entry.id)));
  }

  const lines = [];
  for (let index = 0; index < 4; index += 1) {
    lines.push(matrix[index].every(Boolean));
    lines.push(matrix.map((row) => row[index]).every(Boolean));
  }
  lines.push(matrix.every((row, index) => row[index]));
  lines.push(matrix.every((row, index) => row[3 - index]));

  return lines.some(Boolean);
}

function resolveMysteryChoice(entryId) {
  const session = state.session;
  if (!session || session.modeId !== "mystery-sound") {
    return;
  }

  const round = session.round;
  if (round.resolved) {
    return;
  }

  round.selectedId = entryId;
  round.resolved = true;
  round.wasCorrect = entryId === round.entryId;

  if (round.wasCorrect) {
    session.score += 2;
    session.correct += 1;
    round.message = `Correct. You matched the pronunciation to “${state.entryMap.get(round.entryId).headword}”.`;
    updateEntryProgress(round.entryId, true, session.modeId);
    pushPulse("#2d936c");
  } else {
    session.wrong += 1;
    round.message = `The pronunciation belonged to “${state.entryMap.get(round.entryId).headword}”.`;
    updateEntryProgress(round.entryId, false, session.modeId);
    pushPulse("#cc444b");
  }

  render();
}

function replayMysteryAudio() {
  const session = state.session;
  if (!session || session.modeId !== "mystery-sound") {
    return;
  }

  if (session.round.replayLeft <= 0) {
    return;
  }

  session.round.replayLeft -= 1;
  state.pendingAudioPath = session.round.prompt.audioPath;
  render();
}

function toggleFilterSet(setName, value, universe) {
  const target = state.filters[setName];
  if (target.has(value) && target.size > 1) {
    target.delete(value);
  } else {
    target.add(value);
  }

  if (target.size === 0) {
    universe.forEach((item) => target.add(item));
  }

  render();
}

function setHeadwordsOnly() {
  const headwordsOnly = state.filters.entryKinds.size === 1 && state.filters.entryKinds.has("headword");
  state.filters.entryKinds = headwordsOnly ? new Set(ENTRY_KINDS) : new Set(["headword"]);
  render();
}

function resetProgress() {
  state.progress = {
    entries: {},
    meta: defaultMeta()
  };
  persistProgress();
  state.notice = "Mastery reset. Learning and Arcade will weight unseen entries again.";
  render();
}

function handleClick(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;
  if (action === "switch-hub") {
    state.hub = trigger.dataset.hub;
    state.notice = "";
    render();
  } else if (action === "learning-create-course") {
    startLearningCourse();
  } else if (action === "learning-nav") {
    setLearningView(trigger.dataset.view);
  } else if (action === "learning-select-lesson") {
    setLearningSelectedLesson(trigger.dataset.lessonKey, trigger.dataset.view || null);
  } else if (action === "learning-open-bonus-week") {
    setLearningSelectedWeek(Number(trigger.dataset.week), "bonus");
  } else if (action === "learning-start-selected") {
    startSelectedLearningFlow();
  } else if (action === "learning-open-phase") {
    openSelectedLearningPhase(trigger.dataset.phase);
  } else if (action === "learning-close-session") {
    closeLearningSession();
  } else if (action === "learning-close-to-view") {
    minimizeLearningSession(trigger.dataset.view || "current");
  } else if (action === "learning-resume-session") {
    resumeLearningSession();
  } else if (action === "learning-confirm-replace-session") {
    confirmLearningSessionReplacement();
  } else if (action === "learning-cancel-replace-session") {
    cancelLearningSessionReplacement();
  } else if (action === "learning-choice") {
    resolveLearningChoice(trigger.dataset.value);
  } else if (action === "learning-next-question") {
    advanceLearningQuestion();
  } else if (action === "learning-next-card") {
    advanceLearningStudyCard();
  } else if (action === "learning-reveal-clue") {
    revealLearningClue();
  } else if (action === "learning-reset") {
    if (window.confirm("Reset the 13-week learning course and all saved learning records?")) {
      resetLearningCourse();
    }
  } else if (action === "learning-jump-today") {
    if (!state.learning.course) {
      return;
    }
    const lesson = resolvePreferredLearningLesson(state.learning.course);
    if (lesson) {
      setLearningSelectedLesson(lesson.lessonKey, "current");
    }
  } else if (action === "start-mode") {
    if (state.status !== "ready") {
      state.pendingStartModeId = trigger.dataset.mode;
      state.notice = `${MODE_META[trigger.dataset.mode].label} will open as soon as the Cambridge corpus finishes loading.`;
      render();
      return;
    }
    startMode(trigger.dataset.mode);
  } else if (action === "return-menu") {
    state.session = null;
    state.summary = null;
    render();
  } else if (action === "restart-mode") {
    startMode(state.currentModeId);
  } else if (action === "toggle-level") {
    toggleFilterSet("levels", trigger.dataset.level, LEVELS);
  } else if (action === "toggle-kind") {
    toggleFilterSet("entryKinds", trigger.dataset.kind, ENTRY_KINDS);
  } else if (action === "headwords-only") {
    setHeadwordsOnly();
  } else if (action === "reset-progress") {
    if (window.confirm("Reset local mastery data across Learning and Arcade?")) {
      resetProgress();
    }
  } else if (action === "toggle-fullscreen") {
    toggleFullscreen();
  } else if (action === "hot-seat-skip") {
    skipHotSeatRound();
  } else if (action === "continue-round") {
    advanceRound();
  } else if (action === "odd-choice") {
    resolveOddChoice(trigger.dataset.label);
  } else if (action === "fly-choice") {
    resolveFlyChoice(trigger.dataset.entryId);
  } else if (action === "bingo-cell") {
    resolveBingoCell(trigger.dataset.entryId);
  } else if (action === "jeopardy-open") {
    openJeopardyTile(trigger.dataset.tileId);
  } else if (action === "jeopardy-answer") {
    resolveJeopardyAnswer(trigger.dataset.value);
  } else if (action === "jeopardy-continue") {
    continueJeopardy();
  } else if (action === "mystery-choice") {
    resolveMysteryChoice(trigger.dataset.entryId);
  } else if (action === "mystery-replay") {
    replayMysteryAudio();
  } else if (action === "play-audio") {
    const path = trigger.dataset.path;
    if (path) {
      state.pendingAudioPath = path;
      render();
    }
  }
}

function handleSubmit(event) {
  if (event.target.matches("[data-form='hot-seat-answer']")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    resolveHotSeat(formData.get("answer") || "");
  } else if (event.target.matches("[data-form='learning-text-answer']")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    submitLearningTextAnswer(String(formData.get("answer") || ""));
  }
}

function handleKeydown(event) {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (event.key.toLowerCase() === "f" && tag !== "input" && tag !== "textarea") {
    event.preventDefault();
    toggleFullscreen();
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
  resizeCanvas();
}

function startAnimationLoop() {
  const frame = (now) => {
    const elapsed = now - state.clock.lastNow;
    state.clock.lastNow = now;
    const manualSuppressed = performance.now() - state.lastManualAdvanceAt < 100;
    if (!manualSuppressed) {
      advanceWorld(elapsed, false);
    } else {
      advanceEffects(elapsed);
    }
    drawCanvas();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function advanceWorld(ms, manual) {
  advanceEffects(ms);

  const session = state.session;
  if (!session || session.modeId !== "fly-swatter") {
    return;
  }

  session.timeLeft = Math.max(0, session.timeLeft - ms / 1000);
  const bucket = Math.floor(session.timeLeft * 5);
  if (bucket !== state.clock.lastTimerBucket || manual) {
    state.clock.lastTimerBucket = bucket;
    render();
  }

  if (session.timeLeft <= 0) {
    finishSession({ badge: "Timer expired", note: "Fly Swatter ran through the full 60-second rush." });
  }
}

function advanceEffects(ms) {
  state.effects.time += ms;
  state.effects.flash = Math.max(0, state.effects.flash - ms * 0.0018);
  state.effects.pulses = state.effects.pulses
    .map((pulse) => ({
      ...pulse,
      life: pulse.life - ms * 0.001
    }))
    .filter((pulse) => pulse.life > 0);
}

function pushPulse(color) {
  state.effects.flash = 1;
  state.effects.pulses.push({
    color,
    radius: 20 + Math.random() * 40,
    life: 1
  });
}

function render() {
  if (state.status === "loading") {
    appRoot.innerHTML = renderLoading();
    syncHooks();
    return;
  }

  if (state.status === "error") {
    appRoot.innerHTML = renderError();
    syncHooks();
    return;
  }

  appRoot.innerHTML = state.hub === "learning" ? renderLearningApp() : renderArcadeApp();

  syncHooks();
  bindCanvas();
  if (state.pendingAudioPath) {
    playAudio(state.pendingAudioPath);
    state.pendingAudioPath = null;
  }
}

function renderLoading() {
  return `
    <div class="loading">
      <div class="loading-card">
        <h1>Loading the Cambridge arcade…</h1>
        <p>Reading the reduced A1-B2 dataset and preparing the session generator, progress store, and audio hooks.</p>
        <div class="mode-grid">
          ${Object.entries(MODE_META).map(([modeId, meta]) => `
            <article class="mode-card">
              <div>
                <h3>${meta.label}</h3>
                <p>${meta.subtitle}</p>
              </div>
              <button class="app-button" data-action="start-mode" data-mode="${modeId}">Queue ${meta.label}</button>
            </article>
          `).join("")}
        </div>
        ${state.notice ? `<p class="microcopy">${escapeHtml(state.notice)}</p>` : ""}
      </div>
    </div>
  `;
}

function renderError() {
  return `
    <div class="loading">
      <div class="loading-card">
        <h1>Could not start the arcade</h1>
        <p>${escapeHtml(state.notice)}</p>
        <p class="microcopy">Run <code>npm run build:data</code> first if the reduced dataset is missing.</p>
      </div>
    </div>
  `;
}

function renderHubSwitch() {
  return `
    <div class="hub-switch">
      ${Object.entries(HUBS).map(([hubId, meta]) => `
        <button class="mode-chip ${state.hub === hubId ? "is-active" : ""}" data-action="switch-hub" data-hub="${hubId}">
          <span>${meta.label}</span>
          <small>${meta.subtitle}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function renderArcadeApp() {
  const stats = getGlobalStats();
  const filteredEntries = getFilteredEntries();
  return `
    <div class="shell">
      <div class="shell-inner">
        <header class="topbar">
          <div class="brand">
            <span class="eyebrow">Cambridge CEFR Arcade</span>
            <h1>Vocabulary that fights back.</h1>
            <p>Desktop-first self-study arcade built from Cambridge A1-B2 tags, fast repetition logic, and pronunciation-driven rounds.</p>
            ${renderHubSwitch()}
          </div>
          <div class="topbar-actions">
            <button class="ghost-button" data-action="toggle-fullscreen">${document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen (F)"}</button>
            <button class="ghost-button is-danger" data-action="reset-progress">Reset Progress</button>
          </div>
        </header>
        <div class="layout">
          <aside class="sidebar">
            <section class="panel">
              <h2>Filters</h2>
              <div class="filter-group">
                <div>
                  <div class="filter-label">CEFR Bands</div>
                  <div class="chip-row">
                    ${LEVELS.map((level) => `
                      <button class="chip ${state.filters.levels.has(level) ? "is-active" : ""}" data-action="toggle-level" data-level="${level}">${level}</button>
                    `).join("")}
                  </div>
                </div>
                <div>
                  <div class="filter-label">Entry Types</div>
                  <div class="chip-row">
                    ${ENTRY_KINDS.map((kind) => `
                      <button class="chip ${state.filters.entryKinds.has(kind) ? "is-active" : ""}" data-action="toggle-kind" data-kind="${kind}">${toTitle(kind)}</button>
                    `).join("")}
                  </div>
                </div>
                <div class="chip-row">
                  <button class="chip is-quick" data-action="headwords-only">Headwords Only Toggle</button>
                </div>
              </div>
            </section>
            <section class="panel">
              <h2>Stats</h2>
              <div class="stats-grid">
                <div class="stat-card"><strong>${stats.filteredCount}</strong><span>Filtered entries</span></div>
                <div class="stat-card"><strong>${stats.audioCount}</strong><span>Audio-ready entries</span></div>
                <div class="stat-card"><strong>${stats.touched}</strong><span>Seen locally</span></div>
                <div class="stat-card"><strong>${stats.mastered}</strong><span>Mastered</span></div>
                <div class="stat-card"><strong>${stats.accuracy}%</strong><span>Accuracy</span></div>
                <div class="stat-card"><strong>${state.progress.meta.sessionsPlayed}</strong><span>Sessions played</span></div>
              </div>
            </section>
            <section class="panel">
              <h3>Coverage Notes</h3>
              <p class="microcopy">Current active pool draws from all matching Cambridge A1-B2 entries, deduped by lookup id. Multiword phrases and idioms stay in play unless you switch to headwords only.</p>
              <div class="chip-row">
                ${LEVELS.map((level) => `
                  <span class="pill">${level}: ${state.data.byLevel[level].filter((entryId) => state.filters.entryKinds.has(state.entryMap.get(entryId).entryKind)).length}</span>
                `).join("")}
              </div>
            </section>
          </aside>
          <main class="stage">
            <section class="hero-card">
              <div class="hero-grid">
                <div class="hero-copy">
                  <div class="hero-badges">
                    <span class="hero-badge">5,207 A1-B2 entries</span>
                    <span class="hero-badge">6 integrated game modes</span>
                    <span class="hero-badge">Local mastery memory</span>
                  </div>
                  ${state.summary ? renderSummary() : state.session ? renderSession() : renderMenu(filteredEntries)}
                </div>
                <div class="canvas-card">
                  <canvas id="arcade-canvas" width="700" height="320"></canvas>
                  <div class="canvas-overlay">
                    <span class="canvas-label">${state.session ? MODE_META[state.session.modeId].label : "Arcade Lobby"} · ${stats.filteredCount} live entries</span>
                  </div>
                </div>
              </div>
            </section>
            ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
          </main>
        </div>
      </div>
    </div>
  `;
}

function renderLearningApp() {
  if (isLearningFocusMode()) {
    return renderLearningFocusApp();
  }

  const summary = getLearningSummaryStats();
  const {
    course,
    selectedLesson,
    selectedStatus,
    selectedRecord,
    selectedWeek,
    selectedBonusSlot,
    selectedBonusStatus,
    selectedBonusRecord
  } = getSelectedLearningContext();
  const planCounts = selectedLesson ? countLevelsForEntryIds(selectedLesson.lessonEntryIds) : null;
  const activePhase = selectedLesson ? state.learning.ui.selectedPhaseTab : "pretest";
  const phaseState = selectedLesson ? getLearningPhaseState(selectedLesson, activePhase) : null;
  const primaryPhaseState = selectedLesson ? getLearningPhaseState(selectedLesson, getDefaultPhaseTabForLesson(selectedLesson)) : null;
  const canvasLabel = course
    ? `${selectedLesson?.displayLabel || "Week 1 · Day 1"} · ${getLearningStatusLabel(selectedStatus || "available")}`
    : "Learning Setup";

  return `
    <div class="shell">
      <div class="shell-inner">
        <header class="topbar">
          <div class="brand">
            <span class="eyebrow">Cambridge CEFR Learning Hub</span>
            <h1>Thirteen weeks. Five days a week. Sixty entries a day.</h1>
            <p>A guided course that starts at A1, leans hardest through A2 and B1, then pushes into B2 with pretests, study cards, exercises, and retained learning history.</p>
            ${renderHubSwitch()}
          </div>
          <div class="topbar-actions">
            <button class="ghost-button" data-action="learning-jump-today">Jump to Next Incomplete</button>
            <button class="ghost-button" data-action="toggle-fullscreen">${document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen (F)"}</button>
            ${course ? `<button class="ghost-button is-danger" data-action="learning-reset">Reset Course</button>` : ""}
            <button class="ghost-button is-danger" data-action="reset-progress">Reset Mastery</button>
          </div>
        </header>
        <div class="layout">
          <aside class="sidebar">
            <section class="panel">
              <h2>Learning Views</h2>
              <div class="learning-nav">
                ${LEARNING_VIEWS.map((view) => `
                  <button class="chip ${state.learning.ui.view === view ? "is-active" : ""}" data-action="learning-nav" data-view="${view}">
                    ${view === "current" ? "Current Day" : view === "week" ? "All Weeks" : view === "bonus" ? "Bonus Bank" : "Learning Summary"}
                  </button>
                `).join("")}
              </div>
            </section>
            <section class="panel">
              <h2>${course ? "Course Stats" : "Course Shape"}</h2>
              <div class="stats-grid">
                <div class="stat-card"><strong>${course ? course.lessonDays.length : 65}</strong><span>Lesson days</span></div>
                <div class="stat-card"><strong>${course ? course.bonusEntryIds.length : 1307}</strong><span>Bonus entries</span></div>
                <div class="stat-card"><strong>${summary.completedDays}</strong><span>Completed days</span></div>
                <div class="stat-card"><strong>${summary.remainingDays}</strong><span>Remaining days</span></div>
                <div class="stat-card"><strong>${summary.averagePretest}%</strong><span>Avg pretest</span></div>
                <div class="stat-card"><strong>${summary.averageExercise}%</strong><span>Avg exercise</span></div>
              </div>
            </section>
            <section class="panel">
              <h3>${course ? "Selected Lesson" : "Plan Notes"}</h3>
              ${course ? `
                <div class="selection-card">
                  <div class="selection-header">
                    <div>
                      <strong>${selectedLesson?.displayLabel || "Week 1 · Day 1"}</strong>
                      <div class="microcopy">${selectedLesson?.lessonKey || "W01-D1"}${state.learning.ui.view === "bonus" ? ` · ${selectedBonusSlot?.displayLabel || getBonusDisplayLabel(selectedWeek)}` : ""}</div>
                    </div>
                    ${selectedLesson ? renderStatusPill(selectedStatus) : ""}
                  </div>
                  ${selectedLesson ? `
                    <div class="chip-row">
                      <span class="pill">60 lesson entries</span>
                      <span class="pill">12-question pretest</span>
                      <span class="pill">30-question exercise</span>
                    </div>
                    <div class="chip-row">${renderLevelPills(planCounts)}</div>
                    <p class="microcopy">Exercise types: ${selectedLesson.exerciseGameTypes.map(toTitle).join(", ")}.</p>
                  ` : ""}
                  ${selectedRecord ? `
                    <div class="chip-row">
                      ${Number.isFinite(selectedRecord.pretestScore) ? `<span class="pill">Pretest ${selectedRecord.pretestScore}%</span>` : ""}
                      ${selectedRecord.studyGroupsCompleted ? `<span class="pill">Study groups ${selectedRecord.studyGroupsCompleted}/6</span>` : ""}
                      ${Number.isFinite(selectedRecord.exerciseScore) ? `<span class="pill">Exercise ${selectedRecord.exerciseScore}%</span>` : ""}
                    </div>
                  ` : ""}
                  ${state.learning.ui.view === "bonus" && selectedBonusRecord ? `
                    <div class="chip-row">
                      ${Number.isFinite(selectedBonusRecord.exerciseScore) ? `<span class="pill">Bonus ${selectedBonusRecord.exerciseScore}%</span>` : ""}
                      ${selectedBonusStatus ? renderStatusPill(selectedBonusStatus) : ""}
                    </div>
                  ` : ""}
                  <div class="play-actions">
                    <button class="app-button" data-action="learning-start-selected">
                      ${state.learning.ui.view === "bonus" ? (selectedBonusStatus === "completed" ? "Open Bonus Recap" : "Start Bonus Drill") : (primaryPhaseState?.actionLabel || phaseState?.actionLabel || "Open Lesson")}
                    </button>
                  </div>
                </div>
              ` : `
                <div class="selection-card">
                  <p class="microcopy">The guided course covers 3,900 core entries across 65 numbered lessons, then leaves 1,307 B2-heavy entries inside the Bonus Bank for weekly drills and catch-up sessions.</p>
                  <div class="chip-row">
                    <span class="pill">13 weeks</span>
                    <span class="pill">Mon-Fri lessons</span>
                    <span class="pill">Bonus drill each week</span>
                  </div>
                </div>
              `}
            </section>
          </aside>
          <main class="stage">
            ${state.learning.session ? renderLearningResumeBar() : ""}
            <section class="hero-card">
              <div class="hero-grid">
                <div class="hero-copy">
                  <div class="hero-badges">
                    <span class="hero-badge">65 core lesson days</span>
                    <span class="hero-badge">3900 scheduled entries</span>
                    <span class="hero-badge">1307-entry bonus bank</span>
                  </div>
                  ${renderLearningContent()}
                </div>
                <div class="canvas-card">
                  <canvas id="arcade-canvas" width="700" height="320"></canvas>
                  <div class="canvas-overlay">
                    <span class="canvas-label">${canvasLabel} · ${course ? `${summary.completedDays}/${course.lessonDays.length} days complete` : "Start the guided plan"}</span>
                  </div>
                </div>
              </div>
            </section>
            ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}
          </main>
        </div>
        ${renderLearningReplaceDialog()}
      </div>
    </div>
  `;
}

function renderLearningContent() {
  if (!state.learning.course) {
    return renderLearningOnboarding();
  }

  if (state.learning.ui.view === "week") {
    return renderLearningWeekView();
  }
  if (state.learning.ui.view === "bonus") {
    return renderLearningBonusView();
  }
  if (state.learning.ui.view === "summary") {
    return renderLearningSummaryView();
  }
  return renderLearningCurrentView();
}

function renderLearningFocusApp() {
  return `
    <div class="shell shell--focus">
      <div class="shell-inner shell-inner--focus">
        <main class="learning-focus-stage">
          ${renderLearningSession()}
        </main>
      </div>
    </div>
  `;
}

function renderLearningResumeBar() {
  if (!state.learning.session || state.learning.ui.presentation !== "dashboard") {
    return "";
  }

  return `
    <section class="resume-banner">
      <div>
        <span class="eyebrow">Active Session</span>
        <strong>${escapeHtml(state.learning.session.displayLabel || "Learning Session")}</strong>
        <p>${escapeHtml(getLearningSessionTitle(state.learning.session))} · ${escapeHtml(getLearningSessionProgressLabel(state.learning.session))}</p>
      </div>
      <div class="play-actions">
        <button class="app-button" data-action="learning-resume-session">Resume</button>
      </div>
    </section>
  `;
}

function renderLearningReplaceDialog() {
  const target = state.learning.ui.pendingTarget;
  const activeSession = state.learning.session;
  if (!target || !activeSession) {
    return "";
  }

  return `
    <div class="dialog-backdrop">
      <div class="dialog-card">
        <span class="eyebrow">Session In Progress</span>
        <h2>Keep the current session or replace it.</h2>
        <p>${escapeHtml(activeSession.displayLabel || "Current session")} · ${escapeHtml(getLearningSessionTitle(activeSession))} is still live at ${escapeHtml(getLearningSessionProgressLabel(activeSession))}.</p>
        <p>Cancel keeps that exact session and resumes it. Replace discards it and opens ${escapeHtml(target.displayLabel)} · ${escapeHtml(target.phaseTitle)}.</p>
        <div class="play-actions">
          <button class="ghost-button" data-action="learning-cancel-replace-session">Keep Current Session</button>
          <button class="app-button" data-action="learning-confirm-replace-session">Replace With New Selection</button>
        </div>
      </div>
    </div>
  `;
}

function renderLearningOnboarding() {
  return `
    <div class="summary-card learning-onboarding">
      <span class="eyebrow">Start The Course</span>
      <h2>Build the numbered 13-week course.</h2>
      <p>The planner schedules all A1, A2, and B1 entries, then adds the highest-priority 666 B2 entries into the core path. The remaining 1,307 B2 entries stay available in the Bonus Bank.</p>
      <div class="play-actions">
        <button class="app-button" data-action="learning-create-course">Create 13-Week Plan</button>
      </div>
      <div class="summary-grid-block">
        <div class="summary-stat"><strong>65</strong><span>Weekday lessons</span></div>
        <div class="summary-stat"><strong>60</strong><span>Entries each day</span></div>
        <div class="summary-stat"><strong>12</strong><span>Pretest questions</span></div>
        <div class="summary-stat"><strong>30</strong><span>Exercise questions</span></div>
      </div>
      <div class="chip-row">
        <span class="pill">Weeks 1-2 lean A1 -> A2</span>
        <span class="pill">Weeks 3-11 lean A2 -> B1</span>
        <span class="pill">Weeks 12-13 peak in B2</span>
      </div>
    </div>
  `;
}

function renderLearningPhaseDetail(lesson, phase, phaseState, record) {
  if (!lesson) {
    return "";
  }

  if (phase === "pretest") {
    return `
      <div class="phase-detail-card">
        <div class="selection-header">
          <div>
            <h4>Diagnostic Pretest</h4>
            <p class="microcopy">A short baseline check across ${DAILY_PRETEST_SIZE} entries from this lesson.</p>
          </div>
          ${renderStatusPill(phaseState.status)}
        </div>
        <div class="chip-row">
          <span class="pill">${DAILY_PRETEST_SIZE} questions</span>
          ${Number.isFinite(record.pretestScore) ? `<span class="pill">Baseline ${record.pretestScore}%</span>` : `<span class="pill">Baseline pending</span>`}
        </div>
      </div>
    `;
  }

  if (phase === "study") {
    return `
      <div class="phase-detail-card">
        <div class="selection-header">
          <div>
            <h4>Study Deck</h4>
            <p class="microcopy">All 60 lesson entries open here in six guided groups with short memory cues and examples.</p>
          </div>
          ${renderStatusPill(phaseState.status)}
        </div>
        <div class="chip-row">
          <span class="pill">6 groups</span>
          <span class="pill">${record.studyGroupsCompleted}/6 finished</span>
          <span class="pill">60 total cards</span>
        </div>
      </div>
    `;
  }

  if (phase === "exercise") {
    return `
      <div class="phase-detail-card">
        <div class="selection-header">
          <div>
            <h4>Mixed Exercise</h4>
            <p class="microcopy">A 30-question randomized check built only from this lesson’s 60 entries.</p>
          </div>
          ${renderStatusPill(phaseState.status)}
        </div>
        <div class="chip-row">
          <span class="pill">${DAILY_EXERCISE_SIZE} questions</span>
          ${Number.isFinite(record.exerciseScore) ? `<span class="pill">Score ${record.exerciseScore}%</span>` : `<span class="pill">Score pending</span>`}
        </div>
        <p class="microcopy">Game types: ${lesson.exerciseGameTypes.map(toTitle).join(", ")}.</p>
      </div>
    `;
  }

  return `
    <div class="phase-detail-card">
      <div class="selection-header">
        <div>
          <h4>Day Summary</h4>
          <p class="microcopy">Review the saved pretest, study, and exercise record for ${lesson.displayLabel}.</p>
        </div>
        ${renderStatusPill(phaseState.status)}
      </div>
      <div class="chip-row">
        ${Number.isFinite(record.pretestScore) ? `<span class="pill">Pretest ${record.pretestScore}%</span>` : ""}
        ${Number.isFinite(record.exerciseScore) ? `<span class="pill">Exercise ${record.exerciseScore}%</span>` : ""}
        <span class="pill">${record.studyGroupsCompleted}/6 study groups</span>
      </div>
    </div>
  `;
}

function renderLearningCurrentView() {
  const { selectedLesson, selectedStatus, selectedRecord } = getSelectedLearningContext();
  const counts = selectedLesson ? countLevelsForEntryIds(selectedLesson.lessonEntryIds) : null;
  const record = normalizeLearningRecord(selectedRecord, "available");
  const activePhase = selectedLesson ? state.learning.ui.selectedPhaseTab : "pretest";
  const activePhaseState = selectedLesson ? getLearningPhaseState(selectedLesson, activePhase) : null;
  const primaryPhaseState = selectedLesson ? getLearningPhaseState(selectedLesson, getDefaultPhaseTabForLesson(selectedLesson)) : null;
  return `
    <div class="learning-stack">
      <div class="summary-card">
        <span class="eyebrow">Current Day</span>
        <h2>${selectedLesson?.displayLabel || "Week 1 · Day 1"}</h2>
        <p>Every lesson opens with a diagnostic pretest, then moves through six study groups and a 30-question mixed exercise.</p>
        <div class="chip-row">
          ${selectedLesson ? renderStatusPill(selectedStatus) : ""}
          ${selectedLesson ? renderLevelPills(counts) : ""}
        </div>
        <div class="summary-grid-block">
          <div class="summary-stat"><strong>${Number.isFinite(record.pretestScore) ? `${record.pretestScore}%` : "Pending"}</strong><span>Pretest</span></div>
          <div class="summary-stat"><strong>${record.studyGroupsCompleted}/6</strong><span>Study groups</span></div>
          <div class="summary-stat"><strong>${Number.isFinite(record.exerciseScore) ? `${record.exerciseScore}%` : "Pending"}</strong><span>Exercise</span></div>
          <div class="summary-stat"><strong>${selectedLesson ? selectedLesson.exerciseGameTypes.length : LEARNING_GAME_TYPES.length}</strong><span>Exercise game types</span></div>
        </div>
        <div class="play-actions">
          <button class="app-button" data-action="learning-start-selected">${primaryPhaseState?.actionLabel || activePhaseState?.actionLabel || "Open Lesson"}</button>
          <button class="ghost-button" data-action="learning-nav" data-view="week">Browse All Weeks</button>
        </div>
      </div>
      ${selectedLesson ? `
        <div class="panel learning-detail-panel">
          <h3>Day Structure</h3>
          <div class="lesson-timeline">
            ${LEARNING_PHASE_TABS.map((phase, index) => {
              const phaseInfo = getLearningPhaseState(selectedLesson, phase);
              return `
                <button class="lesson-step is-action ${state.learning.ui.selectedPhaseTab === phase ? "is-selected" : ""} is-${phaseInfo.locked ? "locked" : phaseInfo.status}" data-action="learning-open-phase" data-phase="${phase}" type="button">
                  <strong>${index + 1}</strong>
                  <span>${escapeHtml(phaseInfo.title)}</span>
                  <small>${escapeHtml(phaseInfo.locked ? phaseInfo.lockedReason : phaseInfo.short)}</small>
                </button>
              `;
            }).join("")}
          </div>
          ${renderLearningPhaseDetail(selectedLesson, activePhase, activePhaseState, record)}
        </div>
      ` : ""}
    </div>
  `;
}

function renderLearningWeekView() {
  const { selectedLessonKey, selectedWeek } = getSelectedLearningContext();

  return `
    <div class="learning-stack">
      <div class="section-header">
        <div>
          <span class="eyebrow">All Weeks</span>
          <h2>Every lesson and weekly bonus slot is open from day 1.</h2>
        </div>
      </div>
      <div class="learning-stack">
        ${Array.from({ length: TOTAL_WEEKS }, (_, index) => index + 1).map((week) => {
          const lessons = getWeekLessons(week);
          const completion = getWeekCompletion(week);
          const allocation = LEARNING_WEEKLY_ALLOCATION[week - 1];
          const bonusSlot = getLearningBonusSlotByWeek(week);
          const bonusStatus = bonusSlot ? getLearningDayStatus({ type: "bonus", date: bonusSlot.date, week }) : "available";
          return `
            <section class="panel">
              <div class="section-header">
                <div>
                  <span class="eyebrow">Week ${week}</span>
                  <h3>${completion.completed}/${completion.total} lesson days completed</h3>
                </div>
                <div class="chip-row">${renderLevelPills(allocation)}</div>
              </div>
              <div class="week-grid week-grid--learning">
                ${lessons.map((lesson) => {
                  const status = getLearningDayStatus({ type: "lesson", date: lesson.date, week: lesson.week, lesson });
                  const counts = countLevelsForEntryIds(lesson.lessonEntryIds);
                  return `
                    <article class="week-card ${lesson.lessonKey === selectedLessonKey ? "is-selected" : ""}">
                      <div class="selection-header">
                        <div>
                          <strong>Day ${lesson.dayInWeek}</strong>
                          <div class="microcopy">${lesson.displayLabel}</div>
                        </div>
                        ${renderStatusPill(status)}
                      </div>
                      <div class="chip-row">
                        ${renderLevelPills(counts)}
                      </div>
                      <div class="play-actions">
                        <button class="app-button" data-action="learning-select-lesson" data-lesson-key="${lesson.lessonKey}" data-view="current">Open Lesson</button>
                      </div>
                    </article>
                  `;
                }).join("")}
                <article class="week-card week-card--bonus ${state.learning.ui.view === "bonus" && selectedWeek === week ? "is-selected" : ""}">
                  <div class="selection-header">
                    <div>
                      <strong>Bonus</strong>
                      <div class="microcopy">Week ${week} · Bonus Bank drill</div>
                    </div>
                    ${renderStatusPill(bonusStatus)}
                  </div>
                  <div class="chip-row">
                    <span class="pill">Bonus Bank</span>
                    <span class="pill">B2-heavy review</span>
                  </div>
                  <div class="play-actions">
                    <button class="app-button" data-action="learning-open-bonus-week" data-week="${week}">Open Bonus</button>
                  </div>
                </article>
              </div>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderLearningBonusView() {
  const { selectedBonusSlot, selectedBonusStatus, selectedBonusRecord } = getSelectedLearningContext();
  const sampleEntries = getEntriesByIds(state.learning.course.bonusEntryIds.slice(0, 12));
  return `
    <div class="learning-stack">
      <div class="summary-card">
        <span class="eyebrow">Bonus Bank</span>
        <h2>${state.learning.course.bonusEntryIds.length} unscheduled entries stay available here.</h2>
        <p>The core path already scheduled all A1, A2, and B1 entries, plus the top 666 B2 entries. This bank holds the remaining B2-heavy material for weekly bonus drills and catch-up sessions.</p>
        <div class="chip-row">
          <span class="pill">${selectedBonusSlot?.displayLabel || "Week 1 · Bonus"}</span>
          ${selectedBonusStatus ? renderStatusPill(selectedBonusStatus) : ""}
          ${Number.isFinite(selectedBonusRecord?.exerciseScore) ? `<span class="pill">Bonus ${selectedBonusRecord.exerciseScore}%</span>` : ""}
        </div>
        <div class="play-actions">
          <button class="app-button" data-action="learning-start-selected">
            ${selectedBonusStatus === "completed" ? "Open Bonus Recap" : "Launch Bonus Drill"}
          </button>
          <button class="ghost-button" data-action="learning-nav" data-view="week">Pick Another Week</button>
        </div>
        <p class="microcopy">Each weekly bonus drill draws from the persistent Bonus Bank without changing the 65 core lesson days.</p>
      </div>
      <div class="bonus-grid">
        ${sampleEntries.map((entry) => `
          <article class="bonus-card">
            <div class="selection-header">
              <strong>${escapeHtml(entry.headword)}</strong>
              <span class="pill">${entry.primaryLevel}</span>
            </div>
            <p>${escapeHtml(entry.previewText)}</p>
            ${entry.cnDefinition ? renderLearningTranslation(entry.cnDefinition) : ""}
            <div class="chip-row">
              ${entry.partOfSpeech ? `<span class="pill">${escapeHtml(entry.partOfSpeech)}</span>` : ""}
              ${entry.guideword ? `<span class="pill">${escapeHtml(entry.guideword)}</span>` : ""}
              ${entry.audioUk || entry.audioUs ? `<span class="pill">Audio ready</span>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderLearningSummaryView() {
  const summary = getLearningSummaryStats();
  return `
    <div class="learning-stack">
      <div class="summary-card">
        <span class="eyebrow">Learning Summary</span>
        <h2>${summary.completedDays} of ${state.learning.course.lessonDays.length} lesson days completed.</h2>
        <p>Your learning records stay local to this browser profile. Bonus sessions are tracked separately so extra review never overwrites the numbered lesson path.</p>
        <div class="summary-grid-block">
          <div class="summary-stat"><strong>${summary.completedDays}</strong><span>Completed days</span></div>
          <div class="summary-stat"><strong>${summary.remainingDays}</strong><span>Remaining days</span></div>
          <div class="summary-stat"><strong>${summary.averagePretest}%</strong><span>Average pretest</span></div>
          <div class="summary-stat"><strong>${summary.averageExercise}%</strong><span>Average exercise</span></div>
        </div>
      </div>
      <div class="week-grid">
        ${LEARNING_WEEKLY_ALLOCATION.map((allocation, index) => {
          const week = index + 1;
          const completion = getWeekCompletion(week);
          return `
            <article class="week-card">
              <div class="selection-header">
                <strong>Week ${week}</strong>
                <span class="pill">${completion.completed}/${completion.total} days</span>
              </div>
              <div class="chip-row">
                ${renderLevelPills(allocation)}
              </div>
              <p class="microcopy">${getLearningGameTypeCount(week)} exercise game types rotate during this week.</p>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderLearningSession() {
  const session = state.learning.session;
  if (!session) {
    return "";
  }

  const progressPercent = session.phase === "study"
    ? Math.round((((session.groupIndex * 10) + session.cardIndex + 1) / DAILY_ENTRIES) * 100)
    : session.phase === "summary" || session.phase === "pretest-review" || session.phase === "exercise-review"
      ? 100
      : Math.round(((session.index + Number(Boolean(getCurrentLearningQuestion()?.resolved))) / Math.max(1, session.questions.length)) * 100);
  const sessionLabel = session.displayLabel || session.plan?.displayLabel || "Week 1 · Day 1";
  const sessionTitle = getLearningSessionTitle(session);

  return `
    <div class="play-card learning-session-card">
      <div class="play-header">
        <div>
          <span class="eyebrow">${sessionLabel}</span>
          <h2>${sessionTitle}</h2>
          <div class="session-meta">
            ${session.phase === "study" ? `<span>Group <strong>${session.groupIndex + 1}/6</strong></span><span>Card <strong>${session.cardIndex + 1}/10</strong></span>` : ""}
            ${session.questions ? `<span>Question <strong>${Math.min(session.index + 1, session.questions.length)}/${session.questions.length}</strong></span>` : ""}
            ${session.questions ? `<span>Correct <strong>${session.correct}</strong></span>` : ""}
          </div>
        </div>
        <div class="play-actions">
          <button class="ghost-button" data-action="learning-close-session">Back to Dashboard</button>
          <button class="ghost-button" data-action="toggle-fullscreen">${document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen"}</button>
        </div>
      </div>
      <div class="progress-bar"><span style="width:${progressPercent}%"></span></div>
      ${session.phase === "study"
        ? renderLearningStudyBody(session)
        : session.phase === "summary"
          ? renderLearningSummaryBody(session)
          : session.phase === "pretest-review" || session.phase === "exercise-review"
            ? renderLearningReviewBody(session)
            : renderLearningQuestionBody(session)}
    </div>
  `;
}

function renderLearningQuestionBody(session) {
  const question = getCurrentLearningQuestion();
  if (!question) {
    return `<p class="microcopy">No active question.</p>`;
  }

  const entry = state.entryMap.get(question.entryId);
  return `
    <div class="session-grid">
      <div class="prompt-card">
        <span class="prompt-label">${escapeHtml(toTitle(question.gameType))}</span>
        <div>${escapeHtml(question.promptText || "")}</div>
        ${question.audioPath ? `<div class="play-actions"><button class="ghost-button" data-action="play-audio" data-path="${question.audioPath}">Play audio</button></div>` : ""}
      </div>
      ${question.displayType === "text" ? `
        <div class="clue-stack">
          ${question.clues.slice(0, question.clueStage + 1).map((clue, index) => `
            <div class="clue-card">
              <span class="clue-label">${index === 0 ? "Definition" : index === 1 ? "Usage" : "Memory"}</span>
              <div>${escapeHtml(clue)}</div>
            </div>
          `).join("")}
        </div>
        <form class="answer-form" data-form="learning-text-answer">
          <input name="answer" type="text" placeholder="Type the entry" autocomplete="off" ${question.resolved ? "disabled" : ""} />
          <button class="app-button" type="submit" ${question.resolved ? "disabled" : ""}>Submit</button>
        </form>
        <div class="play-actions">
          ${!question.resolved && question.clueStage < question.clues.length - 1 ? `<button class="ghost-button" data-action="learning-reveal-clue">Reveal Another Clue</button>` : ""}
          ${question.resolved ? `<button class="app-button" data-action="learning-next-question">${session.index === session.questions.length - 1 ? "Finish Phase" : "Next Question"}</button>` : ""}
        </div>
      ` : `
        <div class="${question.displayType === "grid" ? "fly-grid learning-grid" : "choice-grid"}">
          ${question.options.map((option) => {
            const optionEntry = state.entryMap.get(option.id);
            const isCorrect = question.displayType === "choice"
              ? (question.gameType === "spelling-check" ? option.id === question.correctValue : option.id === question.correctValue)
              : option.id === question.correctValue;
            const isWrong = question.resolved && question.selectedValue === option.id && !isCorrect;
            return `
              <button class="choice-card ${question.displayType === "grid" ? "fly-cell" : ""} ${question.resolved && isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}" data-action="learning-choice" data-value="${escapeHtml(option.id)}" ${question.resolved ? "disabled" : ""}>
                <strong>${escapeHtml(option.label)}</strong>
                ${option.correct !== undefined ? `<small>${option.correct ? "Correct spelling" : "Distractor"}</small>` : optionEntry ? `<small>${optionEntry.primaryLevel} · ${escapeHtml(toTitle(optionEntry.entryKind))}</small>` : ""}
              </button>
            `;
          }).join("")}
        </div>
        ${question.resolved ? `<button class="app-button" data-action="learning-next-question">${session.index === session.questions.length - 1 ? "Finish Phase" : "Next Question"}</button>` : ""}
      `}
      ${question.feedback ? `
        <div class="feedback-card ${question.wasCorrect ? "is-good" : question.resolved ? "is-bad" : ""}">
          <strong>${question.wasCorrect ? "Correct" : question.resolved ? "Reveal" : "Keep going"}</strong>
          <p>${escapeHtml(question.feedback)}</p>
          ${question.feedbackMeaning ? renderLearningTranslation(question.feedbackMeaning) : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function renderLearningStudyBody(session) {
  const currentGroup = session.groups[session.groupIndex];
  const currentEntry = state.entryMap.get(currentGroup[session.cardIndex]);
  const overallIndex = session.groupIndex * 10 + session.cardIndex + 1;
  return `
    <div class="session-grid">
      <div class="study-card">
        <div class="selection-header">
          <div>
            <span class="eyebrow">Card ${overallIndex} of ${DAILY_ENTRIES}</span>
            <h3>${escapeHtml(currentEntry.headword)}</h3>
          </div>
          <div class="chip-row">
            <span class="pill">${currentEntry.primaryLevel}</span>
            <span class="pill">${escapeHtml(toTitle(currentEntry.entryKind))}</span>
            ${currentEntry.partOfSpeech ? `<span class="pill">${escapeHtml(currentEntry.partOfSpeech)}</span>` : ""}
          </div>
        </div>
        <p class="study-definition">${escapeHtml(currentEntry.previewText)}</p>
        ${currentEntry.cnDefinition ? renderLearningTranslation(currentEntry.cnDefinition) : ""}
        <div class="study-columns">
          <div class="clue-card">
            <span class="clue-label">Usage Cue</span>
            <div>${escapeHtml(currentEntry.usageCue || currentEntry.examples[0] || currentEntry.previewText)}</div>
          </div>
          <div class="clue-card">
            <span class="clue-label">Memory Cue</span>
            <div>${escapeHtml(currentEntry.memoryCue || makeHeadwordHint(currentEntry.headword))}</div>
          </div>
        </div>
        ${currentEntry.examples.length ? `
          <div class="example-grid">
            ${currentEntry.examples.slice(0, 2).map((example, index) => `
              <div class="clue-card">
                <span class="clue-label">Example</span>
                <div>${escapeHtml(example)}</div>
                ${currentEntry.cnExamples?.[index] ? renderLearningTranslation(currentEntry.cnExamples[index], "中文例句", "learning-translation learning-translation--example") : ""}
              </div>
            `).join("")}
          </div>
        ` : ""}
        <div class="play-actions">
          ${currentEntry.audioUk || currentEntry.audioUs ? `<button class="ghost-button" data-action="play-audio" data-path="${selectAudioPath(currentEntry)}">Play pronunciation</button>` : ""}
          <button class="app-button" data-action="learning-next-card">${overallIndex === DAILY_ENTRIES ? (session.review ? "Return to Summary" : "Start Exercise") : "Next Card"}</button>
        </div>
      </div>
    </div>
  `;
}

function renderLearningSummaryBody(session) {
  const record = state.learning.records[session.date];
  return `
    <div class="session-grid">
      <div class="summary-grid-block">
        ${session.kind === "lesson" ? `<div class="summary-stat"><strong>${record?.pretestScore ?? 0}%</strong><span>Pretest</span></div>` : ""}
        <div class="summary-stat"><strong>${record?.exerciseScore ?? 0}%</strong><span>${session.kind === "bonus" ? "Bonus drill" : "Exercise"}</span></div>
        <div class="summary-stat"><strong>${record?.studyGroupsCompleted ?? 0}${session.kind === "lesson" ? "/6" : ""}</strong><span>${session.kind === "lesson" ? "Study groups" : "Bonus record"}</span></div>
        <div class="summary-stat"><strong>${record?.completedAt ? "Saved" : "Pending"}</strong><span>Retained locally</span></div>
      </div>
      <div class="play-actions">
        <button class="ghost-button" data-action="learning-close-session">Back to Dashboard</button>
        <button class="app-button" data-action="learning-close-to-view" data-view="week">Open All Weeks</button>
      </div>
    </div>
  `;
}

function renderLearningReviewBody(session) {
  const record = normalizeLearningRecord(state.learning.records[session.date], "available");
  const isPretest = session.phase === "pretest-review";
  return `
    <div class="session-grid">
      <div class="summary-card">
        <span class="eyebrow">${isPretest ? "Pretest Recap" : "Exercise Recap"}</span>
        <h3>${session.displayLabel || session.plan?.displayLabel || "Lesson recap"}</h3>
        <p>${isPretest
          ? "The diagnostic baseline is already saved. Reopen the study deck whenever you want another pass through all 60 cards."
          : "The mixed exercise score is saved. Open the day summary for the retained lesson record or replay the full exercise later."}</p>
        <div class="summary-grid-block">
          ${isPretest
            ? `<div class="summary-stat"><strong>${record.pretestScore ?? 0}%</strong><span>Baseline</span></div>`
            : `<div class="summary-stat"><strong>${record.exerciseScore ?? 0}%</strong><span>Exercise</span></div>`}
          <div class="summary-stat"><strong>${record.studyGroupsCompleted}/6</strong><span>Study groups</span></div>
          <div class="summary-stat"><strong>${session.plan?.exerciseGameTypes?.length || 0}</strong><span>Game types</span></div>
          <div class="summary-stat"><strong>${isPretest ? DAILY_PRETEST_SIZE : DAILY_EXERCISE_SIZE}</strong><span>Questions</span></div>
        </div>
      </div>
      <div class="play-actions">
        <button class="ghost-button" data-action="learning-close-session">Back to Dashboard</button>
        <button class="app-button" data-action="${isPretest ? "learning-open-phase" : "learning-open-phase"}" data-phase="${isPretest ? "study" : "summary"}">${isPretest ? "Open Study Deck" : "Open Day Summary"}</button>
      </div>
    </div>
  `;
}

function renderMenu(filteredEntries) {
  return `
    <div class="stats-strip">
      <div><strong>${filteredEntries.length}</strong><span>current playable entries</span></div>
      <div><strong>${filteredEntries.filter((entry) => entry.entryKind !== "headword").length}</strong><span>phrases + idioms live</span></div>
      <div><strong>${filteredEntries.filter((entry) => entry.audioUk || entry.audioUs).length}</strong><span>entries with audio</span></div>
    </div>
    <h2>Choose a mode</h2>
    <p>The weighting engine favors unseen and shaky vocabulary while letting mastered words drift back in at a lower frequency. Every mode obeys the current filters.</p>
    <div class="mode-grid">
      ${Object.entries(MODE_META).map(([modeId, meta]) => {
        const best = state.progress.meta.modeStats[modeId]?.bestScore || 0;
        const pool = getModePool(modeId);
        const disabled = !ensurePoolSize(modeId, pool);
        return `
          <article class="mode-card ${disabled ? "is-disabled" : ""}">
            <div>
              <h3>${meta.label}</h3>
              <p>${meta.description}</p>
            </div>
            <div class="mode-meta">
              <span>${meta.subtitle}</span>
              <span><strong>${pool.length}</strong> eligible entries</span>
              <span>Best score: <strong>${best}</strong></span>
            </div>
            <button class="app-button ${disabled ? "is-disabled" : ""}" data-action="start-mode" data-mode="${modeId}">Start ${meta.label}</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderSummary() {
  const summary = state.summary;
  return `
    <div class="summary-card">
      <div class="play-header">
        <div>
          <span class="eyebrow">Session Complete</span>
          <h2>${MODE_META[summary.modeId].label}</h2>
          <p>${summary.note || "Round closed cleanly. Your local weighting model has already been updated."}</p>
        </div>
        <div class="play-actions">
          <button class="ghost-button" data-action="return-menu">Back to Lobby</button>
          <button class="app-button" data-action="restart-mode">Play Again</button>
        </div>
      </div>
      <div class="summary-grid-block">
        <div class="summary-stat"><strong>${summary.score}</strong><span>Score</span></div>
        <div class="summary-stat"><strong>${summary.correct}</strong><span>Correct</span></div>
        <div class="summary-stat"><strong>${summary.wrong}</strong><span>Wrong</span></div>
        <div class="summary-stat"><strong>${summary.badge || "Complete"}</strong><span>Session badge</span></div>
      </div>
    </div>
  `;
}

function renderSession() {
  const session = state.session;
  const progressPercent = session.modeId === "fly-swatter"
    ? `${Math.round((session.timeLeft / 60) * 100)}%`
    : `${Math.round((((session.roundIndex || 0) + 1) / Math.max(1, session.totalRounds || session.prompts?.length || session.tiles?.length || 1)) * 100)}%`;

  const header = `
    <div class="play-card">
      <div class="play-header">
        <div>
          <span class="eyebrow">${MODE_META[session.modeId].subtitle}</span>
          <h2>${MODE_META[session.modeId].label}</h2>
          <div class="session-meta">
            <span>Score <strong>${session.score}</strong></span>
            <span>Correct <strong>${session.correct}</strong></span>
            <span>Wrong <strong>${session.wrong}</strong></span>
            ${session.modeId === "fly-swatter" ? `<span>Time <strong>${session.timeLeft.toFixed(1)}s</strong></span>` : ""}
          </div>
        </div>
        <div class="play-actions">
          <button class="ghost-button" data-action="return-menu">Leave Session</button>
          <button class="app-button" data-action="restart-mode">Restart</button>
        </div>
      </div>
      <div class="progress-bar"><span style="width:${progressPercent}"></span></div>
      ${renderModeBody(session)}
    </div>
  `;

  return header;
}

function renderModeBody(session) {
  if (session.modeId === "hot-seat") {
    return renderHotSeat(session);
  }
  if (session.modeId === "odd-one-out") {
    return renderOddOneOut(session);
  }
  if (session.modeId === "fly-swatter") {
    return renderFlySwatter(session);
  }
  if (session.modeId === "bingo") {
    return renderBingo(session);
  }
  if (session.modeId === "jeopardy") {
    return renderJeopardy(session);
  }
  return renderMysterySound(session);
}

function renderHotSeat(session) {
  const round = session.round;
  const entry = state.entryMap.get(round.entryId);
  return `
    <div class="session-grid">
      <p>Round ${session.roundIndex + 1} of ${session.totalRounds}. Solve early for a higher score; wrong answers unlock deeper clues.</p>
      <div class="clue-stack">
        ${round.clues.slice(0, round.clueStage + 1).map((clue, index) => `
          <div class="clue-card">
            <span class="clue-label">${index === 0 ? "Definition" : index === 1 ? "Example" : "Hint"}</span>
            <div>${escapeHtml(clue)}</div>
          </div>
        `).join("")}
      </div>
      <form class="answer-form" data-form="hot-seat-answer">
        <input name="answer" type="text" placeholder="Type the Cambridge entry" ${round.resolved ? "disabled" : ""} autocomplete="off" />
        <button class="app-button" type="submit" ${round.resolved ? "disabled" : ""}>Submit</button>
      </form>
      <div class="play-actions">
        ${round.resolved ? `<button class="app-button" data-action="continue-round">Next Round</button>` : `<button class="ghost-button" data-action="hot-seat-skip">Skip & Reveal</button>`}
      </div>
      ${round.message ? `
        <div class="feedback-card ${round.wasCorrect ? "is-good" : round.resolved ? "is-bad" : ""}">
          <strong>${round.wasCorrect ? "Locked in" : round.resolved ? "Reveal" : "More clues"}</strong>
          <p>${escapeHtml(round.message)}</p>
          ${round.revealedAnswer ? `<p class="microcopy">Answer: ${escapeHtml(entry.headword)}</p>` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function renderOddOneOut(session) {
  const round = session.round;
  return `
    <div class="session-grid">
      <div class="prompt-card">
        <span class="prompt-label">${round.prompt.label}</span>
        <div>${escapeHtml(round.prompt.text)}</div>
      </div>
      <div class="choice-grid">
        ${round.choices.map((choice) => {
          const classes = [
            "choice-card",
            round.resolved && choice.correct ? "is-correct" : "",
            round.resolved && round.selectedLabel === choice.label && !choice.correct ? "is-wrong" : ""
          ].join(" ").trim();
          return `
            <button class="${classes}" data-action="odd-choice" data-label="${escapeHtml(choice.label)}" ${round.resolved ? "disabled" : ""}>
              <strong>${escapeHtml(choice.label)}</strong>
              <small>${choice.correct ? "Correct entry" : "Distractor"}</small>
            </button>
          `;
        }).join("")}
      </div>
      ${round.message ? `
        <div class="feedback-card ${round.wasCorrect ? "is-good" : "is-bad"}">
          <strong>${round.wasCorrect ? "Correct" : "Incorrect"}</strong>
          <p>${escapeHtml(round.message)}</p>
        </div>
      ` : ""}
      ${round.resolved ? `<button class="app-button" data-action="continue-round">Next Round</button>` : ""}
    </div>
  `;
}

function renderFlySwatter(session) {
  const board = session.board;
  return `
    <div class="session-grid">
      <div class="prompt-card">
        <span class="prompt-label">${board.prompt.label}</span>
        <div>${escapeHtml(board.prompt.text)}</div>
        ${board.prompt.audioPath ? `<div class="play-actions"><button class="ghost-button" data-action="play-audio" data-path="${board.prompt.audioPath}">Play prompt audio</button></div>` : ""}
      </div>
      <div class="fly-grid">
        ${board.options.map((entry) => `
          <button class="fly-cell" data-action="fly-choice" data-entry-id="${entry.id}">
            <strong>${escapeHtml(entry.headword)}</strong>
            <small>${entry.primaryLevel} · ${escapeHtml(toTitle(entry.entryKind))}</small>
          </button>
        `).join("")}
      </div>
      <p class="microcopy">Correct hits add a small time bonus. Wrong hits cut streak momentum.</p>
    </div>
  `;
}

function renderBingo(session) {
  const currentPrompt = session.prompts[session.promptIndex];
  return `
    <div class="session-grid">
      <div class="prompt-card">
        <span class="prompt-label">${currentPrompt.prompt.label}</span>
        <div>${escapeHtml(currentPrompt.prompt.text)}</div>
        ${currentPrompt.prompt.audioPath ? `<div class="play-actions"><button class="ghost-button" data-action="play-audio" data-path="${currentPrompt.prompt.audioPath}">Play clue audio</button></div>` : ""}
      </div>
      <div class="bingo-grid">
        ${session.cardEntries.map((entry) => {
          const isMarked = session.markedIds.includes(entry.id);
          const isCurrent = currentPrompt.targetId === entry.id;
          return `
            <button class="bingo-cell ${isMarked ? "is-marked" : ""} ${isCurrent ? "is-current" : ""}" data-action="bingo-cell" data-entry-id="${entry.id}">
              <strong>${escapeHtml(entry.headword)}</strong>
              <small>${entry.primaryLevel} · ${escapeHtml(toTitle(entry.entryKind))}</small>
            </button>
          `;
        }).join("")}
      </div>
      ${session.message ? `<div class="feedback-card"><p>${escapeHtml(session.message)}</p></div>` : ""}
    </div>
  `;
}

function renderJeopardy(session) {
  const activeTile = session.tiles.find((tile) => tile.id === session.activeTileId);
  return `
    <div class="session-grid">
      <div class="jeopardy-grid">
        <div class="jeopardy-head">Level</div>
        <div class="jeopardy-head">Definition</div>
        <div class="jeopardy-head">Audio</div>
        <div class="jeopardy-head">Example</div>
        <div class="jeopardy-head">Spelling</div>
        <div class="jeopardy-head">Mixed</div>
        ${LEVELS.map((level) => {
          const rowTiles = session.tiles.filter((tile) => tile.level === level);
          return `
            <div class="jeopardy-level">${level}</div>
            ${rowTiles.map((tile) => `
              <button class="tile-card ${tile.answered ? "is-cleared" : ""}" data-action="${tile.answered ? "" : "jeopardy-open"}" data-tile-id="${tile.id}">
                <span class="tile-value">${tile.answered ? (tile.wasCorrect ? "Cleared" : "Missed") : tile.value}</span>
                <small>${tile.category}</small>
              </button>
            `).join("")}
          `;
        }).join("")}
      </div>
      ${activeTile ? renderJeopardyOverlay(activeTile) : `<p class="microcopy">Open any live tile to answer its clue. A wrong answer halves that tile’s value.</p>`}
    </div>
  `;
}

function renderJeopardyOverlay(tile) {
  const prompt = tile.activePrompt;
  if (!prompt) {
    return "";
  }

  return `
    <div class="overlay-shell">
      <div class="overlay-card">
        <span class="prompt-label">${escapeHtml(tile.category)} · ${tile.level}</span>
        <h3>${tile.value} points</h3>
        <div>${escapeHtml(prompt.prompt.text)}</div>
        ${prompt.prompt.audioPath ? `<div class="play-actions"><button class="ghost-button" data-action="play-audio" data-path="${prompt.prompt.audioPath}">Play audio</button></div>` : ""}
        <div class="choice-grid">
          ${prompt.choices.map((choice) => {
            const value = prompt.type === "spelling" ? choice.label : choice.id;
            const classes = [
              "choice-card",
              tile.answered && ((prompt.type === "spelling" && choice.correct) || (prompt.type !== "spelling" && choice.id === prompt.answerId)) ? "is-correct" : "",
              tile.answered && ((prompt.type === "spelling" && tile.resultLabel === choice.label && !choice.correct) || (prompt.type !== "spelling" && tile.resultLabel === choice.id && choice.id !== prompt.answerId)) ? "is-wrong" : ""
            ].join(" ").trim();
            return `
              <button class="${classes}" data-action="jeopardy-answer" data-value="${escapeHtml(value)}" ${tile.answered ? "disabled" : ""}>
                <strong>${escapeHtml(choice.label)}</strong>
              </button>
            `;
          }).join("")}
        </div>
        ${tile.answered ? `
          <div class="feedback-card ${tile.wasCorrect ? "is-good" : "is-bad"}">
            <strong>${tile.wasCorrect ? "Correct" : "Incorrect"}</strong>
            <p>${tile.wasCorrect ? "Tile cleared and score added." : "Tile closed. The board still moves on."}</p>
          </div>
          <button class="app-button" data-action="jeopardy-continue">Back to Board</button>
        ` : ""}
      </div>
    </div>
  `;
}

function renderMysterySound(session) {
  const round = session.round;
  return `
    <div class="session-grid">
      <div class="prompt-card">
        <span class="prompt-label">Mystery Sound</span>
        <div>${escapeHtml(round.prompt.text)}</div>
        <div class="play-actions">
          <button class="ghost-button ${round.replayLeft <= 0 ? "is-disabled" : ""}" data-action="mystery-replay" ${round.replayLeft <= 0 ? "disabled" : ""}>Replay (${round.replayLeft} left)</button>
          <button class="ghost-button" data-action="play-audio" data-path="${round.prompt.audioPath}">Play Now</button>
        </div>
      </div>
      <div class="choice-grid">
        ${round.choices.map((choice) => {
          const classes = [
            "choice-card",
            round.resolved && choice.id === round.entryId ? "is-correct" : "",
            round.resolved && round.selectedId === choice.id && choice.id !== round.entryId ? "is-wrong" : ""
          ].join(" ").trim();
          return `
            <button class="${classes}" data-action="mystery-choice" data-entry-id="${choice.id}" ${round.resolved ? "disabled" : ""}>
              <strong>${escapeHtml(choice.label)}</strong>
            </button>
          `;
        }).join("")}
      </div>
      ${round.message ? `
        <div class="feedback-card ${round.wasCorrect ? "is-good" : "is-bad"}">
          <strong>${round.wasCorrect ? "Matched" : "Missed"}</strong>
          <p>${escapeHtml(round.message)}</p>
        </div>
      ` : ""}
      ${round.resolved ? `<button class="app-button" data-action="continue-round">Next Round</button>` : ""}
    </div>
  `;
}

function playAudio(path) {
  try {
    if (!audioPlayer) {
      audioPlayer = new Audio();
    }
    audioPlayer.src = path;
    audioPlayer.currentTime = 0;
    audioPlayer.play().catch(() => {
      state.notice = "Audio playback needs a user gesture in this browser state.";
    });
  } catch {
    state.notice = "Could not play audio prompt.";
  }
}

function bindCanvas() {
  fxCanvas = document.querySelector("#arcade-canvas");
  if (!fxCanvas) {
    fxContext = null;
    return;
  }
  fxContext = fxCanvas.getContext("2d");
  resizeCanvas();
  drawCanvas();
}

function resizeCanvas() {
  if (!fxCanvas) {
    return;
  }
  const rect = fxCanvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  fxCanvas.width = Math.max(1, Math.round(rect.width * scale));
  fxCanvas.height = Math.max(1, Math.round(rect.height * scale));
  if (fxContext) {
    fxContext.setTransform(scale, 0, 0, scale, 0, 0);
  }
  drawCanvas();
}

function drawCanvas() {
  if (!fxCanvas || !fxContext) {
    return;
  }

  const width = fxCanvas.clientWidth;
  const height = fxCanvas.clientHeight;
  const ctx = fxContext;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(255, 214, 195, 0.85)");
  gradient.addColorStop(0.55, "rgba(209, 240, 237, 0.75)");
  gradient.addColorStop(1, "rgba(255, 240, 215, 0.92)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const time = state.effects.time * 0.0012;
  ctx.strokeStyle = `rgba(31, 39, 51, ${0.08 + state.effects.flash * 0.08})`;
  ctx.lineWidth = 1;

  for (let index = 0; index < 14; index += 1) {
    const y = ((index + 1) * height) / 15;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(time + index * 0.5) * 8);
    ctx.bezierCurveTo(width * 0.2, y - 10, width * 0.7, y + 12, width, y + Math.cos(time + index) * 8);
    ctx.stroke();
  }

  const centerX = width * 0.52;
  const centerY = height * 0.5;
  const baseRadius = 44 + Math.sin(time * 2.4) * 8;
  const ringCount = 3;

  for (let ring = 0; ring < ringCount; ring += 1) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(22, 105, 122, ${0.12 + ring * 0.07})`;
    ctx.lineWidth = 3;
    ctx.arc(centerX, centerY, baseRadius + ring * 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  state.effects.pulses.forEach((pulse) => {
    ctx.beginPath();
    ctx.strokeStyle = toAlphaColor(pulse.color, pulse.life);
    ctx.lineWidth = 4;
    ctx.arc(centerX, centerY, pulse.radius + (1 - pulse.life) * 40, 0, Math.PI * 2);
    ctx.stroke();
  });

  const stats = getGlobalStats();
  const learningFocus = state.hub === "learning" && isLearningFocusMode();
  const canvasLabel = state.hub === "learning"
    ? (learningFocus ? `Learning ${toTitle(state.learning.session.phase)}` : state.learning.course ? "Learning Hub" : "Learning Setup")
    : (state.session ? MODE_META[state.session.modeId].label : "Arcade Lobby");
  const canvasMeta = state.hub === "learning"
    ? (state.learning.course ? `${getLearningSummaryStats().completedDays} lesson days completed · ${state.learning.course.bonusEntryIds.length} bonus entries` : "13 weeks · 5 study days · 60 entries per day")
    : `${stats.filteredCount} filtered entries · ${stats.mastered} mastered locally`;
  ctx.fillStyle = "#1f2733";
  ctx.font = '700 22px "Avenir Next", "Trebuchet MS", sans-serif';
  ctx.fillText(`${canvasLabel} Signal`, 28, 42);
  ctx.font = '600 16px "Avenir Next", "Trebuchet MS", sans-serif';
  ctx.fillStyle = "#5f6977";
  ctx.fillText(canvasMeta, 28, 68);

  ctx.fillStyle = "rgba(238, 108, 77, 0.92)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 14 + state.effects.flash * 10, 0, Math.PI * 2);
  ctx.fill();
}

function buildTextSnapshot() {
  if (state.hub === "learning") {
    const context = getSelectedLearningContext();
    const base = {
      activeHub: "learning",
      view: isLearningFocusMode() ? "learning-focus" : state.learning.course ? `learning-${state.learning.ui.view}` : "learning-onboarding",
      coordinateSystem: "DOM layout coordinates; x grows right and y grows down. Canvas is decorative only.",
      learning: {
        presentation: state.learning.ui.presentation,
        hasActiveSession: Boolean(state.learning.session),
        sessionMinimized: Boolean(state.learning.session && state.learning.ui.presentation === "dashboard"),
        resumeLabel: state.learning.session ? getLearningSessionResumeLabel(state.learning.session) : null,
        selectedLessonKey: context.selectedLessonKey,
        displayLabel: context.selectedLesson?.displayLabel || null,
        lessonStatus: context.selectedStatus,
        bonusDisplayLabel: context.selectedBonusSlot?.displayLabel || null,
        bonusStatus: context.selectedBonusStatus || null,
        selectedPhaseTab: state.learning.ui.selectedPhaseTab,
        activeView: state.learning.ui.view,
        phase: state.learning.session?.phase || null,
        week: context.selectedWeek || null,
        dayInWeek: context.selectedLesson?.dayInWeek || null,
        record: context.selectedRecord ? {
          pretestScore: context.selectedRecord.pretestScore,
          studyGroupsCompleted: context.selectedRecord.studyGroupsCompleted,
          exerciseScore: context.selectedRecord.exerciseScore
        } : null,
        course: state.learning.course ? {
          lessonDayCount: state.learning.course.lessonDays.length,
          bonusCount: state.learning.course.bonusEntryIds.length
        } : null,
        session: null
      }
    };

    if (!state.learning.session) {
      return base;
    }

    const session = state.learning.session;
    const currentQuestion = getCurrentLearningQuestion();
    base.learning.session = {
      kind: session.kind,
      phase: session.phase,
      lessonKey: session.lessonKey || null,
      displayLabel: session.displayLabel || null,
      score: session.correct,
      total: session.questions?.length || 0,
      answeredCount: session.answeredCount ?? 0,
      remainingGroups: session.phase === "study" ? Math.max(0, 6 - (session.groupIndex + 1)) : 0,
      progressLabel: getLearningSessionProgressLabel(session),
      currentEntry: currentQuestion ? state.entryMap.get(currentQuestion.entryId)?.headword || "" : null,
      currentQuestion: currentQuestion ? {
        gameType: currentQuestion.gameType,
        displayType: currentQuestion.displayType,
        prompt: currentQuestion.promptText || currentQuestion.clues?.[currentQuestion.clueStage] || "",
        options: currentQuestion.options?.map((option) => option.label) || [],
        clueStage: currentQuestion.clueStage ?? null,
        resolved: currentQuestion.resolved
      } : null
    };

    if (session.phase === "study") {
      const entryId = session.groups?.[session.groupIndex]?.[session.cardIndex];
      base.learning.session.currentEntry = state.entryMap.get(entryId)?.headword || "";
      base.learning.session.groupIndex = session.groupIndex + 1;
      base.learning.session.cardIndex = session.cardIndex + 1;
    }

    if (session.phase === "summary") {
      base.learning.session.summary = session.summary;
    }

    return base;
  }

  const filteredEntries = getFilteredEntries();
  const base = {
    activeHub: "arcade",
    view: state.summary ? "summary" : state.session ? "mode" : "menu",
    mode: state.session?.modeId || state.summary?.modeId || "menu",
    coordinateSystem: "DOM layout coordinates; x grows right and y grows down. Canvas is decorative only.",
    filters: {
      levels: [...state.filters.levels],
      entryKinds: [...state.filters.entryKinds]
    },
    filteredEntryCount: filteredEntries.length,
    stats: getGlobalStats(),
    session: null,
    summary: state.summary
  };

  if (!state.session) {
    return base;
  }

  const session = state.session;
  const snapshot = {
    score: session.score,
    correct: session.correct,
    wrong: session.wrong
  };

  if (session.modeId === "hot-seat") {
    const round = session.round;
    snapshot.round = session.roundIndex + 1;
    snapshot.totalRounds = session.totalRounds;
    snapshot.prompt = round.clues.slice(0, round.clueStage + 1);
    snapshot.feedback = round.message;
  } else if (session.modeId === "odd-one-out") {
    snapshot.round = session.roundIndex + 1;
    snapshot.totalRounds = session.totalRounds;
    snapshot.prompt = session.round.prompt.text;
    snapshot.options = session.round.choices.map((choice) => choice.label);
  } else if (session.modeId === "fly-swatter") {
    snapshot.timer = Number(session.timeLeft.toFixed(2));
    snapshot.prompt = session.board.prompt.text;
    snapshot.options = session.board.options.map((entry) => entry.headword);
    snapshot.target = state.entryMap.get(session.board.targetId)?.headword || "";
  } else if (session.modeId === "bingo") {
    const prompt = session.prompts[session.promptIndex];
    snapshot.prompt = prompt?.prompt.text || "";
    snapshot.marked = session.markedIds.map((id) => state.entryMap.get(id)?.headword);
    snapshot.board = session.cardEntries.map((entry) => ({
      word: entry.headword,
      marked: session.markedIds.includes(entry.id)
    }));
  } else if (session.modeId === "jeopardy") {
    snapshot.board = session.tiles.map((tile) => ({
      id: tile.id,
      category: tile.category,
      level: tile.level,
      answered: tile.answered,
      value: tile.value
    }));
    if (session.activeTileId) {
      const tile = session.tiles.find((item) => item.id === session.activeTileId);
      snapshot.prompt = tile?.activePrompt?.prompt?.text || "";
      snapshot.options = tile?.activePrompt?.choices?.map((choice) => choice.label) || [];
    }
  } else if (session.modeId === "mystery-sound") {
    snapshot.round = session.roundIndex + 1;
    snapshot.totalRounds = session.totalRounds;
    snapshot.prompt = session.round.prompt.text;
    snapshot.options = session.round.choices.map((choice) => choice.label);
    snapshot.replayLeft = session.round.replayLeft;
  }

  base.session = snapshot;
  return base;
}

function syncHooks() {
  window.render_game_to_text = () => JSON.stringify(buildTextSnapshot());
  window.__arcade_debug__ = {
    getState: () => buildDebugSnapshot()
  };
}

function toTitle(value) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function toAlphaColor(color, alpha) {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const normalized = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return color;
}

function buildDebugSnapshot() {
  const snapshot = buildTextSnapshot();
  if (state.hub === "learning") {
    const question = getCurrentLearningQuestion();
    if (question) {
      snapshot.learning.session = snapshot.learning.session || {};
      snapshot.learning.session.answer = state.entryMap.get(question.entryId)?.headword || question.correctValue || "";
      if (question.displayType === "text") {
        snapshot.learning.session.clues = question.clues;
      }
    } else if (state.learning.session?.phase === "study") {
      const entryId = state.learning.session.groups?.[state.learning.session.groupIndex]?.[state.learning.session.cardIndex];
      snapshot.learning.session = snapshot.learning.session || {};
      snapshot.learning.session.answer = state.entryMap.get(entryId)?.headword || "";
    }
    return snapshot;
  }

  if (!state.session) {
    return snapshot;
  }

  const session = state.session;
  if (session.modeId === "hot-seat") {
    snapshot.session.answer = state.entryMap.get(session.round.entryId)?.headword || "";
  } else if (session.modeId === "odd-one-out") {
    snapshot.session.answer = state.entryMap.get(session.round.entryId)?.headword || "";
  } else if (session.modeId === "fly-swatter") {
    snapshot.session.answer = state.entryMap.get(session.board.targetId)?.headword || "";
  } else if (session.modeId === "bingo") {
    const currentPrompt = session.prompts[session.promptIndex];
    snapshot.session.answer = currentPrompt ? state.entryMap.get(currentPrompt.targetId)?.headword || "" : "";
  } else if (session.modeId === "jeopardy" && session.activeTileId) {
    const tile = session.tiles.find((item) => item.id === session.activeTileId);
    if (tile?.activePrompt?.type === "spelling") {
      snapshot.session.answer = tile.activePrompt.answerLabel;
    } else {
      snapshot.session.answer = tile?.activePrompt?.answerId ? state.entryMap.get(tile.activePrompt.answerId)?.headword || "" : "";
    }
  } else if (session.modeId === "mystery-sound") {
    snapshot.session.answer = state.entryMap.get(session.round.entryId)?.headword || "";
  }

  return snapshot;
}

function buildLearningGridOptions(targetEntry, pool, count = 12) {
  const distractors = sampleEntries(pool, count - 1, {
    excludeIds: new Set([targetEntry.id]),
    sameLevelAs: targetEntry,
    weightFn: () => 1
  });

  return shuffle([targetEntry, ...distractors]).map((entry) => ({
    id: entry.id,
    label: entry.headword
  }));
}

function buildLearningClues(entry) {
  return [
    entry.previewText,
    entry.usageCue || buildExamplePrompt(entry).text,
    entry.memoryCue || makeHeadwordHint(entry.headword)
  ].filter(Boolean);
}

function resolveLearningGameType(entry, requestedType, pool) {
  if (requestedType === "audio-choice" && !(entry.audioUk || entry.audioUs)) {
    return entry.usageCue ? "usage-choice" : "definition-match";
  }
  if (requestedType === "usage-choice" && !entry.usageCue && entry.examples.length === 0) {
    return "definition-match";
  }
  if (requestedType === "spelling-check" && /\s/.test(entry.headword)) {
    return "definition-match";
  }
  if (requestedType === "speed-grid" && pool.length < 8) {
    return "definition-match";
  }
  return requestedType;
}

function buildLearningQuestion(entry, requestedType, pool) {
  const gameType = resolveLearningGameType(entry, requestedType, pool);

  if (gameType === "definition-match") {
    return {
      gameType,
      displayType: "choice",
      entryId: entry.id,
      promptLabel: "Definition Match",
      promptText: entry.previewText,
      options: buildChoiceOptions(entry, pool),
      correctValue: entry.id,
      resolved: false,
      feedback: ""
    };
  }

  if (gameType === "usage-choice") {
    return {
      gameType,
      displayType: "choice",
      entryId: entry.id,
      promptLabel: "Usage Choice",
      promptText: entry.usageCue || buildExamplePrompt(entry).text,
      options: buildChoiceOptions(entry, pool),
      correctValue: entry.id,
      resolved: false,
      feedback: ""
    };
  }

  if (gameType === "audio-choice") {
    const prompt = buildAudioPrompt(entry);
    return {
      gameType,
      displayType: "choice",
      entryId: entry.id,
      promptLabel: "Audio Choice",
      promptText: prompt.text,
      audioPath: prompt.audioPath,
      options: buildChoiceOptions(entry, pool),
      correctValue: entry.id,
      resolved: false,
      feedback: ""
    };
  }

  if (gameType === "spelling-check") {
    return {
      gameType,
      displayType: "choice",
      entryId: entry.id,
      promptLabel: "Spelling Check",
      promptText: entry.previewText,
      options: buildSpellingChoices(entry.headword).map((choice) => ({
        id: choice.label,
        label: choice.label,
        correct: choice.correct
      })),
      correctValue: entry.headword,
      resolved: false,
      feedback: ""
    };
  }

  if (gameType === "speed-grid") {
    return {
      gameType,
      displayType: "grid",
      entryId: entry.id,
      promptLabel: "Speed Grid",
      promptText: entry.previewText,
      options: buildLearningGridOptions(entry, pool),
      correctValue: entry.id,
      resolved: false,
      feedback: ""
    };
  }

  return {
    gameType: "clue-ladder",
    displayType: "text",
    entryId: entry.id,
    promptLabel: "Clue Ladder",
    clues: buildLearningClues(entry),
    clueStage: 0,
    resolved: false,
    feedback: "",
    correctValue: entry.headword
  };
}

function createLearningQuizQuestions(entryIds, pool, requestedTypes, seedKey) {
  const rotatingTypes = seededShuffle(requestedTypes, `${seedKey}:rotating`);
  return entryIds.map((entryId, index) => {
    const entry = state.entryMap.get(entryId);
    const requestedType = rotatingTypes[index % rotatingTypes.length];
    return buildLearningQuestion(entry, requestedType, pool);
  });
}

function chunkEntries(entryIds, size = 10) {
  const groups = [];
  for (let index = 0; index < entryIds.length; index += size) {
    groups.push(entryIds.slice(index, index + size));
  }
  return groups;
}

function createLessonPretestSession(plan, record) {
  const lessonPool = getEntriesByIds(plan.lessonEntryIds);
  const questions = createLearningQuizQuestions(
    plan.pretestEntryIds,
    lessonPool,
    ["definition-match", "usage-choice", "audio-choice", "spelling-check"],
    `${plan.date}:pretest`
  );
  const answeredCount = Math.min(record.pretestAnswers.length, questions.length);
  const correct = record.pretestAnswers.filter((answer) => answer.correct).length;
  return {
    kind: "lesson",
    phase: "pretest",
    date: plan.date,
    lessonKey: plan.lessonKey,
    displayLabel: plan.displayLabel,
    plan,
    questions,
    index: Math.min(answeredCount, questions.length - 1),
    answeredCount,
    correct
  };
}

function createLessonStudySession(plan, record, options = {}) {
  const groups = chunkEntries(plan.lessonEntryIds, 10);
  return {
    kind: "lesson",
    phase: "study",
    date: plan.date,
    lessonKey: plan.lessonKey,
    displayLabel: plan.displayLabel,
    plan,
    groups,
    review: Boolean(options.review),
    groupIndex: options.review ? 0 : Math.min(record.studyGroupsCompleted, groups.length - 1),
    cardIndex: 0
  };
}

function createLessonExerciseSession(plan, record) {
  const lessonPool = getEntriesByIds(plan.lessonEntryIds);
  const questions = createLearningQuizQuestions(
    plan.exerciseEntryIds,
    lessonPool,
    plan.exerciseGameTypes,
    `${plan.date}:exercise`
  );
  const answeredCount = Math.min(record.exerciseAnswers.length, questions.length);
  const correct = record.exerciseAnswers.filter((answer) => answer.correct).length;
  return {
    kind: "lesson",
    phase: "exercise",
    date: plan.date,
    lessonKey: plan.lessonKey,
    displayLabel: plan.displayLabel,
    plan,
    questions,
    index: Math.min(answeredCount, questions.length - 1),
    answeredCount,
    correct
  };
}

function createLessonSummarySession(plan, record) {
  return {
    kind: "lesson",
    phase: "summary",
    date: plan.date,
    lessonKey: plan.lessonKey,
    displayLabel: plan.displayLabel,
    plan,
    summary: {
      pretestScore: record.pretestScore || 0,
      exerciseScore: record.exerciseScore || 0,
      studyGroupsCompleted: record.studyGroupsCompleted,
      completedAt: record.completedAt
    }
  };
}

function createLessonReviewSession(plan, record, reviewPhase) {
  return {
    kind: "lesson",
    phase: `${reviewPhase}-review`,
    date: plan.date,
    lessonKey: plan.lessonKey,
    displayLabel: plan.displayLabel,
    plan,
    summary: {
      pretestScore: record.pretestScore || 0,
      exerciseScore: record.exerciseScore || 0,
      studyGroupsCompleted: record.studyGroupsCompleted,
      completedAt: record.completedAt
    }
  };
}

function createBonusSession(slot, record) {
  const poolIds = deterministicPickIds(state.learning.course.bonusEntryIds, Math.min(60, state.learning.course.bonusEntryIds.length), `${slot.date}:bonus-pool`);
  const exerciseIds = deterministicPickIds(poolIds, Math.min(DAILY_EXERCISE_SIZE, poolIds.length), `${slot.date}:bonus-exercise`);
  const bonusPool = getEntriesByIds(poolIds);
  const questions = createLearningQuizQuestions(exerciseIds, bonusPool, LEARNING_GAME_TYPES, `${slot.date}:bonus`);
  const answeredCount = Math.min(record.exerciseAnswers.length, questions.length);
  const correct = record.exerciseAnswers.filter((answer) => answer.correct).length;
  return {
    kind: "bonus",
    phase: "bonus",
    date: slot.date,
    displayLabel: slot.displayLabel,
    week: slot.week,
    entryIds: exerciseIds,
    poolIds,
    questions,
    index: Math.min(answeredCount, questions.length - 1),
    answeredCount,
    correct
  };
}

function createBonusSummarySession(slot, record, entryIds = []) {
  return {
    kind: "bonus",
    phase: "summary",
    date: slot.date,
    displayLabel: slot.displayLabel,
    week: slot.week,
    entryIds,
    summary: {
      exerciseScore: record.exerciseScore || 0,
      completedAt: record.completedAt,
      bonusCount: entryIds.length
    }
  };
}

function getEntriesByIds(entryIds) {
  return entryIds.map((entryId) => state.entryMap.get(entryId)).filter(Boolean);
}

function createLearningSessionForDate(dateString) {
  const plan = getLearningLessonByDate(dateString);
  if (plan) {
    const record = ensureLearningRecord(dateString, "lesson");
    if (record.status === "completed") {
      return createLessonSummarySession(plan, record);
    }
    if (record.pretestAnswers.length < DAILY_PRETEST_SIZE && record.status !== "pretested" && record.status !== "studied" && record.status !== "completed") {
      return createLessonPretestSession(plan, record);
    }
    if (record.studyGroupsCompleted < 6 && record.status !== "studied" && record.status !== "completed") {
      return createLessonStudySession(plan, record);
    }
    if (record.exerciseAnswers.length < DAILY_EXERCISE_SIZE && record.status !== "completed") {
      return createLessonExerciseSession(plan, record);
    }
    return createLessonSummarySession(plan, record);
  }

  const slot = state.learning.course?.bonusSlots?.find((item) => item.date === dateString);
  if (!slot) {
    return null;
  }
  const record = ensureLearningRecord(slot.date, "bonus");
  return record.status === "bonus-completed"
    ? createBonusSummarySession(slot, record, record.bonusEntryIds)
    : createBonusSession(slot, record);
}

function startLearningCourse(startDate = getNextMonday(todayString())) {
  if (!isMonday(startDate)) {
    startDate = getNextMonday(todayString());
  }
  state.learning.course = createLearningCourse(startDate);
  state.learning.records = {};
  state.learning.ui.view = "current";
  state.learning.ui.selectedLessonKey = state.learning.course.lessonDays[0]?.lessonKey || null;
  state.learning.ui.selectedPhaseTab = "pretest";
  state.learning.ui.presentation = "dashboard";
  state.learning.ui.pendingTarget = null;
  state.learning.ui.selectedDate = null;
  state.learning.session = null;
  persistLearningStore();
  render();
}

function resetLearningCourse() {
  state.learning = {
    course: null,
    records: {},
    ui: {
      view: "current",
      selectedLessonKey: null,
      selectedPhaseTab: "pretest",
      presentation: "dashboard",
      pendingTarget: null,
      selectedDate: null
    },
    session: null
  };
  persistLearningStore();
  render();
}

function startSelectedLearningFlow() {
  if (!state.learning.course) {
    return;
  }
  if (state.learning.ui.view === "bonus") {
    openSelectedBonusFlow();
    return;
  }
  openSelectedLearningPhase(state.learning.ui.selectedPhaseTab);
}

function openSelectedBonusFlow(forceReplace = false) {
  const { selectedBonusSlot, selectedBonusStatus, selectedBonusRecord } = getSelectedLearningContext();
  if (!selectedBonusSlot) {
    return;
  }
  const target = buildLearningTarget();
  if (!forceReplace && !shouldOpenLearningTarget(target)) {
    return;
  }
  const record = ensureLearningRecord(selectedBonusSlot.date, "bonus");
  const session = selectedBonusStatus === "completed"
    ? createBonusSummarySession(selectedBonusSlot, selectedBonusRecord || record, (selectedBonusRecord || record).bonusEntryIds)
    : createBonusSession(selectedBonusSlot, record);
  activateLearningSession(session);
}

function openSelectedLearningPhase(phase, forceReplace = false) {
  const { selectedLesson, selectedDate } = getSelectedLearningContext();
  if (!selectedLesson || !selectedDate) {
    return;
  }
  const nextPhase = LEARNING_PHASE_TABS.includes(phase) ? phase : getDefaultPhaseTabForLesson(selectedLesson);
  state.learning.ui.selectedPhaseTab = nextPhase;
  const phaseState = getLearningPhaseState(selectedLesson, nextPhase);
  if (phaseState.locked) {
    state.notice = phaseState.lockedReason;
    persistLearningStore();
    render();
    return;
  }
  const target = buildLearningTarget(nextPhase);
  if (!forceReplace && !shouldOpenLearningTarget(target)) {
    return;
  }

  const record = ensureLearningRecord(selectedDate, "lesson");
  let session;
  if (nextPhase === "pretest") {
    session = phaseState.status === "completed"
      ? createLessonReviewSession(selectedLesson, record, "pretest")
      : createLessonPretestSession(selectedLesson, record);
  } else if (nextPhase === "study") {
    session = createLessonStudySession(selectedLesson, record, {
      review: phaseState.status === "completed"
    });
  } else if (nextPhase === "exercise") {
    session = phaseState.status === "completed"
      ? createLessonReviewSession(selectedLesson, record, "exercise")
      : createLessonExerciseSession(selectedLesson, record);
  } else {
    session = createLessonSummarySession(selectedLesson, record);
  }
  activateLearningSession(session);
}

function closeLearningSession() {
  minimizeLearningSession();
}

function getCurrentLearningQuestion() {
  return state.learning.session?.questions?.[state.learning.session.index] || null;
}

function recordLearningAnswer(question, wasCorrect, response) {
  const session = state.learning.session;
  if (!session) {
    return;
  }

  const dayType = session.kind === "bonus" ? "bonus" : "lesson";
  const record = ensureLearningRecord(session.date, dayType);
  const answerRecord = {
    entryId: question.entryId,
    gameType: question.gameType,
    correct: wasCorrect,
    response
  };

  if (session.phase === "pretest") {
    record.pretestAnswers.push(answerRecord);
    record.pretestScore = Math.round(((session.correct + Number(wasCorrect)) / session.questions.length) * 100);
  } else {
    record.exerciseAnswers.push(answerRecord);
    record.exerciseScore = Math.round(((session.correct + Number(wasCorrect)) / session.questions.length) * 100);
    if (session.kind === "bonus") {
      record.bonusEntryIds = session.entryIds;
    }
  }

  updateEntryProgress(question.entryId, wasCorrect, session.phase === "pretest" ? "learning-pretest" : session.kind === "bonus" ? "learning-bonus" : "learning-exercise");
  persistLearningStore();
}

function resolveLearningChoice(value) {
  const session = state.learning.session;
  const question = getCurrentLearningQuestion();
  if (!session || !question || question.resolved || question.displayType === "text") {
    return;
  }

  question.selectedValue = value;
  question.wasCorrect = value === question.correctValue;
  question.resolved = true;
  const feedback = buildLearningResolvedFeedback(question, question.wasCorrect);
  question.feedback = feedback.text;
  question.feedbackMeaning = feedback.meaning;

  recordLearningAnswer(question, question.wasCorrect, value);
  session.answeredCount += 1;
  if (question.wasCorrect) {
    session.correct += 1;
    pushPulse("#2d936c");
  } else {
    pushPulse("#cc444b");
  }

  persistLearningStore();
  render();
}

function revealLearningClue() {
  const question = getCurrentLearningQuestion();
  if (!question || question.displayType !== "text" || question.resolved) {
    return;
  }
  question.clueStage = Math.min(question.clueStage + 1, question.clues.length - 1);
  persistLearningStore();
  render();
}

function submitLearningTextAnswer(answer) {
  const session = state.learning.session;
  const question = getCurrentLearningQuestion();
  if (!session || !question || question.displayType !== "text" || question.resolved) {
    return;
  }

  const normalized = normalizeAnswer(answer);
  const correct = normalizeAnswer(question.correctValue);
  if (normalized === correct) {
    question.wasCorrect = true;
    question.resolved = true;
    {
      const feedback = buildLearningResolvedFeedback(question, true);
      question.feedback = feedback.text;
      question.feedbackMeaning = feedback.meaning;
    }
    recordLearningAnswer(question, true, answer);
    session.answeredCount += 1;
    session.correct += 1;
    pushPulse("#2d936c");
  } else if (question.clueStage < question.clues.length - 1) {
    question.clueStage += 1;
    question.feedback = "Not yet. Another clue unlocked.";
    question.feedbackMeaning = "";
    pushPulse("#f4a261");
  } else {
    question.wasCorrect = false;
    question.resolved = true;
    {
      const feedback = buildLearningResolvedFeedback(question, false);
      question.feedback = feedback.text;
      question.feedbackMeaning = feedback.meaning;
    }
    recordLearningAnswer(question, false, answer);
    session.answeredCount += 1;
    pushPulse("#cc444b");
  }

  persistLearningStore();
  render();
}

function finishLearningPhase() {
  const session = state.learning.session;
  if (!session) {
    return;
  }

  const dayType = session.kind === "bonus" ? "bonus" : "lesson";
  const record = ensureLearningRecord(session.date, dayType);

  if (session.phase === "pretest") {
    record.status = "pretested";
    record.pretestScore = Math.round((session.correct / session.questions.length) * 100);
    state.learning.ui.selectedPhaseTab = "study";
    state.learning.session = createLessonStudySession(session.plan, record);
    state.notice = `Pretest complete: ${record.pretestScore}% baseline.`;
  } else if (session.phase === "exercise") {
    record.status = "completed";
    record.exerciseScore = Math.round((session.correct / session.questions.length) * 100);
    record.completedAt = new Date().toISOString();
    state.learning.ui.selectedPhaseTab = "summary";
    state.learning.session = createLessonSummarySession(session.plan, record);
    state.notice = "Lesson complete. Your day summary is ready.";
  } else if (session.phase === "bonus") {
    record.status = "bonus-completed";
    record.exerciseScore = Math.round((session.correct / session.questions.length) * 100);
    record.completedAt = new Date().toISOString();
    record.bonusEntryIds = session.entryIds;
    const slot = getLearningBonusSlotByWeek(session.week) || { date: session.date, displayLabel: session.displayLabel, week: session.week };
    state.learning.session = createBonusSummarySession(slot, record, session.entryIds);
    state.notice = "Bonus drill complete.";
  }

  persistLearningStore();
  render();
}

function advanceLearningQuestion() {
  const session = state.learning.session;
  const question = getCurrentLearningQuestion();
  if (!session || !question || !question.resolved) {
    return;
  }

  session.index += 1;
  if (session.index >= session.questions.length) {
    finishLearningPhase();
    return;
  }

  const next = getCurrentLearningQuestion();
  if (next?.audioPath) {
    state.pendingAudioPath = next.audioPath;
  }
  persistLearningStore();
  render();
}

function advanceLearningStudyCard() {
  const session = state.learning.session;
  if (!session || session.phase !== "study") {
    return;
  }

  const record = ensureLearningRecord(session.date, "lesson");
  const currentGroup = session.groups[session.groupIndex];
  if (session.cardIndex < currentGroup.length - 1) {
    session.cardIndex += 1;
    persistLearningStore();
    render();
    return;
  }

  if (session.review) {
    if (session.groupIndex < session.groups.length - 1) {
      session.groupIndex += 1;
      session.cardIndex = 0;
      persistLearningStore();
      render();
      return;
    }
    state.learning.ui.selectedPhaseTab = "summary";
    state.learning.session = createLessonSummarySession(session.plan, record);
    state.notice = "Study deck recap complete.";
    persistLearningStore();
    render();
    return;
  }

  record.studyGroupsCompleted = Math.max(record.studyGroupsCompleted, session.groupIndex + 1);
  if (record.studyGroupsCompleted >= session.groups.length) {
    record.status = "studied";
    state.learning.ui.selectedPhaseTab = "exercise";
    state.learning.session = createLessonExerciseSession(session.plan, record);
    const next = getCurrentLearningQuestion();
    if (next?.audioPath) {
      state.pendingAudioPath = next.audioPath;
    }
    state.notice = "Study cards complete. The 30-question exercise is live.";
    persistLearningStore();
    render();
    return;
  }

  session.groupIndex += 1;
  session.cardIndex = 0;
  persistLearningStore();
  render();
}
