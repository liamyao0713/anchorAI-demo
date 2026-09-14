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
assert.doesNotMatch(workspaceHtml, /--v7-panel-body-height|v7-col-body|setModel\(|setPage\(/, "workspace entry must not include legacy static demo behavior");
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

const workspaceBundle = `${workspaceCss}\n${workspaceApiJs}\n${workspaceAdapterJs}\n${workspaceStateJs}\n${workspaceExportJs}\n${workspaceUiJs}`;
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
assert.equal(vm.metrics.correctedClaims, 2);
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
