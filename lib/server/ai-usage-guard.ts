import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { CareerReport, JobPathInput, JobSearchProfile, Profile } from "../types";

const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// Workflow grants deliberately outlive 24-hour idempotency records so a cached
// report can never be returned after its authorization grant has just expired.
const WORKFLOW_TTL_SECONDS = 25 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const JOB_RESULT_TTL_SECONDS = 15 * 60;
const QUOTA_TTL_SECONDS = 2 * 24 * 60 * 60;
const LOCAL_SECRET = "career-pyxis-local-development-secret-only";
const CHARGE_SCRIPT = `
  local cost = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])
  for index, key in ipairs(KEYS) do
    local current = tonumber(redis.call("GET", key) or "0")
    local limit = tonumber(ARGV[index + 2])
    if current + cost > limit then return index end
  end
  for _, key in ipairs(KEYS) do
    local nextValue = redis.call("INCRBY", key, cost)
    if nextValue == cost then redis.call("EXPIRE", key, ttl) end
  end
  return 0
`;
const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  end
  return 0
`;

type StoredValue = { value: string; expiresAt: number };
type QuotaEntry = { key: string; limit: number; message: string };

interface GuardStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  charge(entries: QuotaEntry[], cost: number, ttlSeconds: number): Promise<number>;
  deleteIfValue(key: string, value: string): Promise<void>;
}

class MemoryGuardStore implements GuardStore {
  private readonly values = new Map<string, StoredValue>();

  private read(key: string): string | null {
    const item = this.values.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return item.value;
  }

  async get(key: string) {
    return this.read(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.read(key) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async charge(entries: QuotaEntry[], cost: number, ttlSeconds: number) {
    const values = entries.map((entry) => Number(this.read(entry.key) ?? 0));
    const rejected = values.findIndex((value, index) => value + cost > entries[index].limit);
    if (rejected >= 0) return rejected + 1;
    entries.forEach((entry, index) => {
      this.values.set(entry.key, { value: String(values[index] + cost), expiresAt: Date.now() + ttlSeconds * 1_000 });
    });
    return 0;
  }

  async deleteIfValue(key: string, value: string) {
    if (this.read(key) === value) this.values.delete(key);
  }
}

class RedisGuardStore implements GuardStore {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token, automaticDeserialization: false });
  }

  async get(key: string) {
    return this.redis.get<string>(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return await this.redis.set(key, value, { ex: ttlSeconds, nx: true }) === "OK";
  }

  async charge(entries: QuotaEntry[], cost: number, ttlSeconds: number) {
    return this.redis.createScript<number>(CHARGE_SCRIPT).eval(entries.map((entry) => entry.key), [String(cost), String(ttlSeconds), ...entries.map((entry) => String(entry.limit))]);
  }

  async deleteIfValue(key: string, value: string) {
    await this.redis.createScript<number>(RELEASE_SCRIPT).eval([key], [value]);
  }
}

export class AiUsageGuardError extends Error {
  constructor(
    readonly code: "PROTECTION_UNAVAILABLE" | "FLOW_REQUIRED" | "QUOTA_EXCEEDED" | "REQUEST_IN_PROGRESS" | "IDEMPOTENCY_CONFLICT",
    message: string,
    readonly status: 403 | 409 | 429 | 503,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

type OperationLease = { lockKey: string; token: string };
type CachedEnvelope<T> = { bodyHash: string; result: T };
type ReportGrant = { profileHash: string; jobProfileHash: string; pathHashes: string[] };

let redisStore: RedisGuardStore | null = null;
const memoryStore = new MemoryGuardStore();

function requiresDurableProtection() {
  return process.env.DATA_MODE?.toLowerCase() === "live";
}

function signingSecret() {
  const configured = process.env.CAREER_PYXIS_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (!requiresDurableProtection()) return LOCAL_SECRET;
  throw new AiUsageGuardError("PROTECTION_UNAVAILABLE", "匿名体验安全配置尚未完成，请稍后再试。", 503, true);
}

function getStore(): GuardStore {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    redisStore ??= new RedisGuardStore(url, token);
    return redisStore;
  }
  if (!requiresDurableProtection()) return memoryStore;
  throw new AiUsageGuardError("PROTECTION_UNAVAILABLE", "匿名体验额度服务尚未配置，请稍后再试。", 503, true);
}

function positiveInteger(name: string, fallback?: number): number {
  const raw = process.env[name];
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AiUsageGuardError("PROTECTION_UNAVAILABLE", "匿名体验额度配置无效，请稍后再试。", 503, true);
  }
  return value;
}

function globalDailyCredits() {
  if (!requiresDurableProtection()) return positiveInteger("AI_PROTECTION_GLOBAL_DAILY_CREDITS", 500);
  return positiveInteger("AI_PROTECTION_GLOBAL_DAILY_CREDITS");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("base64url");
}

function hmac(value: string) {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function cookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-career_pyxis_session" : "career_pyxis_session";
}

function parseCookies(request: Request) {
  return new Map((request.headers.get("cookie") ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];
    return [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()] as const];
  }));
}

function resolveSession(request: Request) {
  const existing = parseCookies(request).get(cookieName());
  if (existing) {
    const separator = existing.lastIndexOf(".");
    const id = separator > 0 ? existing.slice(0, separator) : "";
    const signature = separator > 0 ? existing.slice(separator + 1) : "";
    if (/^[a-zA-Z0-9_-]{16,80}$/u.test(id) && safeEqual(hmac(`session:${id}`), signature)) return { id, setCookie: null };
  }
  const id = randomUUID();
  const value = `${id}.${hmac(`session:${id}`)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return { id, setCookie: `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}` };
}

