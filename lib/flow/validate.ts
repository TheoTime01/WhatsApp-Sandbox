import { Action, Component, FlowJson } from "./types";

export const INPUT_TYPES = ["TextInput", "TextArea", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "DatePicker", "CalendarPicker", "OptIn", "PhotoPicker", "DocumentPicker"];
export const KNOWN_TYPES = [...INPUT_TYPES, "TextHeading", "TextSubheading", "TextBody", "TextCaption", "RichText", "Image", "EmbeddedLink", "Footer", "Form", "If", "Switch"];
const ACTION_KEYS = ["on-click-action", "on-select-action", "on-unselect-action"] as const;

const ver = (v: string) => { const [a, b] = v.split(".").map(Number); return a + (b || 0) / 100; };

/** Walk components through Form children and If/Switch branches. */
export function walk(children: Component[], visit: (c: Component, depth: number, parent?: Component) => void, depth = 0, parent?: Component) {
  for (const c of children) {
    visit(c, depth, parent);
    if (c.children) walk(c.children, visit, depth, c);
    if (c.type === "If") {
      if (Array.isArray(c.then)) walk(c.then as Component[], visit, depth + 1, c);
      if (Array.isArray(c.else)) walk(c.else as Component[], visit, depth + 1, c);
    }
    if (c.type === "Switch" && c.cases && typeof c.cases === "object") for (const branch of Object.values(c.cases as Record<string, Component[]>)) if (Array.isArray(branch)) walk(branch, visit, depth + 1, c);
  }
}

const isDynamic = (v: unknown) => typeof v === "string" && v.includes("${");
const textOf = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "");

