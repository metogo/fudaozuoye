"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkLearningImageSize = checkLearningImageSize;
exports.copyLearningImage = copyLearningImage;
const pixelRatio = 2;
const maxDimension = 16384;
const maxPixels = 32_000_000;
const generationTimeout = 30_000;
function snapshotLearningText(source) {
    const clone = source.cloneNode(true);
    const originals = [source, ...source.querySelectorAll("*")];
    const copies = [clone, ...clone.querySelectorAll("*")];
    const view = source.ownerDocument.defaultView;
    if (!view)
        throw new Error("无法读取正文样式");
    originals.forEach((element, index) => {
        if (element.closest(".katex-mathml"))
            return;
        const style = view.getComputedStyle(element);
        for (const property of style)
            copies[index].style.setProperty(property, style.getPropertyValue(property));
        if (element.closest(".katex")) {
            copies[index].style.whiteSpace = "nowrap";
            copies[index].style.wordBreak = "normal";
        }
    });
    clone.style.position = "fixed";
    clone.style.left = "-100000px";
    clone.style.top = "0";
    clone.style.pointerEvents = "none";
    clone.setAttribute("aria-hidden", "true");
    source.ownerDocument.body.appendChild(clone);
    return clone;
}
function checkLearningImageSize(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error("正文尺寸无效，无法生成图片");
    }
    if (width * pixelRatio > maxDimension || height * pixelRatio > maxDimension ||
        width * height * pixelRatio ** 2 > maxPixels) {
        throw new Error("讲解过长或公式过宽，无法完整复制为清晰图片，请复制文本");
    }
}
async function renderLearningImage(source, signal) {
    await source.ownerDocument.fonts.ready;
    signal.throwIfAborted();
    const { toBlob, getFontEmbedCSS } = await Promise.resolve().then(() => __importStar(require("html-to-image")));
    const width = Math.ceil(source.getBoundingClientRect().width);
    const height = Math.ceil(source.scrollHeight);
    checkLearningImageSize(width + 32, height + 32);
    const fonts = await getFontEmbedCSS(source, { preferredFontFormat: "woff2" });
    signal.throwIfAborted();
    // html-to-image otherwise continues with missing fonts after logging failed fetches.
    const fontUrls = Array.from(fonts.matchAll(/url\(([^)]*)\)/gi), (match) => match[1].replace(/["']/g, "").trim());
    if (fontUrls.some((url) => !/^data:[^,]+,.+/.test(url)) ||
        (source.querySelector(".katex") && (!fonts.includes("KaTeX") || fontUrls.length === 0))) {
        throw new Error("公式字体加载失败，请重试");
    }
    try {
        await Promise.all([...new Set(fontUrls)].map((url) => new FontFace("copy-font-check", `url("${url}")`).load()));
    }
    catch {
        throw new Error("公式字体无法解码，请重试");
    }
    signal.throwIfAborted();
    const blob = await toBlob(source, {
        backgroundColor: "#ffffff", pixelRatio, skipAutoScale: true, fontEmbedCSS: fonts,
        // The snapshot already has exact font sizes. The library rounds this property down,
        // breaking KaTeX's glyph metrics and making multi-digit subscripts wrap.
        includeStyleProperties: Array.from(source.ownerDocument.defaultView.getComputedStyle(source))
            .filter((property) => property !== "font-size"),
        width: width + 32, height: height + 32,
        style: { position: "static", left: "auto", top: "auto", width: `${width + 32}px`, height: `${height + 32}px`, padding: "16px", boxSizing: "border-box" },
        filter: (node) => !(node instanceof Element && node.matches("button,input,textarea,select,.katex-mathml,.streaming-indicator,[data-copy-exclude]")),
    });
    signal.throwIfAborted();
    if (!blob || !blob.size)
        throw new Error("图片生成失败，请重试");
    return blob;
}
function generateLearningImage(snapshot) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error("图片生成超时，请重试或复制文本");
            controller.abort(error);
            reject(error);
        }, generationTimeout);
    });
    return Promise.race([renderLearningImage(snapshot, controller.signal), timeout]).finally(() => {
        clearTimeout(timer);
        snapshot.remove();
    });
}
/** Create the item immediately so asynchronous rendering retains the user's pasteboard gesture. */
async function copyLearningImage(source) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined" ||
        (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports("image/png"))) {
        throw new Error("当前浏览器不支持复制图片，请使用支持此功能的浏览器");
    }
    // KaTeX's 1px accessibility tree deliberately overflows. Only visible clipping containers
    // can lose visual content; positioned glyph spans are not independent image boundaries.
    for (const element of [source, ...source.querySelectorAll("*")]) {
        if (element.closest(".katex-mathml"))
            continue;
        const style = source.ownerDocument.defaultView?.getComputedStyle(element);
        const clips = style && /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
        if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2 && (clips || element === source)) {
            throw new Error("当前公式超出正文宽度，请在更宽的窗口中复制图片");
        }
    }
    const image = generateLearningImage(snapshotLearningText(source));
    // A browser can reject write before consuming the promise; keep its rejection handled.
    void image.catch(() => undefined);
    // Observe generation independently: some browsers leave write pending while unfocused,
    // even when the promised image has already failed or timed out.
    await Promise.all([image, navigator.clipboard.write([new ClipboardItem({ "image/png": image })])]);
}
