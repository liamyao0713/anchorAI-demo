import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const html = readFileSync("index.html", "utf8");
const css = readFileSync("live-chat.css", "utf8");
const js = readFileSync("live-chat.js", "utf8");
const workspaceCss = readFileSync("workspace.css", "utf8");
const workspaceApiJs = readFileSync("workspace-api.js", "utf8");
const workspaceAdapterJs = readFileSync("workspace-adapter.js", "utf8");
const workspaceStateJs = readFileSync("workspace-state.js", "utf8");
const workspaceExportJs = readFileSync("workspace-export.js", "utf8");
const workspaceUiJs = readFileSync("workspace-ui.js", "utf8");
const casesCss = readFileSync("cases.css", "utf8");
const casesJs = readFileSync("cases.js", "utf8");
const anchorReviewCss = readFileSync("anchor-review.css", "utf8");
const anchorReviewJs = readFileSync("anchor-review.js", "utf8");

// index.html now carries two independent regions: the live Evidence Verification
// Workspace, and the archived v40 case gallery migrated below it. The
// anti-fabrication guards below must keep applying to the workspace only -- the
// gallery is static archived material and is allowed to name models, cases and
// PMIDs, because it reports what those models actually said.
const casesMarker = '<section id="anchor-cases"';
assert.ok(html.includes(casesMarker), "index.html must include the archived case gallery");
const workspaceHtml = html.slice(0, html.indexOf(casesMarker));
const casesHtml = html.slice(html.indexOf(casesMarker));

const liveChat = require("../live-chat.js");
const workspaceApi = require("../workspace-api.js");
const workspaceAdapter = require("../workspace-adapter.js");
const workspaceState = require("../workspace-state.js");
const workspaceExport = require("../workspace-export.js");

