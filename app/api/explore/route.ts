import type { Answer, ExploreRequest, Profile } from "@/lib/types";
import { generateContribution, generateQuestions, generateReport } from "@/lib/server/explore-service";
import { ProviderError } from "@/lib/server/model-provider";
import { protectAiRequest, takeBurstLimit } from "@/lib/server/api-protection";
import { aiUsageGuardResponse, createAnonymousAiContext } from "@/lib/server/ai-usage-guard";

export const runtime = "nodejs";
// Leave headroom above the 120s application deadline so Vercel can serialize
// and return the API's structured timeout response instead of terminating it.
export const maxDuration = 150;
const MAX_BODY_BYTES = 32_000;

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
    isStringList(value.likedTasks, 8, 40) && isStringList(value.dislikedTasks, 8, 40) && isStringList(value.workValues, 6, 40);
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
  const protectionFailure = await protectAiRequest(request, fallbackId);
  if (protectionFailure) return protectionFailure;
  const burst = takeBurstLimit(request, "explore", 12, 60_000);
  if (burst.limited) return Response.json(
    { error: { code: "RATE_LIMIT", message: "请求过于频繁，请稍后再试。", retryable: true, stage: "request_protection" }, requestId: fallbackId },
    { status: 429, headers: { "retry-after": String(burst.retryAfterSeconds), "cache-control": "no-store" } },
  );
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
  let context: ReturnType<typeof createAnonymousAiContext>;
  try {
    context = createAnonymousAiContext(request);
    const cached = await context.cached<unknown>(body.mode, requestId, body);
    if (cached) return context.json(cached);
    if (body.mode === "generate_report") await context.requireQuestions(body.profile);
    if (body.mode === "generate_contribution_draft") await context.requireContribution(body.profile);
  } catch (error) {
    const response = aiUsageGuardResponse(error, requestId);
    if (response) return response;
    return errorResponse(error, requestId, "request_protection");
  }

  const cost = body.mode === "generate_report" ? 10 : 2;
  const attempts = body.mode === "generate_questions" ? 3 : 2;
  const hardDeadline = AbortSignal.timeout(120_000);
  let lease;
  try {
    lease = await context.begin(body.mode, body.mode, cost, attempts, 150);
    if (body.mode === "generate_questions") {
      const result = await generateQuestions(body.profile, requestId, hardDeadline);
      await context.grantQuestions(body.profile);
      await context.cache(body.mode, requestId, body, result);
      return context.json(result);
    }
    if (body.mode === "generate_report") {
      const result = await generateReport(body.profile, body.answers, requestId, hardDeadline);
      await context.grantReport(body.profile, result);
      await context.cache(body.mode, requestId, body, result);
      return context.json(result);
    }
    if (body.mode === "generate_contribution_draft") {
      const result = await generateContribution(body.profile, body.authorized, body.experienceType, hardDeadline);
      await context.cache(body.mode, requestId, body, result);
      return context.json(result);
    }
    return errorResponse(new ProviderError("未知的请求模式。", "INVALID_OUTPUT", false), requestId);
  } catch (error) {
    const guardResponse = aiUsageGuardResponse(error, requestId);
    if (guardResponse) return context.attach(guardResponse);
    const stage = body.mode === "generate_questions" ? "question_generation" : body.mode === "generate_report" ? "report_generation" : "contribution_draft";
    return context.attach(errorResponse(error, requestId, stage));
  } finally {
    if (lease) await context.release(lease);
  }
}
