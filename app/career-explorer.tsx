"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceSourceLinks } from "@/app/components/report/evidence-source-links";
import { JobVerificationPanel } from "@/app/components/report/job-verification-panel";
import { EMPTY_PROFILE, EXAMPLE_PROFILE, MENTOR_META, TASK_OPTIONS, VALUE_OPTIONS } from "@/lib/constants";
import type { Answer, ApiErrorBody, CareerReport, ContributionDraft, EvidenceLabel, JobOpportunityLead, Profile, Question, QuestionFallbackReason, QuestionsResponse } from "@/lib/types";

type Stage = "intro" | "profile" | "questions" | "generating_report" | "report";
type ShareStep = "closed" | "permission" | "loading" | "draft" | "submitted";
type SavedState = { stage: Stage; profile: Profile; questions: Question[]; followUps: Question[]; questionFallback: QuestionFallbackReason | null; answers: Answer[]; report: CareerReport | null; savedAt: string };

const STORAGE_KEY = "career-pyxis-exploration-v1";
const SHARE_KEY = "career-pyxis-contribution-v1";
const priorityCopy = {
  夯: { title: "优先验证", note: "当前证据和现实条件最支持，值得先试。" },
  稳: { title: "备选验证", note: "存在明显匹配，但仍有关键证据缺口。" },
  拉: { title: "探索性方向", note: "存在潜力，但当前资料不足、代价较高或进入条件较弱。" },
};
const evidenceIcons: Record<EvidenceLabel, string> = { "我的回答": "我", "导师观察": "察", "检索资料": "检", "已核验职业事实": "核", "AI 推断": "AI", "缓存资料": "存" };

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}`;
}

async function apiCall<T>(payload: object): Promise<T> {
  const controller = new AbortController();
  // Keep the browser deadline slightly above the server deadline so the API can
  // return its structured timeout response instead of being cancelled first.
  const timer = window.setTimeout(() => controller.abort(), 125_000);
  try {
    const response = await fetch("/api/explore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await response.json() as T | ApiErrorBody;
    if (!response.ok) throw new Error("error" in (data as ApiErrorBody) ? (data as ApiErrorBody).error.message : "请求失败，请重试。");
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("生成时间超过预期。你的内容已保存，可以重新生成或返回修改。");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function BrandHeader({ stage, onHome }: { stage: Stage; onHome: () => void }) {
  const step = stage === "intro" ? 0 : stage === "profile" ? 1 : stage === "questions" ? 2 : stage === "generating_report" ? 3 : 4;
  return (
    <header className="site-header">
      <button className="brand brand-button" type="button" onClick={onHome} aria-label="返回职途罗盘首页">
        <span className="brand-mark" aria-hidden="true">
          <Image src="/career-pyxis-logo.svg" alt="" width={34} height={34} priority unoptimized />
        </span>
        <span>职途罗盘</span>
      </button>
      {stage !== "intro" && (
        <ol className="stepper" aria-label="探索进度">
          {["经历", "探索", "生成", "报告"].map((label, index) => <li key={label} className={step >= index + 1 ? "is-active" : ""}><span>{index + 1}</span>{label}</li>)}
        </ol>
      )}
    </header>
  );
}

function Intro({ onStart, onExample }: { onStart: () => void; onExample: () => void }) {
  return <>
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">一次有证据的职业探索</p>
        <h1>别急着选职业，<br /><em>先找到值得验证的方向</em></h1>
        <p className="hero-lead">三类导师从不同角度理解你的经历，AI 结合行业资料，帮你发现三条职业路径和一个七天行动。</p>
        <div className="hero-actions">
          <button className="button button-primary" type="button" onClick={onStart}>开始探索 <span aria-hidden="true">→</span></button>
          <button className="button button-secondary" type="button" onClick={onExample}>使用示例画像快速体验</button>
        </div>
        <ul className="quick-facts" aria-label="体验说明"><li><strong>约 5 分钟</strong><span>完成一次探索</span></li><li><strong>1 + 4</strong><span>一段经历，四道情境题</span></li><li><strong>3 + 1</strong><span>三条路径，一个行动</span></li></ul>
      </div>
      <div className="compass-scene" aria-label="三位导师共同校准职业方向的示意图">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="route-line route-one" /><div className="route-line route-two" />
        <div className="compass"><span className="compass-north">N</span><span className="compass-needle" /><span className="compass-center">职途<br />罗盘</span></div>
        {(["builder", "investor", "storyteller"] as const).map((mentor) => <article className={`mentor-card mentor-${mentor}`} key={mentor}><span className="mentor-icon" aria-hidden="true">{MENTOR_META[mentor].icon}</span><div><small>{MENTOR_META[mentor].short}</small><strong>{MENTOR_META[mentor].name}</strong></div></article>)}
        <span className="signal signal-a">证据</span><span className="signal signal-b">约束</span><span className="signal signal-c">行动</span>
      </div>
    </section>
    <section className="trust-strip" aria-label="产品原则"><p><span aria-hidden="true">◇</span> 不替你做职业决定</p><p><span aria-hidden="true">◎</span> 区分回答、资料与 AI 推断</p><p><span aria-hidden="true">↗</span> 每个方向都落到低成本验证</p></section>
    <section className="how-it-works section-shell"><div><p className="eyebrow">为什么不是又一次职业测评</p><h2>少一点标签，多一点可以验证的证据</h2></div><div className="method-grid"><article><span>01</span><h3>从真实经历出发</h3><p>没有正式实习也没关系，课程、社团与个人项目同样能暴露工作偏好。</p></article><article><span>02</span><h3>三种视角交叉观察</h3><p>不模拟名人，不做人格诊断，只从建造、长期选择和人的体验三个角度提问。</p></article><article><span>03</span><h3>把结论变成行动</h3><p>不是给你一串岗位名，而是解释排序、证据缺口、现实代价与七天验证任务。</p></article></div></section>
  </>;
}

function ChipSelector({ options, selected, onChange, label }: { options: string[]; selected: string[]; onChange: (values: string[]) => void; label: string }) {
  return <div className="chip-list" role="group" aria-label={label}>{options.map((item) => { const active = selected.includes(item); return <button key={item} type="button" className={`chip ${active ? "is-selected" : ""}`} aria-pressed={active} onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])}>{active ? "✓ " : "+ "}{item}</button>; })}</div>;
}

function ProfileForm({ profile, setProfile, onBack, onSubmit, isLoading, error }: { profile: Profile; setProfile: (profile: Profile) => void; onBack: () => void; onSubmit: () => void; isLoading: boolean; error: string }) {
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value });
  return <section className="flow-shell profile-layout">
    <aside className="flow-aside"><p className="eyebrow">01 · 带上一段真实经历</p><h2>让导师团先认识你做过的事</h2><p>我们关心你怎样处理任务，而不是学校、公司或职位光环。</p><div className="privacy-card"><strong>隐私边界</strong><p>请不要填写姓名、电话、身份证、精确住址、公司机密或他人的敏感信息。未经另行授权，内容不会进入经验分享。</p></div></aside>
    <form className="profile-form panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="field"><label htmlFor="experience"><span>1</span> 描述一件你投入过或印象深刻的项目 <b>*</b></label><p>课程、校园、实习、兼职、个人或正式工作项目都可以。</p><textarea id="experience" value={profile.experience} onChange={(event) => update("experience", event.target.value)} maxLength={1400} rows={5} placeholder="例如：我在毕业设计中重新设计了校园心理咨询预约体验……" required /><small>{profile.experience.length}/1400{profile.experience.length < 30 ? " · 至少 30 字" : ""}</small></div>
      <div className="field"><label htmlFor="responsibility"><span>2</span> 你具体负责了什么，结果如何？ <b>*</b></label><textarea id="responsibility" value={profile.responsibility} onChange={(event) => update("responsibility", event.target.value)} maxLength={1000} rows={4} placeholder="说明你的动作、产出与尚未验证的部分。" required /><small>{profile.responsibility.length}/1000{profile.responsibility.length < 15 ? " · 至少 15 字" : ""}</small></div>
      <div className="field field-split"><div><label><span>3</span> 你喜欢哪些任务？ <b>*</b></label><ChipSelector options={TASK_OPTIONS} selected={profile.likedTasks} onChange={(values) => update("likedTasks", values)} label="喜欢的任务" /></div><div><label><span>4</span> 你会排斥哪些任务？</label><ChipSelector options={TASK_OPTIONS} selected={profile.dislikedTasks} onChange={(values) => update("dislikedTasks", values)} label="排斥的任务" /></div></div>
      <div className="field"><label htmlFor="skills"><span>5</span> 你已经会些什么？</label><input id="skills" value={profile.skills} onChange={(event) => update("skills", event.target.value)} maxLength={500} placeholder="工具、方法、语言或可证明的能力" /></div>
      <div className="field compact-grid"><div><label htmlFor="weeklyTime"><span>6</span> 每周可投入</label><input id="weeklyTime" value={profile.weeklyTime} onChange={(event) => update("weeklyTime", event.target.value)} maxLength={80} placeholder="如：5—8 小时" /></div><div><label htmlFor="budget">学习预算</label><input id="budget" value={profile.budget} onChange={(event) => update("budget", event.target.value)} maxLength={80} placeholder="如：500 元以内" /></div><div><label htmlFor="location">地区 / 远程要求</label><input id="location" value={profile.location} onChange={(event) => update("location", event.target.value)} maxLength={100} /></div></div>
      <div className="field"><label><span>7</span> 你最看重哪些工作特征？ <b>*</b></label><ChipSelector options={VALUE_OPTIONS} selected={profile.workValues} onChange={(values) => update("workValues", values)} label="看重的工作特征" /></div>
      {error && <div className="error-banner" role="alert"><span>!</span>{error}</div>}
      <div className="form-actions"><button className="button button-ghost" type="button" onClick={onBack}>返回</button><button className="button button-primary" type="submit" disabled={isLoading}>{isLoading ? "导师团正在准备问题…" : "请导师团开始提问 →"}</button></div>
    </form>
  </section>;
}

function MentorRail({ current }: { current: Question["mentor"] }) {
  return <div className="mentor-rail" aria-label="三位导师"><span className="rail-line" />{(["builder", "investor", "storyteller"] as const).map((mentor) => <div key={mentor} className={`rail-mentor mentor-tone-${mentor} ${current === mentor ? "is-current" : ""}`}><span>{MENTOR_META[mentor].icon}</span><div><strong>{MENTOR_META[mentor].name}</strong><small>{MENTOR_META[mentor].short}</small></div></div>)}</div>;
}

function QuestionFlow({ questions, answers, setAnswers, onBack, fallbackReason }: { questions: Question[]; answers: Answer[]; setAnswers: (answers: Answer[]) => void; onBack: () => void; fallbackReason: QuestionFallbackReason | null }) {
  const index = Math.min(answers.length, questions.length - 1);
  const question = questions[index];
  const [pending, setPending] = useState<Answer | null>(null);
  const [supplement, setSupplement] = useState("");
  const choose = (option: Question["options"][number]) => setPending({ questionId: question.id, optionId: option.id, optionLabel: option.label, signals: option.signals, insight: option.insight });
  const chooseCustom = () => setPending({ questionId: question.id, optionId: "custom", optionLabel: "补充说明", signals: ["custom-evidence"], insight: "你的补充会作为一条独立证据进入报告，不会被强行归入某个人格标签。", supplement });
  const advance = () => { if (!pending) return; setAnswers([...answers, { ...pending, supplement: pending.optionId === "custom" ? supplement : undefined }]); };
  return <section className="flow-shell questions-layout">
    <aside><p className="eyebrow">02 · 四道动态情境题</p><MentorRail current={question.mentor} /><button className="text-button" type="button" onClick={onBack}>← 返回修改经历</button></aside>
    <div className="question-panel panel">
      <div className="question-top"><span className={`mentor-avatar mentor-tone-${question.mentor}`}>{MENTOR_META[question.mentor].icon}</span><div><small>{MENTOR_META[question.mentor].name}</small><strong>{index + 1} / 4</strong></div></div>
      {fallbackReason && <div className="notice-banner" role="status">个性化问题生成未完成（{fallbackReason.label}），已切换到通用探索题，你仍然可以继续体验。</div>}
      {index === 3 && <p className="followup-hint">导师团发现这里还有一个值得确认的地方：{question.triggerReason}</p>}
      <h2>{question.prompt}</h2>
      <div className="option-list">{question.options.map((option, optionIndex) => <button type="button" className={`option-card ${pending?.optionId === option.id ? "is-selected" : ""}`} key={option.id} onClick={() => choose(option)}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option.label}</p><i aria-hidden="true">{pending?.optionId === option.id ? "✓" : "→"}</i></button>)}<button type="button" className={`option-card option-custom ${pending?.optionId === "custom" ? "is-selected" : ""}`} onClick={chooseCustom}><span>＋</span><p>都不符合，我想补充一句</p><i aria-hidden="true">→</i></button></div>
      {pending?.optionId === "custom" && <textarea className="supplement-input" value={supplement} onChange={(event) => { setSupplement(event.target.value); setPending({ ...pending, supplement: event.target.value }); }} maxLength={240} rows={3} autoFocus placeholder="用自己的话补充，最多 240 字" />}
      {pending && pending.optionId !== "custom" && <div className="insight-card"><span>新线索</span><p>{pending.insight}</p></div>}
      <div className="question-footer"><div className="progress-dots">{[0,1,2,3].map((dot) => <span key={dot} className={dot < answers.length ? "is-done" : dot === index ? "is-current" : ""} />)}</div><button className="button button-primary" type="button" disabled={!pending || (pending.optionId === "custom" && supplement.trim().length < 3)} onClick={advance}>{questions.length === 4 && index === 3 ? "生成我的职业路径 →" : "确认，下一题 →"}</button></div>
    </div>
  </section>;
}

function Generating({ error, onRetry, onBack }: { error: string; onRetry: () => void; onBack: () => void }) {
  const [active, setActive] = useState(0);
  useEffect(() => { if (error) return; const timer = window.setInterval(() => setActive((value) => Math.min(2, value + 1)), 2100); return () => window.clearInterval(timer); }, [error]);
  return <section className="generating-shell"><div className="thinking-compass"><span /><strong>正在校准</strong></div><p className="eyebrow">三位导师正在汇总证据</p><h2>{error ? "这次生成没有顺利完成" : "你的路径正在浮现"}</h2>{error ? <><div className="error-banner large" role="alert"><span>!</span>{error}</div><div className="hero-actions centered"><button className="button button-primary" type="button" onClick={onRetry}>重新生成</button><button className="button button-secondary" type="button" onClick={onBack}>返回修改</button></div></> : <div className="generation-steps">{["整理你的经历和导师观察", "检索可能相关的职业资料", "比较路径并生成七天行动"].map((label, index) => <div key={label} className={active >= index ? "is-active" : ""}><span>{active > index ? "✓" : index + 1}</span><p>{label}</p><i>{active === index ? "进行中" : active > index ? "已完成" : "等待中"}</i></div>)}</div>}<p className="slow-note">通常需要 10—60 秒。请不要关闭页面，你的输入已保存在当前浏览器。</p></section>;
}

function EvidenceBadge({ label }: { label: EvidenceLabel }) { return <span className="evidence-badge"><i>{evidenceIcons[label]}</i>{label}</span>; }
function DetailBlock({ title, items }: { title: string; items: string[] }) { return <div className="detail-block"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>; }

function ReportView({ report, profile, onModify, onShare }: { report: CareerReport; profile: Profile; onModify: () => void; onShare: () => void }) {
  const [openPath, setOpenPath] = useState(0);
  const [showPremium, setShowPremium] = useState(false);
  const [leadState, setLeadState] = useState<{ requestId: string; leads: JobOpportunityLead[] }>({ requestId: report.requestId, leads: [] });
  const opportunityLeads = leadState.requestId === report.requestId ? leadState.leads : [];
  const handleLeadsChange = useCallback((leads: JobOpportunityLead[]) => setLeadState({ requestId: report.requestId, leads }), [report.requestId]);
  const sourceById = useMemo(() => new Map(report.sources.map((source) => [source.id, source])), [report.sources]);
  return <section className="report-shell">
    <div className="report-heading"><div><p className="eyebrow">03 · 从夯到拉的验证顺序</p><h1>你的优先验证顺序</h1><p>这不是职业定论，而是基于你当前提供的证据和资料，建议先后验证的三个方向。</p></div><button className="button button-secondary" type="button" onClick={onModify}>修改回答并重新生成</button></div>
    <section className="observation-section"><div className="section-title"><span>导师观察</span><h2>导师团如何理解你</h2></div><div className="observation-grid">{report.mentorObservations.map((item) => <article key={item.mentor} className={`observation-card mentor-tone-${item.mentor}`}><span className="mentor-avatar">{MENTOR_META[item.mentor].icon}</span><small>{MENTOR_META[item.mentor].name}</small><p>{item.observation}</p><details><summary>查看对应回答</summary><ul>{item.supportingAnswers.map((answer) => <li key={answer}>{answer.length > 80 ? answer.slice(0, 80) + "…" : answer}</li>)}</ul></details></article>)}</div></section>
    <section className="path-section"><div className="section-title"><span>路径榜</span><h2>先后验证，不是高低评判</h2></div><div className="path-stack">{report.rankedPaths.map((path, index) => { const open = openPath === index; const copy = priorityCopy[path.priority]; return <article key={`${path.priority}-${path.title}`} className={`path-card priority-${path.priority} ${open ? "is-open" : ""}`}><button className="path-summary" type="button" aria-expanded={open} onClick={() => setOpenPath(open ? -1 : index)}><span className="priority-mark"><b>{path.priority}</b><small>{copy.title}</small></span><span className="path-copy"><small>{path.field}</small><strong>{path.title}</strong><p>{path.summary}</p><span className="mini-evidence">{path.evidenceItems.slice(0,3).map((evidence) => <EvidenceBadge key={`${evidence.label}-${evidence.content}`} label={evidence.label} />)}</span></span><span className="expand-icon">{open ? "−" : "+"}<small>{open ? "收起" : "查看为什么排这里"}</small></span></button>{open && <div className="path-detail"><div className="priority-explain"><strong>{path.priority}｜{copy.title}</strong><p>{copy.note}</p></div><div className="detail-grid"><DetailBlock title="为什么与我匹配" items={path.matchReasons} /><DetailBlock title="导师观察如何支持" items={path.mentorSupport} /><DetailBlock title="真实工作内容" items={path.realWork} /><DetailBlock title="初级进入门槛" items={path.entryRequirements} /><DetailBlock title="工作方式与现实代价" items={path.tradeoffs} /><DetailBlock title="我还缺少哪些证据" items={path.evidenceGaps} /></div><div className="evidence-ledger"><h3>证据账本</h3>{path.evidenceItems.map((item) => <div key={`${item.label}-${item.content}`}><EvidenceBadge label={item.label} /><p>{item.content}</p><EvidenceSourceLinks sourceIds={item.sourceIds} sourceById={sourceById} /></div>)}</div><div className="action-plan"><header><span>7 DAY TEST</span><div><small>七天验证任务</small><h3>{path.sevenDayAction.task}</h3></div></header><div className="action-meta"><span>预计 {path.sevenDayAction.estimatedTime}</span><span>预算 {path.sevenDayAction.budget}</span><span>产出：{path.sevenDayAction.output}</span></div><div className="action-columns"><DetailBlock title="完成标准" items={path.sevenDayAction.doneCriteria} /><DetailBlock title="继续，如果…" items={path.sevenDayAction.continueIf} /><DetailBlock title="调整，如果…" items={path.sevenDayAction.adjustIf} /><DetailBlock title="退出，如果…" items={path.sevenDayAction.exitIf} /></div></div><div className="uncertainty"><strong>仍需核实</strong><ul>{path.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}</article>; })}</div></section>
    <JobVerificationPanel key={report.requestId} report={report} profile={profile} onLeadsChange={handleLeadsChange} />
    <section className="sources-section"><div className="section-title"><span>职业判断依据</span><h2>资料有出处，岗位有时效</h2><p className="section-description">职业资料用于解释工作内容与进入门槛；企业官网机会仅表示检索时发现了相关官方页面。只有上方通过动态核验的岗位才会标记“核验时仍在招”，官网线索请打开后确认地点与投递状态。</p></div><div className="source-list">{report.sources.map((source) => <article id={`source-${source.id}`} key={source.id}><div><EvidenceBadge label={source.label} /><span className={`confidence confidence-${source.confidence}`}>{source.confidence}</span></div><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a><p>{source.publisher} · {source.region}</p><small>{source.supports}</small><footer>资料时间：{source.publishedOrCheckedAt} · 获取：{source.retrievedAt.slice(0,10)}</footer></article>)}{opportunityLeads.map((lead) => <article className="source-opportunity-lead" key={lead.id}><div><span className="opportunity-lead-badge">企业官网机会</span><span className="confidence confidence-待核实">待打开确认</span></div><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title} ↗</a><p>{lead.company} · {lead.ats} 企业招聘官网</p><small>对应「{lead.pathTitle}」：{lead.relationshipNote}</small><footer>{lead.locationHint} · 发现：{lead.foundAt.slice(0, 10)}</footer></article>)}</div></section>
    <section className="report-cta"><div><p className="eyebrow">把一次探索变成长期复利</p><h2>想看更深，或让真实经验帮助下一位探索者？</h2><p>高级报告与积分兑换是正式产品路线预览；Demo 不收费、不发放真实积分。</p></div><div><button className="button button-secondary" type="button" onClick={() => setShowPremium(true)}>升级高级报告 <small>路线预览</small></button><button className="button button-primary" type="button" onClick={onShare}>分享行业经验，审核通过得积分</button></div></section>
    {showPremium && <div className="toast" role="status"><button type="button" aria-label="关闭高级报告提示" onClick={() => setShowPremium(false)}>×</button><strong>高级报告将在正式产品中开放</strong><p>Demo 不收费。未来将增加长期反馈、细分地区资料和行动复盘。</p></div>}
  </section>;
}

function ContributionDialog({ step, setStep, profile, draft, setDraft }: { step: ShareStep; setStep: (step: ShareStep) => void; profile: Profile; draft: ContributionDraft | null; setDraft: (draft: ContributionDraft) => void }) {
  const [experienceType, setExperienceType] = useState("课程或校园项目");
  const [checks, setChecks] = useState([false, false, false, false, false]);
  const [anonymous, setAnonymous] = useState(true);
  const [localError, setLocalError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (step !== "closed") dialogRef.current?.focus(); }, [step]);
  if (step === "closed") return null;
  const generate = async () => { setStep("loading"); setLocalError(""); try { const value = await apiCall<ContributionDraft>({ mode: "generate_contribution_draft", requestId: requestId(), profile, experienceType, authorized: true }); setDraft(value); setStep("draft"); } catch (error) { setLocalError(error instanceof Error ? error.message : "草稿生成失败。"); setStep("permission"); } };
  const saveContribution = (status: "draft" | "pending") => {
    if (!draft) return;
    try {
      localStorage.setItem(SHARE_KEY, JSON.stringify({ draft, anonymous, status, savedAt: new Date().toISOString() }));
      setLocalError("");
      setStep(status === "pending" ? "submitted" : "closed");
    } catch {
      setLocalError("当前浏览器无法保存草稿，请复制内容后再关闭。");
    }
  };
  const fields: Array<[keyof ContributionDraft, string]> = [["experienceType","经验类型"],["field","岗位或领域"],["regionAndTime","地区和时间"],["projectType","项目或公司类型"],["actualTasks","实际任务"],["skills","使用的技能"],["hiddenDifficulties","容易被忽略的困难"],["advice","对后来者的建议"],["limits","适用范围和局限"]];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setStep("closed"); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={dialogRef} tabIndex={-1}><button className="modal-close" type="button" onClick={() => setStep("closed")} aria-label="关闭">×</button>{step === "permission" && <><p className="eyebrow">自愿分享 · 默认不授权</p><h2 id="share-title">先确认边界，再整理草稿</h2><p className="modal-lead">是否允许系统从你选择的经历中整理一份分享草稿？未经你的查看、修改和最终确认，内容不会进入正式行业知识库。</p><div className="permission-points"><p><span>✓</span> 只处理你本次选择的项目经历</p><p><span>✓</span> 草稿可编辑，也可以随时放弃</p><p><span>✓</span> Demo 仅保存在当前浏览器</p></div><label className="field"><b>这段经验属于</b><select value={experienceType} onChange={(event) => setExperienceType(event.target.value)}><option>正式工作</option><option>实习</option><option>兼职或自由职业</option><option>招聘或面试</option><option>课程或校园项目</option><option>个人项目</option><option>行业观察</option></select></label>{localError && <div className="error-banner">{localError}</div>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setStep("closed")}>暂不分享</button><button className="button button-primary" type="button" onClick={generate}>允许整理分享草稿</button></div></>}
      {step === "loading" && <div className="modal-loading"><div className="thinking-compass"><span /></div><h2 id="share-title">正在整理可编辑草稿</h2><p>系统正在区分个人经验、适用范围与需要删除的敏感内容。</p></div>}
      {step === "draft" && draft && <><p className="eyebrow">分享草稿 · 提交前仍可修改</p><h2 id="share-title">请逐项核对这是不是你的真实经验</h2><div className="draft-grid">{fields.map(([key,label]) => <label key={key}><span>{label}</span><textarea rows={key === "actualTasks" || key === "hiddenDifficulties" ? 4 : 3} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}</div><div className="sensitive-notice"><strong>敏感内容提醒</strong><p>{draft.sensitiveContentNotice}</p></div>{localError && <div className="error-banner">{localError}</div>}<label className="check-row"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /><span>匿名展示（推荐）</span></label><div className="confirm-list">{["内容来自本人真实经历","不包含他人隐私","不包含公司、客户或项目机密","同意审核后被其他用户的报告引用","理解个人经验不代表整个行业"].map((label,index) => <label className="check-row" key={label}><input type="checkbox" checked={checks[index]} onChange={(event) => setChecks(checks.map((value,i) => i === index ? event.target.checked : value))} /><span>{label}</span></label>)}</div><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => saveContribution("draft")}>保存草稿，暂不提交</button><button className="button button-primary" type="button" disabled={!checks.every(Boolean)} onClick={() => saveContribution("pending")}>确认并保存为待审核</button></div></>}
      {step === "submitted" && <div className="submitted-state"><span>✓</span><p className="eyebrow">已保存在当前浏览器</p><h2 id="share-title">分享草稿已保存为待审核</h2><p>Demo 阶段内容不会进入正式行业知识库，也不会发放真实积分。正式产品中，仅审核通过且被证明有用的知识会获得积分。</p><button className="button button-primary" type="button" onClick={() => setStep("closed")}>完成</button></div>}
    </div></div>;
}

export default function CareerExplorer() {
  const [stage, setStage] = useState<Stage>("intro");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [baseQuestions, setBaseQuestions] = useState<Question[]>([]);
  const [followUps, setFollowUps] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [report, setReport] = useState<CareerReport | null>(null);
  const [questionFallback, setQuestionFallback] = useState<QuestionFallbackReason | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [shareStep, setShareStep] = useState<ShareStep>("closed");
  const [shareDraft, setShareDraft] = useState<ContributionDraft | null>(null);

  useEffect(() => {
    const online = () => setOffline(false); const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online); window.addEventListener("offline", offlineHandler);
    window.requestAnimationFrame(() => {
      setOffline(!navigator.onLine);
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedState | null;
        if (saved?.profile) {
          setProfile(saved.profile); setBaseQuestions(saved.questions ?? []); setFollowUps(saved.followUps ?? []); setQuestionFallback(saved.questionFallback ?? null);
          setAnswers(saved.answers?.length === 4 && !saved.report ? saved.answers.slice(0, 3) : saved.answers ?? []);
          setReport(saved.report ?? null); setStage(saved.report ? "report" : saved.stage === "generating_report" ? "questions" : saved.stage);
        }
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setHydrated(true);
    });
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offlineHandler); };
  }, []);
  useEffect(() => { if (!hydrated) return; const safeStage = stage === "generating_report" ? "questions" : stage; try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage: safeStage, profile, questions: baseQuestions, followUps, questionFallback, answers, report, savedAt: new Date().toISOString() } satisfies SavedState)); } catch { /* 浏览器禁用存储时仍允许继续当前会话。 */ } }, [stage, profile, baseQuestions, followUps, questionFallback, answers, report, hydrated]);

  const selectedFollowUp = useMemo(() => {
    if (answers.length < 3 || followUps.length === 0) return null;
    const signals = answers.slice(0, 3).flatMap((answer) => answer.signals);
    return [...followUps].sort((a, b) => (b.triggerSignals?.filter((signal) => signals.includes(signal)).length ?? 0) - (a.triggerSignals?.filter((signal) => signals.includes(signal)).length ?? 0))[0];
  }, [answers, followUps]);
  const activeQuestions = useMemo(() => [...baseQuestions, ...(selectedFollowUp ? [selectedFollowUp] : [])], [baseQuestions, selectedFollowUp]);

  const goHome = () => { if (stage === "intro" || window.confirm("返回首页不会删除已保存的内容，确定返回吗？")) setStage("intro"); };
  const generateQuestions = async () => { setLoadingQuestions(true); setError(""); try { const result = await apiCall<QuestionsResponse>({ mode: "generate_questions", requestId: requestId(), profile }); setBaseQuestions(result.questions); setFollowUps(result.followUpCandidates); setAnswers([]); setQuestionFallback(result.isFallback ? result.fallbackReason ?? { code: "unavailable", label: "AI 服务暂时不可用" } : null); setStage("questions"); window.scrollTo({ top: 0, behavior: "smooth" }); } catch (caught) { setError(caught instanceof Error ? caught.message : "问题生成失败，请重试。"); } finally { setLoadingQuestions(false); } };
  const generateReport = async (reportAnswers: Answer[]) => { if (reportAnswers.length !== 4) return; setError(""); setStage("generating_report"); window.scrollTo({ top: 0, behavior: "smooth" }); try { const result = await apiCall<CareerReport>({ mode: "generate_report", requestId: requestId(), profile, answers: reportAnswers }); setReport(result); setStage("report"); window.scrollTo({ top: 0, behavior: "smooth" }); } catch (caught) { setError(caught instanceof Error ? caught.message : "报告生成失败，请重试。"); } };
  const updateAnswers = (nextAnswers: Answer[]) => { setAnswers(nextAnswers); if (nextAnswers.length === 4) void generateReport(nextAnswers); };

  return <main>
    <BrandHeader stage={stage} onHome={goHome} />
    {offline && <div className="offline-banner" role="status">当前处于离线状态。输入已保存；恢复网络后请手动重试。</div>}
    {stage === "intro" && <Intro onStart={() => { setProfile(EMPTY_PROFILE); setError(""); setStage("profile"); }} onExample={() => { setProfile(EXAMPLE_PROFILE); setError(""); setStage("profile"); }} />}
    {stage === "profile" && <ProfileForm profile={profile} setProfile={setProfile} onBack={() => setStage("intro")} onSubmit={generateQuestions} isLoading={loadingQuestions} error={error} />}
    {stage === "questions" && baseQuestions.length === 3 && <QuestionFlow key={answers.length} questions={activeQuestions} answers={answers} setAnswers={updateAnswers} onBack={() => setStage("profile")} fallbackReason={questionFallback} />}
    {stage === "generating_report" && <Generating error={error} onRetry={() => void generateReport(answers)} onBack={() => setStage("profile")} />}
    {stage === "report" && report && <ReportView report={report} profile={profile} onModify={() => { setAnswers([]); setStage("questions"); }} onShare={() => setShareStep("permission")} />}
    <ContributionDialog step={shareStep} setStep={setShareStep} profile={profile} draft={shareDraft} setDraft={setShareDraft} />
    <footer className="site-footer"><span>职途罗盘</span><p>职业探索不是职业定论。请用真实任务和可信来源继续验证。</p></footer>
  </main>;
}
