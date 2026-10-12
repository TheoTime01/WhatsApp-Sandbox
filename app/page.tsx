"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FlowRuntime, RunConfig } from "@/components/FlowRuntime";
import { FlowStudio, buildCloudApiPayload } from "@/components/FlowStudio";
import { initialFlows } from "@/lib/flow/flows";
import { appointmentEndpoint } from "@/lib/flow/engine";
import { Dict, EndpointLog, FlowMessageConfig, FlowRecord } from "@/lib/flow/types";
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, CalendarDays, Camera, CheckCheck,
  ChevronDown, Clock3, FileText, Menu, MessageCircle, MoreVertical,
  Paperclip, Send, Smile, Users, X, Zap,
} from "lucide-react";

type Side = "sender" | "traveler" | "receiver";
const SIDES: Side[] = ["sender", "traveler", "receiver"];
const ROLES: Record<Side, { label: string; user: string; initial: string; caption: string }> = {
  sender: { label: "Sender", user: "User A", initial: "A", caption: "Sender preview" },
  traveler: { label: "Traveler", user: "User B", initial: "B", caption: "Traveler preview" },
  receiver: { label: "Receiver", user: "User C", initial: "C", caption: "Receiver preview" },
};
type Message = {
  id: string;
  kind: "text" | "flow" | "flow_reply" | "system";
  from: Side;
  text: string;
  time: string;
  description?: string;
  payload?: Record<string, unknown>;
  flow?: FlowMessageConfig;
};
type LogEvent = { id: string; type: string; at: string; payload: Record<string, unknown> };
const initialMessages: Message[] = [
  { id: "seed-1", kind: "text", from: "traveler", text: "Hi both! I'm flying to Lisbon on the 15th and have space in my bag.", time: "2:23 PM" },
  { id: "seed-2", kind: "text", from: "sender", text: "Great, I have a parcel to send. Can I request a delivery?", time: "2:23 PM" },
  { id: "seed-3", kind: "flow", from: "traveler", text: "Request a delivery", description: "Share the parcel details and pickup slot", time: "2:33 PM",
    flow: { flowId: "flow_delivery", cta: "Request Delivery", header: "", body: "Share the parcel details and pickup slot", footer: "", flowToken: "seed_token", action: "data_exchange", screen: "DETAILS", mode: "published" } },
  { id: "seed-4", kind: "text", from: "receiver", text: "I'll be waiting in Lisbon!", time: "2:34 PM" },
];
const fmtTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
type FlowEnv = { flows: FlowRecord[]; endpointOn: boolean; onEndpointLog: (log: EndpointLog) => void };

function PhoneStatus() {
  return <div className="phone-status"><span>9:41</span><span className="dynamic-island" /><span className="phone-system-icons"><span className="signal">▂▄▆</span><span>◉</span><span className="battery"><i /></span></span></div>;
}

function ChatHeader({ side }: { side: Side }) {
  return <div className="chat-header">
    <ArrowLeft size={23} strokeWidth={1.8} className="chat-back" />
    <div className={`profile-avatar avatar-${side}`}><Users size={18} /></div>
    <div className="chat-identity"><strong>Parcel Delivery Group</strong><span>You are the {ROLES[side].label}</span></div>
    <div className="chat-header-tools"><Camera size={18} /><MoreVertical size={19} /></div>
  </div>;
}

function ReadReceipt() { return <CheckCheck size={14} className="read-receipt" />; }

function MessageBubble({ message, side, onOpenFlow }: { message: Message; side: Side; onOpenFlow: () => void }) {
  const outgoing = message.from === side;
  if (message.kind === "system") return <div className="system-message">{message.text}</div>;
  if (message.kind === "flow_reply") return <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`bubble ${outgoing ? "outgoing" : "incoming"} flow-reply`}>
    {!outgoing && <b className={`sender-name name-${message.from}`}>{ROLES[message.from].label}</b>}
    <span className="flow-reply-title"><CheckCheck size={13} /> {message.text}</span><span className="flow-reply-body">{message.description}</span><MessageTime time={message.time} sent={outgoing} />
  </motion.div>;
  if (message.kind === "flow") return <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flow-message-card">
    {message.flow?.header && <div className="flow-card-header">{message.flow.header}</div>}
    <div className="flow-card-copy">{!outgoing && <b className={`sender-name name-${message.from}`}>{ROLES[message.from].label}</b>}<strong>{message.text}</strong><span>{message.description}</span>{message.flow?.footer && <small className="flow-card-footer">{message.flow.footer}</small>}{message.flow?.mode === "draft" && <small className="flow-card-footer">Draft mode</small>}</div>
    <button onClick={onOpenFlow} className="flow-open-button">{message.flow?.cta ?? "Open Flow"} <ArrowUpRight size={15} /></button>
    <span className="card-timestamp">{message.time}</span>
  </motion.div>;
  return <motion.div layout initial={{ opacity: 0, y: 5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`bubble ${outgoing ? "outgoing" : "incoming"}`}>
    {!outgoing && <b className={`sender-name name-${message.from}`}>{ROLES[message.from].label}</b>}<span>{message.text}</span><MessageTime time={message.time} sent={outgoing} />
  </motion.div>;
}

