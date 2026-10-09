(function () {
  "use strict";

  const PHASES = [
    { key: "raw_generation", label: "Raw answer" },
    { key: "retrieval", label: "Evidence search" },
    { key: "claim_extraction", label: "Claim extraction" },
    { key: "verification", label: "Claim check" },
    { key: "correction", label: "Correction" },
  ];

  const PHASE_ALIASES = {
    accepted: null,
    raw_answer: "raw_generation",
    raw_generation: "raw_generation",
    retrieval: "retrieval",
    claim_extraction: "claim_extraction",
    verification: "verification",
    verification_skipped: "verification",
    correction: "correction",
  };

  // Ⓑ/Ⓒ 栏在等 final 的那段时间要说一句「现在在做什么」。约定只给三步，所以把后端
  // 的 stage 和 keepalive.phase 都归到这三步上。raw_generation / accepted /
  // verification_skipped 不在表里：它们不对应三步中的任何一步，照 setLivePhase 的
  // 规则保留上一步，而不是把已经显示出来的步骤抹成空白。
  const PROGRESS_ALIASES = {
    retrieval: "retrieval",
    // claim 级检索与 claim 抽取都发生在「拿证据」这一段，用户此刻只需要知道还没到核验。
    claim_retrieval: "retrieval",
    claim_extraction: "retrieval",
    verification: "ncbi",
    ncbi: "ncbi",
    correction: "correction",
  };

  function progressPhase(value) {
    return PROGRESS_ALIASES[String(value || "").toLowerCase()] || "";
  }

  function createInitialState() {
    return {
      status: "idle",
      question: "",
      activePanel: "raw",
      activeAuditTab: "corrections",
      correctedMode: "clean",
      selectedClaimId: null,
      selectedCitationId: null,
      startedAt: null,
      completedAt: null,
      error: null,
      rawAnswer: null,
      // raw_answer_delta 拼起来的那段 A。只在生成期间有值：完整的 raw_answer 一到就
      // 清空，显示改以 rawAnswer.text 为准（见 liveAnswerText）。
      streamingAnswer: "",
      livePhase: "",
      response: null,
      viewModel: null,
      stageEvents: [],
      phases: PHASES.map((phase) => ({
        key: phase.key,
        label: phase.label,
        status: "pending",
        observedAt: null,
      })),
    };
  }

  function startRun(previousState, question, startedAt) {
    const state = createInitialState();
    state.status = "running";
    state.question = String(question || "").trim();
    state.startedAt = startedAt || new Date().toISOString();
    state.activePanel = previousState && previousState.activePanel ? previousState.activePanel : "raw";
    return state;
  }

  function recordStage(state, stage, observedAt) {
    const key = PHASE_ALIASES[String(stage || "").toLowerCase()];
    const next = cloneState(state);
    next.stageEvents.push({
      stage: String(stage || "unknown"),
      observedAt: observedAt || new Date().toISOString(),
    });
    const phase = progressPhase(stage);
    if (phase) next.livePhase = phase;
    if (!key) return next;

    let reached = false;
    next.phases = next.phases.map((phase) => {
      if (phase.key === key) {
        reached = true;
        return Object.assign({}, phase, {
          status: stage === "verification_skipped" ? "skipped" : "running",
          observedAt: observedAt || new Date().toISOString(),
        });
      }
      if (!reached && phase.status === "pending") {
        return Object.assign({}, phase, { status: "completed" });
      }
      return phase;
    });
    return next;
  }

  // A 的增量按到达顺序拼接。空串不动状态：后端合并事件时偶尔会发一个空的 text，
  // 为它克隆一次状态并重画一次 Ⓐ 栏没有任何意义。
  function appendRawAnswerDelta(state, text) {
    const chunk = typeof text === "string" ? text : "";
    if (!chunk) return state;
    const next = cloneState(state);
    next.streamingAnswer = `${next.streamingAnswer || ""}${chunk}`;
    return next;
  }

  // keepalive 带来的步骤。认不出的值保留上一步：把「正在矫正」换成空白，看起来像
  // 进度退回去了，而后端其实什么都没变。
  function setLivePhase(state, phase) {
    const next = progressPhase(phase);
    if (!next || next === state.livePhase) return state;
    const cloned = cloneState(state);
    cloned.livePhase = next;
    return cloned;
  }

  // Ⓐ 栏此刻该显示的那段话：完整的 raw_answer 一到就以它为准，它才是后端最终认定的
  // 原话；在那之前用拼起来的增量。
  function liveAnswerText(state) {
    const full = state.rawAnswer && typeof state.rawAnswer.text === "string" ? state.rawAnswer.text : "";
    if (full) return full;
    return state.streamingAnswer || "";
  }

  function receiveRawAnswer(state, rawAnswer) {
    const next = cloneState(state);
    next.rawAnswer = rawAnswer || null;
    // 拼接结果到此作废：留着它，一旦 raw_answer.text 比拼出来的短（后端做了截断或
    // 清理），两份文字就会在「哪一份是原话」上打架。
    next.streamingAnswer = "";
    next.phases = next.phases.map((phase) => {
      if (phase.key === "raw_generation") {
        return Object.assign({}, phase, { status: "completed", observedAt: phase.observedAt || new Date().toISOString() });
      }
      return phase;
    });
    return next;
  }

  function completeRun(state, payload, viewModel, completedAt) {
    const next = cloneState(state);
    next.status = "completed";
    next.completedAt = completedAt || new Date().toISOString();
    next.response = payload || null;
    next.viewModel = viewModel || null;
    next.rawAnswer = payload && payload.raw_answer ? payload.raw_answer : next.rawAnswer;
    next.error = null;
    next.phases = next.phases.map((phase) => {
      if (phase.status === "pending" || phase.status === "running") {
        return Object.assign({}, phase, { status: "completed" });
      }
      return phase;
    });
    return next;
  }

  function failRun(state, error, completedAt) {
    const next = cloneState(state);
    next.status = "failed";
    next.completedAt = completedAt || new Date().toISOString();
    next.error = error || null;
    let marked = false;
    next.phases = next.phases.map((phase) => {
      if (!marked && (phase.status === "running" || phase.status === "pending")) {
        marked = true;
        return Object.assign({}, phase, { status: "failed" });
      }
      if (!marked) return phase;
      return phase.status === "pending" ? Object.assign({}, phase, { status: "skipped" }) : phase;
    });
    return next;
  }

  function cancelRun(state, completedAt) {
    return failRun(state, { code: "CANCELLED", message: "The request was cancelled.", retryable: true }, completedAt);
  }

  function clearRun() {
    return createInitialState();
  }

  function setActivePanel(state, panel) {
    const next = cloneState(state);
    next.activePanel = panel || "raw";
    return next;
  }

  function setAuditTab(state, tab) {
    const next = cloneState(state);
    next.activeAuditTab = tab || "corrections";
    return next;
  }

  function setCorrectedMode(state, mode) {
    const next = cloneState(state);
    next.correctedMode = mode === "tracked" ? "tracked" : "clean";
    return next;
  }

  function selectClaim(state, claimId) {
    const next = cloneState(state);
    next.selectedClaimId = claimId || null;
    next.activePanel = "audit";
    next.activeAuditTab = "corrections";
    return next;
  }

  function selectCitation(state, citationId) {
    const next = cloneState(state);
    next.selectedCitationId = citationId || null;
    next.activePanel = "audit";
    next.activeAuditTab = "citations";
    return next;
  }

  function cloneState(state) {
    return {
      status: state.status,
      question: state.question,
      activePanel: state.activePanel,
      activeAuditTab: state.activeAuditTab,
      correctedMode: state.correctedMode,
      selectedClaimId: state.selectedClaimId,
      selectedCitationId: state.selectedCitationId,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      error: state.error,
      rawAnswer: state.rawAnswer,
      streamingAnswer: state.streamingAnswer || "",
      livePhase: state.livePhase || "",
      response: state.response,
      viewModel: state.viewModel,
      stageEvents: (state.stageEvents || []).slice(),
      phases: (state.phases || []).map((phase) => Object.assign({}, phase)),
    };
  }

  const exported = {
    PHASES,
    PROGRESS_ALIASES,
    createInitialState,
    startRun,
    recordStage,
    progressPhase,
    appendRawAnswerDelta,
    setLivePhase,
    liveAnswerText,
    receiveRawAnswer,
    completeRun,
    failRun,
    cancelRun,
    clearRun,
    setActivePanel,
    setAuditTab,
    setCorrectedMode,
    selectClaim,
    selectCitation,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
  if (typeof window !== "undefined") {
    window.AnchorWorkspaceState = exported;
  }
})();
