// Minimal RFC 7230 request parsing + JSON response helpers for route steps.
export interface ParsedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string;
}

export async function parseRequest(): Promise<ParsedRequest> {
  const raw = await Bun.stdin.text();
  const sep = raw.indexOf("\r\n\r\n");
  const head = sep === -1 ? raw : raw.slice(0, sep);
  const body = sep === -1 ? "" : raw.slice(sep + 4);
  const lines = head.split("\r\n");
  const [method = "GET", target = "/"] = (lines[0] ?? "").split(" ");
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  const url = new URL(target, "http://localhost");
  return { method: method.toUpperCase(), path: url.pathname, query: url.searchParams, headers, body };
}

export function json(status: number, data: unknown, extraHeaders: Record<string, string> = {}): string {
  const payload = JSON.stringify(data);
  const headers = [
    `HTTP/1.1 ${status} ${statusText(status)}`,
    "Content-Type: application/json; charset=utf-8",
    "Cache-Control: no-store",
    `Content-Length: ${Buffer.byteLength(payload)}`,
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ].join("\r\n");
  return headers + payload;
}

export function text(status: number, body: string, contentType: string, extraHeaders: Record<string, string> = {}): string {
  const headers = [
    `HTTP/1.1 ${status} ${statusText(status)}`,
    `Content-Type: ${contentType}`,
    "Cache-Control: no-store",
    `Content-Length: ${Buffer.byteLength(body)}`,
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ].join("\r\n");
  return headers + body;
}

function statusText(s: number): string {
  return ({ 200: "OK", 400: "Bad Request", 404: "Not Found", 409: "Conflict", 422: "Unprocessable Entity", 500: "Internal Server Error" } as Record<number, string>)[s] ?? "OK";
}
