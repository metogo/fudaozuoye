"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conceptGraphDefinition = conceptGraphDefinition;
exports.evaluatePolynomial = evaluatePolynomial;
exports.functionBoundingBox = functionBoundingBox;
exports.geometryBoundingBox = geometryBoundingBox;
exports.geometryPointPositions = geometryPointPositions;
function conceptGraphDefinition(visual) {
    const direction = visual.direction === "left-right" ? "LR" : "TD";
    const nodes = visual.nodes.map((node) => `${node.id}[${JSON.stringify(cleanMermaidText(node.label))}]:::${node.role}`);
    const edges = visual.edges.map((edge) => `${edge.from} -->${edge.label ? `|${cleanMermaidText(edge.label)}|` : ""} ${edge.to}`);
    return [
        `flowchart ${direction}`,
        ...nodes,
        ...edges,
        "classDef given fill:#f5f5f4,stroke:#78716c,color:#292524",
        "classDef relation fill:#ecfdf5,stroke:#047857,color:#064e3b",
        "classDef step fill:#fffbeb,stroke:#d97706,color:#78350f",
        "classDef check fill:#fff1f2,stroke:#e11d48,color:#881337",
    ].join("\n");
}
function evaluatePolynomial(coefficients, x) {
    return coefficients.reduce((value, coefficient) => value * x + coefficient, 0);
}
function functionBoundingBox(visual) {
    const [minimumX, maximumX] = visual.domain;
    const samples = Array.from({ length: 81 }, (_, index) => minimumX + (maximumX - minimumX) * index / 80);
    const values = visual.series.flatMap((series) => samples.map((x) => evaluatePolynomial(series.coefficients, x))).filter(Number.isFinite);
    const minimumY = Math.min(0, ...values);
    const maximumY = Math.max(0, ...values);
    const span = Math.max(2, maximumY - minimumY);
    return [minimumX, maximumY + span * 0.12, maximumX, minimumY - span * 0.12];
}
function geometryBoundingBox(visual) {
    const positions = geometryPointPositions(visual);
    const xs = Object.values(positions).map((point) => point.x);
    const ys = Object.values(positions).map((point) => point.y);
    const radii = visual.objects.flatMap((object) => {
        if (object.type !== "circle")
            return [];
        if (object.radius)
            return [object.radius];
        const center = positions[object.center];
        const through = object.through ? positions[object.through] : undefined;
        return center && through ? [Math.hypot(center.x - through.x, center.y - through.y)] : [];
    });
    const margin = Math.max(1, ...radii, (Math.max(...xs) - Math.min(...xs)) * 0.16, (Math.max(...ys) - Math.min(...ys)) * 0.16);
    return [Math.min(...xs) - margin, Math.max(...ys) + margin, Math.max(...xs) + margin, Math.min(...ys) - margin];
}
function geometryPointPositions(visual) {
    const rightAngle = visual.objects.find((object) => object.type === "right_angle");
    const positions = {};
    if (rightAngle?.type === "right_angle") {
        positions[rightAngle.vertex] = { x: 0, y: 0 };
        positions[rightAngle.from] = { x: 4, y: 0 };
        positions[rightAngle.to] = { x: 0, y: 3 };
    }
    const remaining = visual.points.filter((point) => !positions[point.id]);
    remaining.forEach((point, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(remaining.length, 3);
        positions[point.id] = { x: Math.cos(angle) * 3.2, y: Math.sin(angle) * 3.2 };
    });
    return positions;
}
function cleanMermaidText(value) {
    return value.replace(/[\r\n]+/g, " ").replace(/[|;#]/g, " ").replace(/\s+/g, " ").trim();
}
