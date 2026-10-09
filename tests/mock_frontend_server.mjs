import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
// 后端 anchor_v6 还没起来时也要能看三栏：这份样例照合约手写，内容改写自历史
// docs/demo_v6_inputs 与 v40 页面。问题里带 "anchor review" 就返回它。
const anchorReviewFixture = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/anchor_review_sample.json"), "utf8"));
// 回放一份抓下来的真实响应：ANCHOR_MOCK_RESPONSE=<file> 时所有 /api/chat 都返回它。
// 用处是对着真后端的输出看渲染，而不必为每一次看一眼再付一次 LLM 的钱。
const replayPath = process.env.ANCHOR_MOCK_RESPONSE || "";
const replayBody = replayPath ? JSON.parse(readFileSync(resolve(root, replayPath), "utf8")) : null;
const port = Number(process.env.PORT || 8090);
// 提速那一轮（2026-10-10）要看的东西只有「时间上的顺序」：Ⓐ 一段一段出现、Ⓑ/Ⓒ 占位
// 并换进度文案、final 之后三栏完整。所以这两个间隔可调——截图时放慢，自动跑时调快。
const deltaIntervalMs = Number(process.env.ANCHOR_MOCK_DELTA_MS || 150);
const stepIntervalMs = Number(process.env.ANCHOR_MOCK_STEP_MS || 700);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, { status: "ok", service: "anchor-ai" });
    return;
  }

  if (request.method === "GET" && request.url === "/ready") {
    sendJson(response, {
      status: "ready",
      dependencies: {
        database: "ok",
        retrieval: "ok",
        llm: "configured",
        configuration: "ok",
      },
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/chat/stream") {
    const requestBody = await consumeRequest(request);
    logChatRequest(requestBody);
    const mockResponse = mockChatResponse(requestBody);
    if (mockResponse.status !== 200) {
      sendJson(response, mockResponse.body, mockResponse.status);
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    });
    // 问题里带 "anchor stream" 就走分段发 A 的那一套；其余照旧一口气发完。
    // 再带上 "error" 的话，A 发完之后发 error 而不是 final —— 用来看「A 已经显示在
    // 三栏里了，这一次却失败了」时页面退回什么样子。
    const streamQuestion = parseQuestion(requestBody);
    if (/anchor stream/i.test(streamQuestion)) {
      await sendDeltaStream(response, mockResponse.body, /error/i.test(streamQuestion));
      response.end();
      return;
    }
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "accepted" });
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "raw_generation" });
    await sendStreamEvent(response, "raw_answer", { query_id: "mock-query-id", raw_answer: mockResponse.body.raw_answer });
    if (mockResponse.delayMs) await delay(mockResponse.delayMs);
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "retrieval" });
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "claim_extraction" });
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "verification" });
    await sendStreamEvent(response, "stage", { query_id: "mock-query-id", stage: "correction" });
    await sendStreamEvent(response, "final", mockResponse.body);
    response.end();
    return;
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    const requestBody = await consumeRequest(request);
    logChatRequest(requestBody);
    const mockResponse = mockChatResponse(requestBody);
    if (mockResponse.delayMs) await delay(mockResponse.delayMs);
    sendJson(response, mockResponse.body, mockResponse.status);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  const pathname = new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname;
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolvedPath = normalize(join(root, relativePath));

  if (!resolvedPath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(resolvedPath)) || "application/octet-stream",
      "Content-Length": fileStat.size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(resolvedPath).pipe(response);
  } catch (_error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock frontend server listening on http://127.0.0.1:${port}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  server.close(() => process.exit(0));
}

function consumeRequest(request) {
  return new Promise((resolveRequest) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolveRequest(body));
    request.on("error", () => resolveRequest(body));
  });
}

