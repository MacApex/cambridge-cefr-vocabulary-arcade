(function () {
  "use strict";

  const STORAGE_KEY_PROGRESS = "cambridge-cefr-standalone-progress-v1";
  const STORAGE_KEY_UI = "cambridge-cefr-standalone-ui-v1";
  const STORAGE_PROBE_KEY = "cambridge-cefr-standalone-storage-probe";
  const VIEW_IDS = ["dashboard", "study", "review", "browse"];
  const LEVELS = ["A1", "A2", "B1", "B2"];
  const ENTRY_KINDS = ["headword", "phrase", "idiom"];
  const STATUS_FILTERS = ["all", "unseen", "due", "learning", "mastered"];
  const SRS_INTERVALS = [0, 1, 3, 7, 14, 30, 60];
  const DEFAULT_STUDY_SIZE = 10;
  const DEFAULT_REVIEW_SIZE = 20;
  const RESULTS_STEP = 150;

  const appRoot = document.getElementById("app");
  const dataset = loadDataset();
  const entryMap = new Map(dataset.entries.map((entry) => [entry.id, entry]));
  const storageStatus = probeStorage();
  const state = {
    dataset,
    entryMap,
    storageReady: storageStatus.ok,
    storageMessage: storageStatus.message,
    progress: storageStatus.ok ? loadProgress() : {},
    ui: storageStatus.ok ? loadUiState() : defaultUiState(),
    notice: "",
    browseLimit: RESULTS_STEP
  };

  bindEvents();
  validateSessionState();
  render();

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("input", handleInput);
  }

  function loadDataset() {
    try {
      const node = document.getElementById("vocab-data");
      const parsed = JSON.parse(node ? node.textContent : "{}");
      if (parsed && Array.isArray(parsed.entries) && parsed.entries.length > 0) {
        return parsed;
      }
    } catch (error) {
      renderFatal(`The standalone dataset could not be loaded: ${String(error)}`);
      throw error;
    }

    renderFatal("The standalone dataset is missing or empty.");
    throw new Error("Standalone dataset missing.");
  }

  function probeStorage() {
    try {
      localStorage.setItem(STORAGE_PROBE_KEY, "ok");
      localStorage.removeItem(STORAGE_PROBE_KEY);
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function defaultUiState() {
    return {
      activeView: "dashboard",
      filters: {
        levels: [...LEVELS],
        kinds: [...ENTRY_KINDS],
        browseStatus: "all",
        search: ""
      },
      showChinese: true,
      currentSession: null,
      selectedEntryId: null
    };
  }

  function loadUiState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_UI) || "null");
      return sanitizeUiState(parsed);
    } catch {
      return defaultUiState();
    }
  }

  function sanitizeUiState(value) {
    const defaults = defaultUiState();
    if (!value || typeof value !== "object") {
      return defaults;
    }

    const activeView = VIEW_IDS.includes(value.activeView) ? value.activeView : defaults.activeView;
    const levelSet = Array.isArray(value.filters?.levels)
      ? value.filters.levels.filter((level) => LEVELS.includes(level))
      : defaults.filters.levels;
    const kindSet = Array.isArray(value.filters?.kinds)
      ? value.filters.kinds.filter((kind) => ENTRY_KINDS.includes(kind))
      : defaults.filters.kinds;

    return {
      activeView,
      filters: {
        levels: levelSet.length ? levelSet : defaults.filters.levels,
        kinds: kindSet.length ? kindSet : defaults.filters.kinds,
        browseStatus: STATUS_FILTERS.includes(value.filters?.browseStatus) ? value.filters.browseStatus : "all",
        search: typeof value.filters?.search === "string" ? value.filters.search.slice(0, 120) : ""
      },
      showChinese: typeof value.showChinese === "boolean" ? value.showChinese : defaults.showChinese,
      currentSession: sanitizeSession(value.currentSession),
      selectedEntryId: typeof value.selectedEntryId === "string" ? value.selectedEntryId : null
    };
  }

  function sanitizeSession(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (!["study", "review"].includes(value.kind)) {
      return null;
    }

    if (!Array.isArray(value.queue) || value.queue.length === 0) {
      return null;
    }

    if (!Array.isArray(value.promptTypes) || value.promptTypes.length !== value.queue.length) {
      return null;
    }

    const queue = value.queue.filter((entryId) => typeof entryId === "string" && entryMap.has(entryId));
    const promptTypes = value.promptTypes.filter((promptType) => ["definition", "example", "translation"].includes(promptType));
    if (queue.length === 0 || promptTypes.length !== queue.length) {
      return null;
    }

    const index = clamp(Number(value.index) || 0, 0, queue.length - 1);
    const correctCount = clamp(Number(value.correctCount) || 0, 0, queue.length);

    return {
      kind: value.kind,
      label: typeof value.label === "string" ? value.label : (value.kind === "study" ? "Study New" : "Review Due"),
      queue,
      promptTypes,
      index,
      correctCount,
      startedAt: typeof value.startedAt === "string" ? value.startedAt : new Date().toISOString(),
      response: {
        input: typeof value.response?.input === "string" ? value.response.input : "",
        revealed: Boolean(value.response?.revealed),
        isCorrect: typeof value.response?.isCorrect === "boolean" ? value.response.isCorrect : null
      }
    };
  }

  function loadProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESS) || "null");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      const sanitized = {};
      for (const [entryId, rawRecord] of Object.entries(parsed)) {
        if (!entryMap.has(entryId) || !rawRecord || typeof rawRecord !== "object") {
          continue;
        }
        sanitized[entryId] = sanitizeProgressRecord(rawRecord);
      }
      return sanitized;
    } catch {
      return {};
    }
  }

  function sanitizeProgressRecord(record) {
    const stage = clamp(Number(record.stage) || 0, 0, 6);
    return {
      stage,
      seenCount: Math.max(0, Number(record.seenCount) || 0),
      correctCount: Math.max(0, Number(record.correctCount) || 0),
      wrongCount: Math.max(0, Number(record.wrongCount) || 0),
      lapses: Math.max(0, Number(record.lapses) || 0),
      dueAt: typeof record.dueAt === "string" ? record.dueAt : null,
      lastReviewedAt: typeof record.lastReviewedAt === "string" ? record.lastReviewedAt : null,
      lastResult: typeof record.lastResult === "string" ? record.lastResult : null
    };
  }

  function persistUiState() {
    if (!state.storageReady) {
      return;
    }
    localStorage.setItem(STORAGE_KEY_UI, JSON.stringify(state.ui));
  }

  function persistProgress() {
    if (!state.storageReady) {
      return;
    }
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(state.progress));
  }

  function validateSessionState() {
    state.ui = sanitizeUiState(state.ui);
    if (state.ui.selectedEntryId && !entryMap.has(state.ui.selectedEntryId)) {
      state.ui.selectedEntryId = null;
    }
    persistUiState();
  }

  function renderFatal(message) {
    if (!appRoot) {
      return;
    }
    appRoot.innerHTML = `
      <div class="warning-wrap">
        <section class="warning-card">
          <span class="eyebrow">Load Error</span>
          <h2>Standalone page failed to boot.</h2>
          <p>${escapeHtml(message)}</p>
        </section>
      </div>
    `;
  }

  function render() {
    if (!state.storageReady) {
      appRoot.innerHTML = renderStorageWarning();
      return;
    }

    const activeEntries = getActiveEntries();
    const stats = buildActiveStats(activeEntries);

    appRoot.innerHTML = `
      <div class="app-shell">
        <div class="app-inner">
          <header class="topbar">
            <div class="brand">
              <span class="eyebrow">Standalone Cambridge CEFR Review</span>
              <h1>One file. All A1-B2 vocabulary. Local progress that stays put.</h1>
              <p>Study unseen words, review due cards, search the full bank, and keep everything in this browser profile without a server or network requests.</p>
              <div class="nav-row">
                ${VIEW_IDS.map((viewId) => `
                  <button class="nav-chip ${state.ui.activeView === viewId ? "is-active" : ""}" data-action="nav-view" data-view="${viewId}">
                    ${escapeHtml(labelForView(viewId))}
                  </button>
                `).join("")}
              </div>
            </div>
            <div class="topbar-actions">
              <button class="chip ${state.ui.showChinese ? "is-soft-active" : ""}" data-action="toggle-chinese">
                ${state.ui.showChinese ? "Chinese On" : "Chinese Off"}
              </button>
              ${state.ui.currentSession ? `
                <button class="app-button" data-action="resume-session">
                  Resume ${escapeHtml(state.ui.currentSession.label)} (${state.ui.currentSession.index + 1}/${state.ui.currentSession.queue.length})
                </button>
              ` : ""}
            </div>
          </header>
          <div class="layout">
            <aside class="sidebar">
              <section class="panel">
                <h2>Active Filters</h2>
                <p>Study and review pools follow these CEFR and entry-kind filters.</p>
                <div class="filter-grid">
                  ${LEVELS.map((level) => renderFilterChip("toggle-level", level, state.ui.filters.levels.includes(level))).join("")}
                </div>
                <div class="filter-grid">
                  ${ENTRY_KINDS.map((kind) => renderFilterChip("toggle-kind", kind, state.ui.filters.kinds.includes(kind), toTitle(kind))).join("")}
                </div>
              </section>
              <section class="panel">
                <h2>Active Pool</h2>
                <div class="stat-grid">
                  <div class="stat-card"><strong>${stats.total}</strong><span>Total entries</span></div>
                  <div class="stat-card"><strong>${stats.unseen}</strong><span>Unseen</span></div>
                  <div class="stat-card"><strong>${stats.due}</strong><span>Due today</span></div>
                  <div class="stat-card"><strong>${stats.learning}</strong><span>Learning</span></div>
                </div>
              </section>
              <section class="panel">
                <h3>Primary Level Split</h3>
                <div class="level-grid">
                  ${LEVELS.map((level) => `
                    <div class="level-pill">
                      <strong>${level}</strong>
                      <span>${stats.levelCounts[level]}</span>
                    </div>
                  `).join("")}
                </div>
                <div class="action-row">
                  <span class="pill is-mastered">Mastered ${stats.mastered}</span>
                  <span class="pill">Dataset ${state.dataset.stats.totalEntries}</span>
                </div>
              </section>
            </aside>
            <main class="main-column">
              ${state.notice ? `<section class="summary-card"><p>${escapeHtml(state.notice)}</p></section>` : ""}
              ${renderView()}
            </main>
          </div>
        </div>
      </div>
    `;
  }

  function renderStorageWarning() {
    return `
      <div class="warning-wrap">
        <section class="warning-card">
          <span class="eyebrow">Persistence Unavailable</span>
          <h2>This standalone page cannot access localStorage here.</h2>
          <p>Direct local progress is required for this file. Open it in Chromium or serve it through a small local HTTP server so the browser can retain your vocabulary history.</p>
          <p class="footer-note">Storage probe error: ${escapeHtml(state.storageMessage || "Unknown browser restriction.")}</p>
        </section>
      </div>
    `;
  }

  function renderView() {
    if (state.ui.activeView === "study") {
      return renderStudyView();
    }
    if (state.ui.activeView === "review") {
      return renderReviewView();
    }
    if (state.ui.activeView === "browse") {
      return renderBrowseView();
    }
    return renderDashboardView();
  }

  function renderDashboardView() {
    const activeEntries = getActiveEntries();
    const stats = buildActiveStats(activeEntries);
    const nextStudy = buildStudyQueue();
    const nextReview = buildReviewQueue();

    return `
      <section class="summary-card">
        <span class="eyebrow">Dashboard</span>
        <h2>Adaptive review without a server</h2>
        <p>New sessions pull unseen entries in A1 to B2 order. Review sessions pull due cards by due date, then lower stage, then older review timestamp.</p>
        <div class="summary-grid">
          <div class="stat-card"><strong>${stats.total}</strong><span>Filtered entries</span></div>
          <div class="stat-card"><strong>${stats.due}</strong><span>Due now</span></div>
          <div class="stat-card"><strong>${stats.learning}</strong><span>In learning</span></div>
          <div class="stat-card"><strong>${stats.mastered}</strong><span>Mastered</span></div>
        </div>
        <div class="action-row">
          <button class="app-button" data-action="start-study">Start Study New (${Math.min(DEFAULT_STUDY_SIZE, nextStudy.length)})</button>
          <button class="ghost-button" data-action="start-review">Review Due (${Math.min(DEFAULT_REVIEW_SIZE, nextReview.length)})</button>
          ${state.ui.currentSession ? `<button class="ghost-button" data-action="resume-session">Resume Current Session</button>` : ""}
        </div>
      </section>
      <section class="summary-card">
        <span class="eyebrow">Queue Preview</span>
        <h2>What comes next</h2>
        <div class="browse-layout">
          <div class="browse-results">
            <div class="detail-section">
              <strong>Study New</strong>
              <p class="microcopy">Unseen entries ordered by primary CEFR level and headword.</p>
              <div class="entry-list">
                ${renderPreviewEntries(nextStudy.slice(0, DEFAULT_STUDY_SIZE))}
              </div>
            </div>
          </div>
          <div class="browse-results">
            <div class="detail-section">
              <strong>Review Due</strong>
              <p class="microcopy">Due cards ordered by due date, stage, then last review.</p>
              <div class="entry-list">
                ${renderPreviewEntries(nextReview.slice(0, DEFAULT_REVIEW_SIZE))}
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderStudyView() {
    const session = state.ui.currentSession?.kind === "study" ? state.ui.currentSession : null;
    if (session) {
      return renderSession(session);
    }

    const queue = buildStudyQueue();
    return `
      <section class="summary-card">
        <span class="eyebrow">Study New</span>
        <h2>Start a 10-card unseen session</h2>
        <p>Cards pull from your active CEFR and entry-kind filters. Prompts rotate among definition, example cloze, and translation-assisted recall when Chinese is enabled and available.</p>
        <div class="action-row">
          <button class="app-button" data-action="start-study">Start Study Session</button>
        </div>
        <div class="entry-list">
          ${renderPreviewEntries(queue.slice(0, DEFAULT_STUDY_SIZE))}
        </div>
      </section>
    `;
  }

  function renderReviewView() {
    const session = state.ui.currentSession?.kind === "review" ? state.ui.currentSession : null;
    if (session) {
      return renderSession(session);
    }

    const queue = buildReviewQueue();
    return `
      <section class="summary-card">
        <span class="eyebrow">Review Due</span>
        <h2>Start a 20-card due review</h2>
        <p>Due cards are sorted by earliest due date, then lower stage, then the oldest last-reviewed timestamp. If no cards are due, use Browse to mark entries due today or keep studying new words.</p>
        <div class="action-row">
          <button class="app-button" data-action="start-review">Start Review Session</button>
        </div>
        <div class="entry-list">
          ${renderPreviewEntries(queue.slice(0, DEFAULT_REVIEW_SIZE), true)}
        </div>
      </section>
    `;
  }

  function renderSession(session) {
    const entryId = session.queue[session.index];
    const entry = entryMap.get(entryId);
    const prompt = buildPrompt(entry, session.promptTypes[session.index]);
    const reviewed = session.index;
    const progress = Math.round((reviewed / session.queue.length) * 100);
    const response = session.response || { input: "", revealed: false, isCorrect: null };

    return `
      <section class="session-card">
        <div class="session-header">
          <div>
            <span class="eyebrow">${escapeHtml(session.label)}</span>
            <h2>${escapeHtml(entry.headword)}</h2>
            <p class="microcopy">Card ${session.index + 1} of ${session.queue.length}. Typed correct so far: ${session.correctCount}.</p>
          </div>
          <div class="action-row">
            <button class="ghost-button" data-action="nav-view" data-view="dashboard">Back to Dashboard</button>
            <button class="ghost-button is-danger" data-action="cancel-session">End Session</button>
          </div>
        </div>
        <div class="progress-strip"><span style="width:${progress}%"></span></div>
        <div class="prompt-stack">
          <div class="prompt-card">
            <span class="prompt-label">${escapeHtml(prompt.label)}</span>
            <h3 class="prompt-title">${escapeHtml(prompt.title)}</h3>
            <div class="prompt-main">${escapeHtml(prompt.body)}</div>
            ${prompt.auxiliary ? `<div class="translation-copy">${escapeHtml(prompt.auxiliary)}</div>` : ""}
          </div>
          ${response.revealed ? renderAnswerSide(entry, response) : `
            <form class="session-form" data-form="answer-form">
              <input name="answer" type="text" autocomplete="off" placeholder="Type the entry" value="${escapeAttribute(response.input)}" />
              <button class="app-button" type="submit">Check</button>
              <button class="ghost-button" type="button" data-action="reveal-answer">Reveal</button>
            </form>
          `}
        </div>
      </section>
    `;
  }

  function renderAnswerSide(entry, response) {
    const resultClass = response.isCorrect ? "is-good" : "is-bad";
    const resultLabel = response.isCorrect ? "Correct" : "Reveal";
    const currentRecord = getProgressRecord(entry.id);
    const nextStages = {
      again: 1,
      hard: Math.max(1, currentRecord.stage),
      good: Math.min(6, currentRecord.stage + 1),
      easy: Math.min(6, currentRecord.stage + 2)
    };

    return `
      <div class="answer-stack">
        <div class="feedback-card ${resultClass}">
          <strong>${resultLabel}</strong>
          <p>${response.isCorrect ? "Your normalized answer matched the entry." : `Correct answer: ${escapeHtml(entry.headword)}`}</p>
          ${response.input ? `<p class="microcopy">Your answer: ${escapeHtml(response.input)}</p>` : ""}
        </div>
        <div class="answer-card">
          <span class="answer-label">Answer Side</span>
          <h3 class="answer-title">${escapeHtml(entry.headword)}</h3>
          <div class="detail-tags">
            <span class="pill">${escapeHtml(entry.primaryLevel)}</span>
            <span class="pill">${escapeHtml(toTitle(entry.entryKind))}</span>
            ${entry.partOfSpeech ? `<span class="pill">${escapeHtml(entry.partOfSpeech)}</span>` : ""}
            ${entry.guideword ? `<span class="pill">${escapeHtml(entry.guideword.toLowerCase())}</span>` : ""}
          </div>
          <div class="answer-main">${escapeHtml(entry.previewText)}</div>
          ${state.ui.showChinese && entry.cnDefinition ? `<div class="translation-copy">${escapeHtml(entry.cnDefinition)}</div>` : ""}
        </div>
        ${(entry.examples || []).length ? `
          <div class="meta-card">
            <strong>Examples</strong>
            <div class="example-list">
              ${entry.examples.slice(0, 2).map((example, index) => `
                <div class="example-card">
                  <div>${escapeHtml(example)}</div>
                  ${state.ui.showChinese && entry.cnExamples?.[index] ? `<div class="translation-copy">${escapeHtml(entry.cnExamples[index])}</div>` : ""}
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div class="meta-card">
          <strong>Rate this card</strong>
          <p class="microcopy">Stage ${currentRecord.stage} now. The next due date follows the deterministic interval table.</p>
          <div class="rating-row">
            ${renderRatingButton("again", nextStages.again)}
            ${renderRatingButton("hard", nextStages.hard)}
            ${renderRatingButton("good", nextStages.good)}
            ${renderRatingButton("easy", nextStages.easy)}
          </div>
        </div>
      </div>
    `;
  }

  function renderRatingButton(rating, stage) {
    const interval = SRS_INTERVALS[stage];
    const subtitle = rating === "again" ? "due now" : `${interval} day${interval === 1 ? "" : "s"}`;
    return `
      <button class="rating-button" data-action="rate-card" data-rating="${rating}">
        ${escapeHtml(toTitle(rating))} -> S${stage} (${subtitle})
      </button>
    `;
  }

  function renderBrowseView() {
    const filtered = getBrowseEntries();
    const visible = filtered.slice(0, state.browseLimit);
    const selectedEntry = getSelectedBrowseEntry(filtered);

    return `
      <section class="summary-card">
        <span class="eyebrow">Browse</span>
        <h2>Search the full A1-B2 bank</h2>
        <div class="browse-layout">
          <div class="browse-results">
            <div class="result-toolbar">
              <input class="search-input" type="search" name="browse-search" placeholder="Search headword, definition, or Chinese meaning" value="${escapeAttribute(state.ui.filters.search)}" />
              <div class="chip-row">
                ${STATUS_FILTERS.map((status) => `
                  <button class="chip ${state.ui.filters.browseStatus === status ? "is-active" : ""}" data-action="set-status-filter" data-status="${status}">
                    ${escapeHtml(status === "all" ? "All" : toTitle(status))}
                  </button>
                `).join("")}
              </div>
              <p class="microcopy">Showing ${visible.length} of ${filtered.length} matching entries.</p>
            </div>
            <div class="entry-list">
              ${visible.length ? visible.map((entry) => renderBrowseCard(entry, selectedEntry?.id === entry.id)).join("") : `<div class="entry-card"><p class="microcopy">No entries match the current filters.</p></div>`}
            </div>
            ${filtered.length > visible.length ? `<div class="action-row"><button class="ghost-button" data-action="show-more-results">Show ${Math.min(RESULTS_STEP, filtered.length - visible.length)} More</button></div>` : ""}
          </div>
          <div>
            ${selectedEntry ? renderEntryDetail(selectedEntry) : `
              <section class="detail-card">
                <span class="eyebrow">Entry Detail</span>
                <h2>Select an entry</h2>
                <p>Choose a word from the results list to inspect meanings, examples, and standalone actions.</p>
              </section>
            `}
          </div>
        </div>
      </section>
    `;
  }

  function renderBrowseCard(entry, isSelected) {
    const record = getProgressRecord(entry.id);
    return `
      <button class="entry-card ${isSelected ? "is-selected" : ""}" data-action="select-entry" data-entry-id="${entry.id}">
        <div class="entry-title-row">
          <strong>${escapeHtml(entry.headword)}</strong>
          <span class="pill">${escapeHtml(entry.primaryLevel)}</span>
        </div>
        <div class="entry-tags">
          <span class="pill">${escapeHtml(toTitle(entry.entryKind))}</span>
          ${renderStatusPill(record)}
        </div>
        <div class="microcopy">${escapeHtml(entry.previewText)}</div>
      </button>
    `;
  }

  function renderEntryDetail(entry) {
    const record = getProgressRecord(entry.id);
    return `
      <section class="detail-card">
        <span class="eyebrow">Entry Detail</span>
        <div class="detail-header">
          <div>
            <strong>${escapeHtml(entry.headword)}</strong>
            <p class="microcopy">${escapeHtml(entry.previewText)}</p>
          </div>
          <div class="detail-tags">
            <span class="pill">${escapeHtml(entry.primaryLevel)}</span>
            <span class="pill">${escapeHtml(toTitle(entry.entryKind))}</span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-tags">
            ${entry.partOfSpeech ? `<span class="pill">${escapeHtml(entry.partOfSpeech)}</span>` : ""}
            ${entry.guideword ? `<span class="pill">${escapeHtml(entry.guideword.toLowerCase())}</span>` : ""}
            ${renderStatusPill(record)}
          </div>
          ${state.ui.showChinese && entry.cnDefinition ? `<div class="translation-copy">${escapeHtml(entry.cnDefinition)}</div>` : ""}
        </div>
        <div class="detail-section">
          <strong>Progress</strong>
          <div class="status-row">
            <span class="pill">Stage ${record.stage}</span>
            <span class="pill">Seen ${record.seenCount}</span>
            <span class="pill">Correct ${record.correctCount}</span>
            <span class="pill">Wrong ${record.wrongCount}</span>
            <span class="pill">Lapses ${record.lapses}</span>
          </div>
          <p class="microcopy">${formatDueText(record)}</p>
        </div>
        ${(entry.examples || []).length ? `
          <div class="detail-section">
            <strong>Examples</strong>
            <div class="example-list">
              ${entry.examples.slice(0, 2).map((example, index) => `
                <div class="example-card">
                  <div>${escapeHtml(example)}</div>
                  ${state.ui.showChinese && entry.cnExamples?.[index] ? `<div class="translation-copy">${escapeHtml(entry.cnExamples[index])}</div>` : ""}
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div class="detail-section">
          <strong>Standalone Actions</strong>
          <div class="action-row">
            <button class="app-button" data-action="start-from-entry" data-entry-id="${entry.id}">Start Study From Here</button>
            <button class="ghost-button" data-action="mark-due-today" data-entry-id="${entry.id}">Mark Due Today</button>
            <button class="ghost-button is-danger" data-action="reset-entry" data-entry-id="${entry.id}">Reset Word Progress</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderPreviewEntries(entries, includeDue) {
    if (!entries.length) {
      return `<div class="entry-card"><p class="microcopy">No entries available for this queue.</p></div>`;
    }

    return entries.map((entry) => {
      const record = getProgressRecord(entry.id);
      return `
        <div class="entry-card">
          <div class="entry-title-row">
            <strong>${escapeHtml(entry.headword)}</strong>
            <span class="pill">${escapeHtml(entry.primaryLevel)}</span>
          </div>
          <div class="detail-tags">
            <span class="pill">${escapeHtml(toTitle(entry.entryKind))}</span>
            ${includeDue ? `<span class="pill">${escapeHtml(formatShortDue(record.dueAt))}</span>` : renderStatusPill(record)}
          </div>
          <div class="microcopy">${escapeHtml(entry.previewText)}</div>
        </div>
      `;
    }).join("");
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target || !state.storageReady) {
      return;
    }

    const action = target.dataset.action;
    if (action === "nav-view") {
      setActiveView(target.dataset.view);
      return;
    }
    if (action === "toggle-level") {
      toggleFilterValue("levels", target.dataset.value, LEVELS);
      return;
    }
    if (action === "toggle-kind") {
      toggleFilterValue("kinds", target.dataset.value, ENTRY_KINDS);
      return;
    }
    if (action === "toggle-chinese") {
      state.ui.showChinese = !state.ui.showChinese;
      persistUiState();
      render();
      return;
    }
    if (action === "start-study") {
      startStudySession();
      return;
    }
    if (action === "start-review") {
      startReviewSession();
      return;
    }
    if (action === "resume-session") {
      resumeSession();
      return;
    }
    if (action === "cancel-session") {
      state.ui.currentSession = null;
      state.notice = "Session cleared.";
      persistUiState();
      render();
      return;
    }
    if (action === "reveal-answer") {
      revealCurrentAnswer(false);
      return;
    }
    if (action === "rate-card") {
      rateCurrentCard(target.dataset.rating);
      return;
    }
    if (action === "set-status-filter") {
      state.ui.filters.browseStatus = STATUS_FILTERS.includes(target.dataset.status) ? target.dataset.status : "all";
      state.browseLimit = RESULTS_STEP;
      persistUiState();
      render();
      return;
    }
    if (action === "show-more-results") {
      state.browseLimit += RESULTS_STEP;
      render();
      return;
    }
    if (action === "select-entry") {
      state.ui.selectedEntryId = target.dataset.entryId;
      persistUiState();
      render();
      return;
    }
    if (action === "start-from-entry") {
      startStudySession(target.dataset.entryId);
      return;
    }
    if (action === "mark-due-today") {
      markEntryDueToday(target.dataset.entryId);
      return;
    }
    if (action === "reset-entry") {
      resetEntryProgress(target.dataset.entryId);
      return;
    }
  }

  function handleSubmit(event) {
    if (!state.storageReady) {
      return;
    }

    const form = event.target;
    if (form.dataset.form !== "answer-form") {
      return;
    }

    event.preventDefault();
    const formData = new FormData(form);
    const answer = String(formData.get("answer") || "");
    revealCurrentAnswer(true, answer);
  }

  function handleInput(event) {
    if (!state.storageReady) {
      return;
    }

    const target = event.target;
    if (target.name === "browse-search") {
      state.ui.filters.search = target.value.slice(0, 120);
      state.browseLimit = RESULTS_STEP;
      persistUiState();
      render();
      return;
    }

    if (target.name === "answer" && state.ui.currentSession) {
      state.ui.currentSession.response.input = target.value;
      persistUiState();
    }
  }

  function setActiveView(viewId) {
    state.ui.activeView = VIEW_IDS.includes(viewId) ? viewId : "dashboard";
    if (viewId === "browse") {
      state.browseLimit = RESULTS_STEP;
    }
    persistUiState();
    render();
  }

  function toggleFilterValue(field, value, allowedValues) {
    const current = new Set(state.ui.filters[field]);
    if (current.has(value)) {
      if (current.size === 1) {
        return;
      }
      current.delete(value);
    } else if (allowedValues.includes(value)) {
      current.add(value);
    }

    state.ui.filters[field] = allowedValues.filter((item) => current.has(item));
    state.browseLimit = RESULTS_STEP;
    persistUiState();
    render();
  }

  function startStudySession(startEntryId) {
    const queue = buildStudyQueue(startEntryId).slice(0, DEFAULT_STUDY_SIZE);
    if (!queue.length) {
      state.notice = "No eligible entries are available for a new study session with the current filters.";
      render();
      return;
    }

    state.ui.currentSession = createSession("study", queue, startEntryId ? "Study From Here" : "Study New");
    state.ui.activeView = "study";
    persistUiState();
    render();
  }

  function startReviewSession() {
    const queue = buildReviewQueue().slice(0, DEFAULT_REVIEW_SIZE);
    if (!queue.length) {
      state.notice = "No cards are due right now for the active filters.";
      render();
      return;
    }

    state.ui.currentSession = createSession("review", queue, "Review Due");
    state.ui.activeView = "review";
    persistUiState();
    render();
  }

  function resumeSession() {
    const session = state.ui.currentSession;
    if (!session) {
      state.notice = "There is no unfinished session to resume.";
      render();
      return;
    }

    state.ui.activeView = session.kind;
    persistUiState();
    render();
  }

  function createSession(kind, queue, label) {
    return {
      kind,
      label,
      queue: queue.map((entry) => entry.id),
      promptTypes: queue.map((entry, index) => selectPromptType(entry, index)),
      index: 0,
      correctCount: 0,
      startedAt: new Date().toISOString(),
      response: {
        input: "",
        revealed: false,
        isCorrect: null
      }
    };
  }

  function selectPromptType(entry, index) {
    const promptTypes = ["definition"];
    if (entry.examples && entry.examples.length > 0) {
      promptTypes.push("example");
    }
    if (state.ui.showChinese && entry.cnDefinition) {
      promptTypes.push("translation");
    }
    return promptTypes[index % promptTypes.length];
  }

  function revealCurrentAnswer(checkInput, providedAnswer) {
    const session = state.ui.currentSession;
    if (!session || session.response.revealed) {
      return;
    }

    const entry = entryMap.get(session.queue[session.index]);
    const rawAnswer = checkInput ? String(providedAnswer || "") : String(session.response.input || "");
    const normalizedAnswer = normalizeAnswer(rawAnswer);
    const normalizedHeadword = normalizeAnswer(entry.headword);
    const isCorrect = Boolean(normalizedAnswer) && normalizedAnswer === normalizedHeadword;

    session.response = {
      input: rawAnswer,
      revealed: true,
      isCorrect
    };

    persistUiState();
    render();
  }

  function rateCurrentCard(rating) {
    if (!["again", "hard", "good", "easy"].includes(rating)) {
      return;
    }

    const session = state.ui.currentSession;
    if (!session || !session.response.revealed) {
      return;
    }

    const entryId = session.queue[session.index];
    const record = ensureProgressRecord(entryId);
    const wasCorrect = Boolean(session.response.isCorrect);
    const currentStage = record.stage;
    const nowIso = new Date().toISOString();

    record.seenCount += 1;
    record.lastReviewedAt = nowIso;
    record.lastResult = rating;

    if (wasCorrect) {
      record.correctCount += 1;
      session.correctCount += 1;
    } else {
      record.wrongCount += 1;
    }

    if (rating === "again") {
      record.stage = 1;
      record.lapses += 1;
      record.dueAt = nowIso;
    } else if (rating === "hard") {
      record.stage = Math.max(1, currentStage);
      record.dueAt = addDaysIso(SRS_INTERVALS[record.stage]);
    } else if (rating === "good") {
      record.stage = Math.min(6, currentStage + 1);
      record.dueAt = addDaysIso(SRS_INTERVALS[record.stage]);
    } else {
      record.stage = Math.min(6, currentStage + 2);
      record.dueAt = addDaysIso(SRS_INTERVALS[record.stage]);
    }

    if (session.index >= session.queue.length - 1) {
      const finishedCount = session.queue.length;
      state.ui.currentSession = null;
      state.notice = `${session.label} finished. ${session.correctCount} of ${finishedCount} typed answers matched exactly.`;
    } else {
      session.index += 1;
      session.response = {
        input: "",
        revealed: false,
        isCorrect: null
      };
      state.notice = `${toTitle(rating)} saved for ${entryMap.get(entryId).headword}.`;
    }

    persistProgress();
    persistUiState();
    render();
  }

  function markEntryDueToday(entryId) {
    if (!entryMap.has(entryId)) {
      return;
    }

    const record = ensureProgressRecord(entryId);
    record.stage = Math.max(1, record.stage || 0);
    record.dueAt = new Date().toISOString();
    record.lastResult = "manual-due";
    persistProgress();
    state.notice = `${entryMap.get(entryId).headword} is now due today.`;
    render();
  }

  function resetEntryProgress(entryId) {
    if (!entryMap.has(entryId)) {
      return;
    }

    delete state.progress[entryId];
    if (state.ui.currentSession?.queue.includes(entryId)) {
      state.ui.currentSession = null;
    }
    persistProgress();
    persistUiState();
    state.notice = `${entryMap.get(entryId).headword} was reset for standalone review.`;
    render();
  }

  function ensureProgressRecord(entryId) {
    if (!state.progress[entryId]) {
      state.progress[entryId] = {
        stage: 0,
        seenCount: 0,
        correctCount: 0,
        wrongCount: 0,
        lapses: 0,
        dueAt: null,
        lastReviewedAt: null,
        lastResult: null
      };
    }
    return state.progress[entryId];
  }

  function getProgressRecord(entryId) {
    return state.progress[entryId] || {
      stage: 0,
      seenCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lapses: 0,
      dueAt: null,
      lastReviewedAt: null,
      lastResult: null
    };
  }

  function getActiveEntries() {
    return state.dataset.entries.filter((entry) => {
      const levelMatch = entry.cefrLevels.some((level) => state.ui.filters.levels.includes(level));
      const kindMatch = state.ui.filters.kinds.includes(entry.entryKind);
      return levelMatch && kindMatch;
    });
  }

  function buildActiveStats(entries) {
    const stats = {
      total: entries.length,
      unseen: 0,
      due: 0,
      learning: 0,
      mastered: 0,
      levelCounts: {
        A1: 0,
        A2: 0,
        B1: 0,
        B2: 0
      }
    };

    const nowIso = new Date().toISOString();
    for (const entry of entries) {
      const record = getProgressRecord(entry.id);
      stats.levelCounts[entry.primaryLevel] += 1;
      if (record.stage >= 5) {
        stats.mastered += 1;
      }
      if (record.seenCount > 0 && record.stage < 5) {
        stats.learning += 1;
      }
      if (record.dueAt && record.dueAt <= nowIso) {
        stats.due += 1;
      }
      if (!record.seenCount) {
        stats.unseen += 1;
      }
    }
    return stats;
  }

  function buildStudyQueue(startEntryId) {
    const activeEntries = getActiveEntries();
    const unseenEntries = activeEntries.filter((entry) => getProgressRecord(entry.id).seenCount === 0);
    if (!startEntryId) {
      return unseenEntries;
    }

    const selected = entryMap.get(startEntryId);
    if (!selected) {
      return unseenEntries;
    }

    const sortedEntries = activeEntries;
    const selectedIndex = sortedEntries.findIndex((entry) => entry.id === startEntryId);
    const queue = [];
    const seenIds = new Set();

    if (selectedIndex >= 0) {
      queue.push(selected);
      seenIds.add(selected.id);
      for (const entry of sortedEntries.slice(selectedIndex + 1)) {
        if (getProgressRecord(entry.id).seenCount === 0 && !seenIds.has(entry.id)) {
          queue.push(entry);
          seenIds.add(entry.id);
        }
      }
      for (const entry of sortedEntries.slice(0, selectedIndex)) {
        if (getProgressRecord(entry.id).seenCount === 0 && !seenIds.has(entry.id)) {
          queue.push(entry);
          seenIds.add(entry.id);
        }
      }
    }

    return queue.length ? queue : unseenEntries;
  }

  function buildReviewQueue() {
    const activeEntries = getActiveEntries();
    const nowIso = new Date().toISOString();
    return activeEntries
      .filter((entry) => {
        const record = getProgressRecord(entry.id);
        return Boolean(record.dueAt && record.dueAt <= nowIso);
      })
      .sort((left, right) => {
        const leftRecord = getProgressRecord(left.id);
        const rightRecord = getProgressRecord(right.id);
        if (leftRecord.dueAt !== rightRecord.dueAt) {
          return (leftRecord.dueAt || "").localeCompare(rightRecord.dueAt || "");
        }
        if (leftRecord.stage !== rightRecord.stage) {
          return leftRecord.stage - rightRecord.stage;
        }
        return (leftRecord.lastReviewedAt || "").localeCompare(rightRecord.lastReviewedAt || "");
      });
  }

  function getBrowseEntries() {
    const search = normalizeSearch(state.ui.filters.search);
    return getActiveEntries().filter((entry) => {
      if (!matchesStatusFilter(entry, state.ui.filters.browseStatus)) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = normalizeSearch([
        entry.headword,
        entry.previewText,
        entry.cnDefinition,
        entry.examples?.join(" "),
        entry.cnExamples?.join(" ")
      ].filter(Boolean).join(" "));
      return haystack.includes(search);
    });
  }

  function matchesStatusFilter(entry, status) {
    if (status === "all") {
      return true;
    }
    const record = getProgressRecord(entry.id);
    const due = Boolean(record.dueAt && record.dueAt <= new Date().toISOString());
    if (status === "unseen") {
      return record.seenCount === 0;
    }
    if (status === "due") {
      return due;
    }
    if (status === "learning") {
      return record.seenCount > 0 && record.stage < 5;
    }
    if (status === "mastered") {
      return record.stage >= 5;
    }
    return true;
  }

  function getSelectedBrowseEntry(filteredEntries) {
    if (!filteredEntries.length) {
      state.ui.selectedEntryId = null;
      persistUiState();
      return null;
    }

    const selected = filteredEntries.find((entry) => entry.id === state.ui.selectedEntryId) || filteredEntries[0];
    if (selected.id !== state.ui.selectedEntryId) {
      state.ui.selectedEntryId = selected.id;
      persistUiState();
    }
    return selected;
  }

  function buildPrompt(entry, promptType) {
    if (promptType === "example" && entry.examples && entry.examples.length) {
      return {
        label: "Example Cloze",
        title: "Fill the missing entry",
        body: maskHeadword(entry.examples[0], entry.headword),
        auxiliary: state.ui.showChinese && entry.cnExamples?.[0] ? entry.cnExamples[0] : ""
      };
    }

    if (promptType === "translation" && state.ui.showChinese && entry.cnDefinition) {
      return {
        label: "Translation Recall",
        title: "Recall the English entry",
        body: entry.cnDefinition,
        auxiliary: entry.cnExamples?.[0] || ""
      };
    }

    return {
      label: "Definition Recall",
      title: "Name the entry",
      body: entry.previewText,
      auxiliary: entry.usageCue || ""
    };
  }

  function maskHeadword(text, headword) {
    const escaped = escapeRegExp(headword.trim());
    const blanks = "_".repeat(Math.max(4, headword.trim().length));
    const boundaryPattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "giu");
    if (boundaryPattern.test(text)) {
      boundaryPattern.lastIndex = 0;
      return text.replace(boundaryPattern, (match, prefix) => `${prefix}${blanks}`);
    }
    return text.replace(new RegExp(escaped, "gi"), blanks);
  }

  function renderFilterChip(action, value, active, label) {
    return `
      <button class="chip ${active ? "is-active" : ""}" data-action="${action}" data-value="${value}">
        ${escapeHtml(label || value)}
      </button>
    `;
  }

  function renderStatusPill(record) {
    if (record.stage >= 5) {
      return `<span class="pill is-mastered">Mastered</span>`;
    }
    if (record.dueAt && record.dueAt <= new Date().toISOString()) {
      return `<span class="pill is-due">Due</span>`;
    }
    if (record.seenCount > 0) {
      return `<span class="pill is-learning">Learning</span>`;
    }
    return `<span class="pill">Unseen</span>`;
  }

  function formatDueText(record) {
    if (!record.dueAt) {
      return "No due date yet. This entry has not entered the standalone review queue.";
    }
    return `Due ${formatShortDue(record.dueAt)}. Last reviewed ${record.lastReviewedAt ? formatShortDue(record.lastReviewedAt) : "never"}.`;
  }

  function formatShortDue(iso) {
    if (!iso) {
      return "not scheduled";
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "invalid date";
    }
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function labelForView(viewId) {
    if (viewId === "study") {
      return "Study New";
    }
    if (viewId === "review") {
      return "Review Due";
    }
    return toTitle(viewId);
  }

  function addDaysIso(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  function normalizeAnswer(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’`]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSearch(value) {
    return normalizeAnswer(value);
  }

  function toTitle(value) {
    return String(value || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
