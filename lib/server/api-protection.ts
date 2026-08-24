import "server-only";

import { checkBotId } from "botid/server";

type BurstBucket = { count: number; resetAt: number };

const burstBuckets = new Map<string, BurstBucket>();

function protectionResponse(requestId: string, status: 403 | 503, code: "REQUEST_BLOCKED" | "PROTECTION_UNAVAILABLE", message: string) {
  return Response.json(
    { error: { code, message, retryable: status === 503, stage: "request_protection" }, requestId },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim().toLowerCase() ?? "";
}

export function isSameOriginBrowserRequest(request: Request): boolean {
  const fetchSite = firstHeaderValue(request.headers.get("sec-fetch-site"));
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
    const expectedHost = forwardedHost || requestUrl.host.toLowerCase();
    const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const expectedProtocol = forwardedProto || requestUrl.protocol.replace(":", "");
    return originUrl.host.toLowerCase() === expectedHost && originUrl.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

export async function protectAiRequest(request: Request, requestId: string): Promise<Response | null> {
  if (!isSameOriginBrowserRequest(request)) {
    return protectionResponse(requestId, 403, "REQUEST_BLOCKED", "请求未通过网站来源校验，请从职途罗盘页面正常使用。");
  }

  try {
    const verification = await checkBotId({ advancedOptions: { checkLevel: "basic" } });
    if (verification.isBot) {
      return protectionResponse(requestId, 403, "REQUEST_BLOCKED", "请求未通过无感安全验证，请刷新页面后重试。");
    }
  } catch (error) {
    console.error(JSON.stringify({ requestId, stage: "request_protection", code: "BOTID_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown" }));
    return protectionResponse(requestId, 503, "PROTECTION_UNAVAILABLE", "安全验证暂时不可用，请稍后重试。");
  }

  return null;
}

function clientAddress(request: Request): string {
  return firstHeaderValue(request.headers.get("x-vercel-forwarded-for")) ||
    firstHeaderValue(request.headers.get("x-forwarded-for")) || "unknown";
}

export function takeBurstLimit(request: Request, scope: string, limit: number, windowMs: number): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (burstBuckets.size > 2_000) {
    for (const [key, bucket] of burstBuckets) {
      if (bucket.resetAt <= now) burstBuckets.delete(key);
    }
  }

  const key = `${scope}:${clientAddress(request)}`;
  const current = burstBuckets.get(key);
  if (!current || current.resetAt <= now) {
    burstBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  current.count += 1;
  return {
    limited: current.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}
