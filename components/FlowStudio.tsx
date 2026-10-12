"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Archive, Braces, CheckCircle2, Copy, Plus, Rocket, Send as SendIcon, Server, XCircle } from "lucide-react";
import { Dict, EndpointLog, FlowMessageConfig, FlowRecord } from "@/lib/flow/types";
import { validateFlowJson } from "@/lib/flow/validate";

type Side = "sender" | "traveler" | "receiver";
type Tab = "flows" | "send" | "endpoint";

export function buildCloudApiPayload(c: FlowMessageConfig, flow: FlowRecord | undefined, to: string, byName = false) {
  const parameters = {
    flow_message_version: "3", flow_token: c.flowToken, ...(byName ? { flow_name: flow?.name } : { flow_id: c.flowId }), flow_cta: c.cta, mode: c.mode,
    flow_action: c.action, ...(c.action === "navigate" && { flow_action_payload: { screen: c.screen, ...(c.data && Object.keys(c.data).length ? { data: c.data } : {}) } }),
  };
  if (c.template) return {
    messaging_product: "whatsapp", to, type: "template",
    template: { name: (flow?.name ?? "flow").toLowerCase().replace(/\W+/g, "_"), language: { code: "en_US" }, components: [
      { type: "body", parameters: [] },
      { type: "button", sub_type: "flow", index: "0", parameters: [{ type: "action", action: { flow_token: c.flowToken, ...(c.action === "navigate" && c.screen ? { flow_action_data: c.data ?? {} } : {}) } }] }] },
  };
  return {
    messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive",
    interactive: { type: "flow", ...(c.header && { header: { type: "text", text: c.header } }), body: { text: c.body }, ...(c.footer && { footer: { text: c.footer } }), action: { name: "flow", parameters } },
  };
}

const blank = (n: number): FlowRecord => ({
  id: `flow_${Date.now()}`, name: `New flow ${n}`, categories: ["OTHER"], status: "DRAFT", endpoint: false,
  json: { version: "7.2", screens: [{ id: "WELCOME", title: "Welcome", terminal: true, success: true, data: {}, layout: { type: "SingleColumnLayout", children: [
    { type: "TextHeading", text: "Hello from your new Flow" },
    { type: "Footer", label: "Done", "on-click-action": { name: "complete", payload: {} } }] } }] },
});

