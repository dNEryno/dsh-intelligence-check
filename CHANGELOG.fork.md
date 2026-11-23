# Fork changes / 分支修改日志

## 2026-11-23 — Current DSH compatibility and catalog recovery

Based on upstream v0.3.4 (29801b2).

- Replace removed `connection.requestRejection` with the authenticated WebServer handler's owner peer check. Required route authentication remains enabled.
- Report provider catalog errors; preserve the previous catalog when every provider fails.
- Refresh the owner's catalog on state reads to recover missed startup synchronization. Coalesce concurrent refreshes, cache successful synchronization for 30 seconds, and retain errors during a 10-second failure cooldown.
- Catch initialization/event synchronization errors and return state-request errors through the existing 503 response. Write a credential-free catalog diagnostic (time, PID, owner status, model count).

中文：修复新版 DSH 删除认证接口导致的 HTTP400；为模型目录同步补错误诊断、页面读取兜底、并发合并、成功缓存与失败冷却；全部提供方失败时保留旧目录。未改变题库和评分规则，未开启自动检测。

Validation: syntax check and focused checks for provider error reporting, all-provider failure, concurrent refresh/cache, owner access and missing-peer 403. Live desktop host returned six models. A manually added DeepSeek target completed milk: first answer 48.00 failed; its automatic independent retest answered 46.24 and passed. Browser visual confirmation remains pending. The original startup desynchronization trigger has not been conclusively identified. No claim is made that one question establishes model identity or overall intelligence.
