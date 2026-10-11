export class ProviderHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(provider: string, status: number, body: string) {
    const snippet = body.length > 800 ? `${body.slice(0, 800)}…` : body;
    super(`${provider} API error (HTTP ${status}): ${snippet}`);
    this.name = "ProviderHttpError";
    this.status = status;
    this.body = body;
  }
}

export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  providerLabel: string;
}

export async function postJson<T>(options: PostJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000,
  );

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ProviderHttpError(options.providerLabel, response.status, text);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `${options.providerLabel} API returned invalid JSON: ${text.slice(0, 200)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