assert.doesNotMatch(html, /live-chat\.css/, "clean workspace entry must not load legacy live-chat.css");
assert.doesNotMatch(html, /live-chat\.js/, "clean workspace entry must not load legacy live-chat.js");
assert.doesNotMatch(html, /id="anchor-live-chat"/, "clean workspace entry must not include the legacy live chat panel");
assert.match(html, /id="anchor-workspace"/, "Evidence Verification Workspace must exist");
assert.match(html, /Evidence Verification Workspace/, "new product bar must name the workspace");
assert.match(html, /id="aw-settings-panel"/, "API configuration must live in settings");
assert.match(html, /id="aw-pipeline"/, "workspace must render pipeline status");
assert.match(html, /data-audit-tab="corrections"/, "C panel must include Corrections tab");
assert.match(html, /data-audit-tab="citations"/, "C panel must include Citations tab");
assert.match(html, /data-audit-tab="run-details"/, "C panel must include Run details tab");
assert.match(html, /id="aw-export-markdown"/, "workspace must export Markdown");
assert.match(html, /id="aw-export-json"/, "workspace must export audit JSON");
assert.match(html, /id="aw-question"/, "workspace question textarea must exist");
assert.match(html, /id="aw-run"/, "workspace run button must exist");
assert.match(html, /id="aw-retry"/, "workspace retry button must exist");
assert.match(html, /id="aw-about-button"/, "product bar must include an About AnchorAI anchor");
assert.match(html, /id="aw-about"/, "workspace must include the product explanation section");
assert.match(html, /How to read this workspace/, "About section must explain how to read the workspace");
assert.match(html, /Why Anchor matters/, "About section must include the cleaned Why Anchor matters copy");
assert.match(html, /The 3 Anchor moats/, "About section must include the cleaned Anchor moats copy");
assert.match(html, /Structured evidence KB/, "About section must explain the structured evidence KB");
assert.match(html, /Visible correction layer/, "About section must explain the visible correction layer");
assert.match(html, /Auditable trace/, "About section must explain the audit trail");
assert.ok(html.indexOf('id="aw-moats-title"') < html.indexOf('class="aw-question-card'), "Q&A workspace must appear after the Anchor moats in source order");
assert.match(html, /data-ui-language="en"/, "workspace root must carry the current UI language");
assert.match(html, /data-ui-lang="zh"/, "workspace must support Chinese static UI copy");
assert.doesNotMatch(html, /data-about-lang=/, "language switching must be global, not About-only");
assert.doesNotMatch(html, /id="aw-about-lang-en" class="aw-mode-button/, "language buttons must not reuse the corrected-answer mode class");
assert.match(html, /Uncorrected answer/, "Raw Answer area must be explicitly uncorrected");
assert.match(html, /Anchor-corrected answer/, "Corrected Answer area must remain separate");
assert.match(html, /Audit \/ Differences \/ Citations/, "Audit area must remain separate");
assert.match(html, /respiratory medicine/, "workspace must disclose the KB scope in English");
assert.doesNotMatch(workspaceHtml, /DeepSeek v4 Pro|Gemini 3 Flash|OpenEvidence|ChatGPT 5\.5|Claude 4\.7/, "workspace entry must not hardcode model selectors");
assert.doesNotMatch(workspaceHtml, /Case 1|Case 2|Case 3|Case 4|Case 5|Case 6/, "workspace entry must not include legacy hardcoded demo cases");
assert.doesNotMatch(workspaceHtml, /nerandomilast|famotidine|MAST trial|FIBRONEER|CAPE COD/i, "workspace entry must not include legacy hardcoded demo topics");
assert.doesNotMatch(workspaceHtml, /20–60%|72 deletes|102 inserts|5,240\+|22 diseases|reviewer signed|approved_at|FDA|NMPA/i, "About copy must not carry unverified legacy statistics or regulatory claims");
assert.doesNotMatch(workspaceHtml, /PMID\s+\d{6,}/, "workspace entry must not hardcode medical citations");
assert.doesNotMatch(workspaceHtml, /system prompt v1\.5/i, "workspace entry must not expose legacy prompts");

assert.match(casesHtml, /class="pagenav"|class='pagenav'/, "case gallery must keep its case picker");
assert.equal((casesHtml.match(/<section class='page/g) || []).length, 6, "case gallery must carry all six migrated cases");
assert.match(html, /cases\.css\?v=/, "index must load the scoped case gallery stylesheet");
assert.match(html, /cases\.js\?v=/, "index must load the case gallery behaviour");
assert.doesNotMatch(casesCss, /^(?!.*#anchor-cases)[^@\n{}]+\{/m, "every case gallery rule must be scoped under #anchor-cases");
assert.doesNotMatch(casesJs, /document\.body\.className/, "case gallery must not take over document.body from the workspace");
assert.match(casesJs, /data-ui-language/, "case gallery language must follow the workspace toggle");
assert.ok(html.indexOf('id="anchor-workspace"') < html.indexOf(casesMarker), "live workspace must stay above the archived gallery");

// Panel A shows the UNCORRECTED answer, and that is all it shows. It used to
// carry claim markers and a flagged-claims list, which meant the panel whose
// only job is to show what the model said before Anchor touched it was already
// displaying Anchor's findings -- there was nothing left to compare against.
// Where a claim failed belongs to the corrected panel, and every correction,
// including the ones that could not be located in the text, is listed under
// Corrections regardless.
const rawPanel = /function renderRawPanel\(\)\s*{([\s\S]*?)\n    }/.exec(workspaceUiJs);
assert.ok(rawPanel, "the raw panel needs a renderer");
assert.match(rawPanel[1], /markers:\s*\[\]/,
  "the uncorrected answer must be rendered with no markers");
assert.equal(/FlaggedClaims|rawMarkers/.test(rawPanel[1]), false,
  "the uncorrected answer must not display verification results");
assert.equal(/FLAGGED_STATUSES|isFlaggedClaim/.test(workspaceUiJs), false,
  "the flagging helpers are dead once panel A stops marking");

// The Markdown export must say the same thing as the audit panel (section 10.9), and
// neither may print the claim text under a heading that reads like a verification.
const SHARED_VERDICT_SENTENCES = [
  "No part of this claim could be verified from the available Anchor evidence.",
  "The exact numerical values could not be verified from the available Anchor evidence.",
  "The available evidence supports the qualitative conclusion, but does not verify the exact effect sizes or p-value stated by the model.",
  "Anchor evidence conflicts with this claim; see Reason and the conflicting evidence below.",
  "The backend did not return sub-clause verification for this claim.",
  "No supporting citation was found for this claim.",
];
for (const sentence of SHARED_VERDICT_SENTENCES) {
  assert.ok(workspaceUiJs.includes(sentence), `audit panel must carry: ${sentence}`);
  assert.ok(workspaceExportJs.includes(sentence), `markdown export must carry: ${sentence}`);
}
assert.doesNotMatch(workspaceExportJs, /Verified: \$\{plain\(correction\.correctedClaim \|\| correction\.originalClaim\)\}/, "export must not echo the claim under a Verified heading");
assert.doesNotMatch(workspaceUiJs, /correctionRow\(t\("correctionVerified"\), correction\.correctedClaim \|\| correction\.originalClaim/, "panel must not echo the claim under the verification result");

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, "workspace entry must not contain duplicate IDs");

assert.match(js, /\/api\/chat\/stream/, "frontend must prefer the streaming chat API");
assert.match(js, /\/api\/chat/, "frontend must keep /api/chat fallback");
assert.match(js, /application\/x-ndjson/, "frontend must consume streamed chat events as NDJSON");
assert.match(js, /method:\s*"POST"/, "frontend must POST to chat API");
assert.match(js, /raw_answer/, "frontend must map raw_answer");
assert.match(js, /corrected_answer/, "frontend must map corrected_answer");
assert.match(js, /grounded_by_anchor: false/, "Raw Answer must be shown as not grounded by Anchor");
assert.match(js, /Not Anchor-verified/, "Raw Answer runtime metadata must include not Anchor-verified");
assert.match(js, /Raw Answer is ready/, "frontend must render Raw Answer before final calibration completes");
assert.match(js, /Evidence search/, "frontend must show evidence retrieval as a visible phase");
assert.match(js, /Claim check/, "frontend must show claim verification as a visible phase");
assert.match(js, /elapsed/, "frontend must show elapsed waiting time");
assert.match(js, /submitting/, "frontend must model submitting state");
assert.match(js, /processing/, "frontend must model processing state");
assert.match(js, /completed/, "frontend must model completed state");
assert.match(js, /failed/, "frontend must model failed state");
assert.match(css, /live-phase-track/, "frontend must style the live phase tracker");
assert.match(css, /live-scope-note/, "frontend must style the KB scope note");
assert.match(workspaceCss, /--aw-bg:\s*#f4f7fb/i, "workspace must use design tokens");
assert.match(workspaceCss, /aw-workspace-grid/, "workspace must style the three-panel grid");
assert.match(workspaceCss, /\.aw-about\s*\{/, "workspace must style the About section with current CSS");
assert.match(workspaceCss, /\.aw-read-guide/, "workspace must style the workspace reading guide");
assert.match(workspaceCss, /\.aw-explainer-grid/, "workspace must style explainer cards");
assert.match(workspaceCss, /\.aw-moat-grid/, "workspace must style moat cards");
assert.match(workspaceCss, /\.aw-shell\s*\{[\s\S]*flex-direction:\s*column/, "workspace root must support visual section ordering");
assert.match(workspaceCss, /\.aw-about\s*\{[\s\S]*order:\s*1/, "About section must render above the Q&A workspace");
assert.match(workspaceCss, /\.aw-question-card,[\s\S]*order:\s*2/, "Q&A workspace must render after the Anchor moats");
assert.match(workspaceCss, /\.aw-question-card,[\s\S]*width:\s*100%/, "Q&A workspace cards must use the available page width");
assert.match(workspaceCss, /\.aw-about-copy\s*\{[\s\S]*max-width:\s*none/, "About copy must use the available card width");
assert.match(workspaceCss, /grid-template-columns:\s*minmax\(0,\s*32fr\) minmax\(0,\s*34fr\) minmax\(0,\s*34fr\)/, "desktop panels must use the requested proportions");
assert.match(workspaceCss, /@media \(max-width: 768px\)/, "workspace must define mobile panel tabs");
assert.match(workspaceCss, /overflow-y:\s*auto/, "workspace panels must scroll internally");
assert.match(workspaceCss, /\.aw-workspace-panel\s*\{[\s\S]*height:\s*var\(--aw-panel-height\)/, "workspace panels must use a fixed height");
assert.match(workspaceCss, /\.aw-workspace-panel\s*\{[\s\S]*max-height:\s*var\(--aw-panel-height\)/, "workspace panels must not expand past the fixed height");
// 2026-10-09：历史 v39/v40 的三栏（.v7-cols / .v7-col-body）现在是工作台的一部分，
// 用来显示响应里的 anchor_review，所以 v7-col-body 不再是「遗留静态 demo」的证据。
// 真正不该回来的是画廊那套全局切换函数和预渲染的多病例/多模型骨架。
assert.doesNotMatch(workspaceHtml, /--v7-panel-body-height|setModel\(|setPage\(|setCorrView\(|v7Slide\(|v7EqualizeCols\(/,
  "workspace entry must not include legacy static demo behavior");
assert.doesNotMatch(workspaceHtml, /class=["'][^"']*\bmwrap\b|class=["'][^"']*\bmtabs\b/,
  "workspace entry must not reintroduce the gallery's per-case / per-model tab skeleton");
assert.match(workspaceUiJs, /UI_LANGUAGE_STORAGE_KEY/, "workspace must persist the global UI language setting");
assert.match(workspaceUiJs, /setUiLanguage/, "workspace must wire global UI language switching");
assert.match(workspaceUiJs, /applyStaticTranslations/, "workspace must translate static UI text");
assert.match(workspaceUiJs, /scrollToAbout/, "workspace must wire the About anchor button");
assert.match(workspaceUiJs, /scrollToWorkspacePanel/, "workspace reading guide must target existing panels rather than duplicate them");
assert.match(js, /corrected claims/, "Corrected Answer area must expose corrected claim count");
assert.match(js, /errorInfoFromHttp/, "frontend must classify HTTP errors");
assert.match(js, /errorInfoFromException/, "frontend must classify network and timeout errors");
assert.match(js, /raw_answer: failed/, "frontend must show Raw Answer failure state");
assert.match(js, /retryButton/, "frontend must wire Retry button");
assert.match(js, /if \(inFlight\) return;/, "frontend must ignore repeated clicks while a request is in flight");
assert.match(js, /setBusy\(sendButton, retryButton, true\)/, "frontend must disable Send and Retry while submitting");
assert.match(js, /setBusy\(sendButton, retryButton, false\)/, "frontend must restore buttons after completion/failure");
assert.doesNotMatch(js, /innerHTML\s*=/, "API/model output must not be rendered through innerHTML assignment");

const workspaceBundle = `${workspaceCss}\n${workspaceApiJs}\n${workspaceAdapterJs}\n${workspaceStateJs}\n${workspaceExportJs}\n${workspaceUiJs}\n${anchorReviewCss}\n${anchorReviewJs}`;
assert.doesNotMatch(workspaceBundle, /innerHTML\s*=/, "workspace must not render untrusted model output through innerHTML assignment");
assert.doesNotMatch(workspaceBundle, /\balert\s*\(/, "workspace must use toast feedback rather than alert");
assert.match(workspaceUiJs, /renderMarkdown/, "workspace must safely render Markdown through DOM nodes");
assert.match(workspaceUiJs, /textContent/, "workspace rendering must use textContent for untrusted text");
assert.match(workspaceApiJs, /AbortController|signal/, "workspace API client must support request cancellation");
assert.match(workspaceAdapterJs, /normalizeResponse/, "workspace must centralize API response adaptation");

const publicBundle = `${html}\n${workspaceBundle}`;
assert.doesNotMatch(publicBundle, /OPENAI_API_KEY/, "frontend must not expose OpenAI env names");
assert.doesNotMatch(publicBundle, /ANCHOR_DB_PATH/, "frontend must not expose database config names");
assert.doesNotMatch(publicBundle, /\bsk-[A-Za-z0-9_-]{12,}/, "frontend must not contain API keys");
assert.doesNotMatch(publicBundle, /anchor_kb_data/, "frontend must not expose local KB paths");

assert.equal(liveChat.normalizeApiBase("http://127.0.0.1:8000/"), "http://127.0.0.1:8000");
assert.equal(liveChat.buildApiUrl("http://127.0.0.1:8000/", "/api/chat"), "http://127.0.0.1:8000/api/chat");
assert.equal(liveChat.statusMeta("sufficient"), "sufficient");
assert.equal(liveChat.statusMeta("verified"), "unavailable");
assert.equal(liveChat.hasDualAnswerPayload({ raw_answer: {}, corrected_answer: {} }), true);
assert.equal(liveChat.hasDualAnswerPayload({ error: {} }), false);
assert.equal(liveChat.liveStateMeta("idle"), "idle");
assert.equal(liveChat.liveStateMeta("submitting"), "submitting");
assert.equal(liveChat.liveStateMeta("processing"), "processing");
assert.equal(liveChat.liveStateMeta("completed"), "completed");
assert.equal(liveChat.liveStateMeta("failed"), "failed");
assert.equal(liveChat.liveStateMeta("unknown"), "failed");
assert.equal(liveChat.phaseMeta("retrieval").label, "Evidence search");
assert.equal(liveChat.phaseMeta("verification").label, "Claim check");
assert.equal(
  liveChat.correctedFallbackText("insufficient"),
  "Anchor 当前知识库中没有足够证据完成可靠核验/矫正。",
);
assert.equal(liveChat.correctedFallbackText("unavailable"), "Anchor calibration is currently unavailable.");
assert.deepEqual(
  pickError(liveChat.errorInfoFromHttp(400, { error: { message: "Traceback /Users/private/db.sqlite" } })),
  {
    code: "INVALID_REQUEST",
    message: "The question could not be processed. Please edit it and try again.",
    queryId: null,
    rawText: "Raw Answer was not generated because the request was invalid.",
  },
);
assert.equal(liveChat.errorInfoFromHttp(422, {}).code, "VALIDATION_ERROR");
assert.equal(liveChat.errorInfoFromHttp(429, {}).code, "RATE_LIMITED");
assert.equal(liveChat.errorInfoFromHttp(500, {}).code, "SERVER_ERROR");
assert.equal(liveChat.errorInfoFromHttp(502, {}).code, "UPSTREAM_UNAVAILABLE");
assert.equal(liveChat.errorInfoFromHttp(503, {}).code, "UPSTREAM_UNAVAILABLE");
assert.equal(
  liveChat.errorInfoFromStreamEvent({
    http_status: 502,
    error: { code: "LLM_UNAVAILABLE", query_id: "q/unsafe path" },
  }).code,
  "LLM_UNAVAILABLE",
);
assert.equal(
  liveChat.errorInfoFromStreamEvent({
    http_status: 502,
    error: { code: "LLM_UNAVAILABLE", query_id: "q/unsafe path" },
  }).queryId,
  "qunsafepath",
);
assert.equal(
  liveChat.errorInfoFromHttp(502, { error: { code: "LLM_UNAVAILABLE", query_id: "q/unsafe path" } }).code,
  "LLM_UNAVAILABLE",
);
assert.equal(
  liveChat.errorInfoFromHttp(502, { error: { code: "LLM_UNAVAILABLE", query_id: "q/unsafe path" } }).queryId,
  "qunsafepath",
);
assert.equal(liveChat.errorInfoFromException({ name: "AbortError" }).code, "REQUEST_TIMEOUT");
assert.equal(liveChat.errorInfoFromException(new TypeError("Failed to fetch http://server.local")).code, "API_OFFLINE");
assert.doesNotMatch(
  liveChat.errorInfoFromHttp(500, { error: { message: "Traceback at /Users/secret/server.py" } }).message,
  /Traceback|\/Users|server\.py/,
);
assert.equal(
  liveChat.correctedClaimCount([
    { original_claim: "A", corrected_claim: "A", verification_status: "supported" },
    { original_claim: "B", corrected_claim: "B with weaker wording", verification_status: "partially_supported" },
    { original_claim: "C", corrected_claim: null, verification_status: "unsupported" },
  ]),
  2,
);
assert.deepEqual(
  liveChat.evidenceIdsFrom({
    evidence_ids: ["EV_1"],
    supporting_evidence_ids: ["EV_1", "EV_2"],
    conflicting_evidence_ids: ["EV_3"],
  }),
  ["EV_1", "EV_2", "EV_3"],
);

assert.equal(workspaceApi.normalizeApiBase("https://api.882498.xyz/"), "https://api.882498.xyz");
assert.equal(workspaceApi.buildApiUrl("https://api.882498.xyz/", "/ready"), "https://api.882498.xyz/ready");
assert.equal(workspaceApi.readinessStatus({ status: "ok" }, { status: "ready", dependencies: { database: "ok", llm: "configured" } }), "connected");
assert.equal(workspaceApi.readinessStatus({ status: "ok" }, { status: "ready", dependencies: { database: "error" } }), "degraded");
assert.equal(workspaceApi.errorInfoFromHttp(429, {}).code, "RATE_LIMITED");

const samplePayload = {
  query_id: "query-123",
  question: "Does treatment help?",
  raw_answer: {
    text: "Mock claim needing weaker wording. Unsupported citation claim.",
    provider: "mock-provider",
    model: "mock-model",
    grounded_by_anchor: false,
    verification_status: "uncorrected",
  },
  corrected_answer: {
    text: "Mock claim may be appropriate in selected patients. [citation-1]",
    evidence_status: "partial",
  },
  confidence: null,
  latency_ms: 1234,
  claims: [
    {
      claim_id: "claim_1",
      text: "Mock claim needing weaker wording",
      type: "treatment",
      verification_status: "partially_supported",
      supporting_evidence_ids: ["EV_1"],
    },
    {
      claim_id: "claim_2",
      text: "Unsupported citation claim",
      type: "citation",
      verification_status: "unsupported",
      supporting_evidence_ids: [],
    },
  ],
  corrections: [
    {
      correction_id: "correction-1",
      original_claim: "Mock claim needing weaker wording",
      corrected_claim: "Mock claim may be appropriate in selected patients",
      verification_status: "partially_supported",
      correction_reason: "Anchor evidence supports a narrower statement.",
      supporting_evidence_ids: ["EV_1"],
      citation_ids: ["citation-1"],
    },
    {
      correction_id: "correction-2",
      original_claim: "Unsupported citation claim",
      corrected_claim: null,
      verification_status: "unsupported",
      correction_reason: "PMID reference was not supported by retrieved Anchor evidence.",
      citation_ids: [],
    },
  ],
  citations: [
    {
      citation_id: "citation-1",
      evidence_id: "EV_1",
      title: "Mock evidence",
      source: "Anchor KB",
      pmid: "12345678",
      doi: "10.1000/mock",
    },
  ],
  audit: {
    raw_answer_preserved: true,
    correction_performed: true,
    evidence_status: "partial",
    notes: ["real note from API"],
  },
};

const vm = workspaceAdapter.normalizeResponse(samplePayload, {
  startedAt: "2026-08-25T00:00:00.000Z",
  completedAt: "2026-08-25T00:00:02.000Z",
  observedLatencyMs: 2000,
  stageEvents: [{ stage: "raw_generation", observedAt: "2026-08-25T00:00:00.500Z" }],
});
assert.equal(vm.queryId, "query-123");
assert.equal(vm.provider, "mock-provider");
assert.equal(vm.model, "mock-model");
assert.equal(vm.evidenceStatus, "partial");
assert.equal(vm.metrics.totalClaims, 2);
assert.equal(vm.metrics.supportedClaims, 0);
// 「已校正」只数**原文真的被改动**的那些。
// correction-2 的 corrected_claim 是 null —— 原文一个字没动，不能算成功纠正。
// 旧实现按状态数（MATERIAL_STATUSES 含 unsupported / not_verifiable），所以给出 2。
assert.equal(vm.metrics.correctedClaims, 1);
assert.equal(vm.corrections[0].editApplied, true);
assert.equal(vm.corrections[1].editApplied, false);
assert.equal(vm.metrics.unsupportedClaims, 1);
assert.equal(vm.corrections[0].category, "partial support");
assert.equal(vm.corrections[1].category, "wrong citation");
assert.equal(vm.corrections[1].severity, "high");
assert.equal(vm.citations[0].href, "https://pubmed.ncbi.nlm.nih.gov/12345678/");
assert.equal(workspaceAdapter.citationHref({ pmid: "not-a-pmid", doi: "10.1000/abc" }), "https://doi.org/10.1000/abc");
assert.equal(workspaceAdapter.citationHref({ url: "javascript:alert(1)" }), null);

const missingVm = workspaceAdapter.normalizeResponse({});
assert.equal(missingVm.rawAnswer.text, "-");
assert.equal(missingVm.metrics.totalClaims, 0);
assert.deepEqual(missingVm.keyCorrections, []);
assert.deepEqual(missingVm.frameworkChecks, []);

let state = workspaceState.createInitialState();
state = workspaceState.startRun(state, "Question one?", "2026-08-25T00:00:00.000Z");
state = workspaceState.recordStage(state, "raw_generation", "2026-08-25T00:00:01.000Z");
state = workspaceState.receiveRawAnswer(state, samplePayload.raw_answer);
state = workspaceState.completeRun(state, samplePayload, vm, "2026-08-25T00:00:02.000Z");
assert.equal(state.status, "completed");
assert.equal(state.viewModel.queryId, "query-123");
const resetState = workspaceState.startRun(state, "Question two?", "2026-08-25T00:01:00.000Z");
assert.equal(resetState.viewModel, null, "starting a new request must clear previous results");
assert.equal(resetState.rawAnswer, null, "starting a new request must clear previous raw answer");
const cancelled = workspaceState.cancelRun(resetState, "2026-08-25T00:01:01.000Z");
assert.equal(cancelled.status, "failed");
assert.equal(cancelled.error.code, "CANCELLED");

const markdown = workspaceExport.buildMarkdownReport(vm, "2026-08-25T00:00:03.000Z");
assert.match(markdown, /Raw Answer/);
assert.match(markdown, /Anchor-Corrected Answer/);
assert.match(markdown, /query-123/);
assert.match(markdown, /Mock evidence/);
const auditJson = workspaceExport.buildAuditJson(vm);
assert.equal(auditJson.query_id, "query-123");
assert.equal(auditJson.corrections.length, 2);
assert.equal(workspaceExport.makeReportFilename(vm, "md", new Date("2026-08-25T00:00:03.000Z")).endsWith(".md"), true);

// Upgrade 2 of the retrieval brief: the backend verifies claims clause by clause and
// returns the two portions. The frontend renders them and must never reconstruct them.
const clausePayload = {
  query_id: "query-clause",
  question: "Does nerandomilast slow FVC decline?",
  raw_answer: { text: "Nerandomilast reduced FVC decline by 73.2 mL at Week 52.", provider: "p", model: "m" },
  corrected_answer: { text: "Anchor evidence supports: Nerandomilast reduced FVC decline.", evidence_status: "partial" },
  confidence: null,
  claims: [
    {
      claim_id: "claim-1",
      text: "Nerandomilast reduced FVC decline by 73.2 mL at Week 52.",
      verification_status: "partially_supported",
      supporting_evidence_ids: ["EV_1"],
      conflicting_evidence_ids: [],
      reason_code: "exact_value_not_verified",
      supported_portion: "Nerandomilast reduced FVC decline",
      unsupported_portion: "by 73.2 mL",
      subclaims: [
        {
          claim_id: "claim-1.1",
          text: "Nerandomilast reduced FVC decline",
          verification_status: "supported",
          supporting_evidence_ids: ["EV_1"],
          conflicting_evidence_ids: [],
          reason_code: "evidence_supports_claim",
        },
        {
          claim_id: "claim-1.2",
          text: "73.2 mL",
          verification_status: "not_verifiable",
          supporting_evidence_ids: [],
          conflicting_evidence_ids: [],
        },
      ],
    },
  ],
  corrections: [
    {
      correction_id: "correction-1",
      claim_id: "claim-1",
      original_claim: "Nerandomilast reduced FVC decline by 73.2 mL at Week 52.",
      corrected_claim: "Anchor evidence supports: Nerandomilast reduced FVC decline.",
      verification_status: "partially_supported",
      supporting_evidence_ids: ["EV_1"],
      conflicting_evidence_ids: [],
      correction_reason: "Clause-level verification.",
      citation_ids: ["citation-1"],
      reason_code: "exact_value_not_verified",
      supported_portion: "Nerandomilast reduced FVC decline",
      unsupported_portion: "by 73.2 mL",
    },
  ],
  citations: [{ citation_id: "citation-1", evidence_id: "EV_1", title: "Trial", pmid: "12345678" }],
  audit: { raw_answer_preserved: true, correction_performed: true, evidence_status: "partial", notes: [] },
};

const clauseVm = workspaceAdapter.normalizeResponse(clausePayload);
const clauseCorrection = clauseVm.corrections[0];
assert.equal(clauseCorrection.supportedPortion, "Nerandomilast reduced FVC decline");
assert.equal(clauseCorrection.unsupportedPortion, "by 73.2 mL");
assert.equal(clauseCorrection.reasonCode, "exact_value_not_verified");
assert.equal(clauseCorrection.subClauseVerified, true);
assert.equal(clauseCorrection.claimId, "claim-1", "correction must join to the claim by claim_id");
assert.equal(clauseVm.claims[0].subclaims.length, 2);
assert.equal(clauseVm.claims[0].subclaims[0].verificationStatus, "supported");
assert.equal(clauseCorrection.subclaims.length, 2, "corrections carry the clause results for rendering");

// A response with no clause-level result must leave the portions null. The old
// adapter filled them in from the status alone, which is the frontend deciding a
// medical question it is not entitled to decide.
const noClausePayload = JSON.parse(JSON.stringify(clausePayload));
delete noClausePayload.corrections[0].supported_portion;
delete noClausePayload.corrections[0].unsupported_portion;
delete noClausePayload.claims[0].subclaims;
const noClauseVm = workspaceAdapter.normalizeResponse(noClausePayload);
assert.equal(noClauseVm.corrections[0].supportedPortion, null);
assert.equal(noClauseVm.corrections[0].unsupportedPortion, null);
assert.equal(noClauseVm.corrections[0].subClauseVerified, false);
assert.deepEqual(noClauseVm.claims[0].subclaims, []);

// A supported claim with no portions returned must not have one invented either.
const supportedPayload = JSON.parse(JSON.stringify(noClausePayload));
supportedPayload.corrections[0].verification_status = "supported";
supportedPayload.claims[0].verification_status = "supported";
const supportedVm = workspaceAdapter.normalizeResponse(supportedPayload);
assert.equal(supportedVm.corrections[0].supportedPortion, null,
  "the frontend must not nominate a supported portion the backend did not return");

// Backward compatibility: a response written against the previous schema, with none
// of the optional fields, still renders.
const legacyPayload = JSON.parse(JSON.stringify(clausePayload));
delete legacyPayload.claims[0].reason_code;
delete legacyPayload.claims[0].supported_portion;
delete legacyPayload.claims[0].unsupported_portion;
delete legacyPayload.claims[0].subclaims;
legacyPayload.corrections[0] = {
  correction_id: "correction-1",
  original_claim: "Nerandomilast reduced FVC decline by 73.2 mL at Week 52.",
  verification_status: "partially_supported",
  correction_reason: "Older API shape.",
};
const legacyVm = workspaceAdapter.normalizeResponse(legacyPayload);
assert.equal(legacyVm.corrections[0].supportedPortion, null);
assert.equal(legacyVm.corrections[0].reasonCode, null);
assert.equal(legacyVm.corrections[0].claimId, "claim-1", "text match still joins an older response");

// The adapter source must not contain a local portion derivation any more.
const adapterSource = workspaceAdapterJs;
assert.equal(/function supportedPortion\s*\(/.test(adapterSource), false,
  "portions must be read from the backend, never derived in the frontend");
assert.equal(/function unsupportedPortion\s*\(/.test(adapterSource), false,
  "portions must be read from the backend, never derived in the frontend");

// ── 逐句标注：只有改动过的句子才允许带视觉标记 ──────────────────
//
// These assertions were first written against live-chat.js, which index.html
// does not load -- the page runs the workspace-*.js set. The checks passed and
// the site did not change. So the first thing pinned here is which files the
// page actually loads.

const loadedScripts = [...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map((m) => m[1]);
assert.ok(loadedScripts.includes("workspace-ui.js"),
  "the page must load the renderer these checks are about");
assert.ok(loadedScripts.includes("workspace-adapter.js"),
  "the page must load the adapter these checks are about");
assert.equal(loadedScripts.includes("live-chat.js"), false,
  "live-chat.js is not loaded by index.html; assertions about it prove nothing");

// Every script and stylesheet the page loads carries the same cache-busting
// stamp. A changed file behind a stale stamp is a deploy that silently does
// nothing, which is exactly what happened on the first attempt.
const stamps = new Set([...html.matchAll(/(?:\.js|\.css)\?v=([a-z0-9-]+)/g)].map((m) => m[1]));
assert.equal(stamps.size, 1, `all assets must share one cache stamp, found ${[...stamps].join(", ")}`);

// The adapter reads the annotated answer; it does not rebuild it. Aligning
// claims back onto sentences needs a similarity floor and an audit trail, and
// both belong server-side.
assert.match(workspaceAdapterJs, /normalizeAnnotatedAnswer\s*\(/,
  "the adapter must normalise annotated_answer");
assert.match(workspaceAdapterJs, /annotated_answer/,
  "annotated_answer must be read from the payload");
assert.equal(/function alignClaim|similarity\s*\(/.test(workspaceAdapterJs), false,
  "sentence alignment must not be reimplemented in the frontend");

// The corrected panel renders the Raw Answer, and still falls back to the
// claim-by-claim text when an older API sends no segments.
assert.match(workspaceUiJs, /function renderAnnotatedAnswer\s*\(/,
  "the corrected panel must render the Raw Answer sentence by sentence");
assert.match(workspaceUiJs, /vm\.annotatedAnswer/,
  "the panel must read the annotated answer from the view model");
assert.match(workspaceUiJs, /renderMarkdown\(refs\.correctedText, text/,
  "an older API with no annotated_answer must still render");

// "Clean" means clean. The whole point of the two modes is that one of them is
// readable prose; a clean view that still carries rules, fix blocks, verdict
// badges and notes is just the tracked view with the strikethrough removed --
// which is what it was, and what the user called out.
const cleanBranch = /if \(!tracked\) {([\s\S]*?)\n      }/.exec(workspaceUiJs);
assert.ok(cleanBranch, "clean mode needs its own branch, not a tracked view minus one line");
for (const decoration of ["aw-seg__fix", "aw-seg__note", "aw-seg__gap", "aw-seg__was", "dataset.verdict"]) {
  assert.ok(!cleanBranch[1].includes(decoration),
    `clean mode must not render ${decoration}`);
}
assert.match(cleanBranch[1], /corrected \|\| blockText/,
  "clean mode shows the corrected wording where there is one, the original otherwise");
// And the class it does use must not smuggle the marking back in via CSS.
const plain = /\.aw-seg--plain\s*{([^}]*)}/.exec(workspaceCss);
assert.ok(plain, ".aw-seg--plain needs a rule of its own");
for (const property of ["border-left", "background", "color", "text-decoration"]) {
  assert.ok(!plain[1].includes(property),
    `.aw-seg--plain must not set ${property} -- clean mode carries no marking`);
}

// The note is smaller and a different colour, and it is a <small>.
assert.match(workspaceUiJs, /create\("small", \{ className: "aw-seg__note"/,
  "the risk note is secondary text, not another paragraph");
// Smaller than the sentence it annotates -- the exact fraction is the gallery's
// (.diff-note is .95em), so what is pinned is that it is under 1em, not a number
// that just re-records whatever was written last.
const noteSize = /^\.aw-seg__note\s*{[^}]*font-size:\s*(\.\d+|0?\.\d+)em/m.exec(workspaceCss);
assert.ok(noteSize, "the risk note needs a declared, relative font size");
assert.ok(Number(noteSize[1]) < 1,
  `the risk note must be smaller than the sentence it annotates, got ${noteSize[1]}em`);
// Revisions are marked the way the case gallery marks them -- inline, with the
// cut text struck where it stood and the replacement beside it -- not as a stack
// of left-ruled callout blocks. These pin the vocabulary from cases.css.
// Asserted on the rules that actually win: the block treatment they replaced is
// still earlier in the file, and a regex that matches it proves nothing.
const inlineDisplay = /\.aw-seg__text,\s*\.aw-seg__was,\s*\.aw-seg__fix\s*{[^}]*display:\s*inline/;
assert.match(workspaceCss, inlineDisplay,
  "revision marks must be inline, so a corrected paragraph still reads as a paragraph");

// Anchored to the start of a line so a compound selector like
// ".aw-seg__was + .aw-seg__fix" is not mistaken for the rule itself.
const struck = /^\.aw-seg__was\s*{([^}]*)}/gm;
const struckRule = [...workspaceCss.matchAll(struck)].pop();
assert.ok(struckRule, "removed text must be struck wherever it appears");
// Phrase-level diffs put deletions inside minor corrections too, so the
// treatment cannot be gated on severity.
assert.ok(!/\.aw-seg--severe \.aw-seg__was\s*{/.test(workspaceCss),
  "the struck treatment must not be scoped to severe segments");
assert.match(struckRule[1], /background:\s*#fee2e2/i, "struck text uses the gallery's red");
assert.match(struckRule[1], /line-through/, "struck text must actually be struck");

const added = /^\.aw-seg__fix\s*{([^}]*)}/gm;
const addedRule = [...workspaceCss.matchAll(added)].pop();
assert.ok(addedRule, "a correction needs its replacement marked");
assert.match(addedRule[1], /background:\s*#dcfce7/i, "added text uses the gallery's green");
assert.match(addedRule[1], /border-bottom:\s*2px solid #16a34a/i, "added text is underlined green");

const noteRule = [...workspaceCss.matchAll(/^\.aw-seg__note\s*{([^}]*)}/gm)].pop();
assert.ok(noteRule, "the risk note needs a rule");
assert.match(noteRule[1], /background:\s*#fef3c7/i, "the note is the gallery's amber aside");
assert.match(noteRule[1], /border-left:\s*3px solid #2563eb/i, "the note carries the gallery's blue edge");
assert.match(workspaceCss, /\.aw-seg__note::before\s*{[^}]*content:\s*"✋ Anchor: "/,
  "the note says who is speaking, as the gallery does");
// Struck, added and note must still be three different grounds.
const grounds = ["#fee2e2", "#dcfce7", "#fef3c7"];
assert.equal(new Set(grounds).size, 3, "struck, added and note must not share a background");

// Indentation follows the gallery's list and prose metrics.
assert.match(workspaceCss, /\.aw-seg-list\s*{[^}]*padding-left:\s*22px/,
  "list indentation must match the gallery's 22px");

// A verdict that could not be settled is not a finding, and must not be painted
// as one -- it was 68% of verdicts, and colouring it made 41% of the answer red.
const unverifiable = /\.aw-seg--unverifiable \.aw-seg__text[^{]*{([^}]*)}/.exec(workspaceCss);
assert.ok(unverifiable, "unverifiable sentences need an explicit no-marking rule");
assert.match(unverifiable[1], /border-left:\s*0/,
  "an unverifiable sentence must carry no rule");
assert.match(workspaceUiJs, /SEVERITY|severity/,
  "the renderer must read the severity the backend graded");

// A verified sentence gets a rule, never a fill or a strikethrough: it is the
// model's own text, unchanged, and has to read that way.
const verifiedBlock = /\.aw-seg--verified \.aw-seg__text\s*{([^}]*)}/.exec(workspaceCss);
assert.ok(verifiedBlock, "verified sentences need a style block");
assert.equal(/background/.test(verifiedBlock[1]), false,
  "a sentence nothing was wrong with must not be highlighted");
assert.equal(/line-through/.test(verifiedBlock[1]), false,
  "a sentence nothing was wrong with must not be struck out");

// ── 未核验的两种情形，以及一个会虚报错误的分类 ────────────────
//
// "not_verifiable" splits: nothing in the KB was retrieved for the claim, or
// evidence was retrieved and did not settle it. Only the first is a gap the
// reader can act on, and only the first is marked.
assert.match(workspaceAdapterJs, /unverifiableReason: optionalText\(segment\.unverifiable_reason\)/,
  "the adapter must carry why a sentence was unverifiable");
assert.match(workspaceUiJs, /unverifiableReason === "no_evidence"/,
  "only the no-coverage case may be marked");
// The gallery has no mark for "we had nothing on this", so the sentence carries
// none and the gap is said in an aside (.corr-caveat: grey, italic, smaller).
// A gap must never borrow the struck red or the added green.
const noEvidence = /^\.aw-seg--no-evidence \.aw-seg__text\s*{([^}]*)}/m.exec(workspaceCss);
assert.ok(noEvidence, "the no-coverage case needs its own style");
assert.match(noEvidence[1], /border-left:\s*0/,
  "a coverage gap must not look like a finding against the sentence");
const gap = /^\.aw-seg__gap\s*{([^}]*)}/m.exec(workspaceCss);
assert.ok(gap, "the gap needs its own aside style");
assert.match(gap[1], /font-style:\s*italic/, "the gap is an aside, not a verdict");
assert.ok(!/#fee2e2|#dcfce7/i.test(gap[1]),
  "a coverage gap must not borrow the struck or added colour");

// Category patterns ran over the reason text of every non-supported verdict,
// so a not_verifiable claim whose reason mentioned a percentage came back
// labelled "numerical error" -- reporting a fault that was never found.
assert.match(workspaceAdapterJs, /normalizedStatus === "not_verifiable"[\s\S]{0,120}return "other"/,
  "a verdict that concluded nothing must not be given a fault category");

// "Key corrections" listing three not_verifiable entries reads as three
// problems found, when the run found none.
assert.match(workspaceAdapterJs, /CONCLUDED_STATUSES = new Set\(\["unsupported", "conflicting", "partially_supported"\]\)/,
  "key corrections must be limited to verdicts that concluded something");
assert.match(workspaceAdapterJs, /CONCLUDED_STATUSES\.has\(/,
  "the filter must actually be applied");


// ════════════════════════════════════════════════════════════════════════════
// anchor_review：历史 v39/v40 的 Ⓐ|Ⓑ|Ⓒ 三栏（2026-10-09）
//
// 响应里带 anchor_review 时，这三栏顶替工作台原来的 A/B/C 面板；不带的旧响应
// 完全走原有渲染。下面的断言盯住三件事：接线接上了、色值与断点照搬了历史、
// 以及这一层仍然不碰 innerHTML。
// ════════════════════════════════════════════════════════════════════════════

assert.match(html, /anchor-review\.css\?v=/, "index must load the anchor_review stylesheet");
assert.match(html, /anchor-review\.js\?v=/, "index must load the anchor_review renderer");
assert.ok(html.indexOf("anchor-review.js") < html.indexOf("workspace-ui.js"),
  "the renderer must load before the UI that reads window.AnchorReview");

assert.match(workspaceHtml, /id="aw-anchor-review"[^>]*hidden/,
  "the review section must start hidden so a response without anchor_review changes nothing");
["v7-col v7-col-a", "v7-col v7-col-b", "v7-col v7-col-c"].forEach((className) => {
  assert.ok(workspaceHtml.includes(className), `review section must carry ${className}`);
});
["v7-h-a", "v7-h-b", "v7-h-c"].forEach((className) => {
  assert.ok(workspaceHtml.includes(className), `review section must carry the ${className} header`);
});
assert.match(workspaceHtml, /<span class="v7-badge">Ⓐ<\/span>/, "Ⓐ column must carry its circled badge");
assert.match(workspaceHtml, /<span class="v7-badge">Ⓑ<\/span>/, "Ⓑ column must carry its circled badge");
assert.match(workspaceHtml, /<span class="v7-badge">Ⓒ<\/span>/, "Ⓒ column must carry its circled badge");
assert.match(workspaceHtml, /class="v7-switch"/, "Ⓑ header must carry the track/clean switch");
assert.match(workspaceHtml, /class="v7-knob"/, "the switch must use the historical knob markup");
assert.match(workspaceHtml, /id="awv7-b-track"[^>]*class="v7-track-view"/, "Ⓑ must hold a track view");
assert.match(workspaceHtml, /id="awv7-b-clean"[^>]*class="v7-clean-view"/, "Ⓑ must hold a clean view");
assert.match(workspaceHtml, /id="awv7-b-refs"[^>]*refs-collapse/,
  "the corrected references must live in a collapsible details inside Ⓑ");
assert.match(workspaceHtml, /id="awv7-c-cards"/, "Ⓒ must hold the correction cards");
assert.match(workspaceHtml, /id="awv7-c-cites"/, "Ⓒ must hold the citation check table");
assert.match(workspaceHtml, /id="awv7-b-incomplete"[^>]*class="v7-incomplete"/,
  "Ⓑ must be able to say the correction did not complete");

// 这一段文案也走现有的中英切换机制，不是写死的英文。
["reviewNoteA", "reviewTitleB", "reviewTitleC", "reviewTrack", "reviewClean",
 "reviewCardsHeading", "reviewCitationsHeading"].forEach((key) => {
  assert.ok(workspaceHtml.includes(`data-i18n="${key}"`), `review copy ${key} must come from the i18n table`);
  assert.ok(workspaceUiJs.includes(`${key}:`), `${key} must be defined in UI_TEXT`);
});
// 两套都要有：只定义英文的话切到中文会静默回落，看不出漏了。
const uiTextBlock = workspaceUiJs.slice(
  workspaceUiJs.indexOf("const UI_TEXT = {"),
  workspaceUiJs.indexOf("function initWorkspace()"));
["reviewTitleA", "reviewNoteA", "reviewTitleB", "reviewTitleC", "reviewTrack", "reviewClean",
 "reviewCardSaid", "reviewCardVerified", "reviewCardWhy", "reviewNoCards", "reviewReferences",
 "reviewIncomplete", "reviewSourceKb"].forEach((key) => {
  // 只数 UI_TEXT 里的定义：collectRefs 里也有同名的 key（指向 DOM 节点）。
  assert.equal((uiTextBlock.match(new RegExp(`\\n\\s+${key}:`, "g")) || []).length, 2,
    `${key} must be defined in both the en and zh tables`);
});
assert.match(workspaceUiJs, /reviewTitleA: "未矫正 · \{model\} 原话"/,
  "the Ⓐ header must name the model that wrote the answer");
// Ⓐ 点名的必须是写出原话的那个模型。anchor_review.model 是 Anchor 的**校正**模型，
// 用它当 Ⓐ 的标题，等于说校正模型写了被校正的那段话。
assert.match(workspaceUiJs, /state\.response\.raw_answer \? state\.response\.raw_answer\.model/,
  "the Ⓐ header must take its model from raw_answer, not from the correcting model");
// 校正没跑完时没有卡片，不等于「无需校正」。
assert.match(workspaceUiJs, /reviewCardsUnavailable/,
  "a failed correction must not be reported as 'nothing to correct'");
assert.match(workspaceUiJs, /renderReviewCards\(review\.cards, review\.completed\)/,
  "the cards renderer must know whether the correction completed");

// 历史色值与几何。这些是设计规格里点名的数字，改掉就不再是「照历史复现」了。
assert.match(anchorReviewCss, /linear-gradient\(90deg, #b91c1c, #dc2626\)/, "Ⓐ header gradient must match v39/v40");
assert.match(anchorReviewCss, /linear-gradient\(90deg, #15803d, #16a34a\)/, "Ⓑ header gradient must match v39/v40");
assert.match(anchorReviewCss, /linear-gradient\(90deg, #6d28d9, #7c3aed\)/, "Ⓒ header gradient must match v39/v40");
assert.match(anchorReviewCss, /grid-template-columns: 1fr 1fr 1fr/, "the three columns must be equal thirds");
assert.match(anchorReviewCss, /gap: 14px/, "column gap must match the historical 14px");
assert.match(anchorReviewCss, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns: 1fr;/,
  "the columns must stack below the historical 1100px breakpoint");
assert.match(anchorReviewCss, /#aw-anchor-review \{[\s\S]*max-width: 1640px/,
  "the review section must use the historical 1640px page width");
assert.match(anchorReviewCss, /\.v7-col-h \{[\s\S]*position: sticky/, "column headers must stay sticky");

// 行内修订标记：五种标记、历史的 ::before 字符。
assert.match(anchorReviewCss, /\.diff-del \{[\s\S]*line-through/, "DEL must render as a strikethrough");
assert.match(anchorReviewCss, /\.diff-del::before \{\s*content: '⌫'/, "DEL must keep its ⌫ prefix");
assert.match(anchorReviewCss, /\.diff-add::before \{\s*content: '＋'/, "NEW must keep its ＋ prefix");
assert.match(anchorReviewCss, /\.diff-note::before \{\s*content: "✋ Anchor: "/, "NOTE must keep its ✋ prefix");
assert.match(anchorReviewCss, /\.diff-up::before \{ content: "⬆️ "; \}/, "UP must keep its ⬆️ prefix");
assert.match(anchorReviewCss, /\.diff-hl::before \{ content: "⭐ "; \}/, "HL must keep its ⭐ prefix");
// 规格点名的缺口：历史 .v7-ans 里的 <mark> 根本没有 CSS，靠浏览器默认黄。
assert.match(anchorReviewCss, /\.v7-ans mark \{[\s\S]*background: #FEF08A/,
  "the Ⓐ column highlight must be styled rather than left to the browser default");

// 引用核验表的三列由后端填，一句长 verdict_text 不能把表撑出栏外 —— 栏是
// overflow:hidden 的，撑出去就是被切掉。历史那张表是预渲染的，不会遇到这件事。
assert.match(anchorReviewCss, /\.ctab \{[\s\S]*table-layout: fixed/,
  "the citation table must not let one long cell set the column widths");
assert.doesNotMatch(anchorReviewCss, /\.vpill \{[\s\S]*white-space: nowrap/,
  "a long verdict must wrap inside its pill rather than overflow the column");

// 整份样式都压在 #aw-anchor-review 底下：.card / .ctab / .diff-del 这些类名同时存在于
// 下方归档的案例画廊，不限定作用域就会互相串味。
// @keyframes 的内层是关键帧（`0%, 100% { … }`），不是选择器，没法串味——先摘掉它们，
// 否则这条断言会把每一个关键帧都当成一条没限定作用域的规则。名字的隔离由下一条管。
const anchorReviewRules = anchorReviewCss.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
assert.doesNotMatch(anchorReviewRules, /^(?!.*#aw-anchor-review)[^@\n{}]+\{/m,
  "every anchor_review rule must be scoped under #aw-anchor-review");
// 动画名是**全局**的，没有作用域可言：同名的 @keyframes 后定义的会盖掉先定义的。
// 所以这一份里的名字一律带 awv7- 前缀，和 workspace.css / cases.css 不会撞。
for (const name of anchorReviewCss.match(/@keyframes\s+([\w-]+)/g) || []) {
  assert.match(name, /@keyframes\s+awv7-/, `${name} must be prefixed so it cannot clash with another sheet`);
}

// 渲染层只产出结构，由 UI 用 createElement/textContent 落地。正文来自模型，所以
// 「不把它交给 innerHTML」这条规矩必须覆盖新模块。
assert.doesNotMatch(anchorReviewJs, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\./,
  "the anchor_review renderer must not build HTML strings or touch the DOM");
assert.match(anchorReviewJs, /parseTrack/, "the renderer must expose the track-view parser");
assert.match(anchorReviewJs, /parseClean/, "the renderer must expose the clean-view parser");
assert.match(anchorReviewJs, /parseAnswer/, "the renderer must expose the Ⓐ-column parser");

// 接线：三栏的渲染、等高内滚、滑块、以及语言/窗口变化后的重算。
assert.match(workspaceUiJs, /renderAnchorReview\(\)/, "the workspace must render the review columns");
assert.match(workspaceUiJs, /currentReview\(\)/, "the workspace must read anchor_review off the response");
assert.match(workspaceUiJs, /equalizeReviewColumns/, "the columns must be equalised to the shortest one");
assert.match(workspaceUiJs, /REVIEW_VIEWPORT_SHARE = 0\.82/, "the height cap must match the historical 82% of the viewport");
assert.match(workspaceUiJs, /REVIEW_MIN_HEIGHT = 460/, "the height floor must match the historical 460px");
assert.match(workspaceUiJs, /setTimeout\(equalizeReviewColumns, 150\)/,
  "resize must debounce the re-fit the way the historical page did");
assert.match(workspaceUiJs, /classList\.toggle\("show-clean"/, "the switch must drive the historical show-clean class");
assert.match(workspaceUiJs, /refs\.workbench\.hidden = on/,
  "the review columns must replace the original panels rather than sit beside them");
// A 框栏头里的「基座模型 / 粘贴答案」是下一次运行要用的控件，不能跟着面板一起消失。
assert.match(workspaceUiJs, /movePanelTools/, "the pre-run controls must survive the switch to the review columns");
assert.match(workspaceCss, /\.aw-paste-row \.aw-panel-tools/,
  "the relocated controls must be restyled for the light question card");

// 这一版明确不渲染的东西。渲染了就得有人去核对它们的历史版式，而那不在这次范围里。
["key_takeaways", "outcome_comparisons"].forEach((field) => {
  assert.equal(anchorReviewJs.includes(field), false, `this version must not render ${field}`);
  assert.equal(workspaceUiJs.includes(field), false, `this version must not render ${field}`);
});

// 本地预览靠 URL 参数改 API 地址；线上默认值不能变。
assert.match(workspaceUiJs, /URLSearchParams\(window\.location\.search\)\.get\("api"\)/,
  "a preview must be able to point the page at a local API with ?api=");
assert.match(workspaceApiJs, /DEFAULT_API_BASE_URL = "https:\/\/api\.882498\.xyz"/,
  "the deployed default API base URL must not change");

// 样例响应：既是离线渲染测试的输入，也是后端该照着填什么的样板。
const reviewFixture = JSON.parse(readFileSync("tests/fixtures/anchor_review_sample.json", "utf8"));
assert.ok(reviewFixture.raw_answer && reviewFixture.corrected_answer,
  "the fixture must stay a valid AnchorChatResponse so the existing panels can read it too");
const sampleReview = reviewFixture.anchor_review;
["engine", "model", "language", "completed", "a_text", "a_marks", "b_track", "b_clean",
 "references", "cards", "citation_checks", "validation"].forEach((field) => {
  assert.ok(Object.prototype.hasOwnProperty.call(sampleReview, field),
    `the fixture must carry the contract field ${field}`);
});
assert.equal(sampleReview.engine, "anchor_v6");
assert.ok(sampleReview.b_track.includes("〚DEL〛") && sampleReview.b_track.includes("〚NEW〛"),
  "the fixture must exercise the track-changes markers");

console.log("frontend static checks passed");

function pickError(errorInfo) {
  return {
    code: errorInfo.code,
    message: errorInfo.message,
    queryId: errorInfo.queryId,
    rawText: errorInfo.rawText,
  };
}


// The Raw Answer is a document -- numbered headings, bullet lists, bold labels --
// and panel B rendered every sentence as a bare <p>. Measured in a real browser:
// panel A came out as 6 paragraphs and 5 lists, panel B as 35 flat paragraphs
// carrying ten literal "**" pairs, which is not a comparison a reader can make.
assert.match(workspaceUiJs, /function segmentBlock\s*\(/,
  "the corrected panel must recover the block each sentence came from");
assert.match(workspaceUiJs, /create\("ul", \{ className: "aw-seg-list"/,
  "consecutive bullet segments must render as one list, not as loose paragraphs");
assert.match(workspaceCss, /\.aw-seg-list\s*{[^}]*list-style/,
  ".aw-seg-list needs its own list styling");
assert.match(workspaceCss, /\.aw-seg-list > \.aw-seg\s*{[^}]*display:\s*list-item/,
  "a marked bullet must still render as a list item");
// Bold has to go through the shared inline renderer in every branch, or the
// markers reach the screen as text.
const annotated = /function fillSegment\s*\([\s\S]*?\n    }/.exec(workspaceUiJs);
assert.ok(annotated, "fillSegment must exist");
assert.ok(!/text:\s*blockText/.test(annotated[1] || annotated[0]),
  "segment text must go through appendBoldText, not be set as raw text");
assert.equal((annotated[0].match(/appendBoldText/g) || []).length >= 4, true,
  "every branch that prints segment text must render its bold");

// The correction is built from the claim, which keeps the bullet the sentence
// arrived with -- inside a <li> that draws its own marker the reader saw "- text"
// next to a disc.
assert.match(workspaceUiJs, /corrected:\s*corrected \? corrected\.replace\(LIST_ITEM_RE, ""\)/,
  "a corrected bullet must lose its literal marker like the original does");

// Corrections arrive whole -- sentence and replacement -- while the gallery's
// marks are built for the phrase that changed. Rendering the pair directly
// printed the sentence twice, once plain and once in green.
assert.match(workspaceUiJs, /function diffTokens\s*\(/,
  "the corrected panel must diff the pair, not print both halves");
assert.match(workspaceUiJs, /const runs = diffTokens\(blockText, corrected\)/,
  "the renderer must use the diff");
assert.match(workspaceUiJs, /DIFF_TOKEN_CAP/,
  "the quadratic table needs a guard, with whole-sentence marking as the fallback");

// Chinese diffs per character, so a reworded clause returns as a dozen
// one-character marks separated by two-character gaps -- accurate and unreadable.
assert.match(workspaceUiJs, /function compactRuns\s*\(/,
  "short unchanged runs between two marks must be absorbed, not left as confetti");
assert.match(workspaceUiJs, /MIN_UNCHANGED_RUN/,
  "the compaction threshold must be named, not inlined");

// safeLink is the sink. The adapter restricts citation URLs to http/https and
// nothing reaches it unchecked today, but the guarantee has to live at the sink
// too -- a "javascript:" href runs on click, and target/rel do not stop it.
const safeLinkBody = /function safeLink\([\s\S]*?\n  }/.exec(workspaceUiJs);
assert.ok(safeLinkBody, "safeLink must exist");
assert.match(safeLinkBody[0], /protocol === "http:" \|\| .*protocol === "https:"/,
  "safeLink must enforce the scheme its name promises");
assert.match(safeLinkBody[0], /rel = "noopener noreferrer"/,
  "an external link must not hand the opener to the target");

// A "**bold**" run whose closing marker sits after a full stop is split across
// two segments, so one carries an opening "**" with nothing to close it. The
// pair-matching split leaves those in the plain text and they reached the screen
// as literal asterisks -- seen in a browser, invisible to every assertion here
// until this one.
assert.match(workspaceUiJs, /ORPHAN_EMPHASIS_RE/,
  "emphasis markers that lost their pair must be stripped, not printed");
const boldFn = /function appendBoldText\([\s\S]*?\n  }/.exec(workspaceUiJs);
assert.ok(boldFn, "appendBoldText must exist");
assert.match(boldFn[0], /replace\(ORPHAN_EMPHASIS_RE, ""\)/,
  "the plain branch must strip orphaned markers before printing");


// --------------------------------------------------------------------------
// 「已校正」取数语义回归（2026-10-06 验收退回项 3）
//
// 页面上那个数此前由前端自己按 claim 状态推，而 not_verifiable 也被算进去，
// 于是一次 15 条 claim、10 条无法核验的回答被显示成「14 条已校正」。

{
  // 后端给了统一计数 → 优先用它，不再自己推
  const withCounts = workspaceAdapter.normalizeResponse(
    {
      query_id: "q-counts",
      raw_answer: { text: "raw", provider: "p", model: "m" },
      corrected_answer: { text: "corrected", evidence_status: "partial" },
      claims: [
        { claim_id: "c1", text: "a", verification_status: "not_verifiable" },
        { claim_id: "c2", text: "b", verification_status: "not_verifiable" },
        { claim_id: "c3", text: "c", verification_status: "partially_supported" },
      ],
      corrections: [
        { correction_id: "r1", claim_id: "c1", original_claim: "a", corrected_claim: "a",
          verification_status: "not_verifiable", correction_reason: "no comparable evidence" },
        { correction_id: "r2", claim_id: "c2", original_claim: "b", corrected_claim: "b",
          verification_status: "not_verifiable", correction_reason: "not retrieved" },
        { correction_id: "r3", claim_id: "c3", original_claim: "c", corrected_claim: "c (qualified)",
          verification_status: "partially_supported", correction_reason: "overstated significance" },
      ],
      citations: [],
      audit: {
        raw_answer_preserved: true, correction_performed: true, evidence_status: "partial",
        notes: [],
        counts: { applied_edits: 1, candidate_edits: 0, annotations: 0, unknown: 2, faithful: 0, not_clinical: 0 },
      },
    },
    {}
  );
  assert.equal(withCounts.metrics.correctedClaims, 1);
  assert.equal(withCounts.metrics.notVerifiableClaims, 2);
}

{
  // 旧服务没有 counts → 退回本地判断，但判据是「正文变了没有」，
  // 不是状态词。两条 not_verifiable 且正文未改 → 已校正必须是 0。
  const legacy = workspaceAdapter.normalizeResponse(
    {
      query_id: "q-legacy",
      raw_answer: { text: "raw", provider: "p", model: "m" },
      corrected_answer: { text: "corrected", evidence_status: "insufficient" },
      claims: [
        { claim_id: "c1", text: "a", verification_status: "not_verifiable" },
        { claim_id: "c2", text: "b", verification_status: "not_verifiable" },
      ],
      corrections: [
        { correction_id: "r1", claim_id: "c1", original_claim: "a", corrected_claim: "a",
          verification_status: "not_verifiable", correction_reason: "x" },
        { correction_id: "r2", claim_id: "c2", original_claim: "b", corrected_claim: null,
          verification_status: "not_verifiable", correction_reason: "y" },
      ],
      citations: [],
      audit: { raw_answer_preserved: true, correction_performed: false, evidence_status: "insufficient", notes: [] },
    },
    {}
  );
  assert.equal(legacy.metrics.correctedClaims, 0, "无法核验不是成功纠正");
  assert.equal(legacy.metrics.notVerifiableClaims, 2);
}

{
  // 后端显式给了 edit_applied → 以它为准，哪怕文本比较会得出别的结论
  const explicit = workspaceAdapter.normalizeResponse(
    {
      query_id: "q-explicit",
      raw_answer: { text: "raw", provider: "p", model: "m" },
      corrected_answer: { text: "corrected", evidence_status: "partial" },
      claims: [{ claim_id: "c1", text: "a", verification_status: "partially_supported" }],
      corrections: [
        { correction_id: "r1", claim_id: "c1", original_claim: "a", corrected_claim: "a (changed)",
          edit_applied: false, verification_status: "partially_supported",
          correction_reason: "回查未通过，保留原文" },
      ],
      citations: [],
      audit: { raw_answer_preserved: true, correction_performed: true, evidence_status: "partial", notes: [] },
    },
    {}
  );
  assert.equal(explicit.corrections[0].editApplied, false);
  assert.equal(explicit.metrics.correctedClaims, 0, "回查未通过的候选不算已应用");
}

console.log("corrected-count semantics checks passed");

// --------------------------------------------------------------------------
// 空项兼容回归（2026-10-06 第三轮验收补充）
//
// corrections / claims / citations 是网络来的数组，里面可能有 null。
// normalizeCorrections 的其余取值都写了 `correction && ...`，新增的 edit_applied
// 漏了这一层，于是 corrections:[null] 会抛 TypeError 把整次渲染打挂。
{
  const withNulls = workspaceAdapter.normalizeResponse(
    {
      query_id: "q-nulls",
      raw_answer: { text: "raw", provider: "p", model: "m" },
      corrected_answer: { text: "corrected", evidence_status: "partial" },
      claims: [null, { claim_id: "c1", text: "a", verification_status: "supported" }],
      corrections: [null, { correction_id: "r1", claim_id: "c1", original_claim: "a",
                            corrected_claim: "a", verification_status: "supported",
                            correction_reason: "ok" }],
      citations: [null],
      audit: { raw_answer_preserved: true, correction_performed: false,
               evidence_status: "partial", notes: [null] },
    },
    {}
  );
  assert.equal(withNulls.metrics.correctedClaims, 0);
  assert.ok(Array.isArray(withNulls.corrections));
}

// 整个数组是 null、或字段整个缺失，也不能抛
{
  for (const payload of [
    { query_id: "q1", corrections: null, claims: null, citations: null },
    { query_id: "q2" },
  ]) {
    const vm = workspaceAdapter.normalizeResponse(payload, {});
    assert.equal(vm.metrics.correctedClaims, 0);
  }
}

console.log("null-item tolerance checks passed");

// --------------------------------------------------------------------------
// 推理模式开关（修复 4）
//
// 「这一次的矫正调用要不要开推理」。后端两个模式的代价差一个数量级（实测矫正调用
// 112～155 秒对 20～40 秒），所以这是每次提问都能改的开关，默认关。

// 开关住在提问卡片的控件那一排（.aw-paste-row）。2026-10-09 起这一排**只有**它：
// 「改为粘贴一段答案」已经删掉，粘贴只剩 A 框栏头那一个入口。三栏模式下 A 框栏头
// 那排控件（粘贴答案 / 选模型）会被搬到同一行，而且搬到开关**之前**——所以最终
// 读成「粘贴 / 模型 / 推理模式 + 提示」，小字留在最后。
{
  const rowStart = workspaceHtml.indexOf('<div class="aw-paste-row">');
  assert.ok(rowStart > 0, "the question card must still have its control row");
  const rowHtml = workspaceHtml.slice(rowStart, workspaceHtml.indexOf("</div>", workspaceHtml.indexOf('id="aw-reasoning-hint"')));
  assert.match(rowHtml, /id="aw-reasoning"/, "the reasoning switch must sit in that same row");
  assert.match(rowHtml, /id="aw-reasoning-hint"/, "the hint must sit next to the switch");
  // 搬家的目的地和顺序都要钉住：append 的话小字会夹在控件中间。
  assert.match(workspaceUiJs, /insertBefore\(refs\.reviewPanelTools, refs\.reasoningControl\)/, "relocated controls must land before the switch");
}
// A 框栏头那排不动：标题加两个控件已经是它放得下的全部。
{
  const toolsStart = workspaceHtml.indexOf('class="aw-panel-tools"');
  const toolsHtml = workspaceHtml.slice(toolsStart, workspaceHtml.indexOf("</header>", toolsStart));
  assert.match(toolsHtml, /id="aw-model"/, "the model select must stay in panel A's header");
  assert.doesNotMatch(toolsHtml, /id="aw-reasoning"/, "the switch must not crowd panel A's header");
}

// 它是一个开关，不是一个按钮：role=switch + aria-checked，而且默认关。
assert.match(workspaceHtml, /id="aw-reasoning"[^>]*role="switch"/, "reasoning control must be a switch");
assert.match(workspaceHtml, /id="aw-reasoning"[^>]*aria-checked="false"/, "reasoning must default to off in the markup");
assert.match(workspaceHtml, /id="aw-reasoning"[^>]*aria-describedby="aw-reasoning-hint"/, "the switch must point at its own hint");
// 提示默认藏着：关着的时候它说的那件事没有发生。
assert.match(workspaceHtml, /id="aw-reasoning-hint"[^>]*hidden/, "the hint must start hidden");

// 文案两套都在，而且中文就是用户给的那一句。
assert.match(workspaceUiJs, /reasoningMode: "Reasoning mode"/, "English switch label must exist");
assert.match(workspaceUiJs, /reasoningMode: "推理模式"/, "Chinese switch label must exist");
// 2026-10-10：推理加速后实测整题 85–98 秒，提示跟着改成「约 1.5 分钟」——提示里写
// 的那个时长是用户唯一的预期来源，和实测差一倍就是在误导。
assert.match(workspaceUiJs, /reasoningHint: "开启后更慢（约 1\.5 分钟），矫正可能更细。"/, "Chinese hint must be the agreed sentence");
assert.match(workspaceUiJs, /reasoningHint: "Slower when on \(about 1\.5 minutes\); the correction may be more detailed\."/, "English hint must exist");
assert.doesNotMatch(workspaceUiJs, /2-3 minutes|2–3 分钟/, "the pre-speedup duration must be gone from both languages");
// 文案走 data-i18n，不是写死的 textContent——否则切语言会把它刷回英文。
assert.match(workspaceHtml, /data-i18n="reasoningMode"/, "switch label must be translated via data-i18n");
assert.match(workspaceHtml, /data-i18n="reasoningHint"/, "hint must be translated via data-i18n");
// data-i18n 不能挂在按钮本身：applyStaticTranslations 会重设 textContent，
// 那会把状态点那个 span 一起抹掉。
assert.doesNotMatch(workspaceHtml, /id="aw-reasoning"[^>]*data-i18n=/, "data-i18n must sit on an inner span, not on the switch itself");

// localStorage 记住上次的选择，读写都包 try/catch（走既有的 safeLocalStorage*）。
assert.match(workspaceUiJs, /ANCHOR_REASONING_MODE/, "the choice must be remembered");
assert.match(workspaceUiJs, /safeLocalStorageSet\(REASONING_STORAGE_KEY/, "writing the choice must go through the guarded helper");
assert.match(workspaceUiJs, /safeLocalStorageGet\(REASONING_STORAGE_KEY\)/, "reading the choice must go through the guarded helper");
// 只有明确的 "on" 才算开：坏值/旧值的结果是关，不是悄悄替用户开了推理。
assert.match(workspaceUiJs, /setReasoningMode\(storedReasoningChoice\(\) === REASONING_ON\)/, "a stored junk value must mean off");

// 三栏里**不**标注模型或模式（用户明确要求）。
assert.doesNotMatch(anchorReviewCss, /reasoning/i, "the three-column view must not style a mode badge");
{
  const reviewStart = workspaceHtml.indexOf('id="aw-anchor-review"');
  assert.ok(reviewStart > 0, "the three-column section must exist");
  const reviewHtml = workspaceHtml.slice(reviewStart);
  assert.doesNotMatch(reviewHtml, /reasoning/i, "the three-column markup must not annotate the mode");
}

// 请求体：**总是**带 anchor_reasoning，而且是布尔。不发它等于「按服务端默认走」,
// 那会让一个关着的开关在服务端默认开推理时失效。
{
  const body = workspaceApi.buildChatBody({ question: "q" });
  assert.equal(body.anchor_reasoning, false, "an absent choice must be sent as an explicit false");
  assert.equal(workspaceApi.buildChatBody({ question: "q", anchorReasoning: true }).anchor_reasoning, true);
  assert.equal(workspaceApi.buildChatBody({ question: "q", anchorReasoning: false }).anchor_reasoning, false);
  // 只有真正的 true 算开——"true"、1、"on" 都不算，免得某处把字符串传进来就静默开了推理。
  for (const loose of ["true", 1, "on", {}]) {
    assert.equal(workspaceApi.buildChatBody({ question: "q", anchorReasoning: loose }).anchor_reasoning, false);
  }
}

// 浏览器的中断计时器要比后端给开推理那一次的预算（默认 300 秒）长，否则后端还在跑、
// 本地已经把请求掐了：用户看到「请求已取消」，而那笔钱照样花了。
assert.ok(workspaceApi.REASONING_REQUEST_TIMEOUT_MS > 300000, "the client must outwait the server's 300s reasoning budget");
assert.equal(workspaceApi.requestTimeoutMs(true), workspaceApi.REASONING_REQUEST_TIMEOUT_MS);
assert.equal(workspaceApi.requestTimeoutMs(false), workspaceApi.REQUEST_TIMEOUT_MS);
assert.equal(workspaceApi.requestTimeoutMs(undefined), workspaceApi.REQUEST_TIMEOUT_MS);
// 只剩流式一条路，它必须带上这个字段：不发等于「按服务端默认走」。
assert.match(workspaceUiJs, /requestStreamedChat\(\{[\s\S]{0,200}anchorReasoning/, "the streamed path must send the choice");
assert.match(workspaceUiJs, /Api\.requestTimeoutMs\(anchorReasoning\)/, "the abort timer must follow the chosen mode");

// 跑着的时候冻住：中途拨动它只会让界面说的和这一次实际用的模式不一样。
assert.match(workspaceUiJs, /refs\.reasoningSwitch\.disabled = running;/, "the switch must be frozen mid-run");

// 样式跟着并排那个按钮走：同一个 .aw-ghost-button 底子，开着时用和粘贴模式
// 同一套蓝色填充，只多一个状态点。
assert.match(workspaceHtml, /id="aw-reasoning"[^>]*class="aw-ghost-button aw-reasoning-switch"/, "the switch must reuse the ghost-button base");
assert.match(workspaceCss, /\.aw-reasoning-switch\[aria-checked="true"\] \{[^}]*--aw-blue-soft/, "the on state must use the same blue fill as paste mode");
assert.match(workspaceCss, /\.aw-reasoning-switch:disabled/, "the frozen state must be visible");
assert.match(workspaceCss, /\.aw-reasoning-hint/, "the hint must be styled");

// 这三个常量必须在模块作用域：initWorkspace 在声明位置之前就调用 setReasoningMode，
// 而 const 不提升——写在函数里会在初始化时抛 ReferenceError，整个工作台一个事件
// 都绑不上（页面看起来还在，但按钮全不响应）。这一条是实测踩出来的。
{
  const moduleScope = workspaceUiJs.slice(0, workspaceUiJs.indexOf("function initWorkspace"));
  assert.match(moduleScope, /const REASONING_STORAGE_KEY =/, "REASONING_STORAGE_KEY must be declared above initWorkspace");
  assert.match(moduleScope, /const REASONING_ON =/, "REASONING_ON must be declared above initWorkspace");
}

console.log("reasoning-mode switch checks passed");

// --------------------------------------------------------------------------
// 修改 2：粘贴模式只有一个入口 / 只走流式（2026-10-09）

// 提问框下方那个「改为粘贴一段答案」整个删掉了：两个按钮开同一个状态，是两处
// 都要记得翻的重复，而它们一旦不同步，界面说的和这一次实际走的路就不一样。
assert.doesNotMatch(html, /aw-paste-toggle/, "the second paste entry point must be gone from the page");
assert.doesNotMatch(workspaceUiJs, /pasteToggle/, "no code may still reach for the removed button");
// 它独有的那两个文案 key 也跟着走：留着就是一组没有任何元素会用到的译文。
assert.doesNotMatch(workspaceUiJs, /pasteToggle:|pasteCancel:/, "the removed button's copy keys must be gone");
// 活下来的那个还在 A 框栏头，而且仍然是 aria-expanded + 两套文案。
assert.match(workspaceHtml, /id="aw-paste-here"[^>]*aria-expanded="false"/, "the surviving button must carry the collapsed state");
assert.match(workspaceHtml, /id="aw-paste-here"[^>]*aria-controls="aw-paste-wrap"/, "the surviving button must point at the paste area");
{
  const toolsStart = workspaceHtml.indexOf('class="aw-panel-tools"');
  const toolsHtml = workspaceHtml.slice(toolsStart, workspaceHtml.indexOf("</header>", toolsStart));
  assert.match(toolsHtml, /id="aw-paste-here"/, "the paste button must stay in panel A's header");
}
// 粘贴状态现在就记在这个按钮上，没有第二个真相来源。
assert.match(workspaceUiJs, /function pasteModeOn\(\) \{\s*\n\s*return refs\.pasteHere\.getAttribute\("aria-expanded"\) === "true";/,
  "paste mode must be read off #aw-paste-here");
assert.match(workspaceUiJs, /refs\.pasteHere\.addEventListener\("click"/, "the surviving button must toggle paste mode");
assert.match(workspaceUiJs, /refs\.pasteHere\.dataset\.i18n = on \? "pasteHereCancel" : "pasteHere"/,
  "the label must switch through the i18n key, not a hardcoded string");
// 三栏模式下这个按钮会被搬到提问卡片那一排，所以两处的浅底样式都要在。
assert.match(workspaceCss, /\.aw-paste-row \.aw-panel-tools \.aw-panel-tool-button\[aria-expanded="true"\]/,
  "the relocated button must still show its on state on the light card");

// 只走流式。线上经 Cloudflare 访问时，一次性的 /api/chat 在等待超过约 100 秒会被
// 隧道切断，而开推理的一次要跑 2–3 分钟——那条路在线上必然失败。流式接口有心跳。
const loadedFrontendJs = `${workspaceApiJs}\n${workspaceAdapterJs}\n${workspaceStateJs}\n${workspaceExportJs}\n${workspaceUiJs}\n${anchorReviewJs}`;
assert.match(loadedFrontendJs, /"\/api\/chat\/stream"/, "the loaded frontend must request the streaming endpoint");
// 路径只以字符串字面量的形式出现（buildApiUrl 的第二个参数），所以这里找的是带引号的
// "/api/chat"。注释里提到它是**解释为什么没有它**，不算一次请求。
assert.doesNotMatch(loadedFrontendJs, /["'`]\/api\/chat["'`]/,
  "the loaded frontend must not request the one-shot chat endpoint any more");
assert.doesNotMatch(loadedFrontendJs, /requestJsonChat|JSON_CHAT_PATH/, "the one-shot client must be gone");
assert.equal(typeof workspaceApi.requestJsonChat, "undefined", "the one-shot client must not be exported");
assert.equal(workspaceApi.JSON_CHAT_PATH, undefined, "the one-shot path must not be exported");
// 流式客户端直接返回 final 那一包，不再是 { fallback, payload }。
assert.doesNotMatch(workspaceApiJs, /fallback: true/, "requestStreamedChat must not signal a fallback any more");
assert.match(workspaceApiJs, /return finalPayload;/, "requestStreamedChat must return the final payload directly");
assert.doesNotMatch(workspaceUiJs, /streamed\.fallback|streamed\.payload/, "the UI must not branch on a fallback any more");

// 拿不到流时给的是一条说清了原因的错误，中英文都有，而不是一个光秃秃的 HTTP 码。
assert.match(workspaceApiJs, /STREAM_UNAVAILABLE: \{/, "an explicit error code must exist for a missing stream");
assert.equal(workspaceApi.buildErrorInfo("STREAM_UNAVAILABLE", 404, null).retryable, true,
  "a missing stream must be retryable");
assert.match(workspaceApi.buildErrorInfo("STREAM_UNAVAILABLE", 404, null).message, /\/api\/chat\/stream/,
  "the English message must name the endpoint that is missing");
// 404/405（后端没这个路由）和「200 但不是 NDJSON」（中间被缓冲掉）都走这个码。
assert.equal(workspaceApiJs.match(/buildErrorInfo\("STREAM_UNAVAILABLE"/g).length, 2,
  "both the missing-route and the not-NDJSON case must report it");
assert.match(workspaceUiJs, /errorStreamUnavailable: "The streaming endpoint/, "English copy must exist");
assert.match(workspaceUiJs, /errorStreamUnavailable: "流式接口没有返回事件流/, "Chinese copy must exist");
assert.match(workspaceUiJs, /renderInlineError\(localizedErrorMessage\(info\)\)/,
  "the inline error must go through the localised lookup");
// 没有译文的错误码照原样显示英文：把一条说清了原因的错误换成一句通用的中文提示
// 是把信息丢掉。这一条钉住那个兜底分支。
assert.match(workspaceUiJs, /return \(info && info\.message\) \|\| "";/, "codes without a translation must keep their own message");

// 请求超时不变：浏览器这一侧必须比后端给开推理那一次的预算更长。
assert.equal(workspaceApi.REASONING_REQUEST_TIMEOUT_MS, 330000, "the reasoning timeout must stay at 330s");

console.log("paste-entry + stream-only checks passed");

// --------------------------------------------------------------------------
// 修改 3：A 边生成边显示 / Ⓑ·Ⓒ 占位与进度（2026-10-10 提速）

// 1) 新事件 raw_answer_delta 被识别，按顺序拼接；完整的 raw_answer 一到就覆盖。
//    keepalive.data.phase 带了就用来更新进度，不带照旧忽略；认不出的事件照旧忽略。
{
  const events = [
    { event: "stage", data: { query_id: "q1", stage: "raw_generation" } },
    { event: "raw_answer_delta", data: { query_id: "q1", text: "Azithromycin " } },
    { event: "raw_answer_delta", data: { query_id: "q1", text: "reduces exacerbations" } },
    // 不认识的事件照旧忽略：解析链是「认识的才处理」，所以后端加事件不会弄坏老前端。
    { event: "some_future_event", data: { whatever: true } },
    { event: "raw_answer", data: { query_id: "q1", raw_answer: { text: "Azithromycin reduces exacerbations.", model: "m" } } },
    { event: "keepalive", data: { query_id: "q1", phase: "ncbi" } },
    { event: "stage", data: { query_id: "q1", stage: "correction" } },
    { event: "final", data: { query_id: "q1", question: "q" } },
  ];
  const ndjson = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(ndjson, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
  const seen = { deltas: [], raw: null, stages: [], keepalives: [] };
  try {
    const payload = await workspaceApi.requestStreamedChat({
      apiBase: "http://127.0.0.1:1",
      question: "q",
      onStage: (stage) => seen.stages.push(stage),
      onRawAnswerDelta: (text) => seen.deltas.push(text),
      onRawAnswer: (rawAnswer) => { seen.raw = rawAnswer; },
      onKeepalive: (data) => seen.keepalives.push(data.phase),
    });
    assert.deepEqual(seen.deltas, ["Azithromycin ", "reduces exacerbations"], "deltas must arrive in order");
    assert.equal(seen.raw.text, "Azithromycin reduces exacerbations.", "the full raw_answer must still be delivered");
    assert.deepEqual(seen.stages, ["raw_generation", "correction"], "stage events must keep working alongside the deltas");
    assert.deepEqual(seen.keepalives, ["ncbi"], "a keepalive phase must be surfaced when the server sends one");
    assert.equal(payload.query_id, "q1", "the final payload must still be what the call returns");
  } finally {
    globalThis.fetch = originalFetch;
  }
}
// 一个没有回调的调用者（比如还没接线的旧代码）不能因为新事件而炸：两个新分支都
// 守了回调存在。
assert.match(workspaceApiJs, /name === "raw_answer_delta" && options\.onRawAnswerDelta/,
  "the delta branch must be guarded by its callback");
assert.match(workspaceApiJs, /name === "keepalive" && options\.onKeepalive/,
  "the keepalive branch must be guarded by its callback");
// 空的 text 不往上传：后端合并事件时偶尔会发一个空串，那不是一次「A 又长了一点」。
assert.match(workspaceApiJs, /typeof data\.text === "string" && data\.text/, "an empty delta must not be forwarded");

// 2) 状态层：按顺序拼接、完整的 raw_answer 覆盖、认不出的阶段不把进度抹掉。
{
  let state = workspaceState.startRun(workspaceState.createInitialState(), "q", "2026-10-10T00:00:00Z");
  assert.equal(state.streamingAnswer, "", "a new run must start with nothing stitched");
  assert.equal(workspaceState.liveAnswerText(state), "", "nothing stitched means nothing to show");

  state = workspaceState.appendRawAnswerDelta(state, "Azithromycin ");
  state = workspaceState.appendRawAnswerDelta(state, "reduces ");
  state = workspaceState.appendRawAnswerDelta(state, "exacerbations");
  assert.equal(state.streamingAnswer, "Azithromycin reduces exacerbations", "deltas must concatenate in order");
  assert.equal(workspaceState.liveAnswerText(state), "Azithromycin reduces exacerbations");

  // 空串 / 非字符串不动状态：为它克隆一次状态并重画一次 Ⓐ 栏没有意义。
  for (const junk of ["", null, undefined, 7, {}]) {
    assert.equal(workspaceState.appendRawAnswerDelta(state, junk), state, "a junk delta must leave the state identical");
  }

  // 覆盖：完整的 raw_answer 到了之后，显示以它为准，拼接结果作废。
  const full = { text: "Azithromycin reduces exacerbations (HR 0.73).", model: "m" };
  const after = workspaceState.receiveRawAnswer(state, full);
  assert.equal(after.streamingAnswer, "", "the stitched text must be dropped once the full answer arrives");
  assert.equal(workspaceState.liveAnswerText(after), full.text, "the full raw_answer must win");
  // 拼出来的那一份不能再从任何地方渗回来。
  assert.ok(!workspaceState.liveAnswerText(after).startsWith("Azithromycin reduces exacerbations("),
    "the two versions must not be concatenated");

  // 清空重来时拼接结果也要跟着走：留着它，下一题开头会先闪一下上一题的原话。
  assert.equal(workspaceState.clearRun().streamingAnswer, "");
  assert.equal(workspaceState.startRun(after, "q2", "2026-10-10T00:01:00Z").streamingAnswer, "");
}

// 三步进度：后端的 stage 和 keepalive.phase 都归到约定的三步上。
assert.equal(workspaceState.progressPhase("retrieval"), "retrieval");
assert.equal(workspaceState.progressPhase("claim_retrieval"), "retrieval");
assert.equal(workspaceState.progressPhase("claim_extraction"), "retrieval");
assert.equal(workspaceState.progressPhase("verification"), "ncbi");
assert.equal(workspaceState.progressPhase("ncbi"), "ncbi");
assert.equal(workspaceState.progressPhase("correction"), "correction");
assert.equal(workspaceState.progressPhase("CORRECTION"), "correction", "the mapping must not care about case");
// 三步以外的一律空：raw_generation 时 Ⓑ/Ⓒ 还没开始，accepted / 没见过的阶段不该被
// 硬塞进三步里的某一步。
for (const other of ["raw_generation", "accepted", "verification_skipped", "", null, "whatever"]) {
  assert.equal(workspaceState.progressPhase(other), "", `${other} must not be forced into one of the three steps`);
}
{
  let state = workspaceState.recordStage(workspaceState.startRun(workspaceState.createInitialState(), "q"), "retrieval");
  assert.equal(state.livePhase, "retrieval", "a stage event must move the displayed step");
  state = workspaceState.recordStage(state, "verification");
  assert.equal(state.livePhase, "ncbi");
  // 认不出的阶段保留上一步：把「正在核验引用」换成空白，看起来像进度退回去了，
  // 而后端其实什么都没变。
  state = workspaceState.recordStage(state, "something_new");
  assert.equal(state.livePhase, "ncbi", "an unknown stage must keep the step already on screen");
  assert.equal(workspaceState.setLivePhase(state, "nonsense"), state, "an unknown keepalive phase must not clone the state");
  assert.equal(workspaceState.setLivePhase(state, "ncbi"), state, "the same phase twice must not clone the state");
  assert.equal(workspaceState.setLivePhase(state, "correction").livePhase, "correction");
}

// 3) 接线：delta 只重画三栏，不走 renderAll —— 这期间每 ~150ms 就来一个事件，
//    一次 renderAll 会把整页（面板、筛选器、审计表）全部重建。
{
  const handler = workspaceUiJs.slice(
    workspaceUiJs.indexOf("onRawAnswerDelta: (chunk) =>"),
    workspaceUiJs.indexOf("onKeepalive: (data) =>"));
  assert.match(handler, /State\.appendRawAnswerDelta\(state, chunk\)/, "the delta must go through the state layer");
  assert.match(handler, /renderAnchorReview\(\)/, "a delta must repaint the columns");
  assert.doesNotMatch(handler, /renderAll\(\)/, "a delta must not repaint the whole page");
}
assert.match(workspaceUiJs, /onKeepalive: \(data\) => \{[\s\S]{0,260}State\.setLivePhase\(state, data && data\.phase\)/,
  "the keepalive phase must go through the state layer");
// stage 和 raw_answer 也要重画三栏：一个管进度文案，一个管「用完整版覆盖 Ⓐ」。
assert.match(workspaceUiJs, /onStage: \(stage\) => \{[\s\S]{0,400}renderAnchorReview\(\)/, "a stage event must refresh the progress line");
assert.match(workspaceUiJs, /onRawAnswer: \(rawAnswer\) => \{[\s\S]{0,400}renderAnchorReview\(\)/, "the full answer must repaint the columns");

// 三栏在 final 之前就摆出来，但只在跑着的时候：跑完/失败后三栏在不在由响应里有没有
// anchor_review 决定（否则一次失败的运行会留下一个空壳三栏）。
assert.match(workspaceUiJs, /function reviewPreviewOn\(\) \{[\s\S]{0,300}state\.status === "running" && Boolean\(State\.liveAnswerText\(state\)\)/,
  "the skeleton must appear as soon as A has text, and only while the run is live");
assert.match(workspaceUiJs, /if \(!review && reviewPreviewOn\(\)\) \{\s*\n\s*setReviewActive\(true\);\s*\n\s*renderReviewPreview\(\);/,
  "renderAnchorReview must take the preview path before falling back to the workbench");
// Ⓐ 的流式文本走的是和 final 之后同一条路径：parseAnswer → 段落结构 → textContent。
// 这条规矩（不把模型输出交给 innerHTML）必须覆盖流式这一路。
assert.match(workspaceUiJs, /renderReviewProse\(refs\.reviewTextA, Review\.parseAnswer\(State\.liveAnswerText\(state\), \[\]\)/,
  "the streaming A column must render through the escaping-free structure path");
assert.doesNotMatch(workspaceUiJs, /\.innerHTML|insertAdjacentHTML/, "no path may hand model text to innerHTML");
// 模型名要等完整的 raw_answer 才知道，在那之前用不点名模型的标题，而不是拿下拉框
// 里选的那个去猜（粘贴模式下根本没有模型写 A）。
assert.match(workspaceUiJs, /function renderReviewPreview\(\)[\s\S]{0,700}t\("reviewTitleAUnknownModel"\)/,
  "the preview must not name a model it has not been told about");

// 占位期间 Ⓑ/Ⓒ 的正式内容全部让位，「修订 ⇄ 净版」也收起来：此刻切过去两边都是空的。
assert.match(workspaceUiJs, /function setReviewPending\(on\) \{[\s\S]{0,600}refs\.reviewCorr\.hidden = on;/,
  "the corrected prose must stand down while the placeholder is up");
assert.match(workspaceUiJs, /function setReviewPending\(on\) \{[\s\S]{0,600}refs\.reviewAuditContent\.hidden = on;/,
  "the audit content must stand down while the placeholder is up");
assert.match(workspaceUiJs, /function setReviewPending\(on\) \{[\s\S]{0,600}refs\.reviewSlide\.hidden = on;/,
  "the track/clean switch must stand down while there is no correction yet");
// 占位必须撤干净，不管接下来画不画三栏：留着它，下一次运行一开始会先闪一下上一次的
// 「正在核验…」。
assert.match(workspaceUiJs, /setReviewPending\(false\);\s*\n\s*if \(!review\) return;/,
  "the placeholder must be cleared even when no review follows");
// 等高内滚在占位期间让开：对到最短那栏（占位块）就是把正在长出来的 Ⓐ 关进一个
// 460px 的框里滚，而这段时间屏幕上唯一在动的就是它。
assert.match(workspaceUiJs, /if \(!reviewActive \|\| reviewPending \|\| window\.innerWidth <= 1100/,
  "equalising must stand down while the columns are a placeholder");
// 占位块的结构在 HTML 里，JS 只刷步骤那一行：每个 delta 重建一次节点的话，骨架
// 动画会一次次从头开始闪。
assert.match(workspaceUiJs, /function renderReviewProgress\(\) \{[\s\S]{0,400}querySelector\("\.v7-pending-step"\)/,
  "only the step line may be rewritten on each event");
assert.doesNotMatch(workspaceUiJs, /replaceChildren\(refs\.reviewPendingB\)/, "the placeholder must not be rebuilt per event");

// 4) 文案：三步中英两套，中文就是约定里的那三句。
for (const key of ["reviewPendingTitle", "reviewProgressStarting", "reviewProgressRetrieval",
  "reviewProgressCitations", "reviewProgressCorrection", "reviewStreamingAria"]) {
  assert.equal((workspaceUiJs.match(new RegExp(`\\n\\s+${key}:`, "g")) || []).length, 2,
    `${key} must exist in both languages`);
}
assert.match(workspaceUiJs, /reviewProgressRetrieval: "正在检索证据"/, "Chinese retrieval step must match the agreed wording");
assert.match(workspaceUiJs, /reviewProgressCitations: "正在核验引用"/, "Chinese citation step must match the agreed wording");
assert.match(workspaceUiJs, /reviewProgressCorrection: "正在矫正"/, "Chinese correction step must match the agreed wording");
assert.match(workspaceUiJs, /reviewPendingTitle: "正在核验…"/, "Chinese placeholder title must match the agreed wording");
assert.match(workspaceUiJs, /reviewProgressRetrieval: "Searching evidence"/, "English retrieval step must exist");
assert.match(workspaceUiJs, /reviewProgressCitations: "Checking citations"/, "English citation step must exist");
assert.match(workspaceUiJs, /reviewProgressCorrection: "Applying corrections"/, "English correction step must exist");
// 三步的译文由 reviewProgressLabel 按 livePhase 选，不是写死的字符串。
assert.match(workspaceUiJs, /function reviewProgressLabel\(\) \{[\s\S]{0,400}state\.livePhase === "retrieval"/,
  "the step line must be chosen by the live phase");

// 5) 占位块的骨架在 HTML 里，默认藏着，标题走 data-i18n（切语言才不会被刷回英文），
//    role=status 让读屏跟得上步骤变化。
for (const id of ["awv7-b-pending", "awv7-c-pending"]) {
  const start = workspaceHtml.indexOf(`id="${id}"`);
  assert.ok(start > 0, `${id} must exist in the review columns`);
  const block = workspaceHtml.slice(start, workspaceHtml.indexOf("</div>", workspaceHtml.indexOf("v7-skel", start)));
  assert.match(block, /role="status"/, `${id} must announce itself to a screen reader`);
  assert.match(block, /aria-live="polite"/, `${id} must announce step changes`);
  assert.match(block, /hidden/, `${id} must start hidden`);
  assert.match(block, /data-i18n="reviewPendingTitle"/, `${id} must translate its title through data-i18n`);
  assert.match(block, /class="v7-pending-step"/, `${id} must carry the step line`);
  assert.equal((block.match(/v7-skel-line/g) || []).length, 3, `${id} must carry the three skeleton bars`);
}
// 让位的那三块各有一个 id/ref，否则「隐藏正式内容」只能靠类名猜。
assert.match(workspaceHtml, /id="awv7-b-corr"/, "the corrected prose wrapper must be addressable");
assert.match(workspaceHtml, /id="awv7-c-content"/, "the audit content wrapper must be addressable");
assert.match(workspaceHtml, /id="awv7-b-slide"/, "the track/clean switch must be addressable");

// 6) 样式：光标、占位块、骨架条，以及关掉动画的人照样看得出这几处在等。
assert.match(anchorReviewCss, /\.v7-stream-caret \{[\s\S]*animation: awv7-caret/, "the streaming caret must blink");
assert.match(anchorReviewCss, /\.v7-pending \{/, "the placeholder must be styled");
// [hidden] 只给一条 UA 的 display:none，作者样式表里任何一条 display 都会盖掉它 ——
// .v7-slide-ctl 的 inline-flex 就把它盖掉了，占位期间开关照样留在 Ⓑ 栏头上。
// 这一条是看截图发现的，不是断言发现的。
assert.match(anchorReviewCss, /#aw-anchor-review \[hidden\] \{ display: none !important; \}/,
  "hiding inside the review section must survive the section's own display rules");
assert.match(anchorReviewCss, /\.v7-pending-step \{/, "the step line must be styled");
assert.match(anchorReviewCss, /\.v7-skel-line \{[\s\S]*animation: awv7-shimmer/, "the skeleton bars must shimmer");
{
  const reduced = anchorReviewCss.slice(anchorReviewCss.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(reduced.length > 0, "reduced motion must be honoured");
  for (const selector of ["v7-stream-caret", "v7-pending-dot", "v7-skel-line"]) {
    assert.ok(reduced.includes(selector), `${selector} must stop animating under reduced motion`);
  }
  assert.match(reduced, /animation: none/, "reduced motion must switch the animations off, not just slow them");
}

// 7) 缓存戳跟着这一轮改动走，否则浏览器会拿旧的 js 配新的 html。
assert.match(html, /\?v=20261010-speed/, "this round's assets must carry the new cache stamp");
// 浏览器的中断计时器不变：后端给开推理那一次的预算（300 秒）没改，只是实际跑得更快了。
assert.equal(workspaceApi.REASONING_REQUEST_TIMEOUT_MS, 330000, "the reasoning abort timer must stay at 330s");

console.log("streaming A + pending-columns checks passed");

// anchor_v6 的 stage 名要能推进进度提示（2026-10-10 实测：一直停在「正在启动核验流程」）。
{
  const stateSrc = readFileSync(new URL("../workspace-state.js", import.meta.url), "utf8");
  assert.match(stateSrc, /anchor_v6_correction:\s*"retrieval"/, "anchor_v6_correction must map to the retrieval step");
  console.log("anchor_v6 progress alias checks passed");
}
