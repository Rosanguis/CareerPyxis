import "server-only";

export interface WebEvidence {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
}

export interface ModelProvider {
  readonly id: "deepseek" | "openai";
  generateJson<T>(system: string, user: string, signal: AbortSignal): Promise<T>;
  searchWeb(query: string, signal: AbortSignal, maxResults?: number): Promise<WebEvidence[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "AUTH_ERROR" | "INSUFFICIENT_BALANCE" | "RATE_LIMIT" | "TIMEOUT" | "TRANSPORT_ERROR" | "PROVIDER_SERVER_ERROR" | "EMPTY_RESPONSE" | "INVALID_OUTPUT" | "SEARCH_UNAVAILABLE",
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

function normalizeHttpError(status: number, detail: string): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("模型服务认证失败，请检查服务端密钥。", "AUTH_ERROR", false, status);
  if (status === 402 || /balance|credit|余额/iu.test(detail)) return new ProviderError("模型账户余额不足。", "INSUFFICIENT_BALANCE", false, status);
  if (status === 429) return new ProviderError("模型服务当前繁忙，请稍后重试。", "RATE_LIMIT", true, status);
  if (status >= 500) return new ProviderError("模型服务暂时不可用。", "PROVIDER_SERVER_ERROR", true, status);
  return new ProviderError("模型请求参数或服务配置有误。", "TRANSPORT_ERROR", false, status);
}

async function parseError(response: Response): Promise<ProviderError> {
  let detail = "";
  try {
    const payload = await response.json() as { error?: { message?: string } | string; message?: string };
    detail = typeof payload.error === "string" ? payload.error : payload.error?.message ?? payload.message ?? "";
  } catch {
    detail = `HTTP ${response.status}`;
  }
  return normalizeHttpError(response.status, detail);
}

function parseJson<T>(value: string | null | undefined): T {
  if (!value?.trim()) throw new ProviderError("模型返回了空内容。", "EMPTY_RESPONSE", true);
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new ProviderError(`模型没有返回有效 JSON：${String(error)}`, "INVALID_OUTPUT", true);
  }
}

type AnthropicCitation = { type?: string; url?: string; title?: string; cited_text?: string };
type AnthropicBlock = {
  type?: string;
  content?: Array<{ type?: string; url?: string; title?: string; page_age?: string }>;
  citations?: AnthropicCitation[];
};

/**
 * Minimal MIT-licensed adaptation of deepseek-ai/deepseek-harness
 * packages/web/web-search-deepseek. The full preview harness is intentionally
 * not bundled; this keeps the Vercel function small and adds a strict call cap.
 */
export class DeepSeekProvider implements ModelProvider {
  readonly id = "deepseek" as const;
  private readonly key = process.env.DEEPSEEK_API_KEY;
  private readonly model = process.env.AI_MODEL || "deepseek-v4-flash";

