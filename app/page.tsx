"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, CalendarDays, Camera, CheckCheck,
  ChevronDown, Clock3, FileText, Link2, Menu, MessageCircle, MoreVertical,
  Paperclip, Send, Smile, X, Zap,
} from "lucide-react";

type Side = "customer" | "business";
type Message = {
  id: string;
  kind: "text" | "flow" | "system";
  from: Side;
  text: string;
  time: string;
  description?: string;
  payload?: Record<string, string>;
};
type LogEvent = { id: string; type: string; at: string; payload: Record<string, unknown> };
type Booking = { service: string; date: string; time: string; status: string };

const initialMessages: Message[] = [
  { id: "seed-1", kind: "text", from: "business", text: "Hello, I am providing support!", time: "2:23 PM" },
  { id: "seed-2", kind: "text", from: "customer", text: "Book your appointment test?", time: "2:23 PM" },
  { id: "seed-3", kind: "flow", from: "business", text: "Book your appointment", description: "Book your appointment", time: "2:33 PM" },
  { id: "seed-4", kind: "text", from: "customer", text: "Yes", time: "2:34 PM" },
];
const fmtTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function PhoneStatus() {
  return <div className="phone-status"><span>9:41</span><span className="dynamic-island" /><span className="phone-system-icons"><span className="signal">▂▄▆</span><span>◉</span><span className="battery"><i /></span></span></div>;
}

function ChatHeader({ side }: { side: Side }) {
  return <div className="chat-header">
    <ArrowLeft size={23} strokeWidth={1.8} className="chat-back" />
    <div className={`profile-avatar ${side === "business" ? "avatar-admin" : ""}`}>{side === "customer" ? <MessageCircle size={18} /> : "J"}</div>
    <div className="chat-identity"><strong>{side === "customer" ? "Travel Ease Support" : "John · Customer Support"}</strong><span>{side === "customer" ? "business account" : "online"}</span></div>
    <div className="chat-header-tools"><Camera size={18} /><MoreVertical size={19} /></div>
  </div>;
}

function ReadReceipt() { return <CheckCheck size={14} className="read-receipt" />; }