function mockChatResponse(requestBody) {
  const question = parseQuestion(requestBody);
  if (replayBody) return okResponse({ ...replayBody, question });
  const rawAnswer = {
    text: "Raw mock answer\n\nMock claim. Mock claim needing weaker wording.",
    provider: "mock-provider",
    model: "mock-model",
    grounded_by_anchor: false,
    verification_status: "uncorrected",
  };
  if (/status400/i.test(question)) {
    return errorResponse(400, "INVALID_REQUEST", "Traceback at /Users/private/server.py");
  }
  if (/status422/i.test(question)) {
    return errorResponse(422, "VALIDATION_ERROR", "Validation failed for request body.");
  }
  if (/status429/i.test(question)) {
    return errorResponse(429, "RATE_LIMITED", "Too many requests.");
  }
  if (/status500/i.test(question)) {
    return errorResponse(500, "INTERNAL_ERROR", "Traceback at /Users/private/app.py");
  }
  if (/status502/i.test(question)) {
    return errorResponse(502, "UPSTREAM_UNAVAILABLE", "Upstream failed.");
  }
  if (/status503/i.test(question)) {
    return errorResponse(503, "UPSTREAM_UNAVAILABLE", "Service unavailable.");
  }
  if (/llm unavailable/i.test(question)) {
    return errorResponse(502, "LLM_UNAVAILABLE", "Base LLM unavailable.");
  }
  if (/llm timeout/i.test(question)) {
    return errorResponse(503, "LLM_TIMEOUT", "Base LLM timed out.");
  }
  if (/slow/i.test(question)) {
    return {
      ...okResponse(successBody(question, rawAnswer)),
      delayMs: 8000,
    };
  }
  if (/database unavailable|retrieval unavailable|calibration unavailable/i.test(question)) {
    return okResponse({
      ...baseResponse(question, rawAnswer),
      corrected_answer: {
        text: "Anchor calibration is currently unavailable.",
        evidence_status: "unavailable",
      },
      claims: [],
      corrections: [],
      citations: [],
      audit: {
        raw_answer_preserved: true,
        correction_performed: false,
        evidence_status: "unavailable",
        notes: ["mocked unavailable browser test"],
      },
    });
  }
  if (/insufficient/i.test(question)) {
    return okResponse({
      ...baseResponse(question, rawAnswer),
      corrected_answer: {
        text: "Anchor 当前知识库中没有足够证据完成可靠核验/矫正。",
        evidence_status: "insufficient",
      },
      claims: [
        {
          claim_id: "claim-1",
          text: "Mock claim without enough Anchor evidence",
          type: "medical_fact",
          evidence_ids: [],
          verification_status: "not_verifiable",
          supporting_evidence_ids: [],
          conflicting_evidence_ids: [],
        },
      ],
      corrections: [],
      citations: [],
      audit: {
        raw_answer_preserved: true,
        correction_performed: false,
        evidence_status: "insufficient",
        notes: ["mocked insufficient browser test"],
      },
    });
  }
  if (/anchor review|anchor stream/i.test(question)) {
    return okResponse({ ...anchorReviewFixture, question });
  }
  if (/anchor fallback/i.test(question)) {
    // 校正未完成：照合约 b_track = b_clean = A 原文，cards 可空，引用核验表仍然给出。
    const review = anchorReviewFixture.anchor_review;
    return okResponse({
      ...anchorReviewFixture,
      question,
      anchor_review: {
        ...review,
        completed: false,
        fallback_reason: "LLM correction returned invalid JSON; Anchor fell back to the raw answer.",
        b_track: review.a_text,
        b_clean: review.a_text,
        cards: [],
        references: [],
        validation: { minimal_diff_ok: false, pmid_whitelist_ok: true, issues: ["llm_json_invalid"] },
      },
    });
  }
  return okResponse(successBody(question, rawAnswer));
}

function successBody(question, rawAnswer) {
  return {
    ...baseResponse(question, rawAnswer),
    corrected_answer: {
      text: "Corrected mock answer. Mock claim is supported [1]. Mock claim may be appropriate in selected patients [2].",
      evidence_status: "sufficient",
    },
    claims: [
      {
        claim_id: "claim-1",
        text: "Mock claim",
        type: "medical_fact",
        evidence_ids: ["EV_1"],
        verification_status: "supported",
        supporting_evidence_ids: ["EV_1"],
        conflicting_evidence_ids: [],
      },
      {
        claim_id: "claim-2",
        text: "Mock claim needing weaker wording",
        type: "medical_fact",
        evidence_ids: ["EV_2"],
        verification_status: "partially_supported",
        supporting_evidence_ids: ["EV_2"],
        conflicting_evidence_ids: [],
      },
    ],
    corrections: [
      {
        correction_id: "correction-1",
        original_claim: "Mock claim",
        corrected_claim: "Mock claim",
        verification_status: "supported",
        supporting_evidence_ids: ["EV_1"],
        conflicting_evidence_ids: [],
        correction_reason: "Supported by Anchor evidence.",
        citation_ids: ["citation-1"],
      },
      {
        correction_id: "correction-2",
        original_claim: "Mock claim needing weaker wording",
        corrected_claim: "Mock claim may be appropriate in selected patients.",
        verification_status: "partially_supported",
        supporting_evidence_ids: ["EV_2"],
        conflicting_evidence_ids: [],
        correction_reason: "Anchor evidence supports a narrower statement.",
        citation_ids: ["citation-2"],
      },
    ],
    citations: [
      {
        citation_id: "citation-1",
        evidence_id: "EV_1",
        title: "Mock evidence",
        source: "Anchor KB",
        pmid: "12345678",
        doi: null,
      },
      {
        citation_id: "citation-2",
        evidence_id: "EV_2",
        title: "Mock evidence 2",
        source: "Anchor KB",
        pmid: null,
        doi: "10.1000/mock",
      },
    ],
    audit: {
      raw_answer_preserved: true,
      correction_performed: true,
      evidence_status: "sufficient",
      notes: ["mocked browser test"],
    },
  };
}

