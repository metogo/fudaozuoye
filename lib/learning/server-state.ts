import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseSession } from "./api";
import type { ClientSessionState, LearningSession } from "./types";

const TOKEN_VERSION = "v1";
const CONSENT_VERSION = "guardian-v1";
const ILLUSTRATION_RECEIPT_VERSION = "illustration-v1";
export const CONSENT_COOKIE = "guardian_consent_v1";

function secret(): Buffer {
  const configured = process.env.SESSION_STATE_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("生产环境缺少 SESSION_STATE_SECRET");
  return createHash("sha256").update(configured || "knowledge-backtracking-development-only-secret").digest();
}

export function sealSession(session: LearningSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openSession(token: unknown): LearningSession {
  if (typeof token !== "string" || token.length < 40 || token.length > 180_000) throw new Error("学习会话凭证不合法");
  const [version, ivRaw, tagRaw, encryptedRaw, ...rest] = token.split(".");
  if (version !== TOKEN_VERSION || !ivRaw || !tagRaw || !encryptedRaw || rest.length) throw new Error("学习会话凭证格式不合法");
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
    const session = parseSession(JSON.parse(plain));
    if (Date.now() - Date.parse(session.updatedAt) > 24 * 60 * 60 * 1000) throw new Error("学习会话已过期，请重新拍题");
    return session;
  } catch (error) {
    if (error instanceof Error && error.message.includes("已过期")) throw error;
    throw new Error("学习会话已损坏或被修改，请重新拍题");
  }
}

export function toClientState(session: LearningSession): ClientSessionState {
  const safe: LearningSession = {
    ...session,
    nodes: session.nodes.map((node) => ({ ...node, check: { ...node.check, answer: "", explanation: "" } })),
    evidence: session.evidence.map((item) => ({ ...item, answer: undefined })),
    transferCheck: session.transferCheck ? { ...session.transferCheck, answer: "", explanation: "" } : null,
  };
  return { session: safe, stateToken: sealSession(session) };
}

export function createConsentValue(): string {
  const timestamp = String(Date.now());
  const nonce = randomBytes(12).toString("base64url");
  const payload = `${CONSENT_VERSION}.${timestamp}.${nonce}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function createIllustrationReceipt(requestId: string, problemFingerprint: string): string {
  const timestamp = String(Date.now());
  const payload = `${ILLUSTRATION_RECEIPT_VERSION}.${timestamp}.${requestId}.${problemFingerprint}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function hasValidIllustrationReceipt(raw: unknown, requestId: string, problemFingerprint: string): boolean {
  if (typeof raw !== "string") return false;
  const [version, timestamp, receiptRequestId, receiptFingerprint, signature, ...rest] = raw.split(".");
  if (version !== ILLUSTRATION_RECEIPT_VERSION || !timestamp || receiptRequestId !== requestId || receiptFingerprint !== problemFingerprint || !signature || rest.length) return false;
  if (!Number.isFinite(Number(timestamp)) || Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000 || Number(timestamp) > Date.now() + 60_000) return false;
  const payload = `${version}.${timestamp}.${receiptRequestId}.${receiptFingerprint}`;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hasValidConsent(request: Request): boolean {
  return validatedConsentValue(request) !== null;
}

export function consentRateIdentity(request: Request): string | null {
  const raw = validatedConsentValue(request);
  return raw ? `consent:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}` : null;
}

function validatedConsentValue(request: Request): string | null {
  const raw = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${CONSENT_COOKIE}=`))?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  const [version, timestamp, nonce, signature, ...rest] = raw.split(".");
  if (version !== CONSENT_VERSION || !timestamp || !nonce || !signature || rest.length) return null;
  if (!Number.isFinite(Number(timestamp)) || Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000) return null;
  const expected = createHmac("sha256", secret()).update(`${version}.${timestamp}.${nonce}`).digest();
  const actual = Buffer.from(signature, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? raw : null;
}
