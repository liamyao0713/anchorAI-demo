(function () {
  "use strict";

  const DEFAULT_API_BASE_URL = "https://api.882498.xyz";
  const API_STORAGE_KEY = "ANCHOR_API_BASE_URL";
  const MODELS_PATH = "/api/models";
  const REQUEST_TIMEOUT_MS = 180000;
  // 开了推理模式的那一次要等更久：后端给这种请求的总预算是
  // ANCHOR_V6_REASONING_REQUEST_TIMEOUT_SECONDS（默认 300 秒）。浏览器这一侧的
  // 中断计时器必须比它**长**，否则后端还在跑、本地已经把请求掐了——用户看到的是
  // 「请求已取消」，而服务端那边照样花了钱。30 秒余量留给网络和隧道。
  const REASONING_REQUEST_TIMEOUT_MS = 330000;
  const JSON_CHAT_PATH = "/api/chat";
  const STREAM_CHAT_PATH = "/api/chat/stream";
  const HEALTH_PATH = "/health";
  const READY_PATH = "/ready";
  const STREAM_MEDIA_TYPE = "application/x-ndjson";

  const ERROR_DEFINITIONS = {
    INVALID_REQUEST: {
      message: "The question could not be processed. Please edit it and try again.",
      retryable: true,
    },
    VALIDATION_ERROR: {
      message: "The request did not match the API schema. Please edit the question and retry.",
      retryable: true,
    },
    RATE_LIMITED: {
      message: "Too many requests. Wait briefly, then retry.",
      retryable: true,
    },
    LLM_UNAVAILABLE: {
      message: "Base LLM is unavailable. Raw Answer could not be generated.",
      retryable: true,
    },
    LLM_TIMEOUT: {
      message: "The request timed out before the pipeline finished.",
      retryable: true,
    },
    DATABASE_UNAVAILABLE: {
      message: "Anchor calibration data is temporarily unavailable.",
      retryable: true,
    },
    RETRIEVAL_UNAVAILABLE: {
      message: "Anchor evidence retrieval is temporarily unavailable.",
      retryable: true,
    },
    API_OFFLINE: {
      message: "Anchor API is unreachable from this browser.",
      retryable: true,
    },
    INVALID_API_BASE_URL: {
      message: "API Base URL is invalid. Use an http or https URL.",
      retryable: false,
    },
    CANCELLED: {
      message: "The request was cancelled.",
      retryable: true,
    },
    SERVER_ERROR: {
      message: "Anchor API returned a server error. Please retry.",
      retryable: true,
    },
    UPSTREAM_UNAVAILABLE: {
      message: "Anchor API dependency is temporarily unavailable.",
      retryable: true,
    },
    INTERNAL_ERROR: {
      message: "Anchor API returned an internal error.",
      retryable: true,
    },
    INVALID_JSON: {
      message: "Anchor API returned a response that could not be parsed.",
      retryable: true,
    },
    SCHEMA_MISMATCH: {
      message: "Anchor API response did not include the expected dual-answer schema.",
      retryable: true,
    },
  };

  function normalizeApiBase(value) {
    const raw = String(value || "").trim();
    return (raw || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  }

  function buildApiUrl(baseUrl, path) {
    const base = normalizeApiBase(baseUrl);
    let parsed;
    try {
      parsed = new URL(base);
    } catch (_error) {
      throw new InvalidApiBaseUrlError();
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new InvalidApiBaseUrlError();
    }
    return `${parsed.toString().replace(/\/+$/, "")}${path}`;
  }

  function apiHostLabel(baseUrl) {
    try {
      return new URL(normalizeApiBase(baseUrl)).host;
    } catch (_error) {
      return "Invalid API URL";
    }
  }

  async function requestHealth(options) {
    return requestJsonEndpoint(options, HEALTH_PATH);
  }

  async function requestReady(options) {
    return requestJsonEndpoint(options, READY_PATH);
  }

  async function requestJsonEndpoint(options, path) {
    const response = await fetch(buildApiUrl(options.apiBase, path), {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: options.signal,
    });
    const payload = await readJsonSafely(response);
    if (!response.ok) {
      throw new WorkspaceApiError(errorInfoFromHttp(response.status, payload));
    }
    return payload;
  }

  async function testConnection(options) {
    const startedAt = Date.now();
    const result = {
      status: "checking",
      health: null,
      ready: null,
      dependencies: {},
      latencyMs: null,
      error: null,
    };
    try {
      result.health = await requestHealth(options);
    } catch (error) {
      result.status = "disconnected";
      result.error = errorInfoFromException(error);
      result.latencyMs = Date.now() - startedAt;
      return result;
    }

    try {
      result.ready = await requestReady(options);
      result.dependencies = Object.assign({}, result.ready && result.ready.dependencies);
      result.status = readinessStatus(result.health, result.ready);
    } catch (error) {
      result.status = "degraded";
      result.error = errorInfoFromException(error);
    } finally {
      result.latencyMs = Date.now() - startedAt;
    }
    return result;
  }

  function readinessStatus(health, ready) {
    if (!health || health.status !== "ok") return "disconnected";
    if (!ready || ready.status !== "ready") return "degraded";
    const deps = ready.dependencies || {};
    const values = Object.keys(deps).map((key) => String(deps[key] || "").toLowerCase());
    if (!values.length) return "degraded";
    return values.every((value) => value === "ok" || value === "configured") ? "connected" : "degraded";
  }

  async function requestStreamedChat(options) {
    const response = await fetch(buildApiUrl(options.apiBase, STREAM_CHAT_PATH), {
      method: "POST",
      headers: {
        "Accept": STREAM_MEDIA_TYPE,
        "Content-Type": "application/json",
      },
      // 模型与粘贴的答案都是**可选**的：没选就不发，后端按默认走。少发一个空字段，
      // 也就少一次「空字符串算不算一个选择」的歧义。
      body: JSON.stringify(buildChatBody(options)),
      signal: options.signal,
    });

    if ((response.status === 404 || response.status === 405) && !response.ok) {
      return { fallback: true, payload: null };
    }

    if (!response.ok) {
      const payload = await readJsonSafely(response);
      throw new WorkspaceApiError(errorInfoFromHttp(response.status, payload));
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.body || !contentType.includes(STREAM_MEDIA_TYPE)) {
      return { fallback: true, payload: null };
    }

    let finalPayload = null;
    await readNdjsonStream(response.body, (event) => {
      const name = String(event && event.event || "");
      const data = event && event.data ? event.data : {};
      if (name === "stage" && options.onStage) {
        options.onStage(data.stage, data);
      } else if (name === "raw_answer" && data.raw_answer && options.onRawAnswer) {
        options.onRawAnswer(data.raw_answer, data);
      } else if (name === "final") {
        finalPayload = data;
        if (options.onFinal) options.onFinal(data);
      } else if (name === "error") {
        throw new WorkspaceApiError(errorInfoFromStreamEvent(data));
      }
    });

    if (!finalPayload) {
      throw new WorkspaceApiError(buildErrorInfo("SCHEMA_MISMATCH", null, null));
    }
    return { fallback: false, payload: finalPayload };
  }

  function buildChatBody(options) {
    const body = { question: options.question };
    const model = typeof options.model === "string" ? options.model.trim() : "";
    if (model) body.llm_model = model;
    const pasted = typeof options.rawAnswer === "string" ? options.rawAnswer.trim() : "";
    if (pasted) body.raw_answer = pasted;
    // 推理模式和上面两个不一样：**总是**发，而且发的是布尔。界面上它是一个有
    // 两档的开关，用户关着它就是在明确要求「这一次不要推理」——不发这个字段的
    // 意思是「按服务端默认走」，那会让一个关着的开关在服务端默认开推理时失效。
    body.anchor_reasoning = options.anchorReasoning === true;
    return body;
  }

  // 这一次请求浏览器等多久。开推理时后端的预算本来就更长，见
  // REASONING_REQUEST_TIMEOUT_MS 上面那段。
  function requestTimeoutMs(anchorReasoning) {
    return anchorReasoning === true ? REASONING_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  }

  async function requestJsonChat(options) {
    const response = await fetch(buildApiUrl(options.apiBase, JSON_CHAT_PATH), {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      // 模型与粘贴的答案都是**可选**的：没选就不发，后端按默认走。少发一个空字段，
      // 也就少一次「空字符串算不算一个选择」的歧义。
      body: JSON.stringify(buildChatBody(options)),
      signal: options.signal,
    });
    const payload = await readJsonSafely(response);
    if (!response.ok) {
      if (hasDualAnswerPayload(payload)) return payload;
      throw new WorkspaceApiError(errorInfoFromHttp(response.status, payload));
    }
    if (!hasDualAnswerPayload(payload)) {
      throw new WorkspaceApiError(buildErrorInfo("SCHEMA_MISMATCH", response.status, null));
    }
    return payload;
  }

  //: 可选模型由**后端**给出，前端不写死：清单改了之后不重新部署前端也能生效，
  //: 而且列出来的每一项都保证是后端肯接受的。拿不到就返回空，界面据此退回「默认模型」。
  async function fetchModelCatalog(options) {
    try {
      const response = await fetch(buildApiUrl(options.apiBase, MODELS_PATH), {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: options.signal,
      });
      if (!response.ok) return null;
      const payload = await readJsonSafely(response);
      if (!payload || !Array.isArray(payload.models) || !payload.models.length) return null;
      return payload;
    } catch (error) {
      return null;
    }
  }

  async function readNdjsonStream(body, onEvent) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach((line) => consumeNdjsonLine(line, onEvent));
    }
    buffer += decoder.decode();
    consumeNdjsonLine(buffer, onEvent);
  }

  function consumeNdjsonLine(line, onEvent) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (_error) {
      throw new WorkspaceApiError(buildErrorInfo("INVALID_JSON", null, null));
    }
    onEvent(parsed);
  }

  async function readJsonSafely(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new WorkspaceApiError(buildErrorInfo("INVALID_JSON", response.status, null));
    }
  }

  function hasDualAnswerPayload(payload) {
    return Boolean(payload && payload.raw_answer && payload.corrected_answer);
  }

  function errorInfoFromStreamEvent(data) {
    const apiError = data && data.error ? data.error : {};
    const status = data && data.http_status ? Number(data.http_status) : null;
    const code = normalizedErrorCode(apiError.code, status);
    return buildErrorInfo(code, status, apiError.query_id);
  }

  function errorInfoFromHttp(status, payload) {
    const apiError = payload && payload.error ? payload.error : {};
    const code = normalizedErrorCode(apiError.code, status);
    return buildErrorInfo(code, status, apiError.query_id);
  }

  function errorInfoFromException(error) {
    if (error && error.name === "AbortError") {
      return buildErrorInfo("CANCELLED", null, null);
    }
    if (error && error.name === "InvalidApiBaseUrlError") {
      return buildErrorInfo("INVALID_API_BASE_URL", null, null);
    }
    if (error && error.name === "WorkspaceApiError" && error.info) {
      return error.info;
    }
    if (error instanceof TypeError) {
      return buildErrorInfo("API_OFFLINE", null, null);
    }
    return buildErrorInfo("INTERNAL_ERROR", null, null);
  }

  function normalizedErrorCode(code, status) {
    const normalized = String(code || "").toUpperCase();
    if (ERROR_DEFINITIONS[normalized]) return normalized;
    if (status === 400 || status === 413) return "INVALID_REQUEST";
    if (status === 422) return "VALIDATION_ERROR";
    if (status === 429) return "RATE_LIMITED";
    if (status === 502 || status === 503) return "UPSTREAM_UNAVAILABLE";
    if (status >= 500) return "SERVER_ERROR";
    return "INTERNAL_ERROR";
  }

  function buildErrorInfo(code, status, queryId) {
    const definition = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL_ERROR;
    return {
      code,
      status,
      queryId: safeToken(queryId),
      message: definition.message,
      retryable: Boolean(definition.retryable),
    };
  }

  function safeToken(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const safe = text.replace(/[^a-zA-Z0-9._:-]/g, "");
    return safe.slice(0, 96) || null;
  }

  function WorkspaceApiError(info) {
    this.name = "WorkspaceApiError";
    this.info = info;
    this.message = info && info.message ? info.message : "Anchor API request failed.";
  }
  WorkspaceApiError.prototype = Object.create(Error.prototype);

  function InvalidApiBaseUrlError() {
    this.name = "InvalidApiBaseUrlError";
    this.message = "Invalid API URL.";
  }
  InvalidApiBaseUrlError.prototype = Object.create(Error.prototype);

  const exported = {
    DEFAULT_API_BASE_URL,
    fetchModelCatalog,
    API_STORAGE_KEY,
    REQUEST_TIMEOUT_MS,
    REASONING_REQUEST_TIMEOUT_MS,
    requestTimeoutMs,
    buildChatBody,
    JSON_CHAT_PATH,
    STREAM_CHAT_PATH,
    HEALTH_PATH,
    READY_PATH,
    STREAM_MEDIA_TYPE,
    normalizeApiBase,
    buildApiUrl,
    apiHostLabel,
    requestHealth,
    requestReady,
    testConnection,
    readinessStatus,
    requestStreamedChat,
    requestJsonChat,
    hasDualAnswerPayload,
    errorInfoFromHttp,
    errorInfoFromStreamEvent,
    errorInfoFromException,
    buildErrorInfo,
    WorkspaceApiError,
    InvalidApiBaseUrlError,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
  if (typeof window !== "undefined") {
    window.AnchorWorkspaceApi = exported;
  }
})();
