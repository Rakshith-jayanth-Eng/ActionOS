import {
  ActionItem,
  ChatMessage,
  DecomposeResponse,
  NaturalCommandResult,
  SuggestedNextAction,
  TaskSubStepsResponse,
} from '../types/action';

export class ApiError extends Error {
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly retryAfterSeconds?: number;

  constructor(message: string, status = 500, retryable = false, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 45000
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;

  const onAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * Resilient JSON request wrapper with automatic transient retry,
 * timeout management, proxy HTML error detection, and structured ApiError throwing.
 */
export async function safeApiRequest<T = any>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = 45000, retries = 1, signal } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        },
        timeoutMs
      );

      const rawText = await response.text();
      let data: any;

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        if (rawText.includes('502') || rawText.includes('Bad Gateway')) {
          throw new ApiError(
            'Server connection was briefly interrupted (502). Please retry in a few seconds.',
            502,
            true
          );
        }
        if (rawText.includes('504') || rawText.includes('Gateway Timeout')) {
          throw new ApiError(
            'The request timed out at the gateway (504). Try a smaller document or retry.',
            504,
            true
          );
        }
        throw new ApiError(
          'Server returned an unexpected non-JSON response. Please retry in a moment.',
          response.status || 500,
          response.status >= 500
        );
      }

      if (!response.ok || data?.success === false) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        const isTransient =
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        const errorMsg =
          data?.error ||
          data?.message ||
          `Request failed with HTTP status ${response.status}`;

        throw new ApiError(errorMsg, response.status, isTransient, retryAfterSeconds);
      }

      return data as T;
    } catch (err: any) {
      lastError = err;

      if (err?.name === 'AbortError') {
        throw new ApiError(
          'The request took too long or was cancelled. Please try again.',
          408,
          true
        );
      }

      const isRetryable =
        err instanceof ApiError
          ? err.retryable && err.status !== 429
          : err instanceof TypeError; // Network fetch error

      if (isRetryable && attempt < retries) {
        const backoff = 600 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      if (err instanceof ApiError) {
        throw err;
      }

      throw new ApiError(
        err?.message || 'Network connection failed. Please check your connection and try again.',
        0,
        true
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiError('Unknown API error occurred.');
}

export async function safeApiPost<T = any>(
  url: string,
  body: unknown,
  options?: RequestOptions
): Promise<T> {
  return safeApiRequest<T>(url, 'POST', body, options);
}

export async function safeApiGet<T = any>(
  url: string,
  options?: RequestOptions
): Promise<T> {
  return safeApiRequest<T>(url, 'GET', undefined, options);
}

/**
 * Typed Domain API Client Methods
 */
export const actionApi = {
  extractObligation(payload: {
    type: 'text' | 'image' | 'pdf';
    content: string;
    mimeType?: string;
    fileName?: string;
    autoDecomposeSubSteps?: boolean;
  }): Promise<{ success: boolean; data: Partial<ActionItem> }> {
    return safeApiPost('/api/extract', payload, { timeoutMs: 60000, retries: 1 });
  },

  determineNextAction(item: ActionItem): Promise<{
    success: boolean;
    recommendation: SuggestedNextAction;
  }> {
    return safeApiPost('/api/next-action', { item }, { timeoutMs: 35000, retries: 1 });
  },

  decomposeGoal(payload: {
    goalTitle: string;
    goalContext?: string;
    deadline?: string | null;
    urgency?: string;
    existingTasks?: string[];
  }): Promise<DecomposeResponse> {
    return safeApiPost('/api/decompose', payload, { timeoutMs: 45000, retries: 1 });
  },

  decomposeTaskSubSteps(payload: {
    itemTitle: string;
    itemSummary: string;
    taskTitle: string;
    taskPriority: string;
    deadline?: string | null;
  }): Promise<TaskSubStepsResponse> {
    return safeApiPost('/api/decompose-task', payload, { timeoutMs: 35000, retries: 1 });
  },

  executeNaturalCommand(payload: {
    command: string;
    items: ActionItem[];
  }): Promise<NaturalCommandResult> {
    return safeApiPost('/api/command', payload, { timeoutMs: 45000, retries: 1 });
  },

  sendChat(payload: {
    item: Partial<ActionItem>;
    messages: ChatMessage[];
    query: string;
  }): Promise<{ success: boolean; reply: string }> {
    return safeApiPost('/api/chat', payload, { timeoutMs: 40000, retries: 1 });
  },

  /**
   * Streams AI chat response chunks via Server-Sent Events (SSE),
   * falling back automatically to standard POST /api/chat if streaming is unavailable.
   */
  async streamChat(
    payload: {
      item: Partial<ActionItem>;
      messages: ChatMessage[];
      query: string;
    },
    onChunk: (partialText: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok || !response.body) {
        const fallback = await this.sendChat(payload);
        onChunk(fallback.reply);
        return fallback.reply;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new ApiError(parsed.error, 500);
            }
            if (parsed.text) {
              accumulated += parsed.text;
              onChunk(accumulated);
            }
          } catch (e) {
            if (e instanceof ApiError) throw e;
          }
        }
      }

      if (!accumulated.trim()) {
        const fallback = await this.sendChat(payload);
        onChunk(fallback.reply);
        return fallback.reply;
      }

      return accumulated;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      const fallback = await this.sendChat(payload);
      onChunk(fallback.reply);
      return fallback.reply;
    }
  },

  syncItemsWithServer(items: ActionItem[]): Promise<{
    success: boolean;
    items: ActionItem[];
    syncedAt: string;
  }> {
    return safeApiPost('/api/items/sync', { items }, { timeoutMs: 15000, retries: 0 });
  },
};
