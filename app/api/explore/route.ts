import type { Answer, ExploreRequest, Profile } from "@/lib/types";
import { generateContribution, generateQuestions, generateReport } from "@/lib/server/explore-service";
import { ProviderError } from "@/lib/server/model-provider";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_BODY_BYTES = 32_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: Request): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown, maxItems: number, maxLength = 80): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.length <= maxLength);
}

function isProfile(value: unknown): value is Profile {
  if (!isRecord(value)) return false;
  const fields = ["experience", "responsibility", "skills", "weeklyTime", "budget", "location"];
  return fields.every((field) => typeof value[field] === "string") &&
    (value.experience as string).length <= 1_400 && (value.responsibility as string).length <= 1_000 &&
    (value.skills as string).length <= 500 && (value.weeklyTime as string).length <= 80 &&
    (value.budget as string).length <= 80 && (value.location as string).length <= 100 &&
    isStringList(value.likedTasks, 8, 40) && isStringList(value.dislikedTasks, 8, 40) && isStringList(value.workValues, 8, 40);
}

function isAnswer(value: unknown): value is Answer {
  if (!isRecord(value)) return false;
  return ["questionId", "optionId", "optionLabel", "insight"].every((field) => typeof value[field] === "string" && (value[field] as string).length <= 500) &&
    isStringList(value.signals, 12, 80) && (value.supplement === undefined || (typeof value.supplement === "string" && value.supplement.length <= 500));
}

function isExploreRequest(value: unknown): value is ExploreRequest {
  if (!isRecord(value) || !isProfile(value.profile) || typeof value.mode !== "string") return false;
  if (typeof value.requestId !== "string" || value.requestId.length > 80) return false;
  if (value.mode === "generate_questions") return true;
  if (value.mode === "generate_report") return Array.isArray(value.answers) && value.answers.length === 4 && value.answers.every(isAnswer);
  if (value.mode === "generate_contribution_draft") return typeof value.authorized === "boolean" && typeof value.experienceType === "string" && value.experienceType.length <= 40;
  return false;
}

function errorResponse(error: unknown, requestId: string, stage?: string) {
  const known = error instanceof ProviderError;
  const code = known ? error.code : "PROVIDER_SERVER_ERROR";
  const message = known ? error.message : "生成过程遇到暂时性问题，请重试或返回修改。";
  const retryable = known ? error.retryable : true;
  const status = code === "AUTH_ERROR" ? 503 : code === "INVALID_OUTPUT" && !retryable ? 400 : code === "RATE_LIMIT" ? 429 : 500;
  console.error(JSON.stringify({ requestId, stage, code, retryable }));
  return Response.json({ error: { code, message, retryable, stage }, requestId }, { status });
}

export async function POST(request: Request) {
  const fallbackId = crypto.randomUUID();
  if (isRateLimited(request)) return errorResponse(new ProviderError("请求过于频繁，请稍后再试。", "RATE_LIMIT", true), fallbackId);
  if (!request.headers.get("content-type")?.includes("application/json")) return errorResponse(new ProviderError("请求格式必须是 JSON。", "INVALID_OUTPUT", false), fallbackId);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return Response.json({ error: { code: "INVALID_OUTPUT", message: "请求内容过大。", retryable: false }, requestId: fallbackId }, { status: 413 });
  let body: ExploreRequest;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return Response.json({ error: { code: "INVALID_OUTPUT", message: "请求内容过大。", retryable: false }, requestId: fallbackId }, { status: 413 });
    const parsed: unknown = JSON.parse(raw);
    if (!isExploreRequest(parsed)) return errorResponse(new ProviderError("请求字段不完整或超过允许长度。", "INVALID_OUTPUT", false), fallbackId);
    body = parsed;
  } catch {
    return errorResponse(new ProviderError("请求 JSON 无法解析。", "INVALID_OUTPUT", false), fallbackId);
  }
  const requestId = typeof body.requestId === "string" && body.requestId.length <= 80 ? body.requestId : fallbackId;
  const hardDeadline = AbortSignal.timeout(90_000);
  try {
    if (body.mode === "generate_questions") return Response.json(await generateQuestions(body.profile, requestId, hardDeadline));
    if (body.mode === "generate_report") return Response.json(await generateReport(body.profile, body.answers, requestId, hardDeadline));
    if (body.mode === "generate_contribution_draft") return Response.json(await generateContribution(body.profile, body.authorized, body.experienceType, hardDeadline));
    return errorResponse(new ProviderError("未知的请求模式。", "INVALID_OUTPUT", false), requestId);
  } catch (error) {
    const stage = body.mode === "generate_questions" ? "question_generation" : body.mode === "generate_report" ? "report_generation" : "contribution_draft";
    return errorResponse(error, requestId, stage);
  }
}
