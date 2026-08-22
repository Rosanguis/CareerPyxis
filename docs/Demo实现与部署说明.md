# 职途罗盘 Demo 实现与部署说明

更新时间：2026-08-22（Asia/Shanghai）

## 1. 本次实现范围

本 Demo 保留原 PRD 的核心判断：职途罗盘不是“给用户贴职业标签”，而是把一段真实经历转成三个值得依次验证的职业假设，并给出证据、限制与七天行动。

已实现的完整主流程：

1. 首页说明产品价值、三位导师视角与非测评边界。
2. 用户填写一段项目经历、任务偏好、已有能力、时间/预算/地区约束和工作价值观。
3. AI 生成三道个性化情境题，分别由“第一性原理建造者”“长期复利配置者”“用户体验叙事者”发问。
4. 根据前三题回答选择一条动态追问，形成第 4 题。
5. 结合画像、回答和职业资料生成“夯 / 稳 / 拉”三条路径。
6. 每条路径展示匹配理由、真实工作、初级门槛、代价、证据缺口、证据账本、来源和七天验证任务。
7. 用户可在明确授权后生成行业经验草稿，逐项核验并仅在本机保存为“待审核”。Demo 不上传知识库、不发真实积分。

## 2. 技术结构

- Next.js 16 App Router、React 19、TypeScript。
- 单一服务端接口：`POST /api/explore`，按 `questions`、`report`、`contribution` 三种动作工作。
- `ModelProvider` 隔离模型差异，默认 DeepSeek，支持切换 OpenAI。
- `DATA_MODE=mock` 提供无密钥、可重复、稳定的现场演示；`DATA_MODE=live` 才访问真实模型。
- 画像、回答、报告和分享草稿仅写入当前浏览器 `localStorage`；没有登录、数据库、支付或真实积分。
- Vercel 函数部署区域为香港，最长执行 120 秒；应用内部另设 90 秒请求上限和分阶段超时。

## 3. DeepSeek 原生联网方案

本项目没有引入独立 `SearchProvider`。DeepSeek 生成与联网检索仍由同一个 `DeepSeekProvider` 负责。

实现参考 DeepSeek 官方 MIT 开源仓库 `deepseek-ai/deepseek-harness`：调用兼容 Anthropic Messages 的 `/anthropic/v1/messages`，注册服务端工具 `web_search_20250305`，解析返回的搜索结果，再将最多 4 个来源交给报告生成。这样既满足“DeepSeek 不原生搜索时使用 harness”的要求，也避免在业务层堆叠另一个搜索供应商。

若 Harness 调用失败或没有结果，系统会明确标记“缓存降级”，使用内置职业资料完成报告，不伪装成实时联网结果。

OpenAI 备选通过 Responses API 的 `web_search` 工具实现，同样由 `OpenAIProvider` 封装。

## 4. 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

浏览器访问 `http://localhost:3000`。默认 `DATA_MODE=mock`，无需 API Key。

质量命令：

```bash
npm run typecheck
npm run lint
npm run build
```

## 5. Vercel 部署

当前生产 Demo：https://career-pyxis.vercel.app

部署状态（2026-08-22）：Vercel 项目 `career-pyxis/career-pyxis` 已创建，
生产 deployment `dpl_8NZF7XBSqVugjoYQHwpeGbAP4SLM` 为 Ready，正式域名已绑定。
生产环境使用 `DATA_MODE=mock`，且未上传 `DEEPSEEK_API_KEY`。线上首页、追问、
夯/稳/拉三路径报告、七日行动、来源与贡献草稿均已完成冒烟验证，生产错误日志为空。

Vercel 账号当前尚未建立 GitHub Login Connection，因此本次通过官方 CLI 部署，
`git push` 自动部署暂未启用。完成 GitHub 账号连接后，可在项目设置中连接
`Rosanguis/CareerPyxis`。

1. 在 Vercel 导入 GitHub 仓库 `Rosanguis/CareerPyxis`。
2. Framework Preset 选择 Next.js，Build Command 保持 `npm run build`。
3. 先以 Mock 模式建立一个稳定的演示部署：

```text
DATA_MODE=mock
NEXT_PUBLIC_SITE_URL=https://你的域名
```

4. 需要现场演示实时 DeepSeek 时再添加：

```text
DATA_MODE=live
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的服务端密钥
AI_MODEL=deepseek-v4-flash
```

5. 如果切换 OpenAI：

```text
AI_PROVIDER=openai
OPENAI_API_KEY=你的服务端密钥
OPENAI_MODEL=gpt-5.6
```

API Key 只能配置在 Vercel 服务端环境变量，不要使用 `NEXT_PUBLIC_` 前缀，也不要提交到 Git。

## 6. 现场稳定性策略

- 主演示建议使用 `DATA_MODE=mock`，保证网络波动、模型限流或密钥额度不会破坏 5 分钟流程。
- 可额外准备一个 `DATA_MODE=live` 的预览部署展示真实 AI；失败时产品会给出可理解的降级结果。
- 演示前用示例画像完整跑一遍，确认 4 道题、三条路径和经验分享弹窗均正常。
- 不把缓存资料称为“实时搜索”；界面会显示“缓存降级”。

## 7. 已知边界

- 当前未接数据库、用户账号、正式审核队列、支付和真实积分系统，这是 Demo 的有意取舍。
- Mock 报告基于一个设计专业校园项目样例；真实模式的输出仍需人工核验来源与结论。
- 职业资料受地区、公司规模和岗位级别影响，报告不构成就业保证或职业定论。
- DeepSeek 实时链路已于 2026-08-22 使用合法服务端 Key 完成端到端验证：题目生成、Harness 搜索、三路径报告和贡献草稿均成功；OpenAI 备选链路仍需单独提供有效 Key 后验证。
