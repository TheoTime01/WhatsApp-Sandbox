import { Component } from "./types";
import { Scope, resolve } from "./engine";
import { evalCondition } from "./expr";

/** Resolve `If` / `Switch` into the concrete component list for the current scope. */
export function expand(children: Component[] | undefined, scope: Scope): Component[] {
  const out: Component[] = [];
  for (const c of children ?? []) {
    if (c.type === "If") {
      const ok = evalCondition(String(c.condition ?? ""), scope);
      out.push(...expand((ok ? c.then : c.else) as Component[] | undefined, scope));
    } else if (c.type === "Switch") {
      const value = String(resolve(c.value, scope) ?? "");
      out.push(...expand((c.cases as Record<string, Component[]> | undefined)?.[value], scope));
    } else if (c.type === "Form") out.push({ ...c, children: expand(c.children, scope) });
    else out.push(c);
  }
  return out;
}

export function flatInputs(children: Component[]): Component[] {
  const out: Component[] = [];
  for (const c of children) { if (c.type === "Form") out.push(...flatInputs(c.children ?? [])); else out.push(c); }
  return out;
}
