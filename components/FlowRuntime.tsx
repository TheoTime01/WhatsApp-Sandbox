"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, FileText, ImagePlus, Loader2, MoreVertical, Trash2, X } from "lucide-react";
import { Action, Component, DataItem, Dict, EndpointLog, EndpointRequest, EndpointResponse, FlowRecord, Media } from "@/lib/flow/types";
import { EndpointHandler, findScreen, resolve, resolvePayload, Scope } from "@/lib/flow/engine";
import { expand, flatInputs } from "@/lib/flow/expand";
import { inline, RichMarkdown } from "./Markdown";
import { Calendar, RangeValue } from "./Calendar";

export type RunConfig = { action: "navigate" | "data_exchange"; screen?: string; data?: Dict; flowToken: string; draft: boolean };
type ScreenState = { data: Dict; form: Dict };

const truthy = (v: unknown) => !(v === undefined || v === null || v === "" || v === false);
const textOf = (v: unknown) => (Array.isArray(v) ? v.join("\n") : v === undefined || v === null ? "" : String(v));
const flag = (c: Component, key: "visible" | "enabled", scope: Scope) => (c[key] === undefined ? true : truthy(resolve(c[key], scope)));
const isReq = (c: Component, scope: Scope) => { const r = resolve(c.required, scope); return r === true || r === "true"; };
const MASK = "••••••••••••";
const verNum = (v: string) => { const [a, b] = v.split(".").map(Number); return a + (b || 0) / 100; };

