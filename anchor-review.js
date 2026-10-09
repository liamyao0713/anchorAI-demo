(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────── anchor_review
  //
  // 历史 demo（v39/v40）三栏 Ⓐ|Ⓑ|Ⓒ 的数据层：把后端的标记文本解析成**段落结构**，
  // 由 workspace-ui 用 createElement + textContent 建成 DOM。
  //
  // 为什么不像历史实现那样直接拼 HTML 字符串：这个前端是公开的 GitHub Pages，正文来自
  // 模型，所以「不把模型输出交给 innerHTML」是一条写进静态检查的硬规矩。返回结构而不是
  // 字符串，注入就不再依赖「我有没有把每一处都转义对」——根本没有一步把文本当标记解析。
  // 顺带的好处是这一层能用 node 直接断言，不需要无头浏览器。
  //
  // 标记的替换顺序照搬 m2-studio/scripts/build_demo_v6.py 的 `_render_marks_in_prose`：
  // 先 DEL/NEW，再 NOTE/UP/HL，最后 [N]。所以写在 NEW 里面的 NOTE 会被解析出来，而写在
  // NOTE 里面的 HL 会被 NOTE 的第一个 〛 截断 —— 两边行为一致，不在这里私自「修好」。
  // 净版规则照搬同一文件的 `_strip_to_clean`。

  const SEVERITY_COLORS = {
    substantive: "#B91C1C",
    moderate: "#D97706",
    confirmed: "#6B7280",
  };

  const VERDICT_COLORS = {
    verified: "#16A34A",
    wrong_paper: "#B91C1C",
    not_found: "#B91C1C",
    no_pmid: "#D97706",
    honest_omission: "#D97706",
  };

  // 认不出的 severity / verdict 一律中性灰：猜一个红或绿，等于替后端做了它没做的判定。
  const NEUTRAL_COLOR = "#6B7280";

  function severityColor(severity) {
    return SEVERITY_COLORS[String(severity || "").toLowerCase()] || NEUTRAL_COLOR;
  }

  function verdictColor(verdict) {
    return VERDICT_COLORS[String(verdict || "").toLowerCase()] || NEUTRAL_COLOR;
  }

  // ─────────────────────────────────────────────────────────────────── 解析

  const BLOCK_RE = /〚(DEL|NEW)〛([\s\S]*?)〚\/\1〛/g;
  const ANNOTATION_RE = /〚(NOTE|UP|HL)\s+([\s\S]*?)〛/g;
  // 没闭合的标记（模型偶尔漏一个 〚/NEW〛）不能原样留在屏幕上。〚MOD〛 是 v13/v14 的
  // 旧标记，也在这里脱掉，内容照常保留。
  const RESIDUE_RE = /〚\/?(?:DEL|NEW|MOD|NOTE|UP|HL)〛?/g;
  const REF_RE = /\[(\d+)\]/g;
  const BOLD_RE = /\*\*([^*]+)\*\*/g;

  const BLOCK_KINDS = { DEL: "del", NEW: "ins" };

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function refNumbers(references) {
    const numbers = new Set();
    (Array.isArray(references) ? references : []).forEach((ref) => {
      const n = Number(ref && ref.n);
      if (Number.isFinite(n)) numbers.add(n);
    });
    return numbers;
  }

  // 一行文本里的换行拆成 br 段。保留 kind（text / bold / mark）不变。
  function pushLines(out, kind, chunk) {
    const lines = String(chunk).replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, index) => {
      if (index > 0) out.push({ kind: "br" });
      if (line) out.push({ kind, text: line });
    });
  }

  function pushBold(out, chunk) {
    let cursor = 0;
    BOLD_RE.lastIndex = 0;
    let match = BOLD_RE.exec(chunk);
    while (match) {
      if (match.index > cursor) pushLines(out, "text", chunk.slice(cursor, match.index));
      pushLines(out, "bold", match[1]);
      cursor = match.index + match[0].length;
      match = BOLD_RE.exec(chunk);
    }
    if (cursor < chunk.length) pushLines(out, "text", chunk.slice(cursor));
  }

  // 叶子层：[N] 引用上标 → **粗体** → 换行。references 里没有的 [N] 留成纯文本，
  // 因为造一个指向不存在条目的锚点，点下去什么都不会发生。
  function parseLeaf(chunk, valid, out) {
    const source = String(chunk).replace(RESIDUE_RE, "");
    let cursor = 0;
    REF_RE.lastIndex = 0;
    let match = REF_RE.exec(source);
    while (match) {
      const n = Number(match[1]);
      if (valid.has(n)) {
        if (match.index > cursor) pushBold(out, source.slice(cursor, match.index));
        out.push({ kind: "ref", n });
        cursor = match.index + match[0].length;
      }
      match = REF_RE.exec(source);
    }
    if (cursor < source.length) pushBold(out, source.slice(cursor));
    return out;
  }

  function parseAnnotations(chunk, valid, out) {
    const source = String(chunk);
    let cursor = 0;
    ANNOTATION_RE.lastIndex = 0;
    let match = ANNOTATION_RE.exec(source);
    while (match) {
      if (match.index > cursor) parseLeaf(source.slice(cursor, match.index), valid, out);
      out.push({ kind: match[1].toLowerCase(), children: parseLeaf(match[2], valid, []) });
      cursor = match.index + match[0].length;
      match = ANNOTATION_RE.exec(source);
    }
    parseLeaf(source.slice(cursor), valid, out);
    return out;
  }

  // Ⓑ 修订视图：〚DEL〛→ del.diff-del，〚NEW〛→ ins.diff-add，其余交给 parseAnnotations。
  function parseTrack(value, references) {
    const valid = refNumbers(references);
    const source = text(value);
    const out = [];
    let cursor = 0;
    BLOCK_RE.lastIndex = 0;
    let match = BLOCK_RE.exec(source);
    while (match) {
      if (match.index > cursor) parseAnnotations(source.slice(cursor, match.index), valid, out);
      out.push({ kind: BLOCK_KINDS[match[1]], children: parseAnnotations(match[2], valid, []) });
      cursor = match.index + match[0].length;
      match = BLOCK_RE.exec(source);
    }
    parseAnnotations(source.slice(cursor), valid, out);
    return out;
  }

  // 历史 _strip_to_clean：接受全部修订。后端已按同一规则给出 b_clean，这里再走一遍是
  // 兜底 —— 万一 b_clean 里还留着标记，不能让 〚NEW〛 这种东西直接漏到屏幕上。
  function stripToClean(value) {
    let s = text(value);
    s = s.replace(/〚DEL〛[\s\S]*?〚\/DEL〛/g, "");
    s = s.replace(/〚NEW〛([\s\S]*?)〚\/NEW〛/g, "$1");
    s = s.replace(/〚NOTE\s+([\s\S]*?)〛/g, "($1)");
    s = s.replace(/〚UP\s+([\s\S]*?)〛/g, "[Upgrade: $1]");
    s = s.replace(/〚HL\s+([\s\S]*?)〛/g, "$1");
    s = s.replace(RESIDUE_RE, "");
    s = s.replace(/ {2,}/g, " ");
    return s.replace(/ +\n/g, "\n");
  }

  function parseClean(value, references) {
    return parseLeaf(stripToClean(value), refNumbers(references), []);
  }

  // Ⓐ 栏：逐字原文，a_marks 里的子串套 <mark>。照历史 hilite()，每个 mark 只标第一处；
  // 重叠时往后找下一处不重叠的位置，找不到就跳过 —— 交叉的 <mark> 建不出合法的 DOM。
  function markRanges(source, marks) {
    const ranges = [];
    (Array.isArray(marks) ? marks : []).forEach((mark) => {
      const needle = text(mark);
      if (!needle) return;
      let from = 0;
      for (;;) {
        const at = source.indexOf(needle, from);
        if (at < 0) return;
        const end = at + needle.length;
        if (!ranges.some((range) => at < range.end && end > range.start)) {
          ranges.push({ start: at, end });
          return;
        }
        from = at + 1;
      }
    });
    return ranges.sort((a, b) => a.start - b.start);
  }

  // Ⓐ 栏按历史行为**不**渲染 **：这一栏承诺的是 LLM 逐字原文，连它的 markdown 残留
  // 也算原文的一部分。
  function parseAnswer(value, marks) {
    const source = text(value);
    const out = [];
    let cursor = 0;
    markRanges(source, marks).forEach((range) => {
      if (range.start > cursor) pushLines(out, "text", source.slice(cursor, range.start));
      pushLines(out, "mark", source.slice(range.start, range.end));
      cursor = range.end;
    });
    if (cursor < source.length) pushLines(out, "text", source.slice(cursor));
    return out;
  }

  // ─────────────────────────────────────────────────────────────────── 归一

  function stringList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(text).filter((item) => item !== "");
  }

  // PubMed 链接只认**整条都是** PMID 的值（允许 "PMID: 35569036" 这种写法）。不能按
  // 「抽出所有数字」来凑：那会把 "Maher 2024 MID" 变成 PMID 2024，造出一条指向毫不
  // 相干论文的链接 —— 比不给链接坏得多。
  function pmidOrEmpty(value) {
    const trimmed = text(value).trim().replace(/^PMID\s*[:：]?\s*/i, "");
    return /^[0-9]{4,9}$/.test(trimmed) ? trimmed : "";
  }

  function pubmedHref(pmid) {
    const safe = pmidOrEmpty(pmid);
    return safe ? `https://pubmed.ncbi.nlm.nih.gov/${safe}/` : "";
  }

  function normalizeReferences(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((ref, index) => {
        if (!ref || typeof ref !== "object") return null;
        const n = Number(ref.n);
        return {
          n: Number.isFinite(n) ? n : index + 1,
          vancouver: text(ref.vancouver),
          pmid: pmidOrEmpty(ref.pmid),
          source: text(ref.source),
          evidenceId: text(ref.evidence_id),
        };
      })
      .filter(Boolean);
  }

  function normalizeCards(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((card) => {
        if (!card || typeof card !== "object") return null;
        return {
          tag: text(card.tag),
          severity: text(card.severity).toLowerCase(),
          said: text(card.said),
          verified: text(card.verified),
          why: text(card.why),
        };
      })
      .filter((card) => card && (card.said || card.verified || card.why || card.tag));
  }

  function normalizeCitationChecks(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        return {
          cit: text(row.cit),
          pmid: pmidOrEmpty(row.pmid),
          claimed: text(row.claimed),
          verdict: text(row.verdict).toLowerCase(),
          verdictText: text(row.verdict_text),
          actual: text(row.actual),
        };
      })
      .filter((row) => row && (row.cit || row.claimed || row.verdict));
  }

  function normalizeReview(payload) {
    if (!payload || typeof payload !== "object") return null;
    const aText = text(payload.a_text);
    const bTrack = text(payload.b_track);
    const bClean = text(payload.b_clean);
    // 三段正文全空的 anchor_review 不是一次校正，是个空壳：当它没来，让页面退回原有
    // 渲染，而不是摆三个空栏。
    if (!aText && !bTrack && !bClean) return null;
    const validation = payload.validation && typeof payload.validation === "object" ? payload.validation : {};
    return {
      engine: text(payload.engine),
      model: text(payload.model),
      language: payload.language === "zh" ? "zh" : payload.language === "en" ? "en" : "",
      completed: payload.completed !== false,
      fallbackReason: text(payload.fallback_reason),
      validationIssues: stringList(validation.issues),
      aText,
      aMarks: stringList(payload.a_marks),
      bTrack: bTrack || aText,
      bClean: bClean || bTrack || aText,
      references: normalizeReferences(payload.references),
      cards: normalizeCards(payload.cards),
      citationChecks: normalizeCitationChecks(payload.citation_checks),
    };
  }

  // 校正未完成时 Ⓑ 栏顶部要说明原因：后端的 fallback_reason 优先，没有就用程序校验留下的
  // validation.issues。两个都空时只说「未完成」，不替后端编一个理由。
  function incompleteReason(review) {
    if (!review) return "";
    if (review.fallbackReason) return review.fallbackReason;
    return review.validationIssues.join("; ");
  }

  const exported = {
    SEVERITY_COLORS,
    VERDICT_COLORS,
    NEUTRAL_COLOR,
    severityColor,
    verdictColor,
    parseTrack,
    parseClean,
    parseAnswer,
    stripToClean,
    markRanges,
    pmidOrEmpty,
    pubmedHref,
    normalizeReview,
    normalizeReferences,
    normalizeCards,
    normalizeCitationChecks,
    incompleteReason,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
  if (typeof window !== "undefined") {
    window.AnchorReview = exported;
  }
})();
