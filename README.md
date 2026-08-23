# 职途罗盘 CareerPyxis

职途罗盘是一个面向职业方向迷茫的大学生、职场新人和转行者的 AI
职业探索 Demo。它不会替用户做职业决定，而是把一段真实经历、四道动态
情境题和带来源的职业资料整理成三条按“夯 / 稳 / 拉”排序的验证路径，
并为每条路径给出一项七天行动。

生产 Demo：https://career-pyxis.vercel.app

部署环境可按需使用 Mock 或 Live；Mock 用于黑客松现场稳定演示，Live
链路使用 DeepSeek V4 Flash、官方 Harness 与官方 ATS 岗位接口。

## 本次 SSAI Demo

默认示例是“缺少正式实习、拥有课程或校园项目经历、正在相邻职业方向
之间摇摆的设计类应届生”。完整主流程包括：

1. 输入真实项目经历、偏好与现实约束；
2. 三位抽象导师提出三道个性化情境题；
3. 根据前三题信号选择第四道动态追问；
4. 发现并比较三个候选职业方向；
5. 分层展示用户回答、导师观察、检索资料、职业事实与 AI 推断；
6. 给出七天验证任务、完成标准和继续 / 调整 / 退出条件；
7. 主报告出现后异步逐方向核验当前岗位，不让招聘检索阻塞报告；
8. 在单独授权后生成可编辑的行业经验分享草稿，并仅保存到当前浏览器。

## 本地运行

需要 Node.js 24 和 npm。

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。默认使用 `DATA_MODE=mock`，无需任何密钥，
可以完整演示并稳定复现结果。

## 切换真实模型

复制 `.env.example` 为 `.env.local`，不要把 `.env.local` 提交到 Git。

### DeepSeek V4 Flash（默认）

```dotenv
DATA_MODE=live
AI_PROVIDER=deepseek
AI_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=你的服务端密钥
```

模型通过 OpenAI-compatible Chat Completions 生成 JSON。联网资料使用
DeepSeek 官方开源 Harness 的原生检索协议：Anthropic-compatible Messages
API 与服务端工具 `web_search_20250305`。每个方向最多一次受控检索；失败时
明确降级到带来源和核验日期的缓存资料。

### OpenAI（可选切换）

```dotenv
DATA_MODE=live
AI_PROVIDER=openai
OPENAI_API_KEY=你的服务端密钥
OPENAI_MODEL=gpt-5.6
```

OpenAI 模式使用 Responses API 与内置 `web_search`。两种供应商共享同一套
业务类型、页面和报告校验规则，密钥只在服务端 Route Handler 中读取。

## 验证命令

```bash
npm run typecheck
npm run lint
npm run build
```

GitHub Actions 始终使用 Mock 模式，不读取真实密钥，也不会产生收费请求。

## 关键技术边界

- Next.js 16.3 App Router + TypeScript + 普通 CSS；
- 单页面状态切换，业务接口为 `/api/explore` 和 `/api/job-verification`；
- 无账号、数据库、支付、真实积分或云端审核；
- localStorage 只保存匿名探索草稿与待审核分享草稿；
- 主报告的浏览器请求上限 125 秒、服务端硬截止 120 秒、Vercel 函数上限 150 秒；单方向岗位核验分别为 65/60/75 秒；
- 不记录完整提示词、用户敏感内容或请求密钥；
- Mock / 缓存结果在 UI 中明确标注，不冒充实时生成；
- DeepSeek 原生搜索适配对齐官方 Harness 的每请求最多 5 次搜索预算；应用层仍限制返回量、官方候选数与超时；
- 职业资料来源与岗位结果分开：前者支撑职业判断，后者会把报告职位与固定英文市场别名合并，并覆盖同义岗位名和相邻起步岗；国际职位通过 Greenhouse、Lever、Ashby、SmartRecruiters 或 Workday 官方接口核验，国内校招增加北森企业官方招聘详情页核验；只有确认仍有官方申请入口并通过当前已知条件初筛后才展示；
- 现场网络仍需在北京移动、电信、联通环境分别实测。

## 开源来源

DeepSeek Harness 适配来源、MIT 许可证与本地改动说明见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- DeepSeek API: https://api-docs.deepseek.com/
- Next.js: https://nextjs.org/docs
- OpenAI API: https://platform.openai.com/docs/

## 安全提醒

真实 API Key 只能配置在 `.env.local` 或 Vercel Sensitive Environment
Variables 中。任何密钥一旦进入 Git 历史，都必须先轮换，再考虑公开仓库。
