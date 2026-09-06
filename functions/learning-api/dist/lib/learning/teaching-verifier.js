"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTeachingProgram = parseTeachingProgram;
exports.verifyTeachingProgram = verifyTeachingProgram;
const node_worker_threads_1 = require("node:worker_threads");
const node_module_1 = require("node:module");
const teaching_worker_1 = require("./teaching-worker");
const identifier = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const reserved = new Set(["constructor", "prototype", "__proto__", "toString", "valueOf", "pi", "e", "x", "sqrt", "abs", "sin", "cos", "tan", "exp", "log"]);
function fail(message) { throw new Error(message); }
function text(v, max) { return typeof v === "string" && v.trim().length > 0 && v.length <= max; }
function list(v, max) { return Array.isArray(v) && v.length <= max; }
function record(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
/** Validate all untrusted structure before allocating a worker. */
function parseTeachingProgram(raw, evidence) {
    if (raw.length > 60000)
        fail("演示协议超出大小限制");
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const p = JSON.parse(cleaned);
    function safeKeys(v, depth = 0) {
        if (depth > 20)
            fail("演示结构过深");
        if (!v || typeof v !== "object")
            return;
        for (const [key, child] of Object.entries(v)) {
            if (["__proto__", "prototype", "constructor"].includes(key))
                fail("禁止的对象属性");
            safeKeys(child, depth + 1);
        }
    }
    safeKeys(p);
    if (record(p)) {
        const values = {}, ambiguous = new Set();
        for (const m of evidence.matchAll(/\b([A-Za-z][A-Za-z0-9_]{0,31})\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
            const before = evidence.slice(0, m.index).trimEnd(), after = evidence.slice(m.index + m[0].length).trimStart();
            // Only standalone literal assignments, not the tail of x+y=0 or a=3*x.
            if (/[+\-*/^=∠]$/.test(before) || (after && !/^[,，。;；、)）\]]/.test(after)) || reserved.has(m[1]))
                continue;
            if (values[m[1]] !== undefined && Number(values[m[1]]) !== Number(m[2]))
                ambiguous.add(m[1]);
            values[m[1]] = m[2];
        }
        for (const name of ambiguous)
            delete values[name];
        p.sourceValues = values;
        p.version ??= 2;
        p.conditions ??= [{ id: "source", quote: evidence }];
        p.symbols ??= [];
        p.variables ??= [];
        const taken = new Set();
        for (const items of [p.conditions, p.variables, p.steps])
            if (Array.isArray(items))
                for (const item of items)
                    if (record(item)) {
                        if (typeof item.id === "string")
                            taken.add(item.id);
                        if (typeof item.name === "string")
                            taken.add(item.name);
                    }
        const sourceId = Array.isArray(p.conditions) && record(p.conditions[0]) ? p.conditions[0].id : "source";
        if (Array.isArray(p.variables))
            for (const v of p.variables)
                if (record(v))
                    v.refs ??= [sourceId];
        if (Array.isArray(p.steps))
            for (const [i, s] of p.steps.entries())
                if (record(s)) {
                    if (s.id === undefined) {
                        let generated = `step${i + 1}`;
                        while (taken.has(generated))
                            generated += "a";
                        s.id = generated;
                        taken.add(generated);
                    }
                    s.refs ??= [sourceId];
                    s.schematic ??= true;
                    s.bounds ??= [-1, -1, 8, 8];
                    if (Array.isArray(s.objects))
                        for (const [j, o] of s.objects.entries())
                            if (record(o))
                                o.id ??= `obj${j + 1}`;
                }
    }
    if (!record(p) || p.version !== 2 || !text(p.title, 80) || !list(p.conditions, 24) || !p.conditions.length || !list(p.variables, 32) || !list(p.symbols, 16) || !list(p.steps, 10) || !p.steps.length)
        fail("需要版本2协议、条件和1至10个步骤");
    const ids = new Set();
    const normalized = evidence.replace(/\s/g, "");
    function id(v) { if (!text(v, 32) || !identifier.test(v) || reserved.has(v) || ids.has(v))
        fail("标识符不合法或重复"); ids.add(v); }
    function refs(v) { if (!list(v, 24) || !v.length || v.some((ref) => typeof ref !== "string" || !ids.has(ref)))
        fail("步骤或变量缺少有效的前置引用"); }
    for (const c of p.conditions) {
        if (!record(c) || !text(c.quote, 12000) || !normalized.includes(c.quote.replace(/\s/g, "")))
            fail("条件必须逐字引用原题证据，不能引用参考答案");
        id(c.id);
    }
    const names = new Set();
    for (const name of p.symbols) {
        if (typeof name !== "string" || !identifier.test(name) || (reserved.has(name) && name !== "x") || names.has(name))
            fail("自由符号不合法");
        names.add(name);
    }
    for (const v of p.variables) {
        if (!record(v) || typeof v.name !== "string" || !identifier.test(v.name) || reserved.has(v.name) || names.has(v.name) || !text(v.expression, 256))
            fail("变量定义不合法");
        refs(v.refs);
        names.add(v.name);
        id(v.name);
    }
    for (const s of p.steps) {
        if (!record(s) || !text(s.title, 80) || !text(s.explanation, 1800) || !list(s.checks, 8) || !s.checks.length || typeof s.schematic !== "boolean" || !list(s.bounds, 4) || s.bounds.length !== 4 || !list(s.objects, 24))
            fail("步骤结构不合法或超限；每步至少需要一个检查");
        refs(s.refs);
        id(s.id);
        const b = s.bounds;
        if (b.some((v) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e6) || !(Number(b[0]) < Number(b[2])) || !(Number(b[1]) < Number(b[3])))
            fail("视图范围应为[xmin,ymin,xmax,ymax]");
        if (Number(b[2]) - Number(b[0]) < 1e-6 || Number(b[3]) - Number(b[1]) < 1e-6)
            fail("视图范围过小");
        for (const c of s.checks)
            if (!record(c) || !["numeric", "identity", "unit", "reasoning"].includes(String(c.kind)) || !text(c.left, 256) || !text(c.right, 256))
                fail("检查项不合法");
        const objects = new Set();
        for (const o of s.objects) {
            if (record(o)) {
                // Lossless transport normalization only: an axis/curve has no explicit
                // points, and a single point's flat pair has only one interpretation.
                if ((o.kind === "axes" || o.kind === "curve") && o.points === undefined)
                    o.points = [];
                if (["point", "circle", "label"].includes(String(o.kind)) && Array.isArray(o.points) && o.points.length === 2 && o.points.every(v => typeof v === "string" || typeof v === "number"))
                    o.points = [o.points];
                if (Array.isArray(o.points))
                    o.points = o.points.map(p => Array.isArray(p) ? p.map(v => typeof v === "number" && Number.isFinite(v) ? String(v) : v) : p);
            }
            if (!record(o) || !text(o.id, 32) || !identifier.test(o.id) || objects.has(o.id) || !["point", "line", "arrow", "circle", "polygon", "curve", "label", "axes"].includes(String(o.kind)) || !list(o.points, 24))
                fail("图形对象不合法");
            objects.add(o.id);
            if (o.text !== undefined && !text(o.text, 100))
                fail("图中文字过长");
            if (o.color !== undefined && !["base", "change", "outline"].includes(String(o.color)))
                fail("颜色不合法");
            for (const point of o.points)
                if (!list(point, 2) || point.length !== 2 || point.some((v) => !text(v, 256)))
                    fail("坐标必须为两个表达式字符串");
            const required = { line: 2, arrow: 2, circle: 1, label: 1, axes: 0, curve: 0 }[String(o.kind)];
            if (required !== undefined && o.points.length !== required)
                fail(`步骤${s.id}对象${o.id}(${o.kind})图形点数不合法：需要${required}点，实际${o.points.length}点；axes和curve不填写points，其他图形按约定填写`);
            if (o.kind === "polygon" && o.points.length < 3)
                fail("多边形至少需要三个点");
            if (o.kind === "point" && !o.points.length)
                fail("点集至少需要一个点");
            if (o.edgeLabels !== undefined && (o.kind !== "polygon" || !list(o.edgeLabels, o.points.length) || o.edgeLabels.some(v => typeof v !== "string" || v.length > 80)))
                fail("边标签只能用于多边形，按顶点顺序对应每条边");
            if (o.rightAngleAt !== undefined && (o.kind !== "polygon" || !Number.isInteger(o.rightAngleAt) || Number(o.rightAngleAt) < 0 || Number(o.rightAngleAt) >= o.points.length))
                fail("直角标记必须指定多边形的顶点序号（从0开始）");
            if (o.kind === "circle" && !text(o.radius, 256))
                fail("圆需要半径表达式");
            if (o.kind === "label" && !text(o.text, 100))
                fail("标签需要文字");
            if (o.kind === "curve" && (!text(o.expression, 256) || !list(o.domain, 2) || o.domain.length !== 2 || o.domain.some((v) => !text(v, 256))))
                fail("曲线需要表达式和区间");
        }
    }
    if (!p.steps.some(s => s.objects.some(o => o.kind !== "label")))
        fail("演示缺少可视化关系：不能全组为空图或只有文字标签，请为题目的关键关系绘图，不要加入无关装饰");
    return p;
}
/** CPU and wall time are bounded by terminating the worker, including synchronous math.js calls. */
function verifyTeachingProgram(program, signal, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted)
            return reject(new DOMException("请求已取消", "AbortError"));
        const worker = new node_worker_threads_1.Worker(`(${teaching_worker_1.teachingWorkerMain.toString()})()`, {
            eval: true,
            workerData: { program, mathPath: (0, node_module_1.createRequire)(`${__dirname}/teaching-verifier.js`).resolve("mathjs") },
            resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        });
        let settled = false;
        const finish = (error, result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            void worker.terminate();
            if (error)
                reject(error);
            else
                resolve(result);
        };
        const abort = () => finish(new DOMException("请求已取消", "AbortError"));
        const timer = setTimeout(() => finish(new Error("数学核验超过资源预算，请简化演示后重试")), timeoutMs);
        signal?.addEventListener("abort", abort, { once: true });
        worker.once("message", (message) => finish(message.error ? new Error(message.error) : undefined, message.result));
        worker.once("error", (error) => finish(error));
        worker.once("exit", (code) => { if (!settled)
            finish(new Error(`核验进程意外结束 (${code})`)); });
    });
}
