# 职途罗盘 Demo 实现与部署说明

更新时间：2026-08-23（Asia/Shanghai）

## 1. 本次实现范围

本 Demo 保留原 PRD 的核心判断：职途罗盘不是“给用户贴职业标签”，而是把一段真实经历转成三个值得依次验证的职业假设，并给出证据、限制与七天行动。

已实现的完整主流程：

1. 首页说明产品价值、三位导师视角与非测评边界。
2. 用户填写一段项目经历、任务偏好、已有能力、时间/预算/地区约束和工作价值观。
3. AI 生成三道个性化情境题，分别由“第一性原理建造者”“长期复利配置者”“用户体验叙事者”发问。
4. 根据前三题回答选择一条动态追问，形成第 4 题。
5. 结合画像、回答和职业资料生成“夯 / 稳 / 拉”三条路径。
6. 每条路径展示匹配理由、真实工作、初级门槛、代价、证据缺口、证据账本、来源和七天验证任务。
7. 初始报告先完整出现，随后按“夯 / 稳 / 拉”逐方向动态核验当前岗位；只有官方 ATS 确认仍发布且未发现当前已知硬条件冲突的岗位才展示申请入口。
8. 用户可在明确授权后生成行业经验草稿，逐项核验并仅在本机保存为“待审核”。Demo 不上传知识库、不发真实积分。

## 2. 技术结构

- Next.js 16 App Router、React 19、TypeScript。
- `POST /api/explore` 负责 `questions`、`report`、`contribution`；`POST /api/job-verification` 在报告出现后独立核验单个职业方向。
- `ModelProvider` 隔离模型差异，默认 DeepSeek，支持切换 OpenAI。
- `DATA_MODE=mock` 提供无密钥、可重复、稳定的现场演示；`DATA_MODE=live` 才访问真实模型。
- 画像、回答、报告和分享草稿仅写入当前浏览器 `localStorage`；没有登录、数据库、支付或真实积分。
- 主报告的 Vercel / 服务端 / 浏览器时限分别为 150 / 120 / 125 秒。单方向岗位核验分别为 75 / 60 / 65 秒；三个方向串行更新，避免瞬间并发占满模型额度，也让用户先看报告而不是等待招聘检索。

## 3. DeepSeek 原生联网方案

本项目没有引入独立 `SearchProvider`。DeepSeek 生成与联网检索仍由同一个 `DeepSeekProvider` 负责。

实现参考 DeepSeek 官方 MIT 开源仓库 `deepseek-ai/deepseek-harness`：调用兼容 Anthropic Messages 的 `/anthropic/v1/messages`，注册服务端工具 `web_search_20250305`，解析返回的搜索结果，再将最多 4 个来源交给报告生成。这样既满足“DeepSeek 不原生搜索时使用 harness”的要求，也避免在业务层堆叠另一个搜索供应商。

若 Harness 调用失败或没有结果，系统会明确标记“缓存降级”，使用内置职业资料完成报告，不伪装成实时联网结果。

OpenAI 备选通过 Responses API 的 `web_search` 工具实现，同样由 `OpenAIProvider` 封装。

### 报告后的岗位核验

职业判断资料和“当前可投岗位”是两类证据，不能混用。报告中的来源用于说明职业方向；页面不会再展示 `live-1` 之类内部 ID，而是显示来源标题、发布方和可打开链接。报告渲染完成后，浏览器再按方向调用岗位核验接口：

1. 沿用当前 `ModelProvider` 的联网能力搜索具体 ATS 岗位页，不增加 `SearchProvider`。
2. 先把报告方向转成招聘市场常用的中英文名称，并分为目标岗位、同义方向、共享核心任务的相邻起步岗；两组检索并行执行，扩大候选池而不延长主报告。
3. 国际岗位只接受 Greenhouse、Lever、Ashby、SmartRecruiters、Workday 五类固定 HTTPS 详情地址；国内只接受单级 `*.zhiye.com` 企业招聘域名和固定北森 API / 详情路径，不请求任意外部地址。国内候选与国际候选分别保留配额，避免国际搜索排名挤掉全部国内校招结果。
4. Workday 校验 `posted=true` 与 `canApply=true`；北森旧版详情页必须仍显示申请按钮且入口同域。新版北森先从搜索结果提取安全企业租户，再调用公开职位列表 API；列表当前返回、`Status=1`、GUID 完整、未明确过期才构成“仍发布”证据，并根据接口返回的校招/实习类别生成官方详情入口。详情页 HTTP 200 本身不作为岗位有效证明。
5. 模型只对已由官方 API 确认的候选做方向、地区、远程范围和职业阶段匹配；外部岗位文本按不可信数据处理。
6. 未通过任何一层的候选直接排除。薪资、签证、工作许可和具体用工条件缺失时必须提示用户投递前确认。
7. 北森官方详情 URL 若因 Vercel 到国内站点的网络问题未完成直连，只能作为“企业官网机会 / 待打开确认”；它与职业资料卡合并在“资料有出处，岗位有时效”区域，不进入强核验岗位清单。

`DATA_MODE=mock` 不伪造“当前在招”岗位，界面会明确说明未联网核验并留空。Live 模式即使没有找到合格岗位，也宁可展示诚实空状态，不使用聚合页、缓存职位或搜索摘要冒充可投递链接。

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

Vercel 项目已连接公开仓库 `Rosanguis/CareerPyxis`，正式域名已绑定。每次推送到主分支后应等待 GitHub Actions 和 Vercel Deployment 都变为成功，再对正式域名执行一次完整冒烟测试。实际数据模式以 Vercel 当前环境变量为准，不要仅凭旧部署记录判断。

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
- 可额外准备一个 `DATA_MODE=live` 的预览部署展示真实 AI；个性化题目失败时产品会说明安全原因（超时、繁忙、连接、格式、配置或服务不可用），自动切换通用题并允许继续体验。
- 演示前用示例画像完整跑一遍，确认 4 道题、三条路径和经验分享弹窗均正常。
- 不把缓存资料称为“实时搜索”；界面会显示“缓存降级”。
- 不把“职业资料来源”称为岗位；现场应等待动态核验区至少返回一个方向，再解释官方发布状态、匹配初筛与投递前复查三层边界。

## 7. 已知边界

- 当前未接数据库、用户账号、正式审核队列、支付和真实积分系统，这是 Demo 的有意取舍。
- Mock 报告基于一个设计专业校园项目样例；真实模式的输出仍需人工核验来源与结论。
- 职业资料受地区、公司规模和岗位级别影响，报告不构成就业保证或职业定论。
- 岗位核验目前覆盖 Greenhouse、Lever、Ashby、SmartRecruiters、Workday 与北森招聘；报告方向会始终合并常见英文市场职位名，并针对国内应届场景增加中文校招查询。高校就业网、招聘简章和国内求职平台只发现线索，最终链接回到企业北森详情页。同义岗位名和相邻起步岗会显式标注扩展原因，不会伪装成报告中的精确职业。“核验时仍在招”只表示核验时官方接口/详情页仍公开且可申请；“企业官网机会”只表示发现了方向相关的官方详情 URL，必须由用户打开确认，两者不会混标。
- DeepSeek 实时链路已于 2026-08-22 使用合法服务端 Key 完成端到端验证：题目生成、Harness 搜索、三路径报告和贡献草稿均成功；OpenAI 备选链路仍需单独提供有效 Key 后验证。
