import { Scope, resolve } from "./engine";

type Tok = { t: "num" | "str" | "bool" | "op" | "lp" | "rp"; v: unknown };

function tokenize(src: string, scope: Scope): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "$" && src[i + 1] === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new Error("Unclosed reference");
      const value = resolve(src.slice(i, end + 1), scope);
      out.push(typeof value === "number" ? { t: "num", v: value } : typeof value === "boolean" ? { t: "bool", v: value } : { t: "str", v: value === undefined || value === null ? "" : String(value) });
      i = end + 1; continue;
    }
    if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) throw new Error("Unclosed string");
      out.push({ t: "str", v: src.slice(i + 1, end) }); i = end + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ([">", "<", "!"].includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
    if (ch === "(") { out.push({ t: "lp", v: ch }); i++; continue; }
    if (ch === ")") { out.push({ t: "rp", v: ch }); i++; continue; }
    const m = src.slice(i).match(/^(true|false|-?\d+(\.\d+)?)/);
    if (m) { out.push(m[0] === "true" || m[0] === "false" ? { t: "bool", v: m[0] === "true" } : { t: "num", v: Number(m[0]) }); i += m[0].length; continue; }
    throw new Error(`Unexpected "${ch}"`);
  }
  return out;
}

/** Evaluate a Flow JSON `If` condition (!, &&, ||, ==, !=, >, >=, <, <=, parentheses). Returns undefined if malformed. */
export function evalCondition(src: string, scope: Scope): boolean | undefined {
  try {
    const toks = tokenize(src, scope); let p = 0;
    const peek = () => toks[p];
    const or = (): unknown => { let l = and(); while (peek()?.v === "||") { p++; const r = and(); l = Boolean(l) || Boolean(r); } return l; };
    const and = (): unknown => { let l = cmp(); while (peek()?.v === "&&") { p++; const r = cmp(); l = Boolean(l) && Boolean(r); } return l; };
    const cmp = (): unknown => {
      const l = unary(); const op = peek();
      if (op?.t === "op" && ["==", "!=", ">", ">=", "<", "<="].includes(op.v as string)) {
        p++; const r = unary();
        switch (op.v) { case "==": return l === r; case "!=": return l !== r; case ">": return Number(l) > Number(r); case ">=": return Number(l) >= Number(r); case "<": return Number(l) < Number(r); default: return Number(l) <= Number(r); }
      }
      return l;
    };
    const unary = (): unknown => { if (peek()?.v === "!") { p++; return !unary(); } return atom(); };
    const atom = (): unknown => {
      const t = toks[p++]; if (!t) throw new Error("Unexpected end");
      if (t.t === "lp") { const v = or(); if (toks[p++]?.t !== "rp") throw new Error("Missing )"); return v; }
      if (t.t === "str" && t.v === "") return "";
      return t.v;
    };
    const result = or();
    if (p < toks.length) throw new Error("Unexpected token");
    return typeof result === "boolean" ? result : undefined;
  } catch { return undefined; }
}
