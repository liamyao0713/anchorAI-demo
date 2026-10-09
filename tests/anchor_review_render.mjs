// anchor_review 三栏的解析测试。
//
// 这一层**不产出 HTML 字符串**：它把后端的 〚〛 标记文本解析成段落结构，
// workspace-ui 再用 createElement / textContent 建成 DOM。所以这里断言的是结构，
// 注入防护也不靠「每一处都转义对了」—— 根本没有一步把模型写的文本当标记解析。
// 结构是纯数据，所以整层能用 node 直接跑，不需要无头浏览器。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Review = require("../anchor-review.js");

const fixture = JSON.parse(readFileSync(new URL("./fixtures/anchor_review_sample.json", import.meta.url), "utf8"));
const review = fixture.anchor_review;

// 把结构里的文字拼回去，用来断言「正文一个字都没丢」。
function flatten(segments) {
  return (segments || []).map((segment) => {
    if (segment.kind === "br") return "\n";
    if (segment.kind === "ref") return `[${segment.n}]`;
    return (segment.text || "") + flatten(segment.children);
  }).join("");
}

function kinds(segments) {
  const found = new Set();
  (segments || []).forEach((segment) => {
    found.add(segment.kind);
    kinds(segment.children).forEach((kind) => found.add(kind));
  });
  return found;
}

// ---------------------------------------------------------------- 注入

{
  // 标记分隔符不是「这段可以当 HTML」的许可：尖括号原样留在文本段里，由 DOM 层
  // 用 textContent 落地，所以不存在被解析成标签的路径。
  const hostile = '<img src=x onerror="alert(1)"> & "quoted"';
  const segments = Review.parseTrack(`〚NEW〛${hostile}〚/NEW〛`, []);
  assert.deepEqual(segments, [{ kind: "ins", children: [{ kind: "text", text: hostile }] }]);
  assert.equal(flatten(segments), hostile, "正文一个字都不能丢");
}

{
  // a_marks 这一侧也进不来：对不上的 mark 整条忽略，不往结构里塞东西。
  assert.deepEqual(Review.parseAnswer("plain text", ["</mark><script>"]),
    [{ kind: "text", text: "plain text" }]);
  const marked = Review.parseAnswer("say <b>x</b> now", ["<b>x</b>"]);
  assert.deepEqual(marked, [
    { kind: "text", text: "say " },
    { kind: "mark", text: "<b>x</b>" },
    { kind: "text", text: " now" },
  ]);
}

// ---------------------------------------------------------------- 五种标记

{
  const segments = Review.parseTrack(
    "a 〚DEL〛gone〚/DEL〛 〚NEW〛added〚/NEW〛 〚NOTE why〛 〚UP tier 3→1〛 〚HL 68.8 mL〛", []);
  assert.deepEqual(segments, [
    { kind: "text", text: "a " },
    { kind: "del", children: [{ kind: "text", text: "gone" }] },
    { kind: "text", text: " " },
    { kind: "ins", children: [{ kind: "text", text: "added" }] },
    { kind: "text", text: " " },
    { kind: "note", children: [{ kind: "text", text: "why" }] },
    { kind: "text", text: " " },
    { kind: "up", children: [{ kind: "text", text: "tier 3→1" }] },
    { kind: "text", text: " " },
    { kind: "hl", children: [{ kind: "text", text: "68.8 mL" }] },
  ]);
}

{
  // 嵌套：DEL/NEW 先切，NOTE/UP/HL 后切，所以写在 NEW 里的 NOTE 也会被解析出来。
  assert.deepEqual(Review.parseTrack("〚NEW〛added 〚NOTE inner〛 tail〚/NEW〛", []), [
    { kind: "ins", children: [
      { kind: "text", text: "added " },
      { kind: "note", children: [{ kind: "text", text: "inner" }] },
      { kind: "text", text: " tail" },
    ] },
  ]);
}

{
  // 没闭合的标记不能原样漏到屏幕上。
  assert.deepEqual(Review.parseTrack("text 〚NEW〛dangling", []), [{ kind: "text", text: "text dangling" }]);
  // 〚MOD〛 是 v13/v14 的旧标记：脱掉标记，内容照常保留。
  assert.deepEqual(Review.parseTrack("〚MOD〛kept〚/MOD〛", []), [{ kind: "text", text: "kept" }]);
}

{
  // DEL/NEW 可以跨行（历史用的是 DOTALL）。
  assert.deepEqual(Review.parseTrack("〚DEL〛one\ntwo〚/DEL〛", []), [
    { kind: "del", children: [
      { kind: "text", text: "one" },
      { kind: "br" },
      { kind: "text", text: "two" },
    ] },
  ]);
}

