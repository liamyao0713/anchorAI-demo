(function () {
  "use strict";

  // Prepared answers for a fixed set of questions. When the typed question matches one exactly
  // (after normalising case, spacing and quotes), the run is played back through the same
  // callbacks a live /api/chat/stream run uses: stages, the answer streamed in pieces, the
  // correction phases, then the final payload. Any other question goes to the backend as usual.

  const CHUNK_CHARS = 28;
  const CHUNK_MS = 70;
  const PHASES = [
    ["retrieval", 5200],
    ["ncbi", 1200],
    ["correction", 7400],
  ];

  function normalise(text) {
    return String(text || "")
      .normalize("NFKC")
      .replace(/[‘’“”"']/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\s?.!。？！]+$/u, "")
      .toLowerCase();
  }

  function cases() {
    const bundle = window.AnchorDemoCases;
    return bundle && Array.isArray(bundle.cases) ? bundle.cases : [];
  }

  function match(question, options) {
    const key = normalise(question);
    if (!key) return null;
    const found = cases().find((item) => normalise(item.question) === key);
    if (!found) return null;
    // A pasted answer, or a model other than the one that wrote the prepared answer, means the
    // user asked for something else: let the backend handle it.
    if (options && typeof options.rawAnswer === "string" && options.rawAnswer.trim()) return null;
    const model = options && typeof options.model === "string" ? options.model.trim() : "";
    const own = found.final && found.final.raw_answer ? found.final.raw_answer.model || "" : "";
    if (model && own && model !== own) return null;
    return found;
  }

  function abortError() {
    try {
      return new DOMException("The operation was aborted.", "AbortError");
    } catch (_error) {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      return error;
    }
  }

  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(abortError());
        return;
      }
      const timer = window.setTimeout(() => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      function onAbort() {
        window.clearTimeout(timer);
        reject(abortError());
      }
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function newQueryId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "q-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2, 10);
  }

  function pieces(text) {
    const out = [];
    let index = 0;
    while (index < text.length) {
      let end = Math.min(text.length, index + CHUNK_CHARS);
      const space = text.lastIndexOf(" ", end);
      if (end < text.length && space > index + 8) end = space + 1;
      out.push(text.slice(index, end));
      index = end;
    }
    return out;
  }

  async function play(item, options) {
    const signal = options.signal;
    const final = JSON.parse(JSON.stringify(item.final));
    const queryId = newQueryId();
    final.query_id = queryId;
    final.question = options.question;
    const stage = (name) => options.onStage && options.onStage(name, { query_id: queryId, stage: name });

    stage("accepted");
    await wait(350, signal);
    stage("raw_generation");
    await wait(900, signal);
    const text = final.raw_answer && final.raw_answer.text ? final.raw_answer.text : "";
    for (const piece of pieces(text)) {
      if (options.onRawAnswerDelta) options.onRawAnswerDelta(piece, { query_id: queryId, text: piece });
      await wait(CHUNK_MS, signal);
    }
    if (options.onRawAnswer) options.onRawAnswer(final.raw_answer, { query_id: queryId, raw_answer: final.raw_answer });
    stage("anchor_v6_correction");
    for (const [phase, ms] of PHASES) {
      if (options.onKeepalive) options.onKeepalive({ query_id: queryId, phase });
      await wait(ms, signal);
    }
    if (options.onFinal) options.onFinal(final);
    return final;
  }

  window.AnchorDemoReplay = { match, play, normalise };
})();
