"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generalTeachingTool = generalTeachingTool;
/** Compact generation schema; the server supplies mechanical IDs and source context. */
function generalTeachingTool() {
    const string = { type: "string" };
    const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
    const objects = { type: "array", maxItems: 24, items: object({
            id: string, kind: { type: "string", enum: ["point", "line", "arrow", "circle", "polygon", "curve", "label", "axes"] },
            points: { type: "array", maxItems: 24, items: { type: "array", minItems: 2, maxItems: 2, items: string } },
            text: string, radius: string, expression: string, domain: { type: "array", minItems: 2, maxItems: 2, items: string },
            color: { type: "string", enum: ["base", "change", "outline"] },
            edgeLabels: { type: "array", maxItems: 24, items: string },
            rightAngleAt: { type: "integer", minimum: 0, maximum: 23 },
        }, ["kind"]) };
    return { type: "function", function: { name: "submit_teaching_program", description: "提交通用原题演示数据；不输出代码，条件不足时只提交clarification", parameters: object({
                title: string, clarification: string,
                variables: { type: "array", maxItems: 32, items: object({ name: string, expression: string }) },
                steps: { type: "array", minItems: 1, maxItems: 10, items: object({
                        title: string, explanation: string,
                        checks: { type: "array", minItems: 1, maxItems: 8, items: object({ kind: { type: "string", enum: ["numeric", "identity", "unit", "reasoning"] }, left: string, right: string }) },
                        objects,
                    }) },
            }, []) } };
}
