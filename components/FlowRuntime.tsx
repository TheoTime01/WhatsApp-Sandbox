"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import { Action, Component, DataItem, Dict, EndpointLog, EndpointRequest, EndpointResponse, FlowRecord } from "@/lib/flow/types";
import { EndpointHandler, findScreen, resolve, resolvePayload, Scope } from "@/lib/flow/engine";

export type RunConfig = { action: "navigate" | "data_exchange"; screen?: string; flowToken: string; draft: boolean };

type ScreenState = { data: Dict; form: Dict };
const truthy = (v: unknown) => !(v === undefined || v === null || v === "" || v === false);
const flag = (c: Component, key: "visible" | "enabled", scope: Scope) => (c[key] === undefined ? true : truthy(resolve(c[key], scope)));

function validateField(c: Component, value: unknown, scope: Scope): string {
  const required = c.required === true || (typeof c.required === "string" && truthy(resolve(c.required, scope)));
  const empty = value === undefined || value === "" || value === false || (Array.isArray(value) && value.length === 0);
  if (c.type === "OptIn") return required && !value ? "You must accept to continue." : "";
  if (empty) return required ? (c["error-message"] as string) || "This field is required." : "";
  const text = String(value);
  if (c.type === "TextInput") {
    const t = c["input-type"];
    if (t === "number" && Number.isNaN(Number(text))) return "Enter a valid number.";
    if (t === "email" && !/^\S+@\S+\.\S+$/.test(text)) return "Enter a valid email address.";
    if (t === "phone" && !/^[+\d][\d\s()-]{5,}$/.test(text)) return "Enter a valid phone number.";
    if (c["min-chars"] && text.length < Number(c["min-chars"])) return `Enter at least ${c["min-chars"]} characters.`;
  }
  if (c.type === "CheckboxGroup" && Array.isArray(value)) {
    if (c["min-selected-items"] && value.length < Number(c["min-selected-items"])) return `Select at least ${c["min-selected-items"]}.`;
    if (c["max-selected-items"] && value.length > Number(c["max-selected-items"])) return `Select at most ${c["max-selected-items"]}.`;
  }
  return "";
}

