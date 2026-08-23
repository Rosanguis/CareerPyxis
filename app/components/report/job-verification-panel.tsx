"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiErrorBody, CareerReport, JobPathInput, JobSearchProfile, JobVerificationResponse, Profile } from "@/lib/types";

type PathState = {
  status: "queued" | "verifying" | "complete" | "error";
  result?: JobVerificationResponse;
  error?: string;
};

function createRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `job-${Date.now()}`;
}

function initialStates(report: CareerReport): PathState[] {
  return report.rankedPaths.map(() => ({ status: "queued" }));
}

function toSearchProfile(profile: Profile): JobSearchProfile {
  return {
    experienceSummary: profile.experience.slice(0, 500),
    location: profile.location,
    skills: profile.skills,
    likedTasks: profile.likedTasks,
    dislikedTasks: profile.dislikedTasks,
    workValues: profile.workValues,
  };
}

function toPathInput(path: CareerReport["rankedPaths"][number]): JobPathInput {
  return { priority: path.priority, title: path.title, field: path.field, entryRequirements: path.entryRequirements.slice(0, 8), targetTasks: path.realWork.slice(0, 6) };
}

async function requestVerification(report: CareerReport, profile: Profile, pathIndex: number, signal: AbortSignal): Promise<JobVerificationResponse> {
  const response = await fetch("/api/job-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      requestId: createRequestId(),
      reportRequestId: report.requestId,
      profile: toSearchProfile(profile),
      path: toPathInput(report.rankedPaths[pathIndex]),
    }),
  });
  const data = await response.json() as JobVerificationResponse | ApiErrorBody;
  if (!response.ok) throw new Error("error" in data ? data.error.message : "岗位核验失败，请稍后重试。");
  return data as JobVerificationResponse;
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未确认";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

const tierCopy = {
  exact: { label: "目标岗位", note: "与报告方向一致" },
  synonym: { label: "同义岗位名", note: "名称不同，但核心职责与产出基本一致" },
  adjacent: { label: "相邻起步岗", note: "与目标方向共享核心任务，适合作为进一步验证的切入口" },
} as const;