export function FlowStudio({ flows, setFlows, endpointOn, setEndpointOn, endpointLogs, onSend, onApiEvent, onPing }: {
  flows: FlowRecord[]; setFlows: (f: FlowRecord[]) => void; endpointOn: boolean; setEndpointOn: (v: boolean) => void; endpointLogs: EndpointLog[];
  onSend: (from: Side, config: FlowMessageConfig) => string | null; onApiEvent: (type: string, payload: Dict) => void; onPing: () => void;
}) {
  const [tab, setTab] = useState<Tab>("flows");
  const [selectedId, setSelectedId] = useState(flows[0]?.id);
  const selected = flows.find((f) => f.id === selectedId) ?? flows[0];
  const [text, setText] = useState("");
  const [from, setFrom] = useState<Side>("traveler");
  const [cfg, setCfg] = useState<FlowMessageConfig>({ flowId: flows[0].id, cta: "Open Flow", header: "", body: "Please fill in this form.", footer: "", flowToken: "token_1", action: "navigate", screen: flows[0].json.screens[0].id, mode: "published" });
  const [sendError, setSendError] = useState("");
  const [byName, setByName] = useState(false);
  const [dataText, setDataText] = useState("");
  const [checks, setChecks] = useState({ phone: true, key: true, webhooks: true });

  useEffect(() => { if (selected) setText(JSON.stringify(selected.json, null, 2)); }, [selected?.id, selected?.json]);
  const parsed = useMemo(() => { try { return { value: JSON.parse(text), error: "" }; } catch (e) { return { value: null, error: (e as Error).message }; } }, [text]);
  const problems = parsed.error ? [`Invalid JSON: ${parsed.error}`] : validateFlowJson(parsed.value);

  const update = (id: string, patch: Partial<FlowRecord>) => setFlows(flows.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const sendFlow = flows.find((f) => f.id === cfg.flowId);
  const dataParsed = useMemo(() => { if (!dataText.trim()) return { value: undefined as Dict | undefined, error: "" }; try { const v = JSON.parse(dataText); return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length ? { value: v as Dict, error: "" } : { value: undefined, error: "data must be a non-empty object" }; } catch { return { value: undefined, error: "data is not valid JSON" }; } }, [dataText]);
  const publishChecks = selected ? [
    { ok: problems.length === 0, label: "Flow JSON is valid", fix: "Fix the validation errors above." },
    { ok: checks.phone, label: "A phone number is connected to the WhatsApp Business account", fix: "Add a phone number to your WABA." },
    { ok: !selected.endpoint || checks.key, label: "Signed public key uploaded to the phone number (endpoint flows)", fix: "Upload and sign a public key." },
    { ok: !selected.endpoint || Boolean(parsed.value?.data_api_version), label: "data_api_version is set (endpoint flows)", fix: 'Set "data_api_version": "3.0".' },
    { ok: !selected.endpoint || endpointOn, label: "Endpoint responds to health check (ping)", fix: "Bring the endpoint online." },
    { ok: checks.webhooks, label: "WABA is subscribed to Flows webhooks", fix: "Subscribe to the flows webhook field." },
  ] : [];
  const failing = publishChecks.filter((c) => !c.ok);
  const setStatus = (f: FlowRecord, next: FlowRecord["status"], alert?: string) => {
    update(f.id, { status: next, ...(next === "PUBLISHED" ? { everPublished: true } : {}) });
    onApiEvent("webhook.flows.status_change", { entry: [{ id: "waba_id", time: Math.floor(Date.now() / 1000), changes: [{ field: "flows", value: { event: "FLOW_STATUS_CHANGE", message: `Flow ${f.name} changed status from ${f.status} to ${next}`, flow_id: f.id, old_status: f.status, new_status: next, ...(alert ? { alert } : {}) } }] }], object: "whatsapp_business_account" });
  };
  const toName = from === "sender" ? "traveler" : from === "traveler" ? "sender" : "traveler";
  const metrics = useMemo(() => {
    const errs = endpointLogs.filter((l) => l.error).length;
    return { total: endpointLogs.length, errs, rate: endpointLogs.length ? Math.round((errs / endpointLogs.length) * 100) : 0, avg: endpointLogs.length ? Math.round(endpointLogs.reduce((a, l) => a + l.ms, 0) / endpointLogs.length) : 0 };
  }, [endpointLogs]);

  return <section className="studio">
    <div className="studio-tabs">
      {([["flows", Braces, "Flows"], ["send", SendIcon, "Send flow message"], ["endpoint", Server, "Endpoint & metrics"]] as const).map(([id, Icon, label]) =>
        <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={14} />{label}</button>)}
    </div>

    {tab === "flows" && selected && <div className="studio-grid">
      <div className="studio-list">
        {flows.map((f) => <button key={f.id} className={f.id === selected.id ? "active" : ""} onClick={() => setSelectedId(f.id)}><strong>{f.name}</strong><span className={`status status-${f.status}`}>{f.status}</span></button>)}
        <button className="studio-add" onClick={() => { const f = blank(flows.length + 1); setFlows([...flows, f]); setSelectedId(f.id); onApiEvent("graph.flows.create", { method: "POST", path: "/{waba-id}/flows", body: { name: f.name, categories: f.categories } }); }}><Plus size={14} /> Create flow</button>
      </div>
      <div className="studio-editor">
        <div className="studio-row">
          <input value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} aria-label="Flow name" disabled={selected.status !== "DRAFT"} />
          <select value={selected.categories[0]} onChange={(e) => update(selected.id, { categories: [e.target.value] })} disabled={selected.status !== "DRAFT"} aria-label="Category">
            {["SIGN_UP", "SIGN_IN", "APPOINTMENT_BOOKING", "LEAD_GENERATION", "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "OTHER"].map((c) => <option key={c}>{c}</option>)}</select>
          <label className="studio-check"><input type="checkbox" checked={selected.endpoint} disabled={selected.status !== "DRAFT"} onChange={(e) => update(selected.id, { endpoint: e.target.checked })} /> Uses endpoint</label>
        </div>
        <textarea spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} readOnly={selected.status !== "DRAFT"} aria-label="Flow JSON" />
        <div className={`studio-validation ${problems.length ? "bad" : "ok"}`}>
          {problems.length ? <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul> : <span><CheckCircle2 size={14} /> Flow JSON is valid</span>}
        </div>
        <ul className="studio-checks">{publishChecks.map((c) => <li key={c.label} className={c.ok ? "ok" : "bad"}>{c.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {c.label}{!c.ok && <small> — {c.fix}</small>}</li>)}</ul>
        <div className="studio-row">
          <button disabled={selected.status !== "DRAFT" || problems.length > 0} onClick={() => { update(selected.id, { json: parsed.value, endpoint: selected.endpoint || Boolean(parsed.value.data_api_version) }); onApiEvent("graph.flows.assets.update", { method: "POST", path: `/${selected.id}/assets`, body: { name: "flow.json", asset_type: "FLOW_JSON" }, response: { success: true, validation_errors: [] } }); }}>Save JSON</button>
          <button disabled={selected.status !== "DRAFT" || failing.length > 0} title={failing.map((f) => f.label).join("\n")} onClick={() => { setStatus(selected, "PUBLISHED"); onApiEvent("graph.flows.publish", { method: "POST", path: `/${selected.id}/publish`, response: { success: true } }); }}><Rocket size={13} /> Publish</button>
          <button disabled={!["PUBLISHED", "THROTTLED", "BLOCKED"].includes(selected.status)} onClick={() => { setStatus(selected, "DEPRECATED"); onApiEvent("graph.flows.deprecate", { method: "POST", path: `/${selected.id}/deprecate`, response: { success: true } }); }}><Archive size={13} /> Deprecate</button>
          <button onClick={() => { const f: FlowRecord = { ...selected, id: `flow_${Date.now()}`, name: `${selected.name} (copy)`, status: "DRAFT", everPublished: false }; setFlows([...flows, f]); setSelectedId(f.id); }}><Copy size={13} /> Duplicate as draft</button>
          <button className="danger" disabled={selected.status !== "DRAFT" || flows.length < 2} title="Only draft Flows can be deleted" onClick={() => { const next = flows.filter((f) => f.id !== selected.id); setFlows(next); setSelectedId(next[0].id); onApiEvent("graph.flows.delete", { method: "DELETE", path: `/${selected.id}`, response: { success: true } }); }}>Delete</button>
        </div>
        {["PUBLISHED", "THROTTLED", "BLOCKED"].includes(selected.status) && <div className="studio-row"><span className="studio-hint">Simulate WhatsApp health monitoring:</span>
          <button disabled={selected.status !== "PUBLISHED"} onClick={() => setStatus(selected, "THROTTLED", "ENDPOINT_LATENCY")}>Throttle (latency alert)</button>
          <button disabled={selected.status !== "THROTTLED"} onClick={() => setStatus(selected, "BLOCKED", "ENDPOINT_ERROR_RATE")}>Block (error rate)</button>
          <button disabled={selected.status === "PUBLISHED"} onClick={() => setStatus(selected, selected.status === "BLOCKED" ? "THROTTLED" : "PUBLISHED")}>Recover</button></div>}
        <p className="studio-hint">Only draft Flows are editable or deletable. Throttled Flows can only send 10 messages per hour; blocked Flows can neither be sent nor opened. Components: Text (Heading, Subheading, Body, Caption), RichText, TextInput, TextArea, CheckboxGroup, RadioButtonsGroup, Dropdown, OptIn, EmbeddedLink, DatePicker, CalendarPicker, Image, PhotoPicker, DocumentPicker, If, Switch and Footer. Actions: <code>navigate</code>, <code>data_exchange</code>, <code>complete</code>, <code>open_url</code>.</p>
      </div>
    </div>}

    {tab === "send" && <div className="studio-grid single">
      <div className="studio-editor">
        <div className="studio-form">
          <label>From<select value={from} onChange={(e) => setFrom(e.target.value as Side)}><option value="sender">Sender</option><option value="traveler">Traveler</option><option value="receiver">Receiver</option></select></label>
          <label>Flow<select value={cfg.flowId} onChange={(e) => { const f = flows.find((x) => x.id === e.target.value); setCfg({ ...cfg, flowId: e.target.value, screen: f?.json.screens[0].id ?? "" }); }}>{flows.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.status})</option>)}</select></label>
          <label>Reference by<select value={byName ? "name" : "id"} onChange={(e) => setByName(e.target.value === "name")}><option value="id">flow_id</option><option value="name">flow_name</option></select></label>
          <label>Message type<select value={cfg.template ? "template" : "interactive"} onChange={(e) => setCfg({ ...cfg, template: e.target.value === "template" })}><option value="interactive">Interactive (user-initiated)</option><option value="template">Template with Flow button (business-initiated)</option></select></label>
          <label>Mode<select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as "draft" | "published" })}><option value="published">published</option><option value="draft">draft</option></select></label>
          <label>flow_action<select value={cfg.action} onChange={(e) => setCfg({ ...cfg, action: e.target.value as "navigate" | "data_exchange" })}><option value="navigate">navigate</option><option value="data_exchange" disabled={!sendFlow?.endpoint}>data_exchange (INIT via endpoint)</option></select></label>
          {cfg.action === "navigate" && <label>First screen<select value={cfg.screen} onChange={(e) => setCfg({ ...cfg, screen: e.target.value })}>{sendFlow?.json.screens.map((s) => <option key={s.id}>{s.id}</option>)}</select></label>}
          {cfg.action === "navigate" && <label>flow_action_payload.data (JSON object)<input value={dataText} placeholder='{"product_name":"Camera"}' onChange={(e) => { setDataText(e.target.value); }} /></label>}
          <label>flow_cta<input maxLength={30} value={cfg.cta} onChange={(e) => setCfg({ ...cfg, cta: e.target.value })} /></label>
          <label>Header<input maxLength={60} value={cfg.header} onChange={(e) => setCfg({ ...cfg, header: e.target.value })} /></label>
          <label>Body<input maxLength={1024} value={cfg.body} onChange={(e) => setCfg({ ...cfg, body: e.target.value })} /></label>
          <label>Footer<input maxLength={60} value={cfg.footer} onChange={(e) => setCfg({ ...cfg, footer: e.target.value })} /></label>
          <label>flow_token<input value={cfg.flowToken} onChange={(e) => setCfg({ ...cfg, flowToken: e.target.value })} /></label>
        </div>
        {sendError && <div className="studio-validation bad">{sendError}</div>}
        <div className="studio-row"><button onClick={() => { if (dataParsed.error) { setSendError(dataParsed.error); return; } const err = onSend(from, { ...cfg, data: dataParsed.value }); setSendError(err ?? ""); }}><SendIcon size={13} /> Send flow message</button></div>
        <pre className="studio-pre">{JSON.stringify(buildCloudApiPayload({ ...cfg, data: dataParsed.value }, sendFlow, toName, byName), null, 2)}</pre>
      </div>
    </div>}

    {tab === "endpoint" && <div className="studio-grid single">
      <div className="studio-editor">
        <div className="studio-metrics">
          <div><b>{metrics.total}</b><span>Requests</span></div><div><b>{metrics.errs}</b><span>Errors</span></div>
          <div><b>{metrics.rate}%</b><span>Error rate</span></div><div><b>{metrics.avg} ms</b><span>Avg latency</span></div>
          <div><b className={endpointOn ? "up" : "down"}>{endpointOn ? "Up" : "Down"}</b><span>Availability</span></div>
        </div>
        <div className="studio-row">
          <label className="studio-check"><input type="checkbox" checked={endpointOn} onChange={(e) => setEndpointOn(e.target.checked)} /> Endpoint online (turn off to simulate outages)</label>
          <button onClick={onPing}><Activity size={13} /> Send health check (ping)</button>
        </div>
        <div className="studio-row"><span className="studio-hint">Publishing prerequisites:</span>
          <label className="studio-check"><input type="checkbox" checked={checks.phone} onChange={(e) => setChecks({ ...checks, phone: e.target.checked })} /> Phone number connected</label>
          <label className="studio-check"><input type="checkbox" checked={checks.key} onChange={(e) => setChecks({ ...checks, key: e.target.checked })} /> Public key uploaded</label>
          <label className="studio-check"><input type="checkbox" checked={checks.webhooks} onChange={(e) => setChecks({ ...checks, webhooks: e.target.checked })} /> Webhooks subscribed</label>
        </div>
        <div className="studio-log">{endpointLogs.length === 0 ? <p className="studio-hint">No endpoint requests yet. Open a flow that uses data_exchange.</p> : [...endpointLogs].reverse().map((l) =>
          <details key={l.id} className={l.error ? "bad" : ""}><summary>{String((l.request as Dict).action)}{(l.request as Dict).screen ? ` · ${(l.request as Dict).screen}` : ""} <small>{l.ms} ms {l.error ? "· error" : ""}</small></summary>
            <pre>{JSON.stringify({ request: l.request, response: l.response }, null, 2)}</pre></details>)}</div>
        <p className="studio-hint">Requests follow the Flows endpoint contract (version 3.0: ping, INIT, data_exchange, BACK, error notifications). Real endpoints receive AES-GCM encrypted bodies; this sandbox shows them decrypted.</p>
      </div>
    </div>}
  </section>;
}
