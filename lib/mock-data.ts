import type { Answer, CareerReport, ContributionDraft, Profile, Question, QuestionsResponse, RankedPath } from "./types";

const today = "2026-08-22";

function option(id: string, label: string, signals: string[], insight: string) {
  return { id, label, signals, insight };
}

export function createMockQuestions(profile: Profile, requestId: string): QuestionsResponse {
  const project = profile.experience.includes("校园") ? "这次校园项目" : "你描述的这段项目经历";
  const strength = profile.likedTasks[0] ?? "投入其中的任务";
  const questions: Question[] = [
    {
      id: "q1",
      mentor: "builder",
      prompt: `回到${project}刚开始、问题还很模糊的时候，如果再给你半天，你最想先推进哪一步？`,
      options: [
        option("q1a", "把问题拆成几个可验证的小假设", ["problem-framing", "structured"], "面对模糊问题时，你可能更愿意先建立可以验证的结构。"),
        option("q1b", "快速做一个粗糙版本，拿去试", ["prototyping", "action"], "你目前看起来更愿意用一个具体产物推动问题向前。"),
        option("q1c", "先找关键参与者，听听他们怎么理解问题", ["research", "empathy"], "你可能更信任来自真实使用者的现场证据。"),
      ],
    },
    {
      id: "q2",
      mentor: "investor",
      prompt: `如果接下来三个月只能把“${strength}”练深一层，你会怎样判断这项投入值得？`,
      options: [
        option("q2a", "能产出一个可公开展示的完整案例", ["portfolio", "craft"], "你可能看重能够被外部看见和检验的能力证据。"),
        option("q2b", "能迁移到多个行业和岗位", ["transferable", "optionality"], "你目前更在意一项能力能否带来长期选择权。"),
        option("q2c", "能尽快换来真实反馈或收入", ["market", "feedback"], "你可能希望能力投入尽早接受真实市场反馈。"),
      ],
    },
    {
      id: "q3",
      mentor: "storyteller",
      prompt: "当别人体验你做出的方案时，哪一种反馈最让你觉得这件事有价值？",
      options: [
        option("q3a", "“终于知道下一步该做什么了”", ["clarity", "service-design"], "你可能享受把复杂处境转化成清晰行动。"),
        option("q3b", "“这个方案准确说出了我的感受”", ["empathy", "narrative"], "你目前看起来很在意方案是否真正理解人的处境。"),
        option("q3c", "“这个变化让结果明显更好了”", ["impact", "measurement"], "你可能更希望自己的工作能够被结果验证。"),
      ],
    },
  ];

  const followUpCandidates: Question[] = [
    {
      id: "q4-reality",
      mentor: "investor",
      prompt: "导师团发现你对方向有兴趣，但现实取舍还会影响排序：如果一条路径更匹配，却需要连续三个月每周投入 8 小时，你会怎么选？",
      triggerSignals: ["portfolio", "craft", "optionality"],
      triggerReason: "确认长期投入与现实约束之间的取舍",
      options: [
        option("q4ra", "愿意投入，但要每两周看到阶段成果", ["paced-investment", "evidence"], "你可能接受长期投入，但需要持续看到证据。"),
        option("q4rb", "先做一个不超过 7 天的低成本试验", ["low-cost-test", "risk-control"], "你目前更偏好先缩小风险，再决定是否加码。"),
        option("q4rc", "如果它明显提高就业概率，可以集中投入", ["career-outcome", "commitment"], "你可能愿意为更清晰的职业回报集中投入。"),
      ],
    },
    {
      id: "q4-craft",
      mentor: "builder",
      prompt: "导师团还想确认：当研究已经足够、必须把方案做出来时，你更愿意承担哪种角色？",
      triggerSignals: ["research", "empathy", "narrative"],
      triggerReason: "确认理解问题之后的落地偏好",
      options: [
        option("q4ca", "亲手完成关键流程和原型", ["hands-on", "design"], "你可能希望把理解直接转化成可体验的方案。"),
        option("q4cb", "把洞察讲清楚，让不同角色共同决策", ["facilitation", "communication"], "你目前可能更擅长让证据进入团队决策。"),
        option("q4cc", "设计验证方式，观察方案是否真的有效", ["evaluation", "research"], "你可能希望继续通过验证减少判断中的不确定性。"),
      ],
    },
    {
      id: "q4-impact",
      mentor: "storyteller",
      prompt: "导师团发现你既在意人的感受，也在意结果。如果两者暂时冲突，你会优先保住什么？",
      triggerSignals: ["impact", "measurement", "market"],
      triggerReason: "确认体验质量与可量化结果之间的优先级",
      options: [
        option("q4ia", "先保证人能够理解并愿意使用", ["adoption", "experience"], "你可能认为被理解和被使用是结果发生的前提。"),
        option("q4ib", "先保证关键指标出现变化", ["metrics", "product"], "你目前更愿意让可观察结果帮助团队取舍。"),
        option("q4ic", "缩小范围，找到两者都能成立的测试", ["experiment", "balance"], "你可能偏好通过小实验寻找体验与结果的交集。"),
      ],
    },
  ];
  return { questions, followUpCandidates, isFallback: false, requestId };
}

