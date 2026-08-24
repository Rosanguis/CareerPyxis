import type { JobPathInput, JobSearchProfile, JobVerificationRequest, Priority } from "@/lib/types";
import { verifyJobsForPath } from "@/lib/server/job-verification-service";
import { ProviderError } from "@/lib/server/model-provider";
import { protectAiRequest, takeBurstLimit } from "@/lib/server/api-protection";

export const runtime = "nodejs";
export const maxDuration = 75;

const MAX_BODY_BYTES = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maxLength: number, minimum = 0): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maxLength;
}

function isStringList(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isString(item, maxLength));
}

function isPriority(value: unknown): value is Priority {
  return value === "夯" || value === "稳" || value === "拉";
}

function isJobSearchProfile(value: unknown): value is JobSearchProfile {
  if (!isRecord(value)) return false;
  return isString(value.experienceSummary, 500) && isString(value.location, 100) && isString(value.skills, 500) &&
    isStringList(value.likedTasks, 8, 40) && isStringList(value.dislikedTasks, 8, 40) && isStringList(value.workValues, 8, 40);
}

function isJobPath(value: unknown): value is JobPathInput {
  if (!isRecord(value)) return false;
  return isPriority(value.priority) && isString(value.title, 120, 2) && isString(value.field, 120, 2) &&
    isStringList(value.entryRequirements, 8, 240) && value.entryRequirements.length > 0 &&
    isStringList(value.targetTasks, 6, 240) && value.targetTasks.length > 0;
}

function isJobVerificationRequest(value: unknown): value is JobVerificationRequest {
  if (!isRecord(value)) return false;
  return isString(value.requestId, 80, 1) && isString(value.reportRequestId, 80, 1) &&
    isJobSearchProfile(value.profile) && isJobPath(value.path);
}

function errorResponse(error: unknown, requestId: string) {
  const known = error instanceof ProviderError;
  const code = known ? error.code : "PROVIDER_SERVER_ERROR";
  const message = known ? error.message : "岗位核验遇到暂时性问题，请稍后重试。";
  const retryable = known ? error.retryable : true;
  const status = code === "AUTH_ERROR" ? 503 : code === "INVALID_OUTPUT" && !retryable ? 400 : code === "RATE_LIMIT" ? 429 : 500;
  console.error(JSON.stringify({ requestId, stage: "job_verification", code, retryable }));
  return Response.json({ error: { code, message, retryable, stage: "job_verification" }, requestId }, { status });
}

export async function POST(request: Request) {
  const fallbackId = crypto.randomUUID();
  const protectionFailure = await protectAiRequest(request, fallbackId);
  if (protectionFailure) return protectionFailure;
  const burst = takeBurstLimit(request, "job-verification", 8, 60_000);
  if (burst.limited) return Response.json(
    { error: { code: "RATE_LIMIT", message: "岗位核验请求较多，请稍后再试。", retryable: true, stage: "request_protection" }, requestId: fallbackId },
    { status: 429, headers: { "retry-after": String(burst.retryAfterSeconds), "cache-control": "no-store" } },
  );
  if (!request.headers.get("content-type")?.includes("application/json")) return errorResponse(new ProviderError("请求格式必须是 JSON。", "INVALID_OUTPUT", false), fallbackId);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return Response.json({ error: { code: "INVALID_OUTPUT", message: "请求内容过大。", retryable: false }, requestId: fallbackId }, { status: 413 });

  let body: JobVerificationRequest;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return Response.json({ error: { code: "INVALID_OUTPUT", message: "请求内容过大。", retryable: false }, requestId: fallbackId }, { status: 413 });
    const parsed: unknown = JSON.parse(raw);
    if (!isJobVerificationRequest(parsed)) return errorResponse(new ProviderError("岗位核验字段不完整或超过允许长度。", "INVALID_OUTPUT", false), fallbackId);
    body = parsed;
  } catch {
    return errorResponse(new ProviderError("请求 JSON 无法解析。", "INVALID_OUTPUT", false), fallbackId);
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  try {
    return Response.json(await verifyJobsForPath(body.profile, body.path, body.requestId, body.reportRequestId, signal));
  } catch (error) {
    return errorResponse(error, body.requestId);
  }
}
