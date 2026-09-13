nchorAI 后续执行指令：Prompt 39 → 43

当前状态已确认：

* Prompt 36：Mac 睡眠/常驻设置检查完成，PASS。
* Prompt 37：KB 每日自动备份完成，PASS。
* Prompt 38：Production structured logging 完成，PASS。
* 后端测试：130 passed。
* 前端静态检查：passed。
* API 重启后公网 `/health`、`/ready` 均为 200。
* GitHub 当前账号已确认具备 `liamyao0713/anchorAI-demo` 的 `push: true` 写权限。
* GitHub Pages 来源为 `main` 分支根目录，当前状态可正常构建。
* 当前前端仍有未推送 commit，线上仍是旧静态版本。
* 已存在回滚点/备份 tag，请继续保留，不得删除或覆盖。
* Prompt 37 发现一个来源尚未确认的旧备份机制：疑似约每 3 小时产生一次备份，当前约 800 个文件 / 4.7 GB。该问题目前只记录，不做破坏性处理。

## 一、执行顺序

严格按照 Master Plan 原定顺序继续：

1. Prompt 39
2. Prompt 40
3. Prompt 41
4. Prompt 42
5. Prompt 43

不要提前发布，不要跳过 Prompt 42 的 Production Readiness Review。

## 二、Prompt 39–42 执行要求

继续自主完成 Prompt 39 → 40 → 41 → 42。

### Prompt 39

完成健康检查相关任务，并实际验证关键服务状态。

不得只依赖旧日志或先前结论，必须重新读取和验证当前 runtime state。

### Prompt 40

完成安全审计与相关文档/检查。

任何涉及 secret、token、API key、数据库凭据、Cloudflare 凭据、GitHub 凭据的内容：

* 不得写入仓库；
* 不得输出完整敏感值；
* 不得为了测试而修改现有生产凭据；
* 发现风险时记录并按 Master Plan 处理。

### Prompt 41

按 Master Plan 已定义的必要评估规模执行即可。

要求：

* 不要自行扩大评估规模；
* 不要增加无必要的真实 LLM/API 调用；
* 如果某个测试需要真实 `/api/chat`，按 Master Plan 的最小必要 case 执行；
* 记录通过、失败、耗时及必要证据；
* 不要为了追求更多样本而无意义消耗 LLM/API 配额。

### Prompt 42

完成完整的 Production Readiness Review。

必须基于本轮真实检查、测试和运行状态判断，而不是沿用旧结论。

如果存在 `Critical FAIL`：

* 立即暂停；
* 不执行 Prompt 43；
* 汇报 Critical FAIL 的具体项目、证据、影响和建议修复方案；
* 不进行正式发布。

如果没有 `Critical FAIL`：

* 不需要再次向我确认；
* 直接继续执行 Prompt 43。

## 三、Prompt 43 正式发布要求

只有在 Prompt 42 确认无 Critical FAIL 后才执行。

GitHub 写权限已经恢复，可以正常 push。

发布时：

* 保持当前 `origin` 不变；
* 不要把 remote 改到 `anchor-ai`；
* 当前目标仓库仍是 `liamyao0713/anchorAI-demo`；
* 按 Master Plan 执行正式发布；
* 发布后验证 GitHub Pages 构建状态；
* 验证线上前端可以正常访问；
* 验证线上前端调用公网 API 正常；
* 至少重新检查公网 `/health`、`/ready`；
* 如 Master Plan 要求，完成真实 smoke test；
* 确认线上版本对应本次发布 commit；
* 保留现有 rollback/tag，不删除回滚点。

## 四、前端保护要求

现有前端页面已经验证可用。

后续任务不得擅自改变：

* HTML 页面结构；
* 页面视觉样式；
* 布局；
* 文案；
* 用户交互设计；
* 已验证通过的前端行为。

除非 Master Plan 的明确任务要求必须修改前端文件。

如果确实必须修改上述前端内容：

1. 先暂停；
2. 告诉我具体文件；
3. 说明为什么必须修改；
4. 说明修改范围；
5. 等我确认后再改。

纯测试、部署配置、日志、安全检查等不影响视觉和交互的必要改动，可以按 Master Plan 自主执行。

不得为了“顺手优化”而重构或美化前端。

## 五、已有功能保护

保持现有已验证通过的功能不被破坏，包括但不限于：

* 公网 API；
* Cloudflare Tunnel；
* `/health`；
* `/ready`；
* `/api/chat`；
* 数据库；
* retrieval；
* LLM 配置；
* CORS；
* GitHub Pages；
* 当前 KB；
* 当前日志；
* 当前备份机制；
* rollback/tag。

不得：

* 修改 git remote；
* 删除现有 tag；
* 覆盖回滚点；
* 清空数据库；
* 重建生产数据库；
* 删除现有 KB；
* 擅自更换公网域名；
* 擅自修改 Cloudflare Tunnel 已验证配置。

## 六、Prompt 37 遗留备份问题

Prompt 37 发现：

* 备份目录中存在另一个未知来源的旧备份任务；
* 疑似约每 3 小时产生一次；
* 当前约 800 个文件 / 4.7 GB；
* 暂未在已检查的 crontab / LaunchAgents 中明确找到其启动来源。

当前处理原则：

1. 只把它记录为后续运维 TODO。
2. 不删除这些旧备份。
3. 不停止未知任务。
4. 不扩大当前新 `prune` 规则去匹配这些旧文件。
5. 不因为它影响本轮 Prompt 39–43 的正常执行。
6. 正式发布完成后，在最终报告中明确记录：

   * 待调查旧备份生产者；
   * 待确认调度来源；
   * 待确认是否与新的每日备份机制重复；
   * 待确认是否需要迁移、停用或清理。
7. 除非发现它已经造成磁盘空间、数据完整性或服务稳定性的 Critical 风险，否则本轮不要对它做破坏性处理。

## 七、自动执行原则

从现在开始：

* 按上述顺序自主继续；
* 不需要每一步向我确认；
* 不要因为普通 warning 或非关键建议暂停；
* 不要重复询问已经明确的 GitHub 权限问题；
* 不要重复询问是否可以 push；
* 不要再次让我选择“先发布还是先做 39–42”。

只有以下情况才暂停找我：

1. Prompt 42 出现 Critical FAIL；
2. 必须修改现有前端视觉、布局、文案或交互；
3. 必须进行浏览器登录、账号授权、验证码等人工操作；
4. 必须使用 sudo 且会改变重要系统设置；
5. 必须删除数据、删除备份、覆盖数据库或执行其他不可逆操作；
6. 出现无法自主安全判断的生产风险。

其余情况直接继续。

## 八、最终交付报告

Prompt 43 和发布后验证完成后，给我一次性汇总：

1. Prompt 39–43 每一项最终状态；
2. 每项 PASS / WARN / FAIL；
3. 后端测试结果；
4. 前端测试结果；
5. Production Readiness Review 结论；
6. 本次发布 commit hash；
7. GitHub push 结果；
8. GitHub Pages 部署/构建结果；
9. 线上前端验证结果；
10. 公网 `/health` 结果；
11. 公网 `/ready` 结果；
12. 真实 `/api/chat` smoke test 结果；
13. 是否修改过前端文件；若修改，列出具体文件和原因；
14. 当前 rollback 方法和对应 tag/commit；
15. Prompt 37 未知旧备份任务作为后续运维 TODO；
16. 其他剩余 WARN / TODO；
17. 明确告诉我：当前系统是否已经达到“可以交给真实用户使用”的状态。

现在直接从 Prompt 39 开始继续执行，不需要再次向我确认。

