import "server-only";

let currentKeyIndex = 0;

const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function parseGeminiKeys(): string[] {
  const multiKeys = (process.env.GEMINI_API_KEYS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const singleKey = process.env.GEMINI_API_KEY?.trim();

  return Array.from(
    new Set([...multiKeys, ...(singleKey ? [singleKey] : [])]),
  );
}

function isRateLimitLikeMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("resource has been exhausted") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota")
  );
}

async function isRateLimitResponse(response: Response): Promise<boolean> {
  if (response.status === 429) {
    return true;
  }

  if (response.ok) {
    return false;
  }

  const bodyText = await response.clone().text();
  return isRateLimitLikeMessage(bodyText);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = requestTimestamps[0];
    const waitMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now + 500;

    if (waitMs > 0) {
      console.info(`[Gemini] Throttling: chờ ${Math.round(waitMs / 1000)}s để tránh rate limit.`);
      await sleep(waitMs);
    }
  }

  requestTimestamps.push(Date.now());
}

export function hasGeminiApiKeys(): boolean {
  return parseGeminiKeys().length > 0;
}

export async function generateGeminiContentWithKeyRotation(
  model: string,
  payload: unknown,
): Promise<Response> {
  const keys = parseGeminiKeys();

  if (keys.length === 0) {
    throw new Error("[Gemini] Không tìm thấy GEMINI_API_KEYS hoặc GEMINI_API_KEY.");
  }

  await waitForRateLimit();

  let attempts = 0;

  while (attempts < keys.length) {
    const keyIndex = (currentKeyIndex + attempts) % keys.length;
    const key = keys[keyIndex];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (await isRateLimitResponse(response)) {
        console.warn(
          `[Gemini] Key index ${keyIndex} bị 429. Đang chuyển sang Key tiếp theo...`,
        );

        attempts += 1;

        if (attempts < keys.length) {
          await sleep(1000);
        }

        continue;
      }

      currentKeyIndex = keyIndex;
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitLikeMessage(message)) {
        console.warn(
          `[Gemini] Key index ${keyIndex} bị 429. Đang chuyển sang Key tiếp theo...`,
        );

        attempts += 1;

        if (attempts < keys.length) {
          await sleep(1000);
        }

        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `[Gemini] Đã thử xoay vòng toàn bộ ${keys.length} API keys nhưng tất cả đều dính 429/rate limit.`,
  );
}