function MessageBubble({ message, side, onOpenFlow }: { message: Message; side: Side; onOpenFlow: () => void }) {
  const outgoing = message.from === side;
  if (message.kind === "system") return <div className="system-message">{message.text}</div>;
  if (message.kind === "flow") {
    if (side === "customer") return <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flow-message-card">
      <div className="flow-card-copy"><strong>{message.text}</strong><span>{message.description}</span></div>
      <button onClick={onOpenFlow} className="flow-open-button">Choose Date &amp; Time <ArrowUpRight size={15} /></button>
      <span className="card-timestamp">{message.time}</span>
    </motion.div>;
    return <motion.div layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="bubble incoming flow-incoming">
      <strong>{message.text}</strong><span className="bubble-desc">{message.description}</span><button onClick={onOpenFlow} className="flow-open-button">Preview Flow <ArrowUpRight size={14} /></button><MessageTime time={message.time} />
    </motion.div>;
  }
  return <motion.div layout initial={{ opacity: 0, y: 5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`bubble ${outgoing ? "outgoing" : "incoming"}`}>
    <span>{message.text}</span><MessageTime time={message.time} sent={outgoing} />
  </motion.div>;
}

function MessageTime({ time, sent = false }: { time: string; sent?: boolean }) {
  return <span className="message-time">{time}{sent && <ReadReceipt />}</span>;
}

function Phone({ side, messages, booking, onOpenFlow, onSend }: {
  side: Side; messages: Message[]; booking: Booking | null; onOpenFlow: () => void; onSend: (side: Side, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages, booking]);
  const submit = (event: FormEvent) => { event.preventDefault(); const text = draft.trim(); if (!text) return; onSend(side, text); setDraft(""); };
  return <section className="device-column">
    <div className="device-label"><span className={`view-avatar ${side === "business" ? "view-avatar-admin" : ""}`}>{side === "customer" ? "A" : "B"}</span><span>{side === "customer" ? "User A View" : "User B View"} <small>({side === "customer" ? "Customer" : "Business/Admin"})</small></span></div>
    <div className="phone-frame"><div className="phone-screen">
      <PhoneStatus /><ChatHeader side={side} />
      <div className="chat-canvas" ref={scroller}>
        <div className="day-chip">Today</div>
        {messages.map((message) => <MessageBubble key={message.id} message={message} side={side} onOpenFlow={onOpenFlow} />)}
        {booking && side === "business" && <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="booking-summary"><div className="booking-summary-title"><span className="booking-status-dot" />Active Flow: Appointment Booking</div><p><strong>User A selected:</strong> {booking.date}, {booking.time}</p><div className="booking-summary-meta">{booking.service}<span>Awaiting Confirmation</span></div></motion.div>}
      </div>
      <form className="chat-input-bar" onSubmit={submit}>
        <button type="button" className="input-icon" aria-label="Emoji"><Smile size={20} /></button>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message" aria-label={`Message from ${side}`} maxLength={500} />
        <button type="button" className="input-icon attach-icon" aria-label="Attach file"><Paperclip size={18} /></button>
        <button type="submit" className="send-button" aria-label="Send message"><Send size={17} fill="currentColor" /></button>
      </form>
      <div className="home-indicator"><span /></div>
    </div></div>
    <div className="device-caption"><span className="online-dot" />{side === "customer" ? "Customer preview" : "Business preview"}<span className="caption-divider">·</span><span>Live synced</span></div>
  </section>;
}

function BookingSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (booking: Booking) => void }) {
  const [service, setService] = useState("");
  const [date, setDate] = useState("2026-10-15");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!service || !date || !time) { setError("Please complete all fields to continue."); return; }
    onSubmit({ service, date: fmtDate(date), time, status: "Awaiting Confirmation" });
  };
  return <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.form className="booking-sheet" onSubmit={submit} initial={{ y: 60, opacity: 0.7 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", damping: 27, stiffness: 280 }}>
      <div className="sheet-grabber" /><div className="sheet-topline"><div><div className="sheet-eyebrow">WHATSAPP FLOW · SCREEN 1 OF 1</div><h2>Book your appointment</h2><p>Choose a service and a time that works for you.</p></div><button type="button" onClick={onClose} className="sheet-close" aria-label="Close booking flow"><X size={19} /></button></div>
      <label className="form-field"><span>Select Service <b>*</b></span><span className="select-wrap"><select required value={service} onChange={(e) => setService(e.target.value)}><option value="">Choose a service</option><option>Travel consultation</option><option>Trip planning session</option><option>Booking support</option></select><ChevronDown size={16} /></span></label>
      <label className="form-field"><span>Select Date <b>*</b></span><span className="field-icon-wrap"><input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} required /><CalendarDays size={17} /></span></label>
      <label className="form-field"><span>Select Time <b>*</b></span><span className="select-wrap"><select required value={time} onChange={(e) => setTime(e.target.value)}><option value="">Choose a time</option><option>10:00 AM</option><option>12:00 PM</option><option>2:00 PM</option><option>3:30 PM</option><option>4:00 PM</option></select><Clock3 size={16} /></span></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-note"><Zap size={14} /><span>Submitting sends a structured mock event to the Business view.</span></div>
      <button type="submit" className="confirm-booking">Confirm Booking <ArrowUpRight size={16} /></button>
      <p className="sheet-disclaimer">This is a sandbox simulation. No real appointment will be created.</p>
    </motion.form>
  </motion.div>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [logsOpen, setLogsOpen] = useState(true);
  const [lastEvent, setLastEvent] = useState("Waiting for an event");
  const eventCounter = useRef(0);

  const log = (type: string, payload: Record<string, unknown>) => {
    eventCounter.current += 1;
    const next: LogEvent = { id: `${Date.now()}-${eventCounter.current}`, type, at: new Date().toISOString(), payload };
    setEvents((previous) => [...previous, next]); setLastEvent(`${type} · captured`); setLogsOpen(true);
  };
  const sendMessage = (side: Side, text: string) => {
    setMessages((previous) => [...previous, { id: `${Date.now()}-${Math.random()}`, kind: "text", from: side, text, time: fmtTime() }]);
    log("message.sent", { from: side === "customer" ? "User A" : "User B", text });
  };
  const submitBooking = (next: Booking) => {
    setBooking(next);
    setMessages((previous) => [...previous,
      { id: `${Date.now()}-booking`, kind: "text", from: "customer", text: `Appointment request: ${next.service} on ${next.date} at ${next.time}.`, time: fmtTime(), payload: { service: next.service, date: next.date, time: next.time } },
      { id: `${Date.now()}-system`, kind: "system", from: "business", text: "Appointment request sent · Awaiting business confirmation", time: fmtTime() },
    ]);
    log("flow.submit", { flow: "Appointment Booking", service: next.service, date: next.date, time: next.time, status: next.status, source: "User A" });
    setSheetOpen(false);
  };
  const reset = () => { setMessages(initialMessages); setBooking(null); setEvents([]); eventCounter.current = 0; setLastEvent("Demo reset · ready"); setSheetOpen(false); };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ application: "WhatsApp Sandbox", exportedAt: new Date().toISOString(), messages, events, booking }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "whatsapp-sandbox-conversation.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><MessageCircle size={27} strokeWidth={2.6} /><span className="brand-phone">⌕</span></span><span>WhatsApp Sandbox</span></a>
      <div className="topbar-right"><span className="environment-label"><span /> LOCAL PLAYGROUND</span><button className="toolbar-button secondary" onClick={reset}>Reset demo</button><button className="toolbar-button primary" onClick={exportJson}><ArrowDownToLine size={16} /> Export JSON</button><button className="mobile-menu" aria-label="Open menu"><Menu size={19} /></button></div>
    </header>
    <section className="workspace">
      <div className="workspace-heading"><div><div className="section-kicker">INTERACTIVE DEVELOPER PLAYGROUND</div><h1>Conversation &amp; Flow Simulator</h1><p>Test both sides of a WhatsApp conversation in real time.</p></div><div className="sync-indicator"><span className="sync-pulse" />Both views synced</div></div>
      <div className="devices-grid">
        <Phone side="customer" messages={messages} booking={null} onOpenFlow={() => setSheetOpen(true)} onSend={sendMessage} />
        <div className="sync-bridge" aria-hidden="true"><span /><div><Link2 size={15} /></div><span /></div>
        <Phone side="business" messages={messages} booking={booking} onOpenFlow={() => setSheetOpen(true)} onSend={sendMessage} />
      </div>
      <div className="workspace-footer"><div className="footer-note"><span className="footer-icon"><Zap size={16} /></span><span><strong>Live conversation sync</strong><small>Send from either phone. Try the appointment Flow in the customer view to test a structured submission.</small></span></div><span className={`flow-state ${booking ? "submitted" : ""}`}><span />{booking ? "FLOW SUBMITTED" : "FLOW READY"}</span></div>
      <div className="canvas-decoration deco-left"><span /><span /><span /></div><div className="canvas-decoration deco-right"><span /><span /><span /></div>
    </section>
    <AnimatePresence>{sheetOpen && <BookingSheet onClose={() => setSheetOpen(false)} onSubmit={submitBooking} />}</AnimatePresence>
    <AnimatePresence>{logsOpen && <motion.aside className="integration-panel" initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}>
      <div className="panel-header"><div className="panel-title-icon"><Zap size={16} /></div><div className="panel-title-copy"><strong>Integration Triggered</strong><span>Mock backend · event inspector</span></div><button onClick={() => setLogsOpen(false)} className="panel-close" aria-label="Close integration panel"><X size={17} /></button></div>
      <div className="panel-body"><div className="event-status"><span className="event-led" />{lastEvent}<span className="event-count">{events.length} event{events.length === 1 ? "" : "s"}</span></div>
        {events.length === 0 ? <div className="empty-log"><div className="empty-log-icon"><FileText size={20} /></div><div><strong>Waiting for a flow event</strong><p>Submit the booking form or send a message to see the payload here.</p></div></div> : <div className="log-scroll"><pre>{JSON.stringify({ method: "POST", endpoint: events[events.length - 1].type === "flow.submit" ? "/mock/whatsapp/flow" : "/mock/whatsapp/message", status: 200, event: events[events.length - 1] }, null, 2)}</pre></div>}
      </div><div className="panel-footer"><span><span className="footer-dot" /> Simulator active</span><button onClick={() => setEvents([])}>Clear logs</button></div>
    </motion.aside>}</AnimatePresence>
    {!logsOpen && <button className="reopen-panel" onClick={() => setLogsOpen(true)}><Zap size={15} /> Integration logs {events.length > 0 && <span>{events.length}</span>}</button>}
    <footer className="subtle-footer"><span>WHATSAPP SANDBOX <b>·</b> DESIGN PREVIEW</span><span>Mock messages only — not connected to WhatsApp APIs</span></footer>
  </main>;
}