function MessageTime({ time, sent = false }: { time: string; sent?: boolean }) {
  return <span className="message-time">{time}{sent && <ReadReceipt />}</span>;
}

function Phone({ side, messages, flowEnv, onSend, onFlowComplete }: {
  side: Side; messages: Message[]; flowEnv: FlowEnv; onSend: (side: Side, text: string) => void;
  onFlowComplete: (side: Side, message: Message, flow: FlowRecord, payload: Dict, summary: string) => void;
}) {
  const [running, setRunning] = useState<Message | null>(null);
  const runningFlow = running?.flow ? flowEnv.flows.find((f) => f.id === running.flow?.flowId) : undefined;
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages]);
  const submit = (event: FormEvent) => { event.preventDefault(); const text = draft.trim(); if (!text) return; onSend(side, text); setDraft(""); };
  return <section className="device-column">
    <div className="device-label"><span className={`view-avatar view-avatar-${side}`}>{ROLES[side].initial}</span><span>{ROLES[side].user} View <small>({ROLES[side].label})</small></span></div>
    <div className="phone-frame"><div className="phone-screen">
      <PhoneStatus /><ChatHeader side={side} />
      <div className="chat-canvas" ref={scroller}>
        <div className="day-chip">Today</div>
        {messages.map((message) => <MessageBubble key={message.id} message={message} side={side} onOpenFlow={() => setRunning(message)} />)}
      </div>
      <form className="chat-input-bar" onSubmit={submit}>
        <button type="button" className="input-icon" aria-label="Emoji"><Smile size={20} /></button>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message" aria-label={`Message from ${side}`} maxLength={500} />
        <button type="button" className="input-icon attach-icon" aria-label="Attach file"><Paperclip size={18} /></button>
        <button type="submit" className="send-button" aria-label="Send message"><Send size={17} fill="currentColor" /></button>
      </form>
      <div className="home-indicator"><span /></div>
      {running?.flow && runningFlow && <FlowRuntime key={running.id} flow={runningFlow} endpoint={appointmentEndpoint} endpointOn={flowEnv.endpointOn}
        config={{ action: running.flow.action, screen: running.flow.screen, flowToken: running.flow.flowToken, draft: running.flow.mode === "draft" } satisfies RunConfig}
        onEndpointLog={flowEnv.onEndpointLog} onClose={() => setRunning(null)}
        onComplete={(payload, summary) => { onFlowComplete(side, running, runningFlow, payload, summary); setRunning(null); }} />}
    </div></div>
    <div className="device-caption"><span className="online-dot" />{ROLES[side].caption}<span className="caption-divider">·</span><span>Live synced</span></div>
  </section>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [flows, setFlows] = useState<FlowRecord[]>(initialFlows);
  const [endpointOn, setEndpointOn] = useState(true);
  const [endpointLogs, setEndpointLogs] = useState<EndpointLog[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [logsOpen, setLogsOpen] = useState(true);
  const [lastEvent, setLastEvent] = useState("Waiting for an event");
  const eventCounter = useRef(0);
  const completed = messages.some((m) => m.kind === "flow_reply");

  const log = (type: string, payload: Record<string, unknown>) => {
    eventCounter.current += 1;
    const next: LogEvent = { id: `${Date.now()}-${eventCounter.current}`, type, at: new Date().toISOString(), payload };
    setEvents((previous) => [...previous, next]); setLastEvent(`${type} · captured`); setLogsOpen(true);
  };
  const sendMessage = (side: Side, text: string) => {
    setMessages((previous) => [...previous, { id: `${Date.now()}-${Math.random()}`, kind: "text", from: side, text, time: fmtTime() }]);
    log("message.sent", { from: ROLES[side].user, role: ROLES[side].label, text });
  };
  const sendFlowMessage = (from: Side, config: FlowMessageConfig): string | null => {
    const flow = flows.find((f) => f.id === config.flowId);
    if (!flow) return "Select a flow first.";
    if (config.mode === "published" && flow.status !== "PUBLISHED") return `Flow is ${flow.status}. Publish it or send in draft mode.`;
    if (!config.cta.trim() || !config.body.trim()) return "flow_cta and body are required.";
    setMessages((previous) => [...previous, { id: `${Date.now()}-flow`, kind: "flow", from, text: config.header || flow.name, description: config.body, time: fmtTime(), flow: config }]);
    log("flow.message.sent", { endpoint: "POST /{phone-number-id}/messages", from: ROLES[from].user, request: buildCloudApiPayload(config, flow, "recipient") });
    return null;
  };
  const completeFlow = (side: Side, message: Message, flow: FlowRecord, payload: Dict, summary: string) => {
    setMessages((previous) => [...previous,
      { id: `${Date.now()}-reply`, kind: "flow_reply", from: side, text: flow.name, description: summary, time: fmtTime(), payload },
      { id: `${Date.now()}-system`, kind: "system", from: side, text: `${ROLES[side].label} completed "${flow.name}"`, time: fmtTime() },
    ]);
    log("flow.completed", { endpoint: "webhook: messages (interactive.nfm_reply)", from: ROLES[side].user, flow_id: flow.id, flow_message_id: message.id,
      interactive: { type: "nfm_reply", nfm_reply: { name: "flow", body: "Sent", response_json: JSON.stringify(payload) } } });
  };
  const addEndpointLog = (entry: EndpointLog) => { setEndpointLogs((p) => [...p, entry]); };
  const ping = () => {
    const t0 = performance.now(); let response: Dict; let error = false;
    if (!endpointOn) { response = { error: "Endpoint unreachable" }; error = true; } else response = appointmentEndpoint({ version: "3.0", action: "ping", flow_token: "healthcheck" });
    addEndpointLog({ id: `${Date.now()}-ping`, at: new Date().toISOString(), request: { version: "3.0", action: "ping" }, response, ms: Math.max(1, Math.round(performance.now() - t0)), error });
  };
  const reset = () => { setMessages(initialMessages); setFlows(initialFlows()); setEvents([]); setEndpointLogs([]); eventCounter.current = 0; setLastEvent("Demo reset · ready"); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ application: "WhatsApp Sandbox", exportedAt: new Date().toISOString(), messages, flows, events, endpointLogs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "whatsapp-sandbox-conversation.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><MessageCircle size={27} strokeWidth={2.6} /><span className="brand-phone">⌕</span></span><span>WhatsApp Sandbox</span></a>
      <div className="topbar-right"><span className="environment-label"><span /> LOCAL PLAYGROUND</span><button className="toolbar-button secondary" onClick={reset}>Reset demo</button><button className="toolbar-button primary" onClick={exportJson}><ArrowDownToLine size={16} /> Export JSON</button><button className="mobile-menu" aria-label="Open menu"><Menu size={19} /></button></div>
    </header>
    <section className="workspace">
      <div className="workspace-heading"><div><div className="section-kicker">INTERACTIVE DEVELOPER PLAYGROUND</div><h1>Conversation &amp; Flow Simulator</h1><p>Test a sender, traveler and receiver sharing one WhatsApp conversation in real time.</p></div><div className="sync-indicator"><span className="sync-pulse" />All 3 views synced</div></div>
      <div className="devices-grid">
        {SIDES.map((side) => <Phone key={side} side={side} messages={messages} flowEnv={{ flows, endpointOn, onEndpointLog: addEndpointLog }} onSend={sendMessage} onFlowComplete={completeFlow} />)}
      </div>
      <div className="workspace-footer"><div className="footer-note"><span className="footer-icon"><Zap size={16} /></span><span><strong>Live conversation sync</strong><small>Send from any phone. Open the Flow in the Sender view, or build and send your own in the Flow Studio below.</small></span></div><span className={`flow-state ${completed ? "submitted" : ""}`}><span />{completed ? "FLOW SUBMITTED" : "FLOW READY"}</span></div>
      <FlowStudio flows={flows} setFlows={setFlows} endpointOn={endpointOn} setEndpointOn={setEndpointOn} endpointLogs={endpointLogs} onSend={sendFlowMessage} onApiEvent={log} onPing={ping} />
      <div className="canvas-decoration deco-left"><span /><span /><span /></div><div className="canvas-decoration deco-right"><span /><span /><span /></div>
    </section>
    <AnimatePresence>{logsOpen && <motion.aside className="integration-panel" initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}>
      <div className="panel-header"><div className="panel-title-icon"><Zap size={16} /></div><div className="panel-title-copy"><strong>Integration Triggered</strong><span>Mock backend · event inspector</span></div><button onClick={() => setLogsOpen(false)} className="panel-close" aria-label="Close integration panel"><X size={17} /></button></div>
      <div className="panel-body"><div className="event-status"><span className="event-led" />{lastEvent}<span className="event-count">{events.length} event{events.length === 1 ? "" : "s"}</span></div>
        {events.length === 0 ? <div className="empty-log"><div className="empty-log-icon"><FileText size={20} /></div><div><strong>Waiting for a flow event</strong><p>Submit the booking form or send a message to see the payload here.</p></div></div> : <div className="log-scroll"><pre>{JSON.stringify({ method: "POST", endpoint: events[events.length - 1].type.startsWith("flow") ? "/mock/whatsapp/flow" : events[events.length - 1].type.startsWith("graph") ? "/mock/graph" : "/mock/whatsapp/message", status: 200, event: events[events.length - 1] }, null, 2)}</pre></div>}
      </div><div className="panel-footer"><span><span className="footer-dot" /> Simulator active</span><button onClick={() => setEvents([])}>Clear logs</button></div>
    </motion.aside>}</AnimatePresence>
    {!logsOpen && <button className="reopen-panel" onClick={() => setLogsOpen(true)}><Zap size={15} /> Integration logs {events.length > 0 && <span>{events.length}</span>}</button>}
    <footer className="subtle-footer"><span>WHATSAPP SANDBOX <b>·</b> DESIGN PREVIEW</span><span>Mock messages only — not connected to WhatsApp APIs</span></footer>
  </main>;
}