  async generateJson<T>(system: string, user: string, signal: AbortSignal): Promise<T> {
    if (!this.key) throw new ProviderError("未配置 DEEPSEEK_API_KEY。", "AUTH_ERROR", false);
    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        redirect: "error",
        signal,
        headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          thinking: { type: "disabled" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_object" },
          temperature: 0.35,
          max_tokens: 8000,
        }),
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderError("模型请求超时。", "TIMEOUT", true);
      throw new ProviderError(`无法连接模型服务：${String(error)}`, "TRANSPORT_ERROR", true);
    }
    if (!response.ok) throw await parseError(response);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
    return parseJson<T>(payload.choices?.[0]?.message?.content);
  }

  async searchWeb(query: string, signal: AbortSignal, maxResults = 4): Promise<WebEvidence[]> {
    if (!this.key) throw new ProviderError("未配置 DEEPSEEK_API_KEY。", "AUTH_ERROR", false);
    const body = {
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: [{ type: "text", text: `Perform a web search for the query: ${query}` }] }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    };
    let response: Response;
    try {
      response = await fetch("https://api.deepseek.com/anthropic/v1/messages", {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          "x-api-key": this.key,
          authorization: `Bearer ${this.key}`,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "CareerPyxis/0.1 (deepseek-harness-adapter)",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (signal.aborted) throw new ProviderError("实时检索超时。", "TIMEOUT", true);
      throw new ProviderError(`实时检索连接失败：${String(error)}`, "SEARCH_UNAVAILABLE", true);
    }
    if (!response.ok) throw await parseError(response);
    const payload = await response.json() as { content?: AnthropicBlock[] };
    const blocks = payload.content ?? [];
    const resultBlocks = blocks.filter((block) => block.type === "web_search_tool_result");
    if (resultBlocks.length === 0) throw new ProviderError("DeepSeek 未返回结构化搜索结果。", "SEARCH_UNAVAILABLE", true);
    const snippets = new Map<string, string>();
    for (const block of blocks) {
      if (block.type !== "text") continue;
      for (const citation of block.citations ?? []) {
        if (citation.url && citation.cited_text && !snippets.has(citation.url)) snippets.set(citation.url, citation.cited_text);
      }
    }
    const seen = new Set<string>();
    const sources: WebEvidence[] = [];
    for (const block of resultBlocks) {
      for (const item of block.content ?? []) {
        if (item.type !== "web_search_result" || !item.url || seen.has(item.url)) continue;
        seen.add(item.url);
        sources.push({ url: item.url, title: item.title, snippet: snippets.get(item.url), publishedAt: item.page_age });
        if (sources.length >= maxResults) return sources;
      }
    }
    return sources;
  }
}

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ url?: string }> };
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
  }>;
  output_text?: string;
};

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai" as const;
  private readonly key = process.env.OPENAI_API_KEY;
  private readonly model = process.env.OPENAI_MODEL || "gpt-5.6";

  async generateJson<T>(system: string, user: string, signal: AbortSignal): Promise<T> {
    if (!this.key) throw new ProviderError("未配置 OPENAI_API_KEY。", "AUTH_ERROR", false);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, store: false, instructions: system, input: user, text: { format: { type: "json_object" } } }),
    }).catch((error) => {
      if (signal.aborted) throw new ProviderError("模型请求超时。", "TIMEOUT", true);
      throw new ProviderError(`无法连接模型服务：${String(error)}`, "TRANSPORT_ERROR", true);
    });
    if (!response.ok) throw await parseError(response);
    const payload = await response.json() as OpenAIResponse;
    const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((content) => content.type === "output_text")?.text;
    return parseJson<T>(text);
  }

  async searchWeb(query: string, signal: AbortSignal, maxResults = 4): Promise<WebEvidence[]> {
    if (!this.key) throw new ProviderError("未配置 OPENAI_API_KEY。", "AUTH_ERROR", false);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, store: false, tools: [{ type: "web_search", search_context_size: "low" }], max_tool_calls: 1, input: `Search for trustworthy career information about: ${query}. Return concise findings with citations.` }),
    }).catch((error) => {
      if (signal.aborted) throw new ProviderError("实时检索超时。", "TIMEOUT", true);
      throw new ProviderError(`实时检索连接失败：${String(error)}`, "SEARCH_UNAVAILABLE", true);
    });
    if (!response.ok) throw await parseError(response);
    const payload = await response.json() as OpenAIResponse;
    const byUrl = new Map<string, WebEvidence>();
    for (const item of payload.output ?? []) {
      for (const source of item.action?.sources ?? []) if (source.url) byUrl.set(source.url, { url: source.url });
      for (const content of item.content ?? []) {
        for (const annotation of content.annotations ?? []) {
          if (annotation.url) byUrl.set(annotation.url, { url: annotation.url, title: annotation.title, snippet: content.text?.slice(0, 500) });
        }
      }
    }
    if (byUrl.size === 0) throw new ProviderError("OpenAI 未返回结构化搜索来源。", "SEARCH_UNAVAILABLE", true);
    return [...byUrl.values()].slice(0, maxResults);
  }
}

export function createProvider(): ModelProvider {
  const provider = (process.env.AI_PROVIDER || "deepseek").toLowerCase();
  if (provider === "openai") return new OpenAIProvider();
  if (provider === "deepseek") return new DeepSeekProvider();
  throw new ProviderError("AI_PROVIDER 只能是 deepseek 或 openai。", "AUTH_ERROR", false);
}
