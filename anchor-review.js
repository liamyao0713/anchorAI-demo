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
  //
  // 三个视图（Ⓐ 原文 / Ⓑ 修订 / Ⓑ 净版）都解析行内 markdown：模型写的就是 markdown，
  // 不解析它，屏幕上露出来的就是 `**`、`###`、`---` 本身。Ⓐ 栏「逐字原文」的承诺改由
  // 「一个字都不吞」来守 —— 配不成对、不在词边界的星号与下划线一律照原样显示。

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
  // 行内 markdown。模型写的就是 markdown，这一层不渲染它的话，屏幕上露出来的就是
  // `**`、`###`、`---` 本身（用户 2026-10-11：「A 框显示不全 / 有 bug」里的一半）。
  //
  // `(?=\S)` 与 `(\S)\1` 把「首尾不是空格」写进正则：`a ** b ** c` 里的星号不成对，
  // 照原样留着。强调的内容不跨行（`[^\n]`）—— 跨了行就不是一对强调，而是两处落单的
  // 星号，吞掉它们等于把两行并成一行。
  // `***三星***` 先于 `**` 扫：反过来的话外层只配到 `***x**`，剩一个星号落在后面。
  const STRONG_EM_RE = /(\*\*\*|___)(?=\S)([^\n]*?)(\S)\1/g;
  const BOLD_RE = /(\*\*|__)(?=\S)([^\n]*?)(\S)\1/g;
  // 斜体只收一层：内容里再出现 `*` 或 `_` 就不算一对，免得 `*a **b** c*` 把粗体吃掉半截。
  // 收尾那个字符也不许是分隔符，否则 `****` 会被当成一对包着一个星号的斜体。
  const ITALIC_RE = /(\*|_)(?=[^*_\s])([^*_\n]*?)([^*_\s])\1/g;
  // 开闭两侧都必须在词边界上：`2*3*4` 的乘号、`my__var__name` 里的下划线不是强调。
  // `p<0.05*` 这种落单的星号根本配不成对，也就不会被动到。
  const WORD_CHAR_RE = /[0-9A-Za-z_]/;
  // 行首 1–6 个井号的标题（去掉井号、整行加粗），以及整行只有 ---/***/___ 的分隔线。
  // 两者都是**整行**语义，所以只在真正的行首判断（见 startsLine）。
  const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*)$/;
  const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

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

  // 单层段落（纯文本 / 粗体 / 斜体）→ 如果只剩一段纯文本，就不建子节点，调用方拿到
  // 的还是老结构 `{ kind, text }`。
  function wrapSegments(kind, segments) {
    if (segments.length === 1 && segments[0].kind === "text") return { kind, text: segments[0].text };
    return { kind, children: segments };
  }

  function plainSegments(chunk) {
    return [{ kind: "text", text: String(chunk) }];
  }

  // 一遍扫描一种强调。配不上词边界的那一对不算强调：把开头的分隔符留在文本里，从它
  // 后面继续找下一对 —— 不成对的星号一个都不吞。
  // `rest` 解析这一遍剩下的普通文本，`body` 解析配上的那一对里面的内容。
  function scanEmphasis(chunk, re, kind, rest, body) {
    const source = String(chunk);
    const parseRest = rest || plainSegments;
    const parseBody = body || parseRest;
    const out = [];
    let cursor = 0;
    const pushPlain = (piece) => {
      if (!piece) return;
      parseRest(piece).forEach((segment) => out.push(segment));
    };
    re.lastIndex = 0;
    let match = re.exec(source);
    while (match) {
      const end = match.index + match[0].length;
      const before = match.index > 0 ? source[match.index - 1] : "";
      const after = end < source.length ? source[end] : "";
      if (WORD_CHAR_RE.test(before) || WORD_CHAR_RE.test(after)) {
        re.lastIndex = match.index + match[1].length;
      } else {
        pushPlain(source.slice(cursor, match.index));
        out.push(wrapSegments(kind, parseBody(match[2] + match[3])));
        cursor = end;
        re.lastIndex = end;
      }
      match = re.exec(source);
    }
    pushPlain(source.slice(cursor));
    return out;
  }

  function italicSegments(chunk) {
    return scanEmphasis(chunk, ITALIC_RE, "italic", plainSegments);
  }

  function boldSegments(chunk) {
    return scanEmphasis(chunk, BOLD_RE, "bold", italicSegments);
  }

  // 长的分隔符先扫：`***x***` 是粗体套斜体，`**x**` 是粗体，`*x*` 是斜体。顺序反了的话
  // `**x**` 会先被当成一对空的 `*`。
  function emphasisSegments(chunk) {
    return scanEmphasis(chunk, STRONG_EM_RE, "bold", boldSegments,
      (body) => [wrapSegments("italic", italicSegments(body))]);
  }

  // chunk 的第 index 个字符是不是一行的开头。标题与分隔线只在这种位置成立：
  // 「foo [1] # bar」里被引用切出来的那半截不是标题，吞掉那个井号就是吞字。
  function startsLine(source, index, outerAtStart) {
    if (index === 0) return Boolean(outerAtStart);
    return source[index - 1] === "\n";
  }

  // 一行 → 段落。kind 是这一行所属的外层样式（"text" 普通正文，"mark" Ⓐ 栏的黄色高亮）。
  function pushLine(out, line, kind, atLineStart) {
    const heading = atLineStart ? HEADING_RE.exec(line) : null;
    const body = heading ? heading[2] : line;
    if (!body) return;
    let segments = emphasisSegments(body);
    if (heading) segments = [wrapSegments("bold", segments)];
    if (kind === "mark") {
      out.push(wrapSegments("mark", segments));
      return;
    }
    segments.forEach((segment) => out.push(segment));
  }

  // 一段文本里的换行拆成 br 段，每一行再按行内 markdown 解析。
  function pushMarkdown(out, chunk, kind, atLineStart) {
    const lines = String(chunk).replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, index) => {
      const lineStart = index > 0 || Boolean(atLineStart);
      const isRule = lineStart && RULE_RE.test(line);
      const previous = out.length ? out[out.length - 1] : null;
      // 分隔线自己就是一个块：前后不再补 br，补了就等于在一条线上下各留一个空行。
      if (index > 0 && !isRule && !(previous && previous.kind === "hr")) out.push({ kind: "br" });
      if (isRule) {
        if (previous && previous.kind === "br") out.pop();
        out.push({ kind: "hr" });
        return;
      }
      pushLine(out, line, kind, lineStart);
    });
  }

  // 叶子层：[N] 引用上标 → 行内 markdown → 换行。references 里没有的 [N] 留成纯文本，
  // 因为造一个指向不存在条目的锚点，点下去什么都不会发生。
  function parseLeaf(chunk, valid, out, atLineStart) {
    const source = String(chunk).replace(RESIDUE_RE, "");
    let cursor = 0;
    REF_RE.lastIndex = 0;
    let match = REF_RE.exec(source);
    while (match) {
      const n = Number(match[1]);
      if (valid.has(n)) {
        if (match.index > cursor) {
          pushMarkdown(out, source.slice(cursor, match.index), "text", startsLine(source, cursor, atLineStart));
        }
        out.push({ kind: "ref", n });
        cursor = match.index + match[0].length;
      }
      match = REF_RE.exec(source);
    }
    if (cursor < source.length) {
      pushMarkdown(out, source.slice(cursor), "text", startsLine(source, cursor, atLineStart));
    }
    return out;
  }

  function parseAnnotations(chunk, valid, out, atLineStart) {
    const source = String(chunk);
    let cursor = 0;
    ANNOTATION_RE.lastIndex = 0;
    let match = ANNOTATION_RE.exec(source);
    while (match) {
      if (match.index > cursor) {
        parseLeaf(source.slice(cursor, match.index), valid, out, startsLine(source, cursor, atLineStart));
      }
      // 注解的正文（〚NOTE …〛 里面那段）永远是行内的，标题/分隔线在那里不成立。
      out.push({ kind: match[1].toLowerCase(), children: parseLeaf(match[2], valid, [], false) });
      cursor = match.index + match[0].length;
      match = ANNOTATION_RE.exec(source);
    }
    parseLeaf(source.slice(cursor), valid, out, startsLine(source, cursor, atLineStart));
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
      if (match.index > cursor) {
        parseAnnotations(source.slice(cursor, match.index), valid, out, startsLine(source, cursor, true));
      }
      // 〚NEW〛 自己在行首时，它包住的那一段也算从行首开始 —— 整行被改写的标题得照常
      // 认出来；在行中间的 〚NEW〛 则不行。
      out.push({
        kind: BLOCK_KINDS[match[1]],
        children: parseAnnotations(match[2], valid, [], startsLine(source, match.index, true)),
      });
      cursor = match.index + match[0].length;
      match = BLOCK_RE.exec(source);
    }
    parseAnnotations(source.slice(cursor), valid, out, startsLine(source, cursor, true));
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
    return parseLeaf(stripToClean(value), refNumbers(references), [], true);
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

  // Ⓐ 栏也渲染行内 markdown（2026-10-11 改）。历史行为是原样显示 `**`，理由是「这一栏
  // 承诺逐字原文」—— 但模型写的 markdown 本来就是给人读的排版，不渲染它，屏幕上露出来的
  // 就是一堆星号和井号。逐字的承诺由「一个字都不吞」来守：配不成对的星号照原样显示。
  //
  // 高亮（a_marks）切出来的每一段各自解析，所以跨越高亮边界的 `**` 配不成对，两个星号
  // 原样留在屏幕上 —— 宁可露出标记，也不能让高亮和加粗互相错位。
  function parseAnswer(value, marks) {
    const source = text(value);
    const out = [];
    let cursor = 0;
    markRanges(source, marks).forEach((range) => {
      if (range.start > cursor) {
        pushMarkdown(out, source.slice(cursor, range.start), "text", startsLine(source, cursor, true));
      }
      pushMarkdown(out, source.slice(range.start, range.end), "mark", startsLine(source, range.start, true));
      cursor = range.end;
    });
    if (cursor < source.length) {
      pushMarkdown(out, source.slice(cursor), "text", startsLine(source, cursor, true));
    }
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
