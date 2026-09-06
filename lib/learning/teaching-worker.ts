/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/** This trusted function is serialized as worker bootstrap, never model-generated code. */
export function teachingWorkerMain() {
  const { parentPort, workerData } = require("node:worker_threads");
  const math = require(workerData.mathPath);
  try {
    const program = workerData.program;
    const scope = new Map<string, number>();
    const bindings = new Map<string, any>();
    const symbols = new Set<string>(program.symbols);
    const variableNames = new Set<string>(program.variables.map((v: any) => v.name));
    const definitions = new Map<string, string>(program.variables.map((v: any) => [v.name, v.expression]));
    const resolving = new Set<string>();
    function bind(name: string) {
      if (bindings.has(name)) return;
      if (resolving.has(name)) throw Error("变量定义存在循环引用 " + name);
      resolving.add(name);
      bindings.set(name, ast(definitions.get(name)!).node);
      resolving.delete(name);
    }
    const inferredSymbols = new Set<string>();
    const functions = new Set(["sqrt", "abs", "sin", "cos", "tan", "exp", "log"]);
    let operations = 0;
    function ast(expression: string, allowX = false) {
      if (typeof expression !== "string" || expression.length > 256) throw Error("表达式过长");
      for (const token of expression.match(/(?<![A-Za-z0-9_])(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []) {
        const decimal = math.bignumber(token), parsed = Number(token);
        if (!Number.isFinite(parsed) || !decimal.eq(math.bignumber(String(parsed))) || (parsed !== 0 && Math.abs(parsed) < 1e-300)) throw Error("常量超出可靠精度或资源范围");
      }
      const node = math.parse(expression);
      let domainSafe = true;
      function walk(n: any, depth: number) {
        if (++operations > 12000 || depth > 16) throw Error("表达式资源超限");
        if (n.type === "ConstantNode") {
          if (typeof n.value !== "number" || !Number.isFinite(n.value) || Math.abs(n.value) > 1e9) throw Error("常量不合法");
        } else if (n.type === "SymbolNode") {
          if (variableNames.has(n.name) && !bindings.has(n.name)) bind(n.name);
          if (!scope.has(n.name) && !bindings.has(n.name) && !symbols.has(n.name) && !(allowX && n.name === "x") && n.name !== "pi" && n.name !== "e") {
            if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(n.name) || ["constructor", "prototype", "toString", "valueOf"].includes(n.name) || variableNames.has(n.name) || symbols.size >= 16) throw Error("未声明或前向引用变量 " + n.name);
            // A missing symbol declaration is recoverable syntax, not permission
            // to invent a value. Numeric evaluation will still reject free symbols.
            symbols.add(n.name); inferredSymbols.add(n.name);
          }
        } else if (n.type === "ParenthesisNode") walk(n.content, depth + 1);
        else if (n.type === "OperatorNode") {
          if (!["+", "-", "*", "/", "^"].includes(n.op) || n.args.length > 2) throw Error("不允许的运算");
          if (n.op === "^") {
            if (n.args[1].type !== "ConstantNode" || Math.abs(n.args[1].value) > 12) throw Error("指数超限");
            if (!Number.isInteger(n.args[1].value) || n.args[1].value < 0) domainSafe = false;
          }
          if (n.op === "/" && (n.args[1].type !== "ConstantNode" || n.args[1].value === 0)) domainSafe = false;
          n.args.forEach((a: any) => walk(a, depth + 1));
        } else if (n.type === "FunctionNode") {
          if (n.fn.type !== "SymbolNode" || !functions.has(n.fn.name) || n.args.length !== 1) throw Error("不允许的函数");
          domainSafe = false;
          n.args.forEach((a: any) => walk(a, depth + 1));
        } else throw Error("禁止的表达式节点 " + n.type);
      }
      walk(node, 0);
      const expanded = node.transform((n: any) => n.type === "SymbolNode" && bindings.has(n.name) ? bindings.get(n.name).cloneDeep() : n);
      walk(expanded, 0);
      return { node: expanded, domainSafe };
    }
    function value(expression: string, local = scope): number {
      const result = ast(expression, local.has("x")).node.evaluate(local);
      if (typeof result !== "number" || !Number.isFinite(result) || Math.abs(result) > 1e9) throw Error("计算结果不是有限实数");
      return result;
    }
    function rational(node: any): any {
      // Fraction(number) uses a rational approximation (even tiny nonzero values
      // can become zero). Decimal text preserves the parsed constant exactly.
      if (node.type === "ConstantNode") return math.fraction(math.bignumber(String(node.value)).toFixed());
      if (node.type === "ParenthesisNode") return rational(node.content);
      if (node.type !== "OperatorNode") return null;
      const a = rational(node.args[0]), b = node.args[1] ? rational(node.args[1]) : undefined;
      if (a === null || b === null) return null;
      let result;
      if (node.op === "+") result = b === undefined ? a : a.add(b);
      else if (node.op === "-") result = b === undefined ? a.neg() : a.sub(b);
      else if (node.op === "*") result = a.mul(b);
      else if (node.op === "/") result = a.div(b);
      else if (node.op === "^" && node.args[1].type === "ConstantNode" && Number.isInteger(node.args[1].value)) result = a.pow(node.args[1].value);
      else return null;
      if (result.n.toString().length > 300 || result.d.toString().length > 300) throw Error("精确运算超出资源限制");
      return result;
    }
    type Polynomial = Map<string, any>;
    function addTerm(out: Polynomial, key: string, coefficient: any) {
      if (++operations > 12000) throw Error("多项式运算超限");
      const c = out.has(key) ? out.get(key).add(coefficient) : coefficient;
      if (c.n.toString().length > 300 || c.d.toString().length > 300) throw Error("多项式系数超限");
      if (c.equals(0)) out.delete(key); else out.set(key, c);
      if (out.size > 256) throw Error("多项式项数超限");
    }
    function product(a: Polynomial, b: Polynomial): Polynomial {
      const out: Polynomial = new Map();
      for (const [ka, ca] of a) for (const [kb, cb] of b) {
        const powers = new Map<string, number>();
        for (const part of [ka, kb].filter(Boolean).flatMap(k => k.split("*"))) {
          const [name, exponent] = part.split("^"); powers.set(name, (powers.get(name) ?? 0) + Number(exponent));
        }
        const key = [...powers].sort(([a], [b]) => a.localeCompare(b)).map(([name, power]) => `${name}^${power}`).join("*");
        addTerm(out, key, ca.mul(cb));
      }
      return out;
    }
    function polynomial(n: any): Polynomial {
      if (n.type === "ConstantNode") { const out: Polynomial = new Map(); addTerm(out, "", rational(n)); return out; }
      if (n.type === "SymbolNode") return new Map([[`${n.name}^1`, math.fraction(1)]]);
      if (n.type === "ParenthesisNode") return polynomial(n.content);
      if (n.type !== "OperatorNode") throw Error("非多项式节点");
      const a = polynomial(n.args[0]);
      if (n.op === "^") { let out: Polynomial = new Map([["", math.fraction(1)]]); for (let i = 0; i < n.args[1].value; i++) out = product(out, a); return out; }
      if (n.op === "/") { const d = rational(n.args[1]); if (d === null || d.equals(0)) throw Error("多项式分母不可核验"); return new Map([...a].map(([k, c]) => [k, c.div(d)])); }
      if (n.op === "*") return product(a, polynomial(n.args[1]));
      const out: Polynomial = new Map();
      for (const [k, c] of a) addTerm(out, k, n.op === "-" && n.args.length === 1 ? c.neg() : c);
      if (n.args.length > 1) for (const [k, c] of polynomial(n.args[1])) addTerm(out, k, n.op === "-" ? c.neg() : c);
      return out;
    }
    function interval(n: any, a: number, b: number): [number, number] {
      if (++operations > 12000) throw Error("曲线区间核验超限");
      if (n.type === "ConstantNode") return [n.value, n.value];
      if (n.type === "SymbolNode") { if (n.name === "x") return [a, b]; const v = value(n.name); return [v, v]; }
      if (n.type === "ParenthesisNode") return interval(n.content, a, b);
      const u = interval(n.args[0], a, b), v = n.args[1] ? interval(n.args[1], a, b) : undefined;
      if (n.type === "OperatorNode") {
        if (n.op === "+") return v ? [u[0] + v[0], u[1] + v[1]] : u;
        if (n.op === "-") return v ? [u[0] - v[1], u[1] - v[0]] : [-u[1], -u[0]];
        if (n.op === "*") { const p = [u[0] * v![0], u[0] * v![1], u[1] * v![0], u[1] * v![1]]; return [Math.min(...p), Math.max(...p)]; }
        if (n.op === "/") { if (v![0] <= 0 && v![1] >= 0) throw Error("曲线区间可能跨越零分母，请拆成连续区间"); const p = [u[0] / v![0], u[0] / v![1], u[1] / v![0], u[1] / v![1]]; return [Math.min(...p), Math.max(...p)]; }
        if (n.op === "^") { const exponent = n.args[1].value; if (!Number.isInteger(exponent) && u[0] < 0) throw Error("曲线幂函数区间无法确认定义域"); const p = [u[0] ** exponent, u[1] ** exponent]; if (exponent > 0 && exponent % 2 === 0 && u[0] <= 0 && u[1] >= 0) p.push(0); return [Math.min(...p), Math.max(...p)]; }
      }
      const fn = n.fn.name;
      if (fn === "sin" || fn === "cos") return [-1, 1];
      if (fn === "abs") return [u[0] <= 0 && u[1] >= 0 ? 0 : Math.min(Math.abs(u[0]), Math.abs(u[1])), Math.max(Math.abs(u[0]), Math.abs(u[1]))];
      if (fn === "sqrt" && u[0] < 0 || fn === "log" && u[0] <= 0) throw Error("曲线区间无法确认实数定义域，请缩小区间");
      if (fn === "tan" && Math.ceil((u[0] - Math.PI / 2) / Math.PI) <= Math.floor((u[1] - Math.PI / 2) / Math.PI)) throw Error("曲线区间跨越正切函数间断点");
      const evaluate = (x: number) => fn === "sqrt" ? Math.sqrt(x) : fn === "log" ? Math.log(x) : fn === "exp" ? Math.exp(x) : Math.tan(x);
      return [evaluate(u[0]), evaluate(u[1])];
    }
    // Symbolic aliases retain their declared free symbols; numeric rendering still
    // refuses unassigned parameters rather than inventing a value for them.
    for (const v of program.variables) bind(v.name);
    function sourceClaims(text: string) {
      for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9_]{0,31})\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
        const known = program.sourceValues?.[m[1]];
        const before = text.slice(0, m.index).trimEnd(), after = text.slice(m.index! + m[0].length).trimStart();
        if (known === undefined || /[+\-*/^=∠]$/.test(before) || (after && !/^[,，。;；、)）\]]/.test(after))) continue;
        if (Number(known) !== Number(m[2])) throw Error(`原题已知${m[1]}=${known}，演示却写成${m[0]}；已知量不可互换或改值，变化后的量请用新名称`);
      }
    }
    for (const [name, known] of Object.entries(program.sourceValues ?? {})) if (bindings.has(name)) {
      const exact = rational(ast(name).node), expected = rational(ast(String(known)).node);
      const actual = value(name);
      if (exact !== null ? !exact.equals(expected) : actual !== Number(known)) throw Error(`变量${name}=${actual}与原题已知${name}=${known}不一致`);
    }
    const result = program.steps.map((step: any) => {
      sourceClaims(step.explanation);
      const checks = step.checks.map((c: any) => {
        if (c.kind === "reasoning") return { status: "unknown", detail: `推理未获工具证明：${c.left}；${c.right}` };
        if (c.kind === "identity") {
          const l = ast(c.left), r = ast(c.right);
          for (const expression of [c.left, c.right]) {
            const node = ast(expression).node;
            if (!node.filter((n: any) => n.type === "SymbolNode" && symbols.has(n.name)).length) value(expression);
          }
          if (!l.domainSafe || !r.domainSafe) return { status: "unknown", detail: "含定义域限制，未证明恒等" };
          const exactLeft = rational(l.node), exactRight = rational(r.node);
          if (exactLeft !== null && exactRight !== null) return { status: exactLeft.equals(exactRight) ? "verified" : "error", detail: `精确算术检查：${c.left} = ${exactLeft.toFraction()}；${c.right} = ${exactRight.toFraction()}` };
          const hasSymbols = [l.node, r.node].some(n => n.filter((child: any) => child.type === "SymbolNode").length > 0);
          if (!hasSymbols) {
            const a = l.node.evaluate(), b = r.node.evaluate();
            if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return { status: "error", detail: `常量等式不成立：${c.left} = ${a}；${c.right} = ${b}` };
          }
          try {
            const difference = polynomial(l.node);
            for (const [key, coefficient] of polynomial(r.node)) addTerm(difference, key, coefficient.neg());
            return difference.size === 0 ? { status: "verified", detail: `多项式精确系数核验通过：${c.left} = ${c.right}（不证明文字推理）` } : { status: "error", detail: `多项式系数不相等：${c.left} 与 ${c.right}` };
          } catch { return { status: "unknown", detail: "符号工具无法核验此表达式" }; }
        }
        if (c.kind === "unit") {
          const pattern = /^-?\d+(?:\.\d+)?\s+[A-Za-z][A-Za-z0-9 */^.-]{0,40}$/;
          if (!pattern.test(c.left) || !pattern.test(c.right)) return { status: "unknown", detail: `单位表达不在可核验格式内：${c.left}；${c.right}` };
          const split = (s: string) => { const at = s.search(/\s/); const magnitude = s.slice(0, at); ast(magnitude); return { magnitude, unit: s.slice(at).trim() }; };
          const left = split(c.left), right = split(c.right);
          try {
            const a = math.unit(math.bignumber(left.magnitude), left.unit), b = math.unit(math.bignumber(right.magnitude), right.unit);
            if (left.unit !== right.unit && [...a.units, ...b.units].some((u: any) => u.unit.offset !== 0)) return { status: "unknown", detail: "带偏移单位的跨单位换算尚未核验，不能只比较归一数值" };
            return { status: a.equalBase(b) && a.value.eq(b.value) ? "verified" : "error", detail: `单位换算数值核对（非符号证明）：${c.left}；${c.right}` };
          } catch { return { status: "unknown", detail: `工具不支持此单位表达：${c.left}；${c.right}` }; }
        }
        const left = ast(c.left).node, right = ast(c.right).node;
        if ([left, right].some(n => n.filter((child: any) => child.type === "SymbolNode" && symbols.has(child.name)).length)) {
          return { status: "unknown", detail: `数值检查含未赋值参数，不能验证：${c.left} = ${c.right}` };
        }
        const exactLeft = rational(left), exactRight = rational(right);
        if (exactLeft !== null && exactRight !== null) return { status: exactLeft.equals(exactRight) ? "verified" : "error", detail: `精确算术检查：${c.left} = ${exactLeft.toFraction()}；${c.right} = ${exactRight.toFraction()}` };
        const a = value(c.left), b = value(c.right);
        const equal = Number.isInteger(a) && Number.isInteger(b) ? a === b : Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(Number.MIN_VALUE, Math.abs(a), Math.abs(b));
        const show = (v: number) => equal ? Number(v.toPrecision(12)) : v;
        return { status: equal ? "verified" : "error", detail: `数值近似检查（非符号证明）：${c.left} ≈ ${show(a)}；${c.right} ≈ ${show(b)}` };
      });
      const objects = step.objects.map((o: any) => {
        sourceClaims(o.text ?? "");
        for (const label of o.edgeLabels ?? []) sourceClaims(label);
        let points = o.points.map((p: string[]) => p.map((s: string) => value(s)));
        let edgeLabels = o.edgeLabels;
        if (o.kind === "polygon") {
          const base = points[0];
          let area2 = 0;
          for (let i = 1; i + 1 < points.length; i++) area2 += (points[i][0] - base[0]) * (points[i + 1][1] - base[1]) - (points[i][1] - base[1]) * (points[i + 1][0] - base[0]);
          const xs = points.map((p: number[]) => p[0]), ys = points.map((p: number[]) => p[1]);
          const tolerance = 32 * Number.EPSILON * (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
          if (Math.abs(area2) <= tolerance) throw Error(`步骤${step.id}的多边形${o.id}退化成线或点；必须给出非共线的有效顶点，不能用零值代替未知边长`);
          // Plain expression labels are claims about the same edge, not decoration.
          // Only the supported ASCII expression grammar is eligible; other prose
          // remains explicitly unverified rather than being guessed or executed.
          const lengths = points.map((a: number[], i: number) => { const b = points[(i + 1) % points.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]); });
          const claims = (edgeLabels ?? []).map((label: string) => {
            // A functional/quantity annotation (e.g. m(O2)=32) is not a
            // scalar geometric edge-name assignment and remains unverified.
            if (label.includes("=") && !/^[A-Za-z][A-Za-z0-9_]*$/.test(label.slice(0, label.indexOf("=")).trim())) return null;
            const expression = (label.includes("=") ? label.slice(label.lastIndexOf("=") + 1) : label).trim().replace(/(\d|\))\s*√/g, "$1*√").replace(/√(\d+(?:\.\d+)?)/g, "sqrt($1)");
            // An explicit edge label binds its displayed magnitude to that edge.
            // Parse a known unit as a suffix, never as a same-named variable (4s != 4*s).
            const quantity = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([A-Za-z][A-Za-z0-9/*^ -]*)$/.exec(expression);
            if (quantity) {
              try { math.unit(quantity[1], quantity[2]); return value(quantity[1]); } catch { return null; }
            }
            // A suffix such as 4s denotes a unit, not 4 multiplied by a variable s.
            if (!expression || !/^[0-9A-Za-z_+*/^().\s-]+$/.test(expression) || /\d\s*[a-df-zA-DF-Z_]/.test(expression)) return null;
            try { return value(expression); } catch { return null; }
          });
          const matches = (a: number, b: number) => a > 0 && Math.abs(a - b) <= 32 * Number.EPSILON * Math.max(a, Math.abs(b));
          // When every length is known and has exactly one corresponding edge,
          // label placement can be computed without asking the model again.
          const positions = claims.map((claimed: number | null) => claimed === null ? [] : lengths.flatMap((actual: number, i: number) => matches(claimed, actual) ? [i] : []));
          if (claims.length === points.length && positions.every((p: number[]) => p.length === 1) && new Set(positions.map((p: number[]) => p[0])).size === points.length) {
            const placed: string[] = [];
            positions.forEach((p: number[], i: number) => { placed[p[0]] = edgeLabels[i]; });
            edgeLabels = placed;
          }
          for (const [i, label] of (o.edgeLabels ?? []).entries()) {
            const claimed = claims[i];
            if (claimed === null) continue;
            const at = edgeLabels === o.edgeLabels ? i : positions[i][0];
            if (!matches(claimed, lengths[at])) throw Error(`步骤${step.id}图形${o.id}边${i}的标注${label}与坐标长度${lengths[i]}不一致；请用同一组真实变量作图，不能只修改标注`);
            checks.push({ status: "verified", detail: `图形边长与标注一致：${label}（不证明该标注符合原题）` });
          }
          if (o.rightAngleAt !== undefined) {
            const i = o.rightAngleAt, b = points[i], a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length];
            const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
            const product = Math.hypot(...u) * Math.hypot(...v), dot = u[0] * v[0] + u[1] * v[1];
            if (product === 0 || Math.abs(dot) > 32 * Number.EPSILON * product) throw Error(`步骤${step.id}的${o.id}顶点${i}并非直角，请核对真实坐标，不能只画直角标记`);
            checks.push({ status: "verified", detail: `几何检查：图形${o.id}的顶点${i}两邻边垂直（不证明边长符合题意）` });
          }
        }
        if (o.kind === "curve") {
          const a = value(o.domain[0]), b = value(o.domain[1]);
          if (!(a < b)) throw Error("曲线区间无效");
          const range = interval(ast(o.expression, true).node, a, b);
          if (range.some(v => !Number.isFinite(v))) throw Error("曲线区间无法安全求值");
          points = Array.from({ length: 81 }, (_, i) => {
            const x = a + (b - a) * i / 80;
            const local = new Map(scope); local.set("x", x);
            return [x, value(o.expression, local)];
          });
        }
        return { ...o, points, edgeLabels, radius: o.radius === undefined ? undefined : value(o.radius), expression: undefined, domain: undefined };
      });
      return { checks, objects, inferredSymbols: [...inferredSymbols] };
    });
    const encoded = JSON.stringify(result);
    if (encoded.length > 250000) throw Error("演示输出超限");
    parentPort.postMessage({ result });
  } catch (error) { parentPort.postMessage({ error: error instanceof Error ? error.message : "核验失败" }); }
}
