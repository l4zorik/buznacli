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

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  providerLabel: string;
  signal?: AbortSignal;
}

export async function postJson<T>(options: PostJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`${options.providerLabel} request timed out`)),
    options.timeoutMs ?? 120_000,
  );
  const onExternalAbort = (): void => {
    controller.abort(options.signal?.reason ?? new Error("aborted"));
  };
  if (options.signal?.aborted) {
    onExternalAbort();
  } else {
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  }

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
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export interface StreamSseOptions {
  url: string;
  providerLabel: string;
  headers: Record<string, string>;
  body: unknown;
  /** Hard cap for the whole stream (default 10 minutes). */
  timeoutMs?: number;
  /** Abort when no chunk arrives for this long (default 30 s). */
  idleTimeoutMs?: number;
  signal?: AbortSignal;
  /** Called for every SSE `data:` payload ([DONE] is handled internally). */
  onEvent: (data: string) => void;
}

/**
 * SSE stream reader with the timeout discipline from our lessons doc:
 * one total cap + an inactivity (idle) timeout per chunk, both living in
 * the transport — every provider inherits them. External abort (Ctrl+C)
 * is forwarded with its reason; abort errors are converted to plain
 * Errors so callers never see raw fetch rejections.
 */
export async function streamSse(options: StreamSseOptions): Promise<void> {
  const controller = new AbortController();
  const abortWith = (reason: Error): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };
  const totalMs = options.timeoutMs ?? 600_000;
  const idleMs = options.idleTimeoutMs ?? 30_000;
  const totalTimer = setTimeout(
    () => abortWith(new Error(`${options.providerLabel} stream timed out (${totalMs}ms)`)),
    totalMs,
  );
  let idleTimer = setTimeout(
    () => abortWith(new Error(`${options.providerLabel} stream went idle (${idleMs}ms without chunks)`)),
    idleMs,
  );
  const resetIdle = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => abortWith(new Error(`${options.providerLabel} stream went idle (${idleMs}ms without chunks)`)),
      idleMs,
    );
  };
  const onExternalAbort = (): void => {
    abortWith(
      options.signal?.reason instanceof Error
        ? options.signal.reason
        : new Error("aborted"),
    );
  };
  if (options.signal?.aborted) {
    onExternalAbort();
  } else {
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...options.headers,
      },
      body: JSON.stringify({
        ...(typeof options.body === "object" && options.body !== null ? options.body : {}),
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ProviderHttpError(options.providerLabel, response.status, text);
    }
    if (!response.body) {
      throw new Error(`${options.providerLabel} stream has no response body`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            return;
          }
          if (data !== "") {
            options.onEvent(data);
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      throw reason instanceof Error ? reason : new Error("aborted");
    }
    throw error;
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(idleTimer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}
