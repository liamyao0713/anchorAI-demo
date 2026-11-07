// Prepared-answer playback: exact-match routing, callback order, and that every bundled case
// renders through the same parser as a live run (no leftover markup, every [N] has a reference).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const Review = require("../anchor-review.js");

const timers = [];
const window = {
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => {},
  crypto: { randomUUID: () => "test-query-id" },
};
const context = vm.createContext({ window, DOMException, console, JSON, Promise, Error });
vm.runInContext(readFileSync(new URL("../demo-cases.js", import.meta.url), "utf8"), context);
vm.runInContext(readFileSync(new URL("../demo-replay.js", import.meta.url), "utf8"), context);
const Replay = window.AnchorDemoReplay;
const cases = window.AnchorDemoCases.cases;

assert.ok(cases.length >= 8, `expected the prepared set, found ${cases.length}`);

function flatten(segments) {
  return (segments || []).map((s) => (s.kind === "ref" ? `[${s.n}]` : (s.text || "") + flatten(s.children))).join("");
}

for (const item of cases) {
  const q = item.question;
  // exact match, tolerant of case / spacing / quotes / trailing punctuation
  assert.equal(Replay.match(q), item);
  assert.equal(Replay.match(`  "${q.toUpperCase()}"  `), item);
  assert.equal(Replay.match(q + " extra words"), null);
  assert.equal(Replay.match(q, { rawAnswer: "pasted text" }), null);

  const review = Review.normalizeReview(item.final.anchor_review);
  assert.ok(review && review.completed, `${q.slice(0, 40)}: review incomplete`);
  const refNumbers = new Set(review.references.map((r) => r.n));
  for (const text of [flatten(Review.parseTrack(review.bTrack, review.references)),
                      flatten(Review.parseClean(review.bClean, review.references))]) {
    assert.ok(!/[〚〛]/.test(text), `${q.slice(0, 40)}: leftover markup`);
  }
  for (const m of review.bClean.matchAll(/\[(\d+)\]/g)) {
    assert.ok(refNumbers.has(Number(m[1])), `${q.slice(0, 40)}: [${m[1]}] has no reference`);
  }
  assert.ok(review.cards.length >= 1, `${q.slice(0, 40)}: no cards`);
  assert.ok(review.citationChecks.length >= 1, `${q.slice(0, 40)}: no citation checks`);
}

// playback order: stages, streamed A, full A, correction phases, final
{
  const item = cases[0];
  const events = [];
  let streamed = "";
  const run = Replay.play(item, {
    question: item.question,
    onStage: (s) => events.push(`stage:${s}`),
    onRawAnswerDelta: (t) => { streamed += t; },
    onRawAnswer: () => events.push("raw_answer"),
    onKeepalive: (d) => events.push(`phase:${d.phase}`),
    onFinal: () => events.push("final"),
  });
  // drain the fake timers until playback resolves
  let done = false;
  run.then(() => { done = true; });
  for (let i = 0; i < 5000 && !done; i += 1) {
    const fn = timers.shift();
    if (fn) fn();
    await Promise.resolve();
    await Promise.resolve();
  }
  const final = await run;
  assert.equal(streamed, item.final.raw_answer.text);
  assert.deepEqual(events, ["stage:accepted", "stage:raw_generation", "raw_answer", "stage:anchor_v6_correction",
                            "phase:retrieval", "phase:ncbi", "phase:correction", "final"]);
  assert.equal(final.query_id, "test-query-id");
  assert.notEqual(item.final.query_id, "test-query-id", "playback must not mutate the bundled case");
}

console.log(`prepared playback checks passed (${cases.length} cases)`);