function clientAddress(request: Request) {
  const value = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  return value.split(",")[0]?.trim().toLowerCase() || "unknown";
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function toJobProfile(profile: Profile): JobSearchProfile {
  return {
    experienceSummary: profile.experience.slice(0, 500),
    location: profile.location,
    skills: profile.skills,
    likedTasks: profile.likedTasks,
    dislikedTasks: profile.dislikedTasks,
    workValues: profile.workValues,
  };
}

function toJobPath(path: CareerReport["rankedPaths"][number]): JobPathInput {
  return {
    priority: path.priority,
    title: path.title,
    field: path.field,
    entryRequirements: path.entryRequirements.slice(0, 8),
    targetTasks: path.realWork.slice(0, 6),
  };
}

function parseStored<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class AnonymousAiContext {
  readonly sessionId: string;
  private readonly setCookie: string | null;
  private readonly store: GuardStore;
  private readonly ipHash: string;

  constructor(request: Request) {
    const session = resolveSession(request);
    this.sessionId = session.id;
    this.setCookie = session.setCookie;
    this.store = getStore();
    this.ipHash = hmac(`ip:${clientAddress(request)}`).slice(0, 32);
  }

  private async storage<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof AiUsageGuardError) throw error;
      console.error(JSON.stringify({ event: "ai_guard_storage_failure", operation, detail: error instanceof Error ? error.message : "unknown" }));
      throw new AiUsageGuardError("PROTECTION_UNAVAILABLE", "匿名体验额度服务暂时不可用，请稍后再试。", 503, true);
    }
  }

  attach(response: Response) {
    if (this.setCookie) response.headers.append("set-cookie", this.setCookie);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  json(data: unknown, init?: ResponseInit) {
    return this.attach(Response.json(data, init));
  }

  private idempotencyKey(scope: string, requestId: string) {
    return `cp:idem:${this.sessionId}:${fingerprint(`${scope}:${requestId}`)}`;
  }

  async cached<T>(scope: string, requestId: string, body: unknown): Promise<T | null> {
    const envelope = parseStored<CachedEnvelope<T>>(await this.storage("idempotency_get", () => this.store.get(this.idempotencyKey(scope, requestId))));
    if (!envelope) return null;
    if (envelope.bodyHash !== fingerprint(body)) {
      throw new AiUsageGuardError("IDEMPOTENCY_CONFLICT", "同一请求编号不能用于不同内容，请刷新页面后重试。", 409, false);
    }
    return envelope.result;
  }

  async cache<T>(scope: string, requestId: string, body: unknown, result: T) {
    const envelope: CachedEnvelope<T> = { bodyHash: fingerprint(body), result };
    await this.storage("idempotency_set", () => this.store.set(this.idempotencyKey(scope, requestId), JSON.stringify(envelope), IDEMPOTENCY_TTL_SECONDS));
  }

  async grantQuestions(profile: Profile) {
    await this.storage("questions_grant", () => this.store.set(`cp:questions:${this.sessionId}:${fingerprint(profile)}`, "1", WORKFLOW_TTL_SECONDS));
  }

  async requireQuestions(profile: Profile) {
    const granted = await this.storage("questions_check", () => this.store.get(`cp:questions:${this.sessionId}:${fingerprint(profile)}`));
    if (granted !== "1") throw new AiUsageGuardError("FLOW_REQUIRED", "请先在当前浏览器完成个性化问题，再生成报告。", 403, false);
  }

  async grantReport(profile: Profile, report: CareerReport) {
    const grant: ReportGrant = {
      profileHash: fingerprint(profile),
      jobProfileHash: fingerprint(toJobProfile(profile)),
      pathHashes: report.rankedPaths.map((path) => fingerprint(toJobPath(path))),
    };
    const reportKey = fingerprint(report.requestId);
    await this.storage("report_grant", async () => {
      await this.store.set(`cp:report:${this.sessionId}:${reportKey}`, JSON.stringify(grant), WORKFLOW_TTL_SECONDS);
      await this.store.set(`cp:profile-report:${this.sessionId}:${grant.profileHash}`, reportKey, WORKFLOW_TTL_SECONDS);
    });
  }

  async requireReport(profile: JobSearchProfile, reportRequestId: string, path: JobPathInput) {
    const grant = parseStored<ReportGrant>(await this.storage("report_check", () => this.store.get(`cp:report:${this.sessionId}:${fingerprint(reportRequestId)}`)));
    if (!grant || grant.jobProfileHash !== fingerprint(profile) || !grant.pathHashes.includes(fingerprint(path))) {
      throw new AiUsageGuardError("FLOW_REQUIRED", "岗位核验必须来自当前浏览器刚生成的报告，请重新完成探索。", 403, false);
    }
  }

  async requireContribution(profile: Profile) {
    const report = await this.storage("contribution_check", () => this.store.get(`cp:profile-report:${this.sessionId}:${fingerprint(profile)}`));
    if (!report) throw new AiUsageGuardError("FLOW_REQUIRED", "请先在当前浏览器生成报告，再整理经验分享草稿。", 403, false);
  }

  private jobResultKey(reportRequestId: string, path: JobPathInput) {
    return `cp:job-result:${this.sessionId}:${fingerprint(reportRequestId)}:${fingerprint(path)}`;
  }

  async cachedJob<T>(reportRequestId: string, path: JobPathInput) {
    return parseStored<T>(await this.storage("job_cache_get", () => this.store.get(this.jobResultKey(reportRequestId, path))));
  }

  async cacheJob<T>(reportRequestId: string, path: JobPathInput, result: T) {
    await this.storage("job_cache_set", () => this.store.set(this.jobResultKey(reportRequestId, path), JSON.stringify(result), JOB_RESULT_TTL_SECONDS));
  }

  async begin(scope: string, attemptDiscriminator: unknown, cost: number, maxDailyAttempts: number, lockTtlSeconds: number): Promise<OperationLease> {
    const lockKey = `cp:lock:${this.sessionId}`;
    const token = randomUUID();
    const acquired = await this.storage("lock_acquire", () => this.store.setIfAbsent(lockKey, token, lockTtlSeconds));
    if (!acquired) throw new AiUsageGuardError("REQUEST_IN_PROGRESS", "当前浏览器已有一个生成或核验任务在进行，请等待它完成。", 409, true);

    try {
      const day = dayKey();
      const sessionLimit = positiveInteger("AI_PROTECTION_SESSION_DAILY_CREDITS", 70);
      const ipLimit = positiveInteger("AI_PROTECTION_IP_DAILY_CREDITS", 1_200);
      const entries: QuotaEntry[] = [
        { key: `cp:quota:session:${day}:${this.sessionId}`, limit: sessionLimit, message: "本浏览器今日的免费体验额度已用完，请明天再试。" },
        { key: `cp:quota:ip:${day}:${this.ipHash}`, limit: ipLimit, message: "当前网络今日的体验请求较多，请稍后或明天再试。" },
        { key: `cp:quota:global:${day}`, limit: globalDailyCredits(), message: "今日免费体验名额已用完，请明天再来。" },
        { key: `cp:quota:operation:${day}:${this.sessionId}:${fingerprint({ scope, attemptDiscriminator })}`, limit: cost * maxDailyAttempts, message: "这一步今天的安全重试次数已用完，请明天再试。" },
      ];
      const rejected = await this.storage("quota_charge", () => this.store.charge(entries, cost, QUOTA_TTL_SECONDS));
      if (rejected > 0) throw new AiUsageGuardError("QUOTA_EXCEEDED", entries[rejected - 1].message, 429, false);
      return { lockKey, token };
    } catch (error) {
      await this.release({ lockKey, token });
      throw error;
    }
  }

  async release(lease: OperationLease) {
    try {
      await this.store.deleteIfValue(lease.lockKey, lease.token);
    } catch (error) {
      console.error(JSON.stringify({ event: "ai_guard_lock_release_failure", detail: error instanceof Error ? error.message : "unknown" }));
    }
  }
}

export function createAnonymousAiContext(request: Request) {
  return new AnonymousAiContext(request);
}

export function aiUsageGuardResponse(error: unknown, requestId: string): Response | null {
  if (!(error instanceof AiUsageGuardError)) return null;
  return Response.json(
    { error: { code: error.code, message: error.message, retryable: error.retryable, stage: "request_protection" }, requestId },
    { status: error.status, headers: { "cache-control": "no-store" } },
  );
}
