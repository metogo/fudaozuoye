const requestBuckets = new Map<string, { count: number; resetAt: number }>();

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") throw new Error("请求来源不合法");
    return;
  }
  if (new URL(origin).host !== new URL(request.url).host) throw new Error("请求来源不合法");
}

export function assertContentLength(request: Request, maxBytes: number): void {
  const raw = request.headers.get("content-length");
  if (raw && Number(raw) > maxBytes) throw new Error("请求内容过大");
}

export function assertRateLimit(request: Request, limit = 50, identity?: string): void {
  const key = identity || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new Error("请求过于频繁，请稍后再试");
}

export async function assertImageFile(file: File): Promise<void> {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("仅支持 JPEG、PNG 或 WebP 图片");
  if (file.size === 0 || file.size > 6 * 1024 * 1024) throw new Error("处理后的图片必须小于 6MB");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(jpeg || png || webp)) throw new Error("图片内容与文件格式不一致");
}
