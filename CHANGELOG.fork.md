# Fork changes / 分支修改日志

## 2026-11-24 — Stop the empty answers and the "switch does nothing" feeling

- 空回答根因：后台 Go 端 `transport.go` 的 `DefaultMaxTokens = 8192` 是硬编码，且 `service.go:536`／`modeltrace.go:107` 每次调用都显式送 `max_tokens`，所以桥接层的「默认值」根本不会被用到。推理模型光思考就能吃掉 8192，回答还没开始就被截断，记录因此是「空回答」。桥接层改为取**下限**：`Math.max(请求值, 16384)`，调用方自己要求更大预算时仍以调用方为准。
- 打开监测开关或全局自动检测时，立刻补跑一轮首轮检测并给出提示。原来只会在下一个间隔整点生效，而且每次改设置都会重新计时，看起来就是「勾了没反应」。纯函数 `core.autoKickTargets(state, change)` 决定该补跑哪些目标（关掉开关、或全局自动检测关着时不补跑）。
- 检测设置弹窗增加未保存守卫：有未保存改动时按 Esc、点遮罩或点关闭，先提示「有未保存的修改。再次点击关闭将放弃这些修改。」，避免改了预算/间隔却没保存。
- 测试套件适配新版 DSH 与 Windows：`requestRejection` 存根换成 handler 第三参 `peer`（缺失 peer 用 `null` 模拟，`undefined` 会被默认参数兜住），POSIX 专供用例在 win32 跳过。
- Validation: 插件测试 36 项 → 28 通过、8 跳过（均为 POSIX 进程观测/直接 spawn shebang 的用例）、0 失败，含新增的 5 项 `autoKickTargets` 用例与 4 项桥接预算用例；`scripts/build-client.mjs` 重建 `plugin/client.js`。上限改动的端到端效果需重启 DSH 后由下一轮自动检测确认（本机已无可用 node 运行时，未能在部署后再跑一次测试）。

## 2026-11-24 — Follow the current conversation model

- 主灯仅匹配当前对话的 provider/model；订阅 DSH 会话 mainView 及官方模型选择目录，切换会话或模型即时更新，Auto effort 不影响匹配。未测灰色，无法确定模型明确显示未知，不借用其他模型的结果。
- 悬停列出所有检测模型各自的最近状态（运行优先），保留复测通过、调用异常与待人工评审说明；断联清除旧绿灯。只读现有状态，不触发模型调用。
- Use the same per-session model directory as the composer, including resolved default routes; subscribe to session and model switches and dispose subscriptions on unmount. Focused tests cover strict route matching, unknown/untested, switches, cleanup and the rendered tooltip.

## 2026-11-24 — Persistent sidebar quality indicator

- Replace the existing sidebar entry's static icon with a persistent colored status lamp and accessible tooltip (target, prompt, timestamp). The existing entry still opens the quality page.
- Read existing state sequentially every three seconds; no model requests or automatic-check settings are changed. Dispose polling on unmount and clear old success on connection failure.
- Running checks take priority across targets; otherwise summarize the latest quality record. Distinguish passed, same-target/prompt failed-then-passed, failed, call/connection error, manual review and untested/cancelled. Exclude fingerprint challenges from quality verdicts.
- Validation: focused indicator state tests and client component tests; rebuild generated client artifact. Browser visual verification requires a refresh after deployment.

## 2026-11-23 — Current DSH compatibility and catalog recovery

Based on upstream v0.3.4 (29801b2).

- Replace removed `connection.requestRejection` with the authenticated WebServer handler's owner peer check. Required route authentication remains enabled.
- Report provider catalog errors; preserve the previous catalog when every provider fails.
- Refresh the owner's catalog on state reads to recover missed startup synchronization. Coalesce concurrent refreshes, cache successful synchronization for 30 seconds, and retain errors during a 10-second failure cooldown.
- Catch initialization/event synchronization errors and return state-request errors through the existing 503 response. Write a credential-free catalog diagnostic (time, PID, owner status, model count).

中文：修复新版 DSH 删除认证接口导致的 HTTP400；为模型目录同步补错误诊断、页面读取兜底、并发合并、成功缓存与失败冷却；全部提供方失败时保留旧目录。未改变题库和评分规则，未开启自动检测。

Validation: syntax check and focused checks for provider error reporting, all-provider failure, concurrent refresh/cache, owner access and missing-peer 403. Live desktop host returned six models. A manually added DeepSeek target completed milk: first answer 48.00 failed; its automatic independent retest answered 46.24 and passed. Browser visual confirmation remains pending. The original startup desynchronization trigger has not been conclusively identified. No claim is made that one question establishes model identity or overall intelligence.