function action(task: string, output: string, criteria: string[]): RankedPath["sevenDayAction"] {
  return {
    task,
    estimatedTime: "6—8 小时",
    budget: "0—200 元",
    output,
    doneCriteria: criteria,
    continueIf: ["完成过程中持续感到好奇，而不是只靠意志硬撑", "至少 2 位目标用户或从业者确认产出有实际价值"],
    adjustIf: ["喜欢问题理解，但明显排斥当前产出形式", "时间或工具门槛高于预期，可缩小题目"],
    exitIf: ["真实任务与想象差异很大且核心工作方式不可接受", "连续两次验证都无法形成可复用的能力证据"],
  };
}

export function createMockReport(profile: Profile, answers: Answer[], requestId: string): CareerReport {
  const paths: RankedPath[] = [
    {
      priority: "夯",
      title: "用户研究",
      field: "研究 × 产品体验",
      summary: "你已经展示了从模糊问题中收集证据、整理模式并推动方案的完整雏形，最值得先用真实任务验证。",
      evidenceItems: [
        { label: "我的回答", content: `你在项目中完成了${profile.responsibility.slice(0, 62)}${profile.responsibility.length > 62 ? "…" : ""}`, sourceIds: [] },
        { label: "导师观察", content: "你倾向先理解真实处境，再把复杂信息变成可执行的结构。", sourceIds: [] },
        { label: "已核验职业事实", content: "初级用户研究工作通常需要研究计划、访谈/可用性测试、综合洞察与跨团队沟通。", sourceIds: ["s1"] },
      ],
      matchReasons: ["已有访谈与信息整理证据", "对人的真实体验保持关注", "能把研究结果转化为流程或原型"],
      mentorSupport: ["第一性原理建造者：能把模糊问题拆成观察与验证", "用户体验叙事者：在意使用者能否理解并采取行动"],
      entryRequirements: ["1—2 个能说明研究问题、过程、洞察与影响的案例", "基础访谈、可用性测试和研究综合能力", "能向产品与设计团队清楚表达证据边界"],
      realWork: ["把业务问题转化为研究问题", "招募并访谈目标用户、执行可用性测试", "综合记录，形成洞察与建议", "与产品、设计和业务共同判断下一步"],
      tradeoffs: ["初级岗位数量通常少于泛产品或设计岗", "研究结论不一定被采用，需要处理组织协作", "大量时间用于准备、记录和综合，而不只是与人聊天"],
      evidenceGaps: ["缺少真实业务环境中的研究影响证据", "尚未证明能独立选择合适方法并处理偏差"],
      uncertainties: ["当前项目来自校园场景，不能直接等同商业研究经验", "具体招聘要求会随公司、地区和岗位级别变化"],
      sevenDayAction: action("围绕一个校园或生活服务，完成 3 次半结构访谈并写出一页研究简报", "1 页研究简报＋访谈提纲＋脱敏记录", ["明确写出研究问题和样本限制", "至少形成 3 条由原始记录支持的发现", "请 1 位产品/设计从业者评价建议是否可执行"]),
    },
    {
      priority: "稳",
      title: "服务设计 / 体验策略",
      field: "设计 × 系统改善",
      summary: "你对完整旅程和多方体验有明显敏感度，但还需要证明自己能处理更复杂的利益相关者与落地约束。",
      evidenceItems: [
        { label: "我的回答", content: "你使用旅程图和流程结构处理了预约前的犹豫，而不只是在优化单个页面。", sourceIds: [] },
        { label: "AI 推断", content: "这种跨触点视角可能迁移到服务设计，但现有证据仍偏单一项目。", sourceIds: [] },
        { label: "检索资料", content: "公开职业资料普遍把研究、旅程映射、共创和服务蓝图列为常见工作。", sourceIds: ["s2"] },
      ],
      matchReasons: ["能观察体验发生前后的连续过程", "愿意整理不同角色的信息", "关注方案是否真正帮助人采取行动"],
      mentorSupport: ["长期复利配置者：系统视角可以迁移到公共服务、商业服务和组织体验", "用户体验叙事者：关注跨触点的一致理解"],
      entryRequirements: ["服务旅程、服务蓝图与共创方法", "至少一个涉及多角色的端到端案例", "把洞察连接到流程、运营与衡量方式"],
      realWork: ["研究一项服务中的多方角色与触点", "主持工作坊并对齐问题", "绘制现状/目标服务蓝图", "与运营、产品或一线团队试点改善"],
      tradeoffs: ["岗位名称分散，可能以体验策略、创新咨询等名称出现", "落地周期更长，成果归因不容易", "需要较强的沟通与推动能力"],
      evidenceGaps: ["缺少多利益相关者协作经验", "缺少把蓝图转成实际试点的证据"],
      uncertainties: ["“服务设计”在不同组织中的职责差异很大", "部分岗位对咨询或商业能力要求较高"],
      sevenDayAction: action("选择一项熟悉的线下服务，访谈 2 类角色并画出一张现状服务蓝图", "一张服务蓝图＋3 个优先改善机会", ["至少覆盖用户与服务提供者两种角色", "每个改善机会对应一个观察证据", "标注哪些是假设、哪些已被访谈支持"]),
    },
    {
      priority: "拉",
      title: "产品经理（体验方向）",
      field: "产品 × 跨团队决策",
      summary: "你的问题理解和原型能力可迁移到产品工作，但目前对数据、商业取舍与持续推进的证据较弱，适合作为探索性方向。",
      evidenceItems: [
        { label: "我的回答", content: `你明确排斥或较少选择“${profile.dislikedTasks.join("、") || "持续协调与数据分析"}”相关任务。`, sourceIds: [] },
        { label: "导师观察", content: "你愿意推动方案，但对长期协调和结果衡量的偏好仍需要确认。", sourceIds: [] },
        { label: "已核验职业事实", content: "产品岗位通常同时涉及用户需求、优先级、跨职能协作与结果衡量。", sourceIds: ["s3"] },
      ],
      matchReasons: ["具备从问题到原型的初步闭环", "能表达用户处境和方案逻辑", "对产品结果存在兴趣但证据尚少"],
      mentorSupport: ["第一性原理建造者：有拆解与方案意识", "长期复利配置者：需要进一步确认是否接受长期协调成本"],
      entryRequirements: ["需求优先级与产品指标基础", "跨角色推进项目的案例", "能说明方案对用户和业务结果的影响"],
      realWork: ["判断问题是否值得解决并定义目标", "协调设计、研发与业务排期", "根据数据与反馈调整优先级", "对交付节奏和结果负责"],
      tradeoffs: ["会议、沟通和取舍占比可能高于亲手设计", "常需在不完整信息下承担决策压力", "初级岗位也可能要求实习或上线经验"],
      evidenceGaps: ["缺少持续推进跨团队项目的证据", "缺少指标设计和上线后迭代经验"],
      uncertainties: ["你对“协调推进”的排斥可能来自一次情境，仍需用真实任务确认", "不同公司产品岗位的设计参与度差异很大"],
      sevenDayAction: action("为现有项目写一页轻量产品决策稿，并找 1 位产品经理做 30 分钟评审", "一页纸：用户问题、目标、非目标、优先级与验证指标", ["写清楚至少 2 个不做的取舍", "提出 1 个可观察的成功信号", "记录从业者指出的 3 个现实缺口"]),
    },
  ];

  return {
    mentorObservations: [
      { mentor: "builder", observation: "你会先寻找结构和证据，再把理解转成具体方案；这是一条工作偏好线索，不是人格结论。", supportingAnswers: [answers[0]?.optionLabel ?? "项目经历中的问题拆解"] },
      { mentor: "investor", observation: `你目前可投入${profile.weeklyTime || "有限时间"}，更适合先用小产出验证，而不是立刻投入长课程。`, supportingAnswers: [answers[1]?.optionLabel ?? "时间与预算约束"] },
      { mentor: "storyteller", observation: "你在意人能否理解、信任并采取下一步，这让研究和体验相关方向更值得优先验证。", supportingAnswers: [answers[2]?.optionLabel ?? "对用户体验的关注"] },
    ],
    rankedPaths: paths,
    sources: [
      { id: "s1", label: "已核验职业事实", title: "User Experience Researchers", publisher: "O*NET OnLine / U.S. Department of Labor", url: "https://www.onetonline.org/link/summary/19-4061.00", region: "美国（职责参考）", publishedOrCheckedAt: today, retrievedAt: today, provider: "人工核验缓存", sourceMode: "cached", supports: "用户研究常见任务与能力要求", confidence: "高" },
      { id: "s2", label: "缓存资料", title: "What is Service Design?", publisher: "Interaction Design Foundation", url: "https://www.interaction-design.org/literature/topics/service-design", region: "全球通用方法参考", publishedOrCheckedAt: today, retrievedAt: today, provider: "人工核验缓存", sourceMode: "cached", supports: "服务设计常见方法与跨触点视角", confidence: "中" },
      { id: "s3", label: "已核验职业事实", title: "Product Manager Career Guide", publisher: "Atlassian", url: "https://www.atlassian.com/agile/product-management/product-manager", region: "全球（职责参考）", publishedOrCheckedAt: today, retrievedAt: today, provider: "人工核验缓存", sourceMode: "cached", supports: "产品经理常见职责与跨职能协作", confidence: "中" },
    ],
    sourceMode: "cached",
    globalUncertainties: ["这是基于一次输入形成的职业假设，不能替代真实任务、从业者访谈和招聘市场验证。", "缓存职业资料用于 Demo 降级，地区、公司规模和岗位级别会改变具体要求。"],
    generatedAt: new Date().toISOString(),
    requestId,
    dataNotice: "当前为可复现的 Mock / 缓存演示结果，页面不会把它伪装成实时联网生成。配置服务端密钥并切换 DATA_MODE=live 后，将调用 DeepSeek V4 Flash 与官方 Harness 搜索能力。",
  };
}

export function createMockContribution(profile: Profile, experienceType = "课程或校园项目"): ContributionDraft {
  return {
    field: "校园项目 / 用户体验设计",
    experienceType,
    regionAndTime: `${profile.location || "地区未填写"} · 2026`,
    projectType: "校园公共服务体验改进",
    actualTasks: profile.responsibility,
    skills: profile.skills,
    hiddenDifficulties: "访谈样本较少，参与者表达的需求与实际行为可能不同；项目未真实上线，无法证明长期效果。",
    advice: "先把研究问题缩小，再决定访谈谁；展示案例时要把原始证据、自己的推断和最终方案分开。",
    limits: "这是一段校园项目经验，仅能说明该项目中的做法，不代表心理咨询行业或所有学校的普遍情况。",
    sensitiveContentNotice: "请删除学校、老师、同学姓名以及任何可识别的心理健康信息。",
  };
}
