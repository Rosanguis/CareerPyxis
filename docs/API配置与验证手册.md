# API 配置与验证手册

## Mock 模式（默认、推荐主舞台使用）

```text
DATA_MODE=mock
```

不需要任何密钥，输出固定可复现，并在报告中显示“缓存降级”。

## DeepSeek V4 Flash 实时模式

在 `.env.local` 或 Vercel 服务端环境变量中配置：

```text
DATA_MODE=live
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...
AI_MODEL=deepseek-v4-flash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

重启开发服务器后，从首页完整走一遍。检查报告顶部不再显示 Mock 提示；如果联网搜索失败，允许报告显示缓存降级，但提问与报告生成仍应完成。

DeepSeek 实现有两类请求：

- `/chat/completions`：结构化生成三道题、报告和分享草稿。
- `/anthropic/v1/messages`：按 DeepSeek 官方 Harness 方式调用 `web_search_20250305` 服务端工具。

项目没有单独的 SearchProvider，也不会把 API Key 发往浏览器。

## OpenAI 备选模式

```text
DATA_MODE=live
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

OpenAI 使用 Responses API；职业资料检索使用同一 provider 的 `web_search` 工具。

## 验证通过标准

- 画像提交后返回恰好 3 道初始题。
- 第 3 题之后只出现 1 道动态第 4 题。
- 报告恰好包含 3 条路径，顺序为夯、稳、拉。
- 每条路径都有证据账本、缺口、现实代价和七天任务。
- 实时资料有可打开链接；失败时明确显示缓存来源/缓存降级。
- API 错误不返回密钥、完整模型原文或服务器堆栈。

## 2026-08-22 DeepSeek Live 实测记录

- 个性化题目：约 17.0 秒，3 道初始题、3 个追问候选、三位导师顺序正确，`isFallback=false`。
- 首次报告：约 71.5 秒，模型内容完整但引用了不存在的来源 ID，被服务端 Schema 正确拒绝，没有展示给用户。
- 修复：只保留真实检索结果中存在的 `sourceIds`；若外部事实的全部引用被移除，则自动降级为“AI 推断”并提示继续核实。
- 修复后报告 API：约 46.5 秒，`sourceMode=live`，3 条“夯稳拉”路径、9 个 Harness 来源、0 个无效来源引用、0 条被迫降级证据。
- 浏览器完整 Live 流程：题目约 17.6 秒、报告约 52 秒，页面正确显示“实时资料”，并完成动态第 4 题与三路径报告。
- 贡献草稿：约 6.9 秒，10 个必需字段全部存在，经验类型正确保留。
- 密钥只存在本地 `.env.local`，测试输出、日志、截图、Git diff 和文档均未包含密钥值。

## 常见问题

**提示缺少 API Key**：确认环境变量名正确，并在修改后重启本地服务或重新部署 Vercel。

**DeepSeek 搜索失败但报告成功**：这是设计内的降级。检查 `/anthropic/v1/messages` 对当前账号/模型是否开放，以及余额、限流和网络。

**输出结构不合法**：服务端会自动重试一次；仍失败则返回安全错误。现场切回 `DATA_MODE=mock`。

**请求超时**：单阶段默认 25 秒、搜索 20 秒、整体 90 秒，Vercel 函数上限 120 秒。不要在现场反复点击生成。

## 安全要求

- 永远不要把 Key 写进源代码、截图、前端环境变量或聊天记录。
- `.env.local` 已被 Git 忽略；只提交 `.env.example`。
- 轮换任何曾公开展示或误提交的 Key。
- 真实用户数据进入正式产品前必须增加持久化加密、删除机制、审核权限和隐私政策；本 Demo 不声称已具备这些能力。