export function FlowRuntime({ flow, config, endpoint, endpointOn, onEndpointLog, onComplete, onClose }: {
  flow: FlowRecord; config: RunConfig; endpoint: EndpointHandler; endpointOn: boolean;
  onEndpointLog: (log: EndpointLog) => void; onComplete: (payload: Dict, summary: string) => void; onClose: () => void;
}) {
  const [stack, setStack] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, ScreenState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const started = useRef(false);
  const counter = useRef(0);

  const current = stack[stack.length - 1];
  const screen = current ? findScreen(flow.json, current) : undefined;
  const state = states[current] ?? { data: {}, form: {} };
  const scope: Scope = { form: state.form, data: state.data, screens: states };

  const setScreenState = (id: string, patch: Partial<ScreenState>) =>
    setStates((prev) => ({ ...prev, [id]: { ...{ data: {}, form: {} }, ...prev[id], ...patch } }));

  const callEndpoint = async (action: EndpointRequest["action"], screenId: string | undefined, data: Dict): Promise<EndpointResponse | null> => {
    const request: EndpointRequest = { version: "3.0", action, flow_token: config.flowToken, ...(screenId ? { screen: screenId } : {}), ...(action === "data_exchange" || action === "BACK" ? { data } : {}) };
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 220));
    let response: EndpointResponse | Dict; let error = false;
    if (!endpointOn) { response = { error: "Endpoint unreachable (timeout)" }; error = true; }
    else { try { response = endpoint(request); } catch (e) { response = { error: (e as Error).message }; error = true; } }
    counter.current += 1;
    onEndpointLog({ id: `${Date.now()}-${counter.current}`, at: new Date().toISOString(), request, response, ms: Math.round(performance.now() - t0), error });
    if (error) { setBanner("Something went wrong. Please try again."); return null; }
    setBanner("");
    return response as EndpointResponse;
  };

  const applyResponse = (res: EndpointResponse) => {
    const extension = (res.data as Dict).extension_message_response as { params?: Dict } | undefined;
    if (res.screen === "SUCCESS" && extension) { finish(extension.params ?? {}); return; }
    if (!res.screen || !findScreen(flow.json, res.screen)) { setBanner(`Endpoint returned unknown screen "${res.screen}".`); return; }
    setScreenState(res.screen, { data: res.data });
    setStack((prev) => (prev[prev.length - 1] === res.screen ? prev : [...prev, res.screen as string]));
  };

  const finish = (payload: Dict) => {
    const summary = Object.entries(payload).filter(([k, v]) => k !== "flow_token" && truthy(v)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ");
    onComplete({ flow_token: config.flowToken, ...payload }, summary || "Flow completed");
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (config.action === "data_exchange" && flow.endpoint) {
        setBusy(true);
        const res = await callEndpoint("INIT", undefined, {});
        setBusy(false);
        if (res) applyResponse(res); else setStack([flow.json.screens[0].id]);
      } else setStack([config.screen && findScreen(flow.json, config.screen) ? config.screen : flow.json.screens[0].id]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collectForm = () => {
    const found: Component[] = [];
    const visit = (items: Component[]) => items.forEach((c) => { if (c.name && c.type !== "Form") found.push(c); if (c.children) visit(c.children); });
    visit(screen?.layout.children ?? []);
    return found.filter((c) => flag(c, "visible", scope));
  };

  const run = async (action: Action | undefined, validate: boolean) => {
    if (!action || busy) return;
    if (validate) {
      const next: Record<string, string> = {};
      for (const c of collectForm()) { const m = validateField(c, state.form[c.name as string], scope); if (m) next[c.name as string] = m; }
      setErrors(next);
      if (Object.keys(next).length) return;
    }
    const payload = resolvePayload(action.payload, scope);
    if (action.name === "navigate") {
      const target = action.next.name;
      setScreenState(target, { data: payload });
      setStack((prev) => [...prev, target]);
    } else if (action.name === "complete") finish(payload);
    else { setBusy(true); const res = await callEndpoint("data_exchange", current, payload); setBusy(false); if (res) applyResponse(res); }
  };

  const setField = (name: string, value: unknown) => setStates((prev) => ({ ...prev, [current]: { ...{ data: {} }, ...prev[current], form: { ...prev[current]?.form, [name]: value } } }));

  const items = (c: Component): DataItem[] => {
    const source = typeof c["data-source"] === "string" ? resolve(c["data-source"], scope) : c["data-source"];
    return Array.isArray(source) ? (source as DataItem[]) : [];
  };

  const render = (c: Component, key: number): React.ReactNode => {
    if (!flag(c, "visible", scope)) return null;
    const text = (v: unknown) => String(resolve(v, scope) ?? "");
    const name = c.name as string;
    const disabled = !flag(c, "enabled", scope);
    const err = errors[name];
    const wrap = (control: React.ReactNode) => (
      <div className="fr-field" key={key}>
        {c.label && c.type !== "OptIn" && <label>{text(c.label)}{c.required === true && <b> *</b>}</label>}
        {control}
        {err ? <p className="fr-error">{err}</p> : c["helper-text"] ? <p className="fr-help">{text(c["helper-text"])}</p> : null}
      </div>
    );
    switch (c.type) {
      case "TextHeading": return <h3 className="fr-heading" key={key}>{text(c.text)}</h3>;
      case "TextSubheading": return <h4 className="fr-subheading" key={key}>{text(c.text)}</h4>;
      case "TextBody": return <p className="fr-body" key={key}>{text(c.text)}</p>;
      case "TextCaption": return <p className="fr-caption" key={key}>{text(c.text)}</p>;
      case "Image": return <img key={key} className="fr-image" alt={text(c["alt-text"])} src={`data:image/png;base64,${c.src}`} />;
      case "EmbeddedLink": return <button type="button" className="fr-link" key={key} onClick={() => run(c["on-click-action"], false)}>{text(c.text)} <ExternalLink size={12} /></button>;
      case "Form": return <div key={key}>{(c.children ?? []).map(render)}</div>;
      case "TextInput": {
        const t = c["input-type"] === "passcode" ? "password" : c["input-type"] === "phone" ? "tel" : (c["input-type"] as string) || "text";
        return wrap(<input disabled={disabled} type={t === "number" ? "text" : t} inputMode={t === "number" ? "decimal" : undefined} maxLength={c["max-chars"] as number | undefined} value={(state.form[name] as string) ?? text(c["init-value"])} onChange={(e) => setField(name, e.target.value)} />);
      }
      case "TextArea": return wrap(<textarea disabled={disabled} rows={3} maxLength={c["max-chars"] as number | undefined} value={(state.form[name] as string) ?? ""} onChange={(e) => setField(name, e.target.value)} />);
      case "DatePicker": return wrap(<input disabled={disabled} type="date" min={c["min-date"]} max={c["max-date"]} value={(state.form[name] as string) ?? ""} onChange={(e) => { setField(name, e.target.value); }} onBlur={() => undefined} />);
      case "Dropdown": return wrap(<span className="fr-select"><select disabled={disabled} value={(state.form[name] as string) ?? ""} onChange={(e) => { setField(name, e.target.value); }}>
        <option value="">Select…</option>{items(c).map((i) => <option key={i.id} value={i.id} disabled={i.enabled === false}>{i.title}</option>)}</select><ChevronDown size={14} /></span>);
      case "RadioButtonsGroup": return wrap(<div className="fr-options">{items(c).map((i) => <label key={i.id} className={i.enabled === false ? "off" : ""}>
        <input type="radio" name={name} disabled={disabled || i.enabled === false} checked={state.form[name] === i.id} onChange={() => setField(name, i.id)} /><span><b>{i.title}</b>{i.description && <small>{i.description}</small>}</span></label>)}</div>);
      case "CheckboxGroup": return wrap(<div className="fr-options">{items(c).map((i) => { const sel = (state.form[name] as string[]) ?? []; return <label key={i.id} className={i.enabled === false ? "off" : ""}>
        <input type="checkbox" disabled={disabled || i.enabled === false} checked={sel.includes(i.id)} onChange={() => setField(name, sel.includes(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id])} /><span><b>{i.title}</b>{i.description && <small>{i.description}</small>}</span></label>; })}</div>);
      case "OptIn": return wrap(<div className="fr-options"><label><input type="checkbox" disabled={disabled} checked={Boolean(state.form[name])} onChange={(e) => setField(name, e.target.checked)} /><span><b>{text(c.label)}</b></span></label></div>);
      case "Footer": return null;
      default: return <p className="fr-caption" key={key}>Unsupported component: {c.type}</p>;
    }
  };

  // on-select-action: fire when a field with the action changes
  const prevForm = useRef<Dict>({});
  useEffect(() => {
    if (!screen) return;
    const walkC = (items2: Component[]) => items2.forEach((c) => {
      if (c.name && c["on-select-action"] && prevForm.current[c.name] !== state.form[c.name] && state.form[c.name] !== undefined) run(c["on-select-action"], false);
      if (c.children) walkC(c.children);
    });
    walkC(screen.layout.children);
    prevForm.current = { ...state.form };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.form]);
  useEffect(() => { prevForm.current = { ...state.form }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current]);

  let footer: Component | undefined;
  const findFooter = (items2: Component[]) => items2.forEach((c) => { if (c.type === "Footer") footer = c; if (c.children) findFooter(c.children); });
  if (screen) findFooter(screen.layout.children);
  const canBack = stack.length > 1 && !screen?.terminal;

  return <div className="flow-overlay">
    <div className="fr-top">
      <button onClick={canBack ? () => { setStack((s) => s.slice(0, -1)); setErrors({}); } : onClose} aria-label={canBack ? "Back" : "Close"}>{canBack ? <ArrowLeft size={18} /> : <X size={18} />}</button>
      <strong>{screen?.title ?? flow.name}</strong>{config.draft && <span className="fr-draft">DRAFT</span>}
    </div>
    <div className="fr-body-scroll">
      {banner && <div className="fr-banner">{banner}</div>}
      {!screen ? <div className="fr-loading"><Loader2 className="spin" size={22} /></div> : screen.layout.children.map(render)}
    </div>
    {footer && flag(footer, "visible", scope) && <div className="fr-footer"><button disabled={busy || !flag(footer, "enabled", scope)} onClick={() => run((footer as Component)["on-click-action"], true)}>{busy ? <Loader2 className="spin" size={16} /> : text2(footer, scope)}</button><small>Managed by the business. <u>Learn more</u></small></div>}
  </div>;
}

const text2 = (c: Component, scope: Scope) => String(resolve(c.label ?? "Continue", scope));
