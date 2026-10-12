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

// ---------------------------------------------------------------- 行内 markdown
//
// 模型写的就是 markdown。2026-10-11 之前 Ⓐ 栏按「逐字原文」原样显示它，于是屏幕上
// 露出来的是 `**`、`###`、`---` 本身。现在三个视图都渲染行内 markdown，「逐字」改由
// 「一个字都不吞」来守：配不成对、不在词边界的星号与下划线照原样显示。

{
  // 三个视图用同一套规则：Ⓐ 原文、Ⓑ 修订、Ⓑ 净版。
  const bolded = [
    { kind: "text", text: "plain " },
    { kind: "bold", text: "bold" },
    { kind: "text", text: " plain" },
  ];
  assert.deepEqual(Review.parseTrack("plain **bold** plain", []), bolded);
  assert.deepEqual(Review.parseAnswer("plain **bold** plain", []), bolded);
  assert.deepEqual(Review.parseClean("plain **bold** plain", []), bolded);
  assert.deepEqual(Review.parseAnswer("**GRADE: moderate**", []),
    [{ kind: "bold", text: "GRADE: moderate" }]);
  assert.deepEqual(Review.parseAnswer("__strong__", []), [{ kind: "bold", text: "strong" }]);
}

{
  // 斜体，含 `_下划线_` 的写法。
  assert.deepEqual(Review.parseAnswer("in *Lancet* 2024", []), [
    { kind: "text", text: "in " },
    { kind: "italic", text: "Lancet" },
    { kind: "text", text: " 2024" },
  ]);
  assert.deepEqual(Review.parseTrack("_NEJM_", []), [{ kind: "italic", text: "NEJM" }]);
  // `***x***` 是粗体套斜体，不是「粗体 + 一个落单的星号」。
  assert.deepEqual(Review.parseAnswer("***both***", []),
    [{ kind: "bold", children: [{ kind: "italic", text: "both" }] }]);
}

{
  // 误伤清单。这些星号/下划线一个都不许动：改了 `p<0.05*`，就是改了模型写的数值。
  for (const literal of [
    "p<0.05*",                 // 落单的星号
    "a ** b ** c",             // 首尾贴着空格，不成对
    "2*3*4",                   // 乘号在词里面
    "my__var__name",           // 单词内部的下划线
    "**unclosed bold",         // 只有开头
    "FVC *",                   // 行尾一个星号
  ]) {
    assert.deepEqual(Review.parseAnswer(literal, []), [{ kind: "text", text: literal }],
      `${literal} 必须原样显示`);
    assert.equal(flatten(Review.parseTrack(literal, [])), literal, `${literal} 在 Ⓑ 栏也原样显示`);
  }
  // 强调不跨行：两行各自落单的星号不配成一对，否则两行会被并成一行。
  assert.equal(flatten(Review.parseAnswer("开头 *一行\n另一行* 结尾", [])), "开头 *一行\n另一行* 结尾");
}

{
  // 行首 #～###### 的标题：去掉井号，整行加粗。
  assert.deepEqual(Review.parseAnswer("### Summary", []), [{ kind: "bold", text: "Summary" }]);
  assert.deepEqual(Review.parseAnswer("###### deep", []), [{ kind: "bold", text: "deep" }]);
  assert.deepEqual(Review.parseAnswer("# 标题里的 **粗体**", []),
    [{ kind: "bold", children: [{ kind: "text", text: "标题里的 " }, { kind: "bold", text: "粗体" }] }]);
  // 七个井号不是标题；`#tag` 没有空格也不是；行中间的井号更不是。
  for (const literal of ["####### too deep", "#tag", "see # below", "C#"]) {
    assert.deepEqual(Review.parseAnswer(literal, []), [{ kind: "text", text: literal }],
      `${literal} 不是标题`);
  }
  // 引用上标切出来的那半截不在行首：那里的井号不许当标题吃掉。
  assert.deepEqual(Review.parseClean("claim [1] # 不是标题", [{ n: 1 }]), [
    { kind: "text", text: "claim " },
    { kind: "ref", n: 1 },
    { kind: "text", text: " # 不是标题" },
  ]);
}

{
  // 整行只有 ---/***/___ 的分隔线渲染成一条线，字符不再露出来。前后不补 br：
  // 补了就等于在一条线上下各留一个空行。
  for (const rule of ["---", "***", "___", "- - -", "-----"]) {
    assert.deepEqual(Review.parseAnswer(rule, []), [{ kind: "hr" }], `${rule} 必须成为分隔线`);
  }
  assert.deepEqual(Review.parseAnswer("上\n---\n下", []), [
    { kind: "text", text: "上" }, { kind: "hr" }, { kind: "text", text: "下" },
  ]);
  assert.deepEqual(Review.parseTrack("---", []), [{ kind: "hr" }]);
  // 列表项与带文字的行不是分隔线。
  assert.deepEqual(Review.parseAnswer("- item", []), [{ kind: "text", text: "- item" }]);
  assert.equal(flatten(Review.parseAnswer("--- 还有话", [])), "--- 还有话");
}