// ---------------------------------------------------------------- [N] 引用

{
  const segments = Review.parseTrack("claim [1] and [2] but not [9]", [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(segments, [
    { kind: "text", text: "claim " },
    { kind: "ref", n: 1 },
    { kind: "text", text: " and " },
    { kind: "ref", n: 2 },
    { kind: "text", text: " but not [9]" },
  ], "references 里没有的 [N] 留成纯文本");
}

{
  // [N] 落在 NEW 里面也要变成引用：校正新增的那几句才是引用最密的地方。
  assert.deepEqual(Review.parseTrack("〚NEW〛per trial [2]〚/NEW〛", [{ n: 2 }]), [
    { kind: "ins", children: [{ kind: "text", text: "per trial " }, { kind: "ref", n: 2 }] },
  ]);
}

{
  // 没有 references 时一个 [N] 都不该变成链接 —— 点下去会落到不存在的锚点上。
  assert.deepEqual(Review.parseTrack("claim [1]", []), [{ kind: "text", text: "claim [1]" }]);
  assert.deepEqual(Review.parseTrack("claim [1]", null), [{ kind: "text", text: "claim [1]" }]);
}

// ---------------------------------------------------------------- 粗体与换行

{
  // Ⓑ 栏渲染 **粗体**（历史 corr_md）。
  assert.deepEqual(Review.parseTrack("plain **bold** plain", []), [
    { kind: "text", text: "plain " },
    { kind: "bold", text: "bold" },
    { kind: "text", text: " plain" },
  ]);
  // Ⓐ 栏相反，按历史行为把 ** 原样显示：那一栏承诺的是逐字原文。
  assert.deepEqual(Review.parseAnswer("**GRADE: moderate**", []),
    [{ kind: "text", text: "**GRADE: moderate**" }]);
}

{
  assert.deepEqual(Review.parseTrack("one\ntwo", []), [
    { kind: "text", text: "one" }, { kind: "br" }, { kind: "text", text: "two" },
  ]);
  // 空行要留下来，段间距靠它。
  assert.deepEqual(Review.parseTrack("one\n\ntwo", []), [
    { kind: "text", text: "one" }, { kind: "br" }, { kind: "br" }, { kind: "text", text: "two" },
  ]);
  assert.deepEqual(Review.parseTrack("one\r\ntwo", []), [
    { kind: "text", text: "one" }, { kind: "br" }, { kind: "text", text: "two" },
  ]);
}

// ---------------------------------------------------------------- 净版

{
  const source = "a 〚DEL〛gone〚/DEL〛 〚NEW〛added〚/NEW〛 〚NOTE why〛 〚UP a→b〛 〚HL key〛";
  const flat = flatten(Review.parseClean(source, []));
  assert.equal(flat.includes("gone"), false, "净版接受删除");
  assert.match(flat, /added/);
  assert.match(flat, /\(why\)/, "净版把 NOTE 变成括号注解");
  assert.match(flat, /\[Upgrade: a→b\]/);
  assert.match(flat, /key/);
  assert.deepEqual([...kinds(Review.parseClean(source, []))].sort(), ["text"],
    "净版只有纯文本，不带任何修订样式");
}

{
  // 净版里的 [N] 照样是可点的引用。
  assert.deepEqual(Review.parseClean("claim [1]", [{ n: 1 }]), [
    { kind: "text", text: "claim " }, { kind: "ref", n: 1 },
  ]);
}

// ---------------------------------------------------------------- Ⓐ 栏高亮

{
  // 每个 mark 只标第一处（历史 hilite 的行为）。
  assert.deepEqual(Review.parseAnswer("dose dose dose", ["dose"]), [
    { kind: "mark", text: "dose" }, { kind: "text", text: " dose dose" },
  ]);
}

{
  // 重叠的 mark 往后找下一处不重叠的位置；找不到就跳过，绝不产出交叉的 mark。
  assert.deepEqual(Review.markRanges("abcabc", ["abc", "bca"]), [{ start: 0, end: 3 }],
    "找不到不重叠位置的 mark 直接忽略");
  assert.deepEqual(Review.markRanges("abc abc", ["abc", "abc"]), [{ start: 0, end: 3 }, { start: 4, end: 7 }],
    "同一个 mark 出现两次就标两处");
}

{
  assert.deepEqual(Review.parseAnswer("text", ["missing"]), [{ kind: "text", text: "text" }]);
  assert.deepEqual(Review.parseAnswer("text", ["", null, undefined]), [{ kind: "text", text: "text" }]);
  assert.deepEqual(Review.parseAnswer("", ["x"]), []);
  assert.deepEqual(Review.parseAnswer(null, null), []);
}

// ---------------------------------------------------------------- 色值

{
  assert.equal(Review.severityColor("substantive"), "#B91C1C");
  assert.equal(Review.severityColor("moderate"), "#D97706");
  assert.equal(Review.severityColor("confirmed"), "#6B7280");
  // 认不出的严重度走中性灰：猜一个红或绿，等于替后端做了它没做的判定。
  assert.equal(Review.severityColor("catastrophic"), Review.NEUTRAL_COLOR);
  assert.equal(Review.severityColor(undefined), Review.NEUTRAL_COLOR);

  assert.equal(Review.verdictColor("verified"), "#16A34A");
  assert.equal(Review.verdictColor("wrong_paper"), "#B91C1C");
  assert.equal(Review.verdictColor("not_found"), "#B91C1C");
  assert.equal(Review.verdictColor("no_pmid"), "#D97706");
  assert.equal(Review.verdictColor("honest_omission"), "#D97706");
  assert.equal(Review.verdictColor("something_new"), Review.NEUTRAL_COLOR);
}

// ---------------------------------------------------------------- PubMed 链接

{
  assert.equal(Review.pubmedHref("35569036"), "https://pubmed.ncbi.nlm.nih.gov/35569036/");
  assert.equal(Review.pubmedHref("PMID: 35569036"), "https://pubmed.ncbi.nlm.nih.gov/35569036/");
  // 整条不是 PMID 的值不能被凑成 PMID：从 "Maher 2024 MID" 里抽出 2024 会链到一篇
  // 毫不相干的论文，比不给链接坏得多。
  assert.equal(Review.pubmedHref("Maher 2024 MID"), "");
  assert.equal(Review.pubmedHref(null), "");
  assert.equal(Review.pubmedHref("javascript:alert(1)"), "");
}

// ---------------------------------------------------------------- 归一

{
  assert.equal(Review.normalizeReview(null), null);
  assert.equal(Review.normalizeReview(undefined), null);
  assert.equal(Review.normalizeReview("not an object"), null);
  // 三段正文全空的 anchor_review 是个空壳：按「没有这个字段」处理，页面退回原渲染。
  assert.equal(Review.normalizeReview({ engine: "anchor_v6" }), null);
}

{
  const minimal = Review.normalizeReview({ a_text: "A only" });
  assert.equal(minimal.completed, true, "completed 缺省算完成");
  assert.equal(minimal.bTrack, "A only", "b_track 缺失就退回 A 原文");
  assert.equal(minimal.bClean, "A only");
  assert.deepEqual(minimal.references, []);
  assert.deepEqual(minimal.cards, []);
  assert.deepEqual(minimal.citationChecks, []);
}

{
  // 网络来的数组里可能有 null，一条都不该把整次渲染打挂。
  const tolerant = Review.normalizeReview({
    a_text: "A",
    a_marks: [null, "A", 7],
    references: [null, { n: 2, vancouver: "v", pmid: "PMID: 123456" }],
    cards: [null, {}, { said: "s" }],
    citation_checks: [null, { cit: "PMID 1" }],
  });
  assert.deepEqual(tolerant.aMarks, ["A", "7"]);
  assert.equal(tolerant.references.length, 1);
  assert.equal(tolerant.references[0].pmid, "123456");
  assert.equal(tolerant.cards.length, 1, "全空的卡片不渲染");
  assert.equal(tolerant.citationChecks.length, 1);
}

{
  const refs = Review.normalizeReferences([
    { n: 1, pmid: "Maher 2024 MID" },
    { n: 2, pmid: null },
    { n: 3, pmid: "12" },
    { n: 4, pmid: "35569036" },
  ]);
  assert.deepEqual(refs.map((ref) => ref.pmid), ["", "", "", "35569036"]);
  // n 缺失就按位置补，否则引用上标会指向 undefined。
  assert.deepEqual(Review.normalizeReferences([{ vancouver: "a" }, { vancouver: "b" }]).map((r) => r.n), [1, 2]);
}

{
  const incomplete = Review.normalizeReview({
    a_text: "A", b_track: "A", b_clean: "A",
    completed: false, fallback_reason: "LLM returned invalid JSON",
  });
  assert.equal(incomplete.completed, false);
  assert.equal(Review.incompleteReason(incomplete), "LLM returned invalid JSON");
}

{
  // 后端没写 fallback_reason 时退回程序校验留下的 issues，不替它编一个理由。
  const issues = Review.normalizeReview({
    a_text: "A", completed: false,
    validation: { issues: ["minimal_diff_failed", "pmid 999 not whitelisted"] },
  });
  assert.equal(Review.incompleteReason(issues), "minimal_diff_failed; pmid 999 not whitelisted");
  assert.equal(Review.incompleteReason(Review.normalizeReview({ a_text: "A", completed: false })), "");
  assert.equal(Review.incompleteReason(null), "");
}

{
  const cards = Review.normalizeCards([
    { tag: "t", severity: "SUBSTANTIVE", said: "s", verified: "v", why: "w" },
  ]);
  assert.equal(cards[0].severity, "substantive", "severity 大小写不该影响配色");
  const checks = Review.normalizeCitationChecks([{ cit: "c", verdict: "WRONG_PAPER" }]);
  assert.equal(checks[0].verdict, "wrong_paper");
}

// ---------------------------------------------------------------- 样例响应

{
  const normalized = Review.normalizeReview(review);
  assert.equal(normalized.engine, "anchor_v6");
  assert.equal(normalized.language, "en");
  assert.equal(normalized.completed, true);
  assert.equal(normalized.references.length, 6);
  assert.equal(normalized.cards.length, 3);
  assert.equal(normalized.citationChecks.length, 6);
  assert.deepEqual(normalized.cards.map((card) => card.severity),
    ["moderate", "substantive", "confirmed"], "样例要覆盖三种严重度");
  assert.ok(new Set(normalized.citationChecks.map((row) => row.verdict)).size >= 3,
    "样例要覆盖多种引用判定");

  const track = Review.parseTrack(normalized.bTrack, normalized.references);
  const clean = Review.parseClean(normalized.bClean, normalized.references);
  const trackKinds = kinds(track);
  ["del", "ins", "note", "up", "hl", "ref"].forEach((kind) => {
    assert.ok(trackKinds.has(kind), `样例的修订视图应当覆盖 ${kind}`);
  });
  assert.equal(kinds(clean).has("del"), false, "净版不带删除");
  assert.equal(kinds(clean).has("ins"), false, "净版不带新增标记");
  assert.ok(kinds(clean).has("ref"), "净版仍然带引用上标");
  assert.equal(/〚|〛/.test(flatten(track)), false, "渲染后不应留下任何 〚〛");
  assert.equal(/〚|〛/.test(flatten(clean)), false);

  // 正文里每一个引用上标，参考文献里都必须真有一条对应，否则点下去什么都不发生。
  const available = new Set(normalized.references.map((ref) => ref.n));
  const used = new Set();
  (function collect(segments) {
    segments.forEach((segment) => {
      if (segment.kind === "ref") used.add(segment.n);
      if (segment.children) collect(segment.children);
    });
  })(track);
  assert.ok(used.size >= 4, "样例的修订视图应当带多个引用上标");
  used.forEach((n) => assert.ok(available.has(n), `引用 [${n}] 没有对应的参考文献条目`));

  const answer = Review.parseAnswer(normalized.aText, normalized.aMarks);
  assert.equal(answer.filter((segment) => segment.kind === "mark").length, normalized.aMarks.length,
    "a_marks 的每一条都应当在 A 原文里标出来");

  // 合约的「最小改动自证」：样例必须自己过得去，否则它教不了任何人该长什么样。
  const reduced = normalized.bTrack
    .replace(/〚NEW〛[\s\S]*?〚\/NEW〛/g, "")
    .replace(/〚DEL〛([\s\S]*?)〚\/DEL〛/g, "$1")
    .replace(/〚(?:NOTE|UP|HL)\s+[\s\S]*?〛/g, "")
    .replace(/〚\/?(?:DEL|NEW|MOD|NOTE|UP|HL)〛?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(reduced, normalized.aText.replace(/\s+/g, " ").trim(),
    "样例的 b_track 必须能还原成 a_text");

  // b_clean 必须就是 b_track 接受全部修订后的结果（历史 _strip_to_clean）。
  assert.equal(normalized.bClean, Review.stripToClean(normalized.bTrack),
    "样例的 b_clean 必须由 b_track 按净版规则派生");
}

{
  // 校正未完成：按约定 b_track = b_clean = A 原文，三栏照常显示。
  const fallback = Review.normalizeReview({
    ...review,
    completed: false,
    fallback_reason: "LLM 输出不是合法 JSON，已退回原文",
    b_track: review.a_text,
    b_clean: review.a_text,
    cards: [],
  });
  assert.equal(fallback.completed, false);
  assert.equal(fallback.bTrack, review.a_text);
  assert.equal(fallback.bClean, review.a_text);
  assert.equal(Review.incompleteReason(fallback), "LLM 输出不是合法 JSON，已退回原文");
  assert.deepEqual(fallback.cards, []);
  // 程序算出的引用核验表在未完成时仍然给出（合约要求），所以 Ⓒ 栏不会整个空着。
  assert.equal(fallback.citationChecks.length, 6);
  // A 原文在 Ⓑ 栏里照常显示，一个字都不丢。
  assert.equal(flatten(Review.parseTrack(fallback.bTrack, fallback.references)).replace(/\*\*/g, ""),
    fallback.aText.replace(/\*\*/g, ""));
}

// ------------------------------------------------- A 边生成边显示（修改 3）
//
// 等 final 的那段时间 Ⓐ 栏显示的是 raw_answer_delta 拼起来的半截原话，走的是和
// final 之后**同一条**路径：parseAnswer(text, []) → 段落结构 → createElement/
// textContent。所以这里断言的就是这条路径在「半截、带敌意字符、还没有 a_marks」
// 时的行为。

{
  // 拼接只是把增量按顺序接起来，解析层不做任何拼装：给它什么就显示什么。
  const deltas = ["阿奇霉素可", "减少 COPD 急性加重", "（HR 0.73）。"];
  const joined = deltas.join("");
  assert.equal(flatten(Review.parseAnswer(joined, [])), joined, "拼起来的 A 必须一个字不差地显示");

  // 半截的句子照样显示，不等它完整：这一栏此刻承诺的就是「模型目前写到这里」。
  const partial = joined.slice(0, 9);
  assert.equal(flatten(Review.parseAnswer(partial, [])), partial, "半截的 A 必须照原样显示");
}

{
  // 流进来的文字同样是模型写的，而且比 final 更不可控（它可能在任何一个字符上断开）。
  // 尖括号留在 text 段里，由 DOM 层 textContent 落地 —— 没有一步把它当标记解析。
  const hostile = '<script>alert(1)</script> 与 〚NEW〛半截';
  const segments = Review.parseAnswer(hostile, []);
  const textSegments = segments.filter((segment) => segment.kind === "text");
  assert.ok(textSegments.some((segment) => segment.text.includes("<script>")),
    "尖括号必须留在文本段里（由 textContent 落地），不能在这一层被改写");
  // 〚NEW〛 这种残留标记在 Ⓐ 栏按历史行为原样显示：这一栏承诺的是 LLM 逐字原文。
  assert.ok(flatten(segments).includes("〚NEW〛"), "Ⓐ 栏不脱标记，逐字原文照原样显示");
  // 没有任何一个段落被标成可渲染的标记类型。
  assert.deepEqual([...kinds(segments)], ["text"], "流式 A 只应产出纯文本段");
}

{
  // 换行要拆成 br：一段还在生成的回答，换行是它唯一的结构。
  const segments = Review.parseAnswer("第一段\n\n第二段开头", []);
  assert.equal(segments.filter((segment) => segment.kind === "br").length, 2, "两个换行必须拆成两个 br");
  assert.equal(flatten(segments), "第一段\n\n第二段开头");
}

{
  // 流式阶段还没有 references（它们随 final 才到），所以 [1] 只能是纯文本：造一个
  // 指向不存在条目的锚点，点下去什么都不会发生。
  const segments = Review.parseAnswer("支持这一点 [1]。", []);
  assert.ok(!kinds(segments).has("ref"), "没有 references 时 [N] 不能变成上标链接");
  assert.equal(flatten(segments), "支持这一点 [1]。");
}

{
  // raw_answer 一到就以它为准：同一个解析器换成完整文本，结果与拼接版无关。
  const stitched = "阿奇霉素可减少急性加重";
  const full = "阿奇霉素可减少 COPD 急性加重（HR 0.73）。";
  assert.notEqual(flatten(Review.parseAnswer(stitched, [])), flatten(Review.parseAnswer(full, [])));
  assert.equal(flatten(Review.parseAnswer(full, [])), full, "覆盖之后显示的必须是完整的那一份");
}

console.log("anchor_review parse checks passed");
console.log("streaming raw-answer parse checks passed");