const toIso = (x: unknown): string | undefined => {
  if (x === undefined || x === null || x === "") return undefined;
  const s = String(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const n = Number(s); return Number.isFinite(n) ? new Date(n).toISOString().slice(0, 10) : undefined;
};
const isoList = (x: unknown) => (Array.isArray(x) ? x.map(toIso).filter(Boolean) as string[] : []);

async function sha256b64(file: File) {
  try { const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return btoa(String.fromCharCode(...new Uint8Array(d))); } catch { return "unavailable"; }
}

function validateField(c: Component, value: unknown, scope: Scope, version: number): string {
  const type = c.type; const required = isReq(c, scope);
  const custom = textOf(resolve(c["error-message"], scope));
  const bad = (m: string) => custom || m;
  if (type === "OptIn") return required && !value ? bad("You must accept to continue.") : "";
  if (type === "PhotoPicker" || type === "DocumentPicker") {
    const k = type === "PhotoPicker" ? "photos" : "documents"; const n = Array.isArray(value) ? value.length : 0;
    const min = Number(c[`min-uploaded-${k}`] ?? 0), max = Number(c[`max-uploaded-${k}`] ?? 30);
    if (n < min) return bad(`Add at least ${min} ${k.slice(0, -1)}${min > 1 ? "s" : ""}.`);
    if (n > max) return bad(`Add at most ${max}.`);
    return "";
  }
  if (type === "CalendarPicker") {
    const range = resolve(c.mode, scope) === "range"; const v = (value ?? {}) as RangeValue; const rq = resolve(c.required, scope);
    if (range) {
      const need = typeof rq === "object" && rq ? (rq as Dict) : { "start-date": rq === true, "end-date": rq === true };
      if ((need["start-date"] && !v["start-date"]) || (need["end-date"] && !v["end-date"])) return bad("Select a date range.");
    } else if (required && !value) return bad("Select a date.");
    return "";
  }
  const empty = value === undefined || value === "" || value === false || (Array.isArray(value) && value.length === 0);
  if (empty) return required ? bad("This field is required.") : "";
  const text = String(value);
  if (type === "TextInput") {
    const t = c["input-type"];
    if (t === "number" && !/^-?\d+(\.\d+)?$/.test(text)) return bad("Enter a valid number.");
    if (t === "email" && !/^\S+@\S+\.\S+$/.test(text)) return bad("Enter a valid email address.");
    if (t === "phone" && !/^[+\d][\d\s()-]{5,}$/.test(text)) return bad("Enter a valid phone number.");
    if (t === "passcode" && !/^\d+$/.test(text)) return bad("Digits only.");
    const min = c["min-chars"] !== undefined ? Number(resolve(c["min-chars"], scope)) : 0;
    if (min && text.length < min) return bad(`Enter at least ${min} characters.`);
    if (c.pattern) { try { if (!new RegExp(String(c.pattern)).test(text)) return bad(textOf(resolve(c["helper-text"], scope)) || "Invalid format."); } catch { /* ignore */ } }
  }
  if (type === "CheckboxGroup" && Array.isArray(value)) {
    const mn = resolve(c["min-selected-items"], scope), mx = resolve(c["max-selected-items"], scope);
    if (mn !== undefined && value.length < Number(mn)) return bad(`Select at least ${mn}.`);
    if (mx !== undefined && value.length > Number(mx)) return bad(`Select at most ${mx}.`);
  }
  if (type === "DatePicker") {
    const d = toIso(value); const un = isoList(resolve(c["unavailable-dates"], scope));
    if (d && un.includes(d)) return bad("This date is unavailable.");
    const mi = toIso(resolve(c["min-date"], scope)), ma = toIso(resolve(c["max-date"], scope));
    if (d && ((mi && d < mi) || (ma && d > ma))) return bad("Date out of range.");
    void version;
  }
  return "";
}

export function FlowRuntime({ flow, config, endpoint, endpointOn, onEndpointLog, onComplete, onClose }: {
  flow: FlowRecord; config: RunConfig; endpoint: EndpointHandler; endpointOn: boolean;
  onEndpointLog: (log: EndpointLog) => void; onComplete: (payload: Dict, summary: string, success: boolean) => void; onClose: () => void;
}) {
  const [stack, setStack] = useState<string[]>([]);
  const [states, setStates] = useState<Record<string, ScreenState>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState("");
  const [info, setInfo] = useState("");
  const started = useRef(false);
  const counter = useRef(0);
  const version = verNum(flow.json.version);

  const current = stack[stack.length - 1];
  const screen = current ? findScreen(flow.json, current) : undefined;
  const state = states[current] ?? { data: {}, form: {} };

  // initial values: component `init-value` and Form `init-values`
  const dataScope: Scope = { form: {}, data: state.data, screens: states };
  const inits: Dict = {};
  if (screen) {
    const visit = (items: Component[]) => items.forEach((c) => {
      if (c.type === "Form" && c["init-values"]) Object.assign(inits, resolve(c["init-values"], dataScope) as Dict);
      if (c.name && c["init-value"] !== undefined) inits[c.name] = resolve(c["init-value"], dataScope);
      if (c.children) visit(c.children);
      for (const branch of [c.then, c.else, ...Object.values((c.cases as Dict) ?? {})]) if (Array.isArray(branch)) visit(branch as Component[]);
    });
    visit(screen.layout.children);
  }
  const form: Dict = { ...inits, ...state.form };
  const scope: Scope = { form, data: state.data, screens: { ...states, [current ?? ""]: { data: state.data, form } } };
  const tree = screen ? expand(screen.layout.children, scope) : [];
  const inputs = flatInputs(tree).filter((c) => c.name && flag(c, "visible", scope));
  const formErrors = (c: Component): Dict => ((resolve((tree.find((x) => x.type === "Form")?.["error-messages"]), scope) as Dict) ?? {});

  const setScreenState = (id: string, patch: Partial<ScreenState>) => setStates((prev) => ({ ...prev, [id]: { ...{ data: {}, form: {} }, ...prev[id], ...patch } }));
  const setField = (name: string, value: unknown) => setStates((prev) => ({ ...prev, [current]: { ...{ data: {} }, ...prev[current], form: { ...prev[current]?.form, [name]: value } } }));

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

  const finish = (payload: Dict, templates: Dict = {}, success = true) => {
    const sensitive = new Set(flow.json.screens.flatMap((s) => s.sensitive ?? []));
    const hidden = new Set<string>();
    flow.json.screens.forEach((s) => flatInputs(s.layout.children).forEach((c) => { if (c.name && (c["input-type"] === "password" || c["input-type"] === "passcode")) hidden.add(c.name); }));
    const parts: string[] = [];
    for (const [k, v] of Object.entries(payload)) {
      if (k === "flow_token" || !truthy(v)) continue;
      const ref = typeof templates[k] === "string" ? String(templates[k]).match(/^\$\{(?:form|screen\.[^.]+\.form)\.([^}]+)\}$/)?.[1] : undefined;
      if (ref && hidden.has(ref)) continue;
      const shown = Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? (x as Media).file_name : String(x))).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
      parts.push(`${k.replace(/_/g, " ")}: ${ref && sensitive.has(ref) ? MASK : shown}`);
    }
    onComplete({ flow_token: config.flowToken, ...payload }, parts.join("\n") || "Flow completed", success);
  };

  const applyResponse = (res: EndpointResponse) => {
    const data = (res.data ?? {}) as Dict;
    const extension = data.extension_message_response as { params?: Dict } | undefined;
    if (res.screen === "SUCCESS" && extension) { finish(extension.params ?? {}); return; }
    if (!res.screen || !findScreen(flow.json, res.screen)) { setBanner(`Endpoint returned unknown screen "${res.screen}".`); return; }
    if (typeof data.error_message === "string") setBanner(data.error_message);
    setScreenState(res.screen, { data });
    setStack((prev) => (prev[prev.length - 1] === res.screen ? prev : [...prev, res.screen as string]));
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (flow.status === "BLOCKED") return;
      if (config.action === "data_exchange" && flow.endpoint) {
        setBusy(true); const res = await callEndpoint("INIT", undefined, {}); setBusy(false);
        if (res) applyResponse(res); else setStack([flow.json.screens[0].id]);
      } else {
        const first = config.screen && findScreen(flow.json, config.screen) ? config.screen : flow.json.screens[0].id;
        setStack([first]); if (config.data) setScreenState(first, { data: config.data });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (action: Action | undefined, validate: boolean) => {
    if (!action || busy) return;
    if (validate) {
      const all: Record<string, boolean> = {};
      for (const c of inputs) all[c.name as string] = true;
      setTouched((t) => ({ ...t, ...all }));
      if (inputs.some((c) => flag(c, "enabled", scope) && validateField(c, form[c.name as string], scope, version))) return;
    }
    if (action.name === "open_url") {
      const url = String(resolve(action.url, scope) ?? "");
      setInfo(/^https?:\/\//i.test(url) ? `Opening ${url} (simulated)` : "Blocked: only http(s) links can be opened."); return;
    }
    const payload = resolvePayload(action.payload, scope);
    if (action.name === "navigate") {
      const target = action.next.name; setScreenState(current, { form }); setScreenState(target, { data: payload }); setStack((prev) => [...prev, target]); setBanner(""); setInfo("");
    } else if (action.name === "complete") finish(payload, action.payload ?? {}, screen?.success !== false);
    else { setBusy(true); const res = await callEndpoint("data_exchange", current, payload); setBusy(false); if (res) applyResponse(res); }
  };

  const goBack = async () => {
    if (stack.length <= 1) { onClose(); return; }
    const leaving = current; const leavingScreen = screen;
    setStack((s) => s.slice(0, -1)); setBanner(""); setInfo("");
    if (leavingScreen?.refresh_on_back && flow.endpoint) { setBusy(true); const res = await callEndpoint("BACK", leaving, {}); setBusy(false); if (res) applyResponse(res); }
  };

  // on-select-action: fire when a field with that action changes value
  const prevForm = useRef<Dict>({});
  useEffect(() => {
    for (const c of inputs) {
      const n = c.name as string; const a = c["on-select-action"] as Action | undefined;
      if (a && JSON.stringify(prevForm.current[n]) !== JSON.stringify(form[n]) && form[n] !== undefined) run(a, false);
    }
    prevForm.current = { ...form };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state.form)]);
  useEffect(() => { prevForm.current = { ...form }; setTouched({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [current]);

  const items = (c: Component): DataItem[] => {
    const source = resolve(c["data-source"], scope);
    return Array.isArray(source) ? (source as DataItem[]) : [];
  };
  const tx = (v: unknown) => textOf(resolve(v, scope));
  const imgSrc = (src: string) => (/^data:image\/(png|jpe?g);base64,/i.test(src) ? src : /^[A-Za-z0-9+/=\s]+$/.test(src) ? `data:image/png;base64,${src.replace(/\s+/g, "")}` : "");

  const field = (c: Component, key: string | number, control: React.ReactNode, opts: { floating?: boolean; value?: unknown; counter?: string } = {}) => {
    const name = c.name as string; const explicit = tx(c["error-message"]);
    const error = (touched[name] && validateField(c, form[name], scope, version)) || explicit || (formErrors(c)[name] as string | undefined);
    const optional = !isReq(c, scope);
    const label = `${tx(c.label)}${optional && c.type !== "OptIn" && opts.floating ? " (optional)" : ""}`;
    return <div className={`fr-field ${error ? "has-error" : ""}`} key={key}>
      {opts.floating
        ? <div className={`fr-box ${truthy(opts.value) ? "filled" : ""}`}>{control}<span className="fr-float">{label}</span>{opts.counter && <span className="fr-counter">{opts.counter}</span>}</div>
        : <>{c.label && <label className="fr-label">{tx(c.label)}{c.type !== "CalendarPicker" && optional ? "" : ""}</label>}{control}</>}
      {error ? <p className="fr-error">{error}</p> : c["helper-text"] ? <p className="fr-help">{tx(c["helper-text"])}</p> : null}
    </div>;
  };

  const optionRow = (c: Component, i: DataItem, kind: "radio" | "checkbox", checked: boolean, toggle: () => void, off: boolean) => (
    <label key={i.id} className={`fr-opt ${i.enabled === false || off ? "off" : ""}`}>
      {i.image && imgSrc(i.image) && <img className={`fr-opt-img ${c["media-size"] === "large" ? "large" : ""}`} alt={i["alt-text"] ?? ""} src={imgSrc(i.image)} />}
      {i.color && /^#?[0-9a-f]{6}$/i.test(i.color) && <span className="fr-swatch" style={{ background: i.color.startsWith("#") ? i.color : `#${i.color}` }} />}
      <span className="fr-opt-text"><b>{i.title}</b>{i.description && <small>{i.description}</small>}</span>
      {i.metadata && <small className="fr-meta">{i.metadata}</small>}
      <input type={kind} name={c.name} disabled={off || i.enabled === false} checked={checked} onChange={toggle} onBlur={() => setTouched((t) => ({ ...t, [c.name as string]: true }))} />
    </label>);

  const pickFiles = async (c: Component, files: FileList | null) => {
    if (!files) return; const name = c.name as string; const isPhoto = c.type === "PhotoPicker";
    const maxKb = Number(c["max-file-size-kb"] ?? 25600); const mimes = (c["allowed-mime-types"] as string[] | undefined) ?? [];
    const next: Media[] = [...((form[name] as Media[]) ?? [])]; const rejected: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > maxKb * 1024) { rejected.push(`${f.name} is larger than ${maxKb} KB`); continue; }
      if (isPhoto && !f.type.startsWith("image/")) { rejected.push(`${f.name} is not a photo`); continue; }
      if (!isPhoto && mimes.length && !mimes.includes(f.type)) { rejected.push(`${f.name} type not allowed`); continue; }
      next.push({ id: crypto.randomUUID(), file_name: f.name, mime_type: f.type || "application/octet-stream", sha256: await sha256b64(f) });
    }
    setField(name, next); setTouched((t) => ({ ...t, [name]: true }));
    setBanner(rejected.join(" · "));
  };

  const render = (c: Component, key: number): React.ReactNode => {
    if (!flag(c, "visible", scope)) return null;
    const name = c.name as string; const disabled = !flag(c, "enabled", scope);
    const val = form[name]; const touch = () => setTouched((t) => ({ ...t, [name]: true }));
    const body = (style: React.CSSProperties = {}) => ({ fontWeight: ({ bold: 700, bold_italic: 700, italic: 400, normal: 400 } as Dict)[tx(c["font-weight"])] as number | undefined, fontStyle: /italic/.test(tx(c["font-weight"])) ? ("italic" as const) : undefined, textDecoration: truthy(resolve(c.strikethrough, scope)) ? "line-through" : undefined, ...style });
    switch (c.type) {
      case "TextHeading": return <h3 className="fr-heading" key={key}>{tx(c.text)}</h3>;
      case "TextSubheading": return <h4 className="fr-subheading" key={key}>{tx(c.text)}</h4>;
      case "TextBody": case "TextCaption": {
        const cls = c.type === "TextBody" ? "fr-body" : "fr-caption";
        const text = textOf(resolve(c.text, scope));
        return c.markdown && version >= 5.01 ? <div key={key} style={body()}><RichMarkdown source={text.replace(/^#/gm, "\\#")} /></div> : <p className={cls} key={key} style={body()}>{text}</p>;
      }
      case "RichText": return <div key={key}><RichMarkdown source={textOf(resolve(c.text, scope))} /></div>;
      case "Image": {
        const src = imgSrc(String(resolve(c.src, scope) ?? "")); if (!src) return null;
        return <div key={key} className="fr-imgbox" style={{ aspectRatio: String(resolve(c["aspect-ratio"], scope) ?? 1), width: resolve(c.width, scope) as number | undefined, height: resolve(c.height, scope) as number | undefined }}><img alt={tx(c["alt-text"])} src={src} style={{ objectFit: c["scale-type"] === "cover" ? "cover" : "contain" }} /></div>;
      }
      case "EmbeddedLink": return <button type="button" className="fr-link" key={key} onClick={() => run(c["on-click-action"] as Action, false)}>{tx(c.text)}</button>;
      case "Form": return <div key={key}>{(c.children ?? []).map(render)}</div>;
      case "TextInput": {
        const t = c["input-type"] === "passcode" || c["input-type"] === "password" ? "password" : c["input-type"] === "phone" ? "tel" : c["input-type"] === "email" ? "email" : "text";
        const max = c["max-chars"] !== undefined ? Number(resolve(c["max-chars"], scope)) : 80;
        return field(c, key, <input disabled={disabled} type={t} inputMode={c["input-type"] === "number" || c["input-type"] === "passcode" ? "numeric" : undefined} maxLength={max} value={(val as string) ?? ""} onChange={(e) => setField(name, e.target.value)} onBlur={touch} />, { floating: true, value: val });
      }
      case "TextArea": {
        const max = c["max-length"] !== undefined ? Number(resolve(c["max-length"], scope)) : 600;
        return field(c, key, <textarea disabled={disabled} rows={3} maxLength={max} value={(val as string) ?? ""} onChange={(e) => setField(name, e.target.value)} onBlur={touch} />, { floating: true, value: val, counter: `${((val as string) ?? "").length} / ${max}` });
      }
      case "DatePicker": {
        const mi = toIso(resolve(c["min-date"], scope)), ma = toIso(resolve(c["max-date"], scope)); const shown = toIso(val);
        return field(c, key, <input disabled={disabled} type="date" min={mi} max={ma} value={shown ?? ""}
          onChange={(e) => setField(name, e.target.value ? (version >= 5 ? e.target.value : String(Date.parse(`${e.target.value}T00:00:00Z`))) : "")} onBlur={touch} />, { floating: true, value: shown ?? val });
      }
      case "CalendarPicker": {
        const mode = resolve(c.mode, scope) === "range" ? "range" : "single";
        const inc = resolve(c["include-days"], scope);
        return field(c, key, <>
          {mode === "range" && (c.title || c.description) && <div className="fr-cal-title"><b>{tx(c.title)}</b><small>{tx(c.description)}</small></div>}
          <Calendar mode={mode} disabled={disabled} value={val as string | RangeValue | undefined} onChange={(v) => { setField(name, v); touch(); }}
            min={toIso(resolve(c["min-date"], scope))} max={toIso(resolve(c["max-date"], scope))} unavailable={isoList(resolve(c["unavailable-dates"], scope))}
            includeDays={Array.isArray(inc) ? (inc as string[]) : undefined} minDays={c["min-days"] !== undefined ? Number(resolve(c["min-days"], scope)) : undefined} maxDays={c["max-days"] !== undefined ? Number(resolve(c["max-days"], scope)) : undefined} />
        </>);
      }
      case "Dropdown": return field(c, key, <span className="fr-select"><select disabled={disabled} value={(val as string) ?? ""} onChange={(e) => setField(name, e.target.value)} onBlur={touch}>
        <option value="" hidden /> {items(c).map((i) => <option key={i.id} value={i.id} disabled={i.enabled === false}>{i.title}{i.description ? ` — ${i.description}` : ""}</option>)}</select><ChevronDown size={14} /></span>, { floating: true, value: val });
      case "RadioButtonsGroup": return field(c, key, <div className="fr-options">{items(c).map((i) => optionRow(c, i, "radio", val === i.id, () => { setField(name, i.id); touch(); }, disabled))}</div>);
      case "CheckboxGroup": return field(c, key, <div className="fr-options">{items(c).map((i) => { const sel = (val as string[]) ?? []; return optionRow(c, i, "checkbox", sel.includes(i.id), () => { setField(name, sel.includes(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id]); touch(); }, disabled); })}</div>);
      case "OptIn": return field(c, key, <div className="fr-optin"><label><input type="checkbox" disabled={disabled} checked={Boolean(val)} onChange={(e) => { setField(name, e.target.checked); touch(); }} /><span>{tx(c.label)}</span></label>
        {c["on-click-action"] ? <button type="button" className="fr-link" onClick={() => run(c["on-click-action"] as Action, false)}>Read more</button> : null}</div>);
      case "PhotoPicker": case "DocumentPicker": {
        const isPhoto = c.type === "PhotoPicker"; const files = (val as Media[]) ?? []; const k = isPhoto ? "photos" : "documents"; const max = Number(c[`max-uploaded-${k}`] ?? 30);
        const accept = isPhoto ? "image/*" : ((c["allowed-mime-types"] as string[] | undefined) ?? []).join(",") || undefined;
        return field(c, key, <div className="fr-picker">
          {c.description ? <p className="fr-help">{tx(c.description)}</p> : null}
          {files.map((f) => <div key={f.id} className="fr-file">{isPhoto ? <ImagePlus size={15} /> : <FileText size={15} />}<span>{f.file_name}</span>
            <button type="button" aria-label="Remove" onClick={() => setField(name, files.filter((x) => x.id !== f.id))}><Trash2 size={14} /></button></div>)}
          {files.length < max && <label className={`fr-upload ${disabled ? "off" : ""}`}>{isPhoto ? <ImagePlus size={16} /> : <FileText size={16} />} {isPhoto ? (c["photo-source"] === "camera" ? "Take a photo" : "Add photos") : "Add documents"}
            <input hidden type="file" multiple disabled={disabled} accept={accept} {...(isPhoto && c["photo-source"] !== "gallery" ? { capture: undefined } : {})} onChange={(e) => { pickFiles(c, e.target.files); e.target.value = ""; }} /></label>}
        </div>);
      }
      case "Footer": return null;
      default: return <p className="fr-caption" key={key}>Unsupported component: {c.type}</p>;
    }
  };

  // Footer (single, may come from an If branch)
  const footer = (function find(items2: Component[]): Component | undefined { for (const c of items2) { if (c.type === "Footer") return c; if (c.children) { const f = find(c.children); if (f) return f; } } })(tree);
  const invalid = inputs.some((c) => flag(c, "enabled", scope) && validateField(c, form[c.name as string], scope, version));
  const canBack = stack.length > 1;
  const left = footer && tx(footer["left-caption"]), center = footer && tx(footer["center-caption"]), right = footer && tx(footer["right-caption"]);

  if (flow.status === "BLOCKED") return <div className="flow-overlay"><div className="flow-sheet"><div className="fr-top"><button onClick={onClose} aria-label="Close"><X size={18} /></button><strong>Unavailable</strong><span /></div>
    <div className="fr-body-scroll"><p className="fr-body">This Flow is currently blocked and cannot be opened. Fix the endpoint health issues, then try again.</p></div></div></div>;

  return <div className="flow-overlay"><div className="flow-sheet">
    <div className="fr-top">
      <button onClick={canBack ? goBack : onClose} aria-label={canBack ? "Back" : "Close"}>{canBack ? <ArrowLeft size={18} /> : <X size={18} />}</button>
      <strong>{tx(screen?.title) || flow.name}</strong><button aria-label="Menu"><MoreVertical size={16} /></button>
    </div>
    {config.draft && <div className="fr-draft-banner">This Flow is in draft mode and is only meant for testing.</div>}
    <div className="fr-body-scroll">
      {banner && <div className="fr-banner">{banner}</div>}
      {info && <div className="fr-info">{info}</div>}
      {!screen ? <div className="fr-loading"><Loader2 className="spin" size={22} /></div> : tree.map(render)}
    </div>
    {footer && flag(footer, "visible", scope) && <div className="fr-footer">
      {(left || right || center) && <div className="fr-captions">{center ? <span className="c">{center}</span> : <><span>{left}</span><span>{right}</span></>}</div>}
      <button disabled={busy || !flag(footer, "enabled", scope) || invalid} onClick={() => run(footer["on-click-action"] as Action, true)}>{busy ? <Loader2 className="spin" size={16} /> : tx(footer.label) || "Continue"}</button>
      <small>Managed by the business. <u>Learn more</u></small></div>}
  </div></div>;
}

export { inline };
