export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export async function readJsonObject(request: Request, maximum = 45 * 1024 * 1024): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Expected an application/json request.");
  }
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maximum) {
    throw new HttpError(413, "The editor request is too large.");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, "The editor request is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "The editor request is invalid.");
  }
  return value as Record<string, unknown>;
}

export function moduleSource(value: unknown): string {
  return `export default ${JSON.stringify(value, null, 2)};\n`;
}

export function parseModule<T>(source: string, label: string): T {
  const match = source.match(/^\s*export\s+default\s+([\s\S]*);\s*$/);
  if (!match) throw new HttpError(502, `${label} is not a supported data module.`);
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    throw new HttpError(502, `${label} contains invalid JSON data.`);
  }
}

export function requiredString(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} is invalid.`);
  const result = value.trim();
  if ((!allowEmpty && !result) || result.length > maximum) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return result;
}

export function singaporeTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((candidate) => candidate.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}+08:00`;
}

export function writingIdNow(date = new Date()): string {
  return singaporeTimestamp(date).slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
}

export function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (item) => item.toString(16).padStart(2, "0")).join("");
}

export function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new HttpError(400, "An uploaded file could not be decoded.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function decodeUtf8Base64(value: string): string {
  return new TextDecoder().decode(decodeBase64(value.replace(/\s/g, "")));
}

export function secureEqual(left: string | null, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

export function normalizeYears(values: unknown[]): string[] {
  return [...new Set(values.map(String).filter((year) => /^\d{4}$/.test(year)))]
    .sort((left, right) => right.localeCompare(left));
}

export function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, message);
  return value as Record<string, unknown>;
}