{
  // 列表行保持现在的换行和文字，不改成真正的列表元素（这一轮明确不做）。
  assert.deepEqual(Review.parseAnswer("- a\n1. b", []), [
    { kind: "text", text: "- a" }, { kind: "br" }, { kind: "text", text: "1. b" },
  ]);
}

{
  // 与现有标记共存。
  // 高亮里面的粗体照常加粗（样例的 a_marks 里就有一条 "**GRADE: moderate**"）。
  assert.deepEqual(Review.parseAnswer("**GRADE: moderate** rest", ["**GRADE: moderate**"]), [
    { kind: "mark", children: [{ kind: "bold", text: "GRADE: moderate" }] },
    { kind: "text", text: " rest" },
  ]);
  // 高亮里没有 markdown 时结构不变，还是老的 { kind, text }。
  assert.deepEqual(Review.parseAnswer("say dose now", ["dose"]), [
    { kind: "text", text: "say " }, { kind: "mark", text: "dose" }, { kind: "text", text: " now" },
  ]);
  // 加粗跨越高亮边界：两段各自解析，星号配不成对，原样留在屏幕上，不吞字也不错位。
  const crossing = Review.parseAnswer("**粗 高亮** 尾", ["高亮**"]);
  assert.equal(flatten(crossing), "**粗 高亮** 尾", "跨边界的星号一个都不能少");
  assert.equal(kinds(crossing).has("bold"), false, "跨越高亮边界的 ** 不算一对");

  // DEL/NEW/NOTE/UP/HL 里面的粗体、斜体照常渲染。
  assert.deepEqual(Review.parseTrack("〚DEL〛*old*〚/DEL〛〚NEW〛**new**〚/NEW〛", []), [
    { kind: "del", children: [{ kind: "italic", text: "old" }] },
    { kind: "ins", children: [{ kind: "bold", text: "new" }] },
  ]);
  assert.deepEqual(Review.parseTrack("〚NOTE see *Lancet*〛", []), [
    { kind: "note", children: [{ kind: "text", text: "see " }, { kind: "italic", text: "Lancet" }] },
  ]);
  // [N] 引用上标和粗体在同一段里各管各的。
  assert.deepEqual(Review.parseTrack("**FVC** 下降 [1]。", [{ n: 1 }]), [
    { kind: "bold", text: "FVC" },
    { kind: "text", text: " 下降 " },
    { kind: "ref", n: 1 },
    { kind: "text", text: "。" },
  ]);
}

