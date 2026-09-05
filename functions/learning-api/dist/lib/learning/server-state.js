"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSENT_COOKIE = void 0;
exports.sealSession = sealSession;
exports.openSession = openSession;
exports.toClientState = toClientState;
exports.createConsentValue = createConsentValue;
exports.createIllustrationReceipt = createIllustrationReceipt;
exports.hasValidIllustrationReceipt = hasValidIllustrationReceipt;
exports.hasValidConsent = hasValidConsent;
exports.consentRateIdentity = consentRateIdentity;
const node_crypto_1 = require("node:crypto");
const api_1 = require("./api");
const TOKEN_VERSION = "v1";
const CONSENT_VERSION = "guardian-v1";
const ILLUSTRATION_RECEIPT_VERSION = "illustration-v1";
exports.CONSENT_COOKIE = "guardian_consent_v1";
function secret() {
    const configured = process.env.SESSION_STATE_SECRET?.trim();
    if (!configured && process.env.NODE_ENV === "production")
        throw new Error("生产环境缺少 SESSION_STATE_SECRET");
    return (0, node_crypto_1.createHash)("sha256").update(configured || "knowledge-backtracking-development-only-secret").digest();
}
function sealSession(session) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", secret(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [TOKEN_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}
function openSession(token) {
    if (typeof token !== "string" || token.length < 40 || token.length > 180_000)
        throw new Error("学习会话凭证不合法");
    const [version, ivRaw, tagRaw, encryptedRaw, ...rest] = token.split(".");
    if (version !== TOKEN_VERSION || !ivRaw || !tagRaw || !encryptedRaw || rest.length)
        throw new Error("学习会话凭证格式不合法");
    try {
        const decipher = (0, node_crypto_1.createDecipheriv)("aes-256-gcm", secret(), Buffer.from(ivRaw, "base64url"));
        decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
        const plain = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
        const session = (0, api_1.parseSession)(JSON.parse(plain));
        if (Date.now() - Date.parse(session.updatedAt) > 24 * 60 * 60 * 1000)
            throw new Error("学习会话已过期，请重新拍题");
        return session;
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("已过期"))
            throw error;
        throw new Error("学习会话已损坏或被修改，请重新拍题");
    }
}
function toClientState(session) {
    const safe = {
        ...session,
        nodes: session.nodes.map((node) => ({ ...node, check: { ...node.check, answer: "", explanation: "" } })),
        evidence: session.evidence.map((item) => ({ ...item, answer: undefined })),
        transferCheck: session.transferCheck ? { ...session.transferCheck, answer: "", explanation: "" } : null,
    };
    return { session: safe, stateToken: sealSession(session) };
}
function createConsentValue() {
    const timestamp = String(Date.now());
    const nonce = (0, node_crypto_1.randomBytes)(12).toString("base64url");
    const payload = `${CONSENT_VERSION}.${timestamp}.${nonce}`;
    const signature = (0, node_crypto_1.createHmac)("sha256", secret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}
function createIllustrationReceipt(requestId, problemFingerprint) {
    const timestamp = String(Date.now());
    const payload = `${ILLUSTRATION_RECEIPT_VERSION}.${timestamp}.${requestId}.${problemFingerprint}`;
    return `${payload}.${(0, node_crypto_1.createHmac)("sha256", secret()).update(payload).digest("base64url")}`;
}
function hasValidIllustrationReceipt(raw, requestId, problemFingerprint) {
    if (typeof raw !== "string")
        return false;
    const [version, timestamp, receiptRequestId, receiptFingerprint, signature, ...rest] = raw.split(".");
    if (version !== ILLUSTRATION_RECEIPT_VERSION || !timestamp || receiptRequestId !== requestId || receiptFingerprint !== problemFingerprint || !signature || rest.length)
        return false;
    if (!Number.isFinite(Number(timestamp)) || Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000 || Number(timestamp) > Date.now() + 60_000)
        return false;
    const payload = `${version}.${timestamp}.${receiptRequestId}.${receiptFingerprint}`;
    const expected = (0, node_crypto_1.createHmac)("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    return actual.length === expected.length && (0, node_crypto_1.timingSafeEqual)(actual, expected);
}
function hasValidConsent(request) {
    return validatedConsentValue(request) !== null;
}
function consentRateIdentity(request) {
    const raw = validatedConsentValue(request);
    return raw ? `consent:${(0, node_crypto_1.createHash)("sha256").update(raw).digest("hex").slice(0, 24)}` : null;
}
function validatedConsentValue(request) {
    const raw = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${exports.CONSENT_COOKIE}=`))?.slice(exports.CONSENT_COOKIE.length + 1);
    if (!raw)
        return null;
    const [version, timestamp, nonce, signature, ...rest] = raw.split(".");
    if (version !== CONSENT_VERSION || !timestamp || !nonce || !signature || rest.length)
        return null;
    if (!Number.isFinite(Number(timestamp)) || Date.now() - Number(timestamp) > 24 * 60 * 60 * 1000)
        return null;
    const expected = (0, node_crypto_1.createHmac)("sha256", secret()).update(`${version}.${timestamp}.${nonce}`).digest();
    const actual = Buffer.from(signature, "base64url");
    return actual.length === expected.length && (0, node_crypto_1.timingSafeEqual)(actual, expected) ? raw : null;
}