export function JobVerificationPanel({ report, profile }: { report: CareerReport; profile: Profile }) {
  const [paths, setPaths] = useState<PathState[]>(() => initialStates(report));
  const runRef = useRef(0);

  const verifyOne = useCallback(async (pathIndex: number, runId: number, parentSignal?: AbortSignal) => {
    setPaths((current) => current.map((item, index) => index === pathIndex ? { ...item, status: "verifying", error: undefined } : item));
    const timeout = AbortSignal.timeout(65_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    try {
      const result = await requestVerification(report, profile, pathIndex, signal);
      if (runRef.current !== runId) return;
      setPaths((current) => current.map((item, index) => index === pathIndex ? { status: "complete", result } : item));
    } catch (error) {
      if (runRef.current !== runId || signal.aborted && parentSignal?.aborted) return;
      const message = signal.aborted ? "岗位核验超时，报告内容不受影响。" : error instanceof Error ? error.message : "岗位核验失败，请稍后重试。";
      setPaths((current) => current.map((item, index) => index === pathIndex ? { status: "error", error: message } : item));
    }
  }, [profile, report]);

  useEffect(() => {
    const runId = ++runRef.current;
    const controller = new AbortController();
    const run = async () => {
      for (let index = 0; index < report.rankedPaths.length; index += 1) {
        if (controller.signal.aborted || runRef.current !== runId) return;
        await verifyOne(index, runId, controller.signal);
      }
    };
    void run();
    return () => {
      runRef.current += 1;
      controller.abort();
    };
  }, [report.rankedPaths.length, verifyOne]);

  const completed = paths.filter((item) => item.status === "complete").length;
  const failed = paths.filter((item) => item.status === "error").length;
  const settled = completed + failed;
  const jobs = useMemo(() => paths.flatMap((item) => item.result?.jobs ?? []), [paths]);
  const isRunning = paths.some((item) => item.status === "queued" || item.status === "verifying");
  const allMock = paths.length > 0 && paths.every((item) => item.result?.status === "mock");
  const allEmpty = paths.length > 0 && paths.every((item) => item.result?.status === "empty");
  const summary = isRunning ? `正在核验 ${settled} / ${paths.length} 个方向` : failed > 0 ? `已核验 ${completed} 个方向，${failed} 个未完成` : allMock ? "当前是缓存演示模式，未执行实时岗位检索" : `已完成 ${completed} 个方向的核验`;

  return <section className="job-verification-section" aria-labelledby="job-verification-title">
    <div className="section-title"><span>实时岗位核验</span><h2 id="job-verification-title">报告先读，岗位随后逐条确认</h2></div>
    <div className="verification-summary" role="status" aria-live="polite">
      <span className={isRunning ? "verification-pulse" : "verification-done"} aria-hidden="true" />
      <div><strong>{summary}</strong><p>系统只使用职业方向、地区和当前已知条件联网查询。报告已经可以阅读，无需等待这里完成。</p></div>
    </div>
    <div className="verification-paths">{report.rankedPaths.map((path, index) => {
      const state = paths[index];
      const result = state?.result;
      const label = state?.status === "verifying" ? "核验中" : state?.status === "queued" ? "等待核验" : state?.status === "error" ? "未完成" : result?.status === "verified" ? `找到 ${result.jobs.length} 个` : result?.status === "mock" ? "演示模式" : "暂无合格岗位";
      return <article key={`${path.priority}-${path.title}`} className={`verification-path status-${state?.status ?? "queued"}`}><header><span>{path.priority}</span><div><small>{path.field}</small><strong>{path.title}</strong></div><b>{label}</b></header>{state?.status === "verifying" && <p>正在查找目标岗位、同义岗位名和相邻起步岗，并检查官方发布状态、申请入口与适配条件…</p>}{result && <><p>{result.message}</p><small>检查 {result.checkedCount} 条官方候选，排除 {result.rejectedCount} 条 · {formatCheckedAt(result.verifiedAt)}</small>{result.searchedScopes.length > 0 && <details className="searched-scopes"><summary>查看本次检索设置</summary><ul>{result.searchedScopes.map((scope) => <li key={scope}>{scope}</li>)}</ul></details>}{state?.status === "complete" && result.status !== "mock" && <button className="verification-refresh" type="button" onClick={() => { const runId = runRef.current; void verifyOne(index, runId); }}>重新核验「{path.title}」</button>}</>}{state?.status === "error" && <div className="verification-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => { const runId = runRef.current; void verifyOne(index, runId); }}>重新核验「{path.title}」</button></div>}</article>;
    })}</div>
    {jobs.length > 0 ? <div className="verified-jobs"><h3>当前通过发布状态与条件初筛的岗位</h3><div className="verified-job-grid">{jobs.map((job) => { const tier = tierCopy[job.searchTier]; return <article className="verified-job-card" key={job.id}><header><span>核验时仍在招</span><small>{job.ats} 官方发布</small></header><div className={`job-tier tier-${job.searchTier}`}><strong>{tier.label}</strong><span>{tier.note}</span></div><p className="job-path-origin">对应报告方向：{job.pathTitle}</p><h4>{job.title}</h4><p className="job-company">{job.company}</p>{job.searchTier !== "exact" && <p className="job-expansion">为什么把它列入当前层级：{job.expansionReason}</p>}<div className="job-meta"><span>{job.location}</span><span>{job.workMode}</span><span>{job.employmentType}</span></div><div className="job-fit"><strong>为什么进入当前清单</strong><ul>{job.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><div className="job-cautions"><strong>投递前仍需确认</strong><ul>{job.cautions.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><p className="job-verified-at">核验于 {formatCheckedAt(job.verifiedAt)}：{job.verificationSignals.join("；")}</p><a className="button button-primary" href={job.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`前往 ${job.company} 的 ${job.title} 官方申请页，将在新窗口打开`}>前往官方申请页 ↗</a></article>; })}</div></div> : allEmpty && <div className="verification-empty"><strong>本轮未发现同时通过当前核验规则的岗位</strong><p>系统已检查本次实际生成的目标岗位名、同义岗位名、可用的相邻起步岗和地区范围，并排除了无法确认仍在招、地区明显冲突或职业阶段不符的结果。这不代表市场上没有机会，你可以在方向卡中稍后重新核验。</p></div>}
    <p className="verification-notice">核验口径：仅展示 Greenhouse、Lever、Ashby、SmartRecruiters 官方公开 API 当前仍发布的岗位；“核验时仍在招”只代表当时未发现当前已知硬条件冲突，提交前请再次查看官方页面。</p>
  </section>;
}