{
  // 样例的 Ⓐ 原文：18 个星号（9 对粗体）必须一个都不剩在屏幕上。
  const answer = Review.parseAnswer(review.a_text, review.a_marks);
  assert.ok(flatten(answer).indexOf("**") < 0, "样例的 A 原文不该再露出 **");
  assert.ok([...kinds(answer)].includes("bold"), "样例的 A 原文必须解析出粗体");
  assert.equal(flatten(answer), review.a_text.replace(/\*\*/g, ""),
    "除了成对的 ** 本身，A 原文一个字都不许变");
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
  // A 原文在 Ⓑ 栏里照常显示，一个字都不丢（成对的 ** 变成加粗，所以两边都脱掉它）。
  assert.equal(flatten(Review.parseTrack(fallback.bTrack, fallback.references)),
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

// 高亮恰好被 ** 包住时不再露出落单的星号（线上 2026-10-11）。
{
  const segs = Review.parseAnswer("Refs end.\n\n**Overall confidence: High** — based on one RCT.", ["Overall confidence: High"]);
  const flat = JSON.stringify(segs);
  assert.ok(!flat.includes("**"), "no lone ** may remain around a highlighted bold phrase: " + flat);
  assert.ok(/Overall confidence: High/.test(flat), "the highlighted words must stay");
  // 两侧符号不配对时只按能配上的那一对处理，多出来的那个照原样保留，不吞字。
  const odd = JSON.stringify(Review.parseAnswer("**Overall confidence: High* — x", ["Overall confidence: High"]));
  assert.ok(odd.includes("*"), "the unmatched asterisk must stay literal, not be swallowed");
  console.log("highlight-inside-emphasis checks passed");
}

// ───────────────────────────────────────────── C 栏的英文界面（线上 2026-10-12）
//
// 界面切到 EN 时，C 栏里这三处后端文字要跟着变：校正卡标签、引用核验判定、
// Ⓑ 栏「校正未完成」后面那条原因。中文界面一个字不变。
{
  const payload = {
    a_text: "A.",
    b_track: "B.",
    b_clean: "B.",
    completed: false,
    fallback_reason: "最小改动自证不通过：把 〚NEW〛 去掉之后，得到的文本不等于 A 原文",
    fallback_reason_en: "Minimal-diff self-check failed: the restored text does not equal the original",
    validation: {
      issues: ["PMID 白名单不通过：B 引入了 49999999"],
      issues_en: ["PMID whitelist failed: the correction introduced 49999999"],
    },
    cards: [
      { tag: "张冠李戴 · WRONG-PAPER", tag_en: "WRONG PAPER", severity: "substantive", said: "s", verified: "v", why: "w" },
      { tag: "引用正确 · CONFIRMED", severity: "confirmed", said: "s", verified: "v", why: "w" },
      { tag: "单 RCT 评 GRADE", severity: "moderate", said: "s", verified: "v", why: "w" },
    ],
    citation_checks: [
      { cit: "[1]", pmid: "21864166", claimed: "c", verdict: "honest_omission",
        verdict_text: "诚实省略 · Anchor 补齐 21864166",
        verdict_text_en: "Honest omission · Anchor added PMID 21864166" },
      { cit: "[2]", pmid: null, claimed: "c", verdict: "no_pmid",
        verdict_text: "未给 PMID/DOI，按题名未能定位",
        verdict_text_en: "No PMID/DOI · not found by title" },
      // 老响应：后端没给英文那一份，退回中文而不是显示空白。
      { cit: "[3]", pmid: "26886654", claimed: "c", verdict: "wrong_paper",
        verdict_text: "✗ 张冠李戴（题名、作者不符）" },
    ],
  };
  const normalized = Review.normalizeReview(payload);
  assert.ok(normalized, "the sample must normalize");

  // 1 · EN 界面：能给英文的地方都不出现汉字。
  const englishSurface = [
    Review.incompleteReason(normalized, "en"),
    ...normalized.cards.slice(0, 2).map((card) => Review.cardTag(card, "en")),
    ...normalized.citationChecks.slice(0, 2).map((row) => Review.verdictText(row, "en")),
  ];
  englishSurface.forEach((value) => {
    assert.ok(value, "every English surface must have text");
    assert.ok(!Review.hasChinese(value), `EN surface must not contain Chinese: ${value}`);
  });
  assert.equal(Review.cardTag(normalized.cards[0], "en"), "WRONG PAPER", "tag_en wins");
  assert.equal(Review.cardTag(normalized.cards[1], "en"), "CONFIRMED", "falls back to the half after ·");
  // 只有中文的标签没有英文可退，照原样显示——比一张没有标签的卡好。
  assert.equal(Review.cardTag(normalized.cards[2], "en"), "单 RCT 评 GRADE");
  assert.equal(
    Review.verdictText(normalized.citationChecks[0], "en"),
    "Honest omission · Anchor added PMID 21864166",
  );
  // 后端没给英文的那一行退回中文，不是空白。
  assert.equal(Review.verdictText(normalized.citationChecks[2], "en"), "✗ 张冠李戴（题名、作者不符）");
  assert.equal(
    Review.incompleteReason(normalized, "en"),
    "Minimal-diff self-check failed: the restored text does not equal the original",
  );
  // fallback_reason_en 缺了就用 validation.issues_en，两个都没有才退回中文。
  const noReasonEn = Review.normalizeReview({ ...payload, fallback_reason_en: "" });
  assert.equal(
    Review.incompleteReason(noReasonEn, "en"),
    "PMID whitelist failed: the correction introduced 49999999",
  );
  const chineseOnly = Review.normalizeReview({
    ...payload, fallback_reason_en: "", validation: { issues: ["程序校验不通过"], issues_en: [] },
  });
  assert.equal(Review.incompleteReason(chineseOnly, "en"), payload.fallback_reason);

  // 2 · 中文界面：和改动之前逐字相同。
  assert.equal(Review.cardTag(normalized.cards[0], "zh"), "张冠李戴 · WRONG-PAPER");
  assert.equal(Review.cardTag(normalized.cards[1], "zh"), "引用正确 · CONFIRMED");
  assert.equal(Review.verdictText(normalized.citationChecks[0], "zh"), "诚实省略 · Anchor 补齐 21864166");
  assert.equal(Review.incompleteReason(normalized, "zh"), payload.fallback_reason);
  // 不传语言 = 老调用方，行为不变。
  assert.equal(Review.incompleteReason(normalized), payload.fallback_reason);

  // 3 · 后端完全没给这三个新字段时（旧响应）两种语言都退回中文，不报错、不空白。
  const legacy = Review.normalizeReview({
    a_text: "A.", b_track: "B.", b_clean: "B.", completed: true,
    cards: [{ tag: "时效 · STALE", severity: "moderate", said: "s", verified: "v", why: "" }],
    citation_checks: [{ cit: "[1]", pmid: "1", claimed: "c", verdict: "verified", verdict_text: "✓ 核验正确" }],
  });
  assert.equal(legacy.cards[0].tagEn, "");
  assert.equal(Review.cardTag(legacy.cards[0], "en"), "STALE");
  assert.equal(Review.verdictText(legacy.citationChecks[0], "en"), "✓ 核验正确");

  console.log("C column i18n parse checks passed");
}
