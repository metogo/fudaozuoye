"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countRequest = countRequest;
const node_crypto_1 = require("node:crypto");
const cloudbase_cjs_1 = __importDefault(require("./cloudbase.cjs"));
const requesty_js_1 = require("./requesty.js");
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const collection = 'cuotiben_daily_usage';
const hash = value => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
let db;
async function countRequest(config, body) {
    if (!uuid.test(body.deviceId) || !uuid.test(body.entryId))
        throw new requesty_js_1.ServiceError(400, '请刷新错题本后再试。');
    if (!config.CLOUDBASE_ENV_ID || !config.CLOUDBASE_APIKEY)
        throw new requesty_js_1.ServiceError(503, '错题本的用量服务尚未配置。');
    db ??= cloudbase_cjs_1.default.init({ env: config.CLOUDBASE_ENV_ID, accessKey: config.CLOUDBASE_APIKEY,
        region: 'ap-shanghai', timeout: 5000 }).database();
    const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const id = hash(body.deviceId);
    const request = hash(JSON.stringify([body.entryId, body.task, body.model, body.q, body.child, body.image]));
    try {
        await db.runTransaction(async (tx) => {
            const doc = tx.collection(collection).doc(id);
            let row;
            try {
                const read = await doc.get();
                if (read.code || read.data?.list?.length !== 1)
                    throw Error('读取用量失败');
                row = read.data.list[0];
            }
            catch (error) {
                if (error?.code !== 'DOCUMENT_NOT_FOUND')
                    throw error;
            }
            const requests = row?.day === day ? row.requests : [];
            if (!Array.isArray(requests))
                throw Error('用量记录格式有误');
            if (requests.includes(request))
                return;
            if (requests.length >= 30)
                throw new requesty_js_1.ServiceError(429, '今天已使用 30 次解析，北京时间零点恢复。已收录的题仍可查看和订正。');
            const next = { day, requests: [...requests, request] };
            const written = row ? await doc.update(next) : await doc.set(next);
            if (written.code || (row ? written.updated !== 1 : written.upsert_id !== id))
                throw Error('写入用量失败');
        }, 5);
    }
    catch (error) {
        if (error instanceof requesty_js_1.ServiceError)
            throw error;
        throw new requesty_js_1.ServiceError(503, '暂时无法读取错题本用量，请稍后重试，题目已保留。');
    }
}