export function validateFlowJson(json: unknown): string[] {
  const errors: string[] = [];
  const flow = json as FlowJson;
  if (!flow || typeof flow !== "object") return ["Flow JSON must be an object."];
  if (JSON.stringify(json).length > 10 * 1024 * 1024) errors.push("Flow JSON cannot exceed 10 MB.");
  if (!flow.version) errors.push("Missing required property: version.");
  else if (!/^\d+\.\d+$/.test(flow.version)) errors.push(`Invalid version "${flow.version}". Use the form "7.3".`);
  const v = /^\d+\.\d+$/.test(flow.version ?? "") ? ver(flow.version) : 99;
  if (!Array.isArray(flow.screens) || flow.screens.length === 0) return [...errors, "Flow JSON needs at least one screen (screens)."];
  const ids = new Set<string>();
  for (const screen of flow.screens) {
    if (!screen.id) { errors.push("A screen is missing its id."); continue; }
    if (!/^[A-Za-z_]+$/.test(screen.id)) errors.push(`Screen id "${screen.id}" may only contain letters and underscores.`);
    if (screen.id === "SUCCESS") errors.push('"SUCCESS" is a reserved keyword and cannot be a screen id.');
    if (ids.has(screen.id)) errors.push(`Duplicate screen id "${screen.id}".`);
    ids.add(screen.id);
  }
  if (!flow.screens.some((s) => s.terminal)) errors.push("At least one screen must be terminal.");
  const usesEndpoint = JSON.stringify(flow).includes('"data_exchange"') || Boolean(flow.data_api_version);
  if (flow.data_api_version && flow.data_api_version !== "3.0") errors.push('data_api_version must be "3.0".');
  if (usesEndpoint && !flow.data_api_version) errors.push('Flows that use data_exchange need "data_api_version": "3.0".');

  // Routing model (required for endpoint-powered Flows)
  if (flow.routing_model) {
    let branches = 0;
    for (const [from, tos] of Object.entries(flow.routing_model)) {
      if (!ids.has(from)) errors.push(`routing_model: unknown screen "${from}".`);
      branches += tos.length;
      for (const to of tos) { if (!ids.has(to)) errors.push(`routing_model: "${from}" routes to unknown screen "${to}".`); if (to === from) errors.push(`routing_model: "${from}" cannot route to itself.`); }
    }
    if (Object.keys(flow.routing_model).length > 0 && branches > 10 * flow.screens.length) errors.push("routing_model has too many branches.");
    const inbound = new Set(Object.values(flow.routing_model).flat());
    const entries = Object.keys(flow.routing_model).filter((k) => !inbound.has(k));
    if (entries.length === 0 && Object.keys(flow.routing_model).length) errors.push("routing_model needs an entry screen (a screen with no inbound edge).");
    for (const s of flow.screens) if (s.terminal && (flow.routing_model[s.id]?.length ?? 0) > 0) errors.push(`routing_model: terminal screen "${s.id}" cannot have routes.`);
  } else if (flow.data_api_version) errors.push("Endpoint-powered Flows must define routing_model.");

  const needV = (ok: boolean, screen: string, what: string, min: string) => { if (!ok) errors.push(`${screen}: ${what} requires Flow JSON version ${min} or higher.`); };

  for (const screen of flow.screens) {
    const sid = screen.id;
    const names = new Set<string>();
    if (screen.layout?.type !== "SingleColumnLayout") errors.push(`${sid}: layout.type must be SingleColumnLayout.`);
    if (!Array.isArray(screen.layout?.children)) { errors.push(`${sid}: layout.children must be an array.`); continue; }
    if (screen.sensitive) needV(v >= 5.01, sid, '"sensitive"', "5.1");
    let footers = 0, total = 0, images = 0, links = 0, optins = 0, pickers = 0, photo = 0, doc = 0;
    walk(screen.layout.children, (c, depth, parent) => {
      total += 1;
      if (!KNOWN_TYPES.includes(c.type)) { errors.push(`${sid}: unknown component type "${c.type}".`); return; }
      const t = c.type;
      if (t === "Footer" && !(parent?.type === "If" || parent?.type === "Switch")) footers += 1;
      if (t === "Footer" && depth > 1) errors.push(`${sid}: Footer can only be in the first level of an If.`);
      if (INPUT_TYPES.includes(t)) {
        if (!c.name) errors.push(`${sid}: ${t} is missing "name".`);
        else if (names.has(c.name)) errors.push(`${sid}: duplicate component name "${c.name}".`);
        else names.add(c.name);
        if (!parent || parent.type !== "Form") needV(v >= 4, sid, `${t} outside a Form`, "4.0");
        if (t !== "OptIn" && !c.label) errors.push(`${sid}: ${t} "${c.name}" is missing "label".`);
      }
      const len = (what: string, value: unknown, max: number) => { if (typeof value === "string" && !isDynamic(value) && value.length > max) errors.push(`${sid}: ${what} exceeds ${max} characters.`); };
      const blank = (what: string, value: unknown) => { const x = textOf(value); if (!isDynamic(x) && x.trim() === "") errors.push(`${sid}: ${what} cannot be empty.`); };
      switch (t) {
        case "TextHeading": blank("TextHeading text", c.text); len("TextHeading text", c.text, 80); break;
        case "TextSubheading": blank("TextSubheading text", c.text); len("TextSubheading text", c.text, 80); break;
        case "TextBody": blank("TextBody text", c.text); len("TextBody text", textOf(c.text), 4096); if (c.markdown) needV(v >= 5.01, sid, "markdown", "5.1"); break;
        case "TextCaption": blank("TextCaption text", c.text); len("TextCaption text", textOf(c.text), 409); if (c.markdown) needV(v >= 5.01, sid, "markdown", "5.1"); break;
        case "RichText": needV(v >= 5.01, sid, "RichText", "5.1"); if (!c.text) errors.push(`${sid}: RichText needs "text".`); break;
        case "TextInput":
          len("TextInput label", c.label, 20); len("TextInput helper-text", c["helper-text"], 80); len("TextInput error-message", c["error-message"], 30);
          if (c.pattern) { needV(v >= 6.02, sid, "TextInput pattern", "6.2"); if (!c["helper-text"]) errors.push(`${sid}: "helper-text" is mandatory when "pattern" is used.`); try { new RegExp(String(c.pattern)); } catch { errors.push(`${sid}: invalid pattern regex.`); } }
          if (c["input-type"] && !["text", "number", "email", "password", "passcode", "phone"].includes(String(c["input-type"]))) errors.push(`${sid}: invalid input-type "${c["input-type"]}".`);
          break;
        case "TextArea": len("TextArea label", c.label, 20); len("TextArea helper-text", c["helper-text"], 80); break;
        case "CheckboxGroup": case "RadioButtonsGroup": case "Dropdown": {
          const limit = t === "Dropdown" ? 20 : 30; len(`${t} label`, c.label, limit);
          const src = c["data-source"];
          if (src === undefined) errors.push(`${sid}: ${t} "${c.name}" needs "data-source".`);
          else if (Array.isArray(src)) {
            const withImages = src.some((i) => i.image);
            const max = t === "Dropdown" ? (withImages ? 100 : 200) : 20;
            if (src.length < 1) errors.push(`${sid}: ${t} "${c.name}" needs at least 1 option.`);
            if (src.length > max) errors.push(`${sid}: ${t} "${c.name}" has more than ${max} options.`);
            const seen = new Set<string>();
            for (const i of src) {
              if (!i.id || !i.title) errors.push(`${sid}: ${t} "${c.name}" options need id and title.`);
              if (seen.has(i.id)) errors.push(`${sid}: ${t} "${c.name}" has duplicate option id "${i.id}".`); seen.add(i.id);
              len("option title", i.title, 30); len("option description", i.description, 300); len("option metadata", i.metadata, 20);
              if (i.image) needV(v >= 5, sid, "option images", "5.0");
            }
          }
          if (t === "CheckboxGroup" && c["min-selected-items"] !== undefined && c["max-selected-items"] !== undefined && Number(c["min-selected-items"]) > Number(c["max-selected-items"])) errors.push(`${sid}: min-selected-items exceeds max-selected-items.`);
          if (t !== "Dropdown" && c["media-size"]) needV(v >= 5, sid, "media-size", "5.0");
          break;
        }
        case "OptIn": optins += 1; len("OptIn label", c.label, 120); if (!c.label) errors.push(`${sid}: OptIn needs "label".`);
          if (c["on-click-action"] && !["data_exchange", "navigate", "open_url"].includes((c["on-click-action"] as Action).name)) errors.push(`${sid}: OptIn on-click-action must be data_exchange, navigate or open_url.`);
          break;
        case "EmbeddedLink": links += 1; len("EmbeddedLink text", c.text, 25); blank("EmbeddedLink text", c.text); if (!c["on-click-action"]) errors.push(`${sid}: EmbeddedLink needs on-click-action.`); break;
        case "DatePicker": len("DatePicker label", c.label, 40); len("DatePicker helper-text", c["helper-text"], 80); len("DatePicker error-message", c["error-message"], 80);
          if (c["on-select-action"] && (c["on-select-action"] as Action).name !== "data_exchange") errors.push(`${sid}: DatePicker on-select-action only supports data_exchange.`); break;
        case "CalendarPicker": needV(v >= 6.01, sid, "CalendarPicker", "6.1"); len("CalendarPicker label", c.label, 40); len("CalendarPicker title", c.title, 80); len("CalendarPicker description", c.description, 300);
          if (c.mode && !["single", "range"].includes(String(c.mode)) && !isDynamic(c.mode)) errors.push(`${sid}: CalendarPicker mode must be "single" or "range".`);
          if ((c.title || c.description || c["min-days"] || c["max-days"]) && c.mode !== "range" && !isDynamic(c.mode)) errors.push(`${sid}: title, description, min-days and max-days are only available in "range" mode.`);
          if (c["on-select-action"] && (c["on-select-action"] as Action).name !== "data_exchange") errors.push(`${sid}: CalendarPicker on-select-action only supports data_exchange.`); break;
        case "Image": images += 1; if (!c.src) errors.push(`${sid}: Image needs "src".`); if (c["scale-type"] && !["cover", "contain"].includes(String(c["scale-type"]))) errors.push(`${sid}: Image scale-type must be cover or contain.`); break;
        case "PhotoPicker": case "DocumentPicker": {
          needV(v >= 4, sid, t, "4.0"); pickers += 1; if (t === "PhotoPicker") photo += 1; else doc += 1;
          const k = t === "PhotoPicker" ? "photos" : "documents";
          if (Number(c[`min-uploaded-${k}`] ?? 0) > Number(c[`max-uploaded-${k}`] ?? 30)) errors.push(`"min-uploaded-${k}" cannot be greater than "max-uploaded-${k}" for ${t} component ${c.name}.`);
          len(`${t} label`, c.label, 80); len(`${t} description`, c.description, 300);
          if (c["max-file-size-kb"] !== undefined && (Number(c["max-file-size-kb"]) < 1 || Number(c["max-file-size-kb"]) > 25600)) errors.push(`${sid}: max-file-size-kb must be between 1 and 25600.`);
          break;
        }
        case "If":
          if (!c.condition) errors.push(`${sid}: If needs "condition".`);
          else if (!String(c.condition).includes("${")) errors.push(`${sid}: If condition must contain at least one dynamic value.`);
          if (!Array.isArray(c.then) || c.then.length === 0) errors.push(`${sid}: If "then" must contain at least one component.`);
          if (Array.isArray(c.else) && c.else.length === 0) errors.push(`${sid}: If "else" cannot be an empty array.`);
          if (depth >= 3) errors.push(`${sid}: up to 3 nested If components are allowed.`);
          needV(v >= 4, sid, "If", "4.0");
          {
            const hasF = (b: unknown) => Array.isArray(b) && (b as Component[]).some((x) => x.type === "Footer");
            if (hasF(c.then) !== hasF(c.else)) errors.push(`${sid}: Missing Footer inside one of the If branches. Branch "else" should exist and contain one Footer.`);
            if (hasF(c.then)) footers += 1;
          }
          break;
        case "Switch": needV(v >= 4, sid, "Switch", "4.0"); if (!c.value) errors.push(`${sid}: Switch needs "value".`); if (!c.cases || Object.keys(c.cases as object).length === 0) errors.push(`${sid}: Invalid empty property found at cases.`); break;
        case "Footer": {
          const label = c.label; len("Footer label", label, 35);
          for (const k of ["left-caption", "center-caption", "right-caption"]) len(`Footer ${k}`, c[k], 15);
          if (c["center-caption"] && (c["left-caption"] || c["right-caption"])) errors.push(`${sid}: Footer can set left+right captions or only a center caption.`);
          if (!c["on-click-action"]) errors.push(`${sid}: Footer needs on-click-action.`);
          if (screen.terminal && (c["on-click-action"] as Action | undefined)?.name === "navigate") errors.push(`${sid}: terminal screens cannot navigate from the Footer.`);
          break;
        }
      }
      for (const key of ACTION_KEYS) {
        const action = c[key] as Action | undefined;
        if (!action) continue;
        if (!["navigate", "data_exchange", "complete", "open_url"].includes(action.name)) { errors.push(`${sid}: unknown action "${action.name}".`); continue; }
        if (action.name === "open_url") needV(v >= 6, sid, "open_url", "6.0");
        if (action.name === "navigate" && !ids.has(action.next?.name)) errors.push(`${sid}: navigate target "${action.next?.name}" does not exist.`);
        if (action.name === "data_exchange" && !flow.data_api_version) errors.push(`${sid}: data_exchange needs "data_api_version" and an endpoint.`);
        if (action.name === "complete" && !screen.terminal && t === "Footer") errors.push(`${sid}: "complete" should only be used on a terminal screen.`);
        const payload = (action as { payload?: Record<string, unknown> }).payload ?? {};
        for (const [pk, pv] of Object.entries(payload)) {
          const m = typeof pv === "string" && pv.match(/^\$\{form\.([^}]+)\}$/);
          if (!m) { if (typeof pv === "object" && pv && JSON.stringify(pv).match(/\$\{form\.[^}]*(photo|doc)/i)) errors.push(`${sid}: media pickers can only be used as top-level string values in an action payload ("${pk}").`); continue; }
          const target = (screen.layout.children.length ? findNamed(screen.layout.children, m[1]) : undefined);
          if (target && (target.type === "PhotoPicker" || target.type === "DocumentPicker") && action.name === "navigate") errors.push(`${sid}: ${target.type} value is not allowed in the payload of the navigate action. Use global dynamic referencing.`);
        }
      }
    });
    if (total > 50) errors.push(`${sid}: a screen can have at most 50 components (found ${total}).`);
    if (footers > 1) errors.push(`${sid}: only one Footer is allowed per screen.`);
    if (screen.terminal && footers === 0) errors.push(`${sid}: terminal screens need a Footer.`);
    if (images > 3) errors.push(`${sid}: at most 3 images per screen.`);
    if (links > 2) errors.push(`${sid}: at most 2 EmbeddedLink components per screen.`);
    if (optins > 5) errors.push(`${sid}: at most 5 OptIn components per screen.`);
    if (photo > 1) errors.push(`${sid}: You can only have a maximum of 1 component of type PhotoPicker per screen.`);
    if (doc > 1) errors.push(`${sid}: You can only have a maximum of 1 component of type DocumentPicker per screen.`);
    if (pickers > 1 && photo && doc) errors.push(`${sid}: You can only have a maximum of 1 component of type PhotoPicker or DocumentPicker per screen.`);
    if (screen.refresh_on_back && !flow.data_api_version) errors.push(`${sid}: refresh_on_back only applies to Flows with a Data Endpoint.`);
  }
  // reachability: every non-entry screen must be the target of some route
  if (!flow.routing_model) {
    const targets = new Set<string>();
    for (const s of flow.screens) walk(s.layout?.children ?? [], (c) => { for (const key of ACTION_KEYS) { const a = c[key] as Action | undefined; if (a?.name === "navigate") targets.add(a.next?.name); } });
    const entries = flow.screens.filter((s) => !targets.has(s.id));
    if (entries.length === 0) errors.push("No entry screen: every screen is the target of a navigate action.");
  }
  return [...new Set(errors)];
}

function findNamed(children: Component[], name: string): Component | undefined {
  let found: Component | undefined;
  walk(children, (c) => { if (c.name === name) found = c; });
  return found;
}
