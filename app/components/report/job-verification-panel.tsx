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
  return { priority: path.priority, title: path.title, field: path.field, entryRequirements: path.entryRequirements.slice(0, 8) };
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

export function JobVerificationPanel({ report, profile }: { report: CareerReport; profile: Profile }) {
  const [paths, setPaths] = useState<PathState[]>(() => initialStates(report));
  const runRef = useRef(0);

  const verifyOne = useCallback(async (pathIndex: number, runId: number, parentSignal?: AbortSignal) => {
    setPaths((current) => current.map((item, index) => index === pathIndex ? { status: "verifying" } : item));
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

  const completed = paths.filter((item) => item.status === "complete" || item.status === "error").length;
  const jobs = useMemo(() => paths.flatMap((item) => item.result?.jobs ?? []), [paths]);
  const isRunning = completed < paths.length;

  return <section className="job-verification-section" aria-labelledby="job-verification-title">
    <div className="section-title"><span>实时岗位核验</span><h2 id="job-verification-title">报告先读，岗位随后逐条确认</h2></div>
    <div className="verification-summary" role="status" aria-live="polite">
      <span className={isRunning ? "verification-pulse" : "verification-done"} aria-hidden="true" />
      <div><strong>{isRunning ? `正在核验 ${completed} / ${paths.length} 个方向` : `已完成 ${paths.length} 个方向的核验`}</strong><p>系统只使用职业方向、地区和当前已知条件联网查询。报告已经可以阅读，无需等待这里完成。</p></div>
    </div>
    <div className="verification-paths">{report.rankedPaths.map((path, index) => {
      const state = paths[index];
      const result = state?.result;
      const label = state?.status === "verifying" ? "核验中" : state?.status === "queued" ? "等待核验" : state?.status === "error" ? "未完成" : result?.status === "verified" ? `找到 ${result.jobs.length} 个` : result?.status === "mock" ? "演示模式" : "暂无合格岗位";
      return <article key={`${path.priority}-${path.title}`} className={`verification-path status-${state?.status ?? "queued"}`}><header><span>{path.priority}</span><div><small>{path.field}</small><strong>{path.title}</strong></div><b>{label}</b></header>{state?.status === "verifying" && <p>正在检查官方 ATS 发布状态、申请入口、地区与职业阶段…</p>}{result && <><p>{result.message}</p><small>检查 {result.checkedCount} 条官方候选，排除 {result.rejectedCount} 条 · {formatCheckedAt(result.verifiedAt)}</small></>}{state?.status === "error" && <div className="verification-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => { const runId = runRef.current; void verifyOne(index, runId); }}>重新核验「{path.title}」</button></div>}</article>;
    })}</div>
    {jobs.length > 0 ? <div className="verified-jobs"><h3>当前通过双重核验的岗位</h3><div className="verified-job-grid">{jobs.map((job) => <article className="verified-job-card" key={job.id}><header><span>已核验可投</span><small>{job.ats} 官方发布</small></header><h4>{job.title}</h4><p className="job-company">{job.company}</p><div className="job-meta"><span>{job.location}</span><span>{job.workMode}</span><span>{job.employmentType}</span></div><div className="job-fit"><strong>为什么进入当前清单</strong><ul>{job.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><div className="job-cautions"><strong>投递前仍需确认</strong><ul>{job.cautions.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><p className="job-verified-at">核验于 {formatCheckedAt(job.verifiedAt)}：{job.verificationSignals.join("；")}</p><a className="button button-primary" href={job.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`前往 ${job.company} 的 ${job.title} 官方申请页，将在新窗口打开`}>前往官方申请页 ↗</a></article>)}</div></div> : !isRunning && <div className="verification-empty"><strong>本轮没有可安全展示的投递链接</strong><p>这不代表市场上没有机会。系统宁可留空，也不会把聚合页、关闭岗位或无法确认的链接包装成推荐。</p></div>}
    <p className="verification-notice">核验口径：仅支持 Greenhouse、Lever、Ashby 官方公开岗位 API；“已核验可投”只代表核验时仍公开且未发现当前已知硬条件冲突，提交前请再次查看官方页面。</p>
  </section>;
}