function okResponse(body) {
  return { status: 200, body };
}

function errorResponse(status, code, message) {
  return {
    status,
    body: {
      error: {
        code,
        message,
        query_id: "mock-query-id",
      },
    },
  };
}

function baseResponse(question, rawAnswer) {
  return {
    query_id: "mock-query-id",
    question,
    raw_answer: rawAnswer,
    confidence: null,
    latency_ms: 12,
  };
}

// 把**浏览器真的发出来**的那个字段打到日志里。看界面只能看出开关反应了，
// 看不出请求体里到底带了什么——而带没带才是这个开关唯一的作用。
function logChatRequest(requestBody) {
  let anchorReasoning = "<unparsable>";
  // 粘贴模式同理：按钮翻成「取消粘贴」只说明它自己翻了，说明不了请求体里带没带
  // 那段文字——而带没带才是粘贴模式唯一的作用。
  let rawAnswer = "<unparsable>";
  try {
    const payload = JSON.parse(requestBody || "{}");
    anchorReasoning = JSON.stringify(payload.anchor_reasoning);
    rawAnswer = typeof payload.raw_answer === "string" ? `${payload.raw_answer.length} chars` : "<absent>";
  } catch (_error) {
    /* 记下 <unparsable> 就够了 */
  }
  console.log(`mock_chat_request anchor_reasoning=${anchorReasoning} raw_answer=${rawAnswer}`);
}

function parseQuestion(requestBody) {
  try {
    const payload = JSON.parse(requestBody || "{}");
    return String(payload.question || "mock question");
  } catch (_error) {
    return "mock question";
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

// A 边生成边推的模拟流：raw_answer_delta 分段发，中途夹 stage 与带 phase 的
// keepalive，最后才是完整的 raw_answer 与 final。发送节奏照约定里那句「可合并成每
// ~150 ms 或每 ~200 字一次」。
async function sendDeltaStream(response, body, failAfterA) {
  const queryId = String(body.query_id || "mock-query-id");
  const text = String((body.raw_answer && body.raw_answer.text) || "");
  await sendStreamEvent(response, "stage", { query_id: queryId, stage: "accepted" });
  await sendStreamEvent(response, "stage", { query_id: queryId, stage: "raw_generation" });
  const chunkSize = Math.max(1, Math.ceil(text.length / 12));
  for (let at = 0; at < text.length; at += chunkSize) {
    await delay(deltaIntervalMs);
    await sendStreamEvent(response, "raw_answer_delta", { query_id: queryId, text: text.slice(at, at + chunkSize) });
  }
  await delay(deltaIntervalMs);
  // 完整的那一份照旧发，前端用它覆盖拼接结果。
  await sendStreamEvent(response, "raw_answer", { query_id: queryId, raw_answer: body.raw_answer });
  if (failAfterA) {
    await delay(stepIntervalMs);
    await sendStreamEvent(response, "error", {
      query_id: queryId,
      http_status: 500,
      error: { code: "INTERNAL_ERROR", message: "mocked failure after the raw answer", query_id: queryId },
    });
    return;
  }
  const steps = [
    ["retrieval", "retrieval"],
    ["claim_extraction", "retrieval"],
    ["verification", "ncbi"],
    ["correction", "correction"],
  ];
  for (const [stage, phase] of steps) {
    await delay(stepIntervalMs);
    await sendStreamEvent(response, "stage", { query_id: queryId, stage });
    // 心跳带 phase 是**可选**的，这里带上，好把前端那条路也走一遍。
    await sendStreamEvent(response, "keepalive", { query_id: queryId, phase });
  }
  await delay(stepIntervalMs);
  await sendStreamEvent(response, "final", body);
}

function sendStreamEvent(response, event, data) {
  return new Promise((resolve) => {
    response.write(`${JSON.stringify({ event, data })}\n`, resolve);
  });
}

function sendJson(response, payload, status = 200) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}
