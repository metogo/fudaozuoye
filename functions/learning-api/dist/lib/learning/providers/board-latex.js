"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertValidLatex = assertValidLatex;
const katex_1 = __importDefault(require("katex"));
function assertValidLatex(value, label) {
    for (const formula of value.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
        const source = formula[1] ?? formula[2] ?? "";
        try {
            katex_1.default.renderToString(source, { throwOnError: true, strict: "error" });
        }
        catch {
            throw new Error(`${label}的 LaTeX 结构不合法`);
        }
    }
}
