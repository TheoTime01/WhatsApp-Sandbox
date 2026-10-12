import { Action, Component, Dict, EndpointRequest, EndpointResponse, FlowJson, Screen } from "./types";

/** Resolve `${form.x}`, `${data.x}`, `${screen.ID.form.x}` and `${screen.ID.data.x}` references. */
export type Scope = { form: Dict; data: Dict; screens: Record<string, { form: Dict; data: Dict }> };

const REF = /^\$\{([^}]+)\}$/;

export function lookup(path: string, scope: Scope): unknown {
  const parts = path.trim().split(".");
  if (parts[0] === "form") return scope.form[parts[1]];
  if (parts[0] === "data") return scope.data[parts[1]];
  if (parts[0] === "screen" && parts.length >= 4) return scope.screens[parts[1]]?.[parts[2] as "form" | "data"]?.[parts[3]];
  return undefined;
}

export function resolve<T>(value: T, scope: Scope): unknown {
  if (typeof value === "string") {
    const whole = value.match(REF);
    if (whole) return lookup(whole[1], scope);
    return value.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const found = lookup(path, scope);
      return found === undefined || found === null ? "" : String(found);
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolve(item, scope));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, scope)]));
  return value;
}

export const resolvePayload = (payload: Dict | undefined, scope: Scope) => (resolve(payload ?? {}, scope) as Dict);

export const findScreen = (flow: FlowJson, id: string): Screen | undefined => flow.screens.find((s) => s.id === id);

/** Mock Flow endpoint, mirroring the request contract of the WhatsApp Flows endpoint examples. */
export type EndpointHandler = (request: EndpointRequest) => EndpointResponse | Dict;

export const appointmentEndpoint: EndpointHandler = (req) => {
  if (req.action === "ping") return { data: { status: "active" } };
  if (req.data?.error) return { data: { acknowledged: true } };
  const base = {
    parcel_types: [{ id: "documents", title: "Documents" }, { id: "small", title: "Small package" }, { id: "gift", title: "Gift" }, { id: "electronics", title: "Electronics" }],
    cities: [{ id: "lis", title: "Lisbon" }, { id: "par", title: "Paris" }, { id: "ber", title: "Berlin" }, { id: "mad", title: "Madrid" }],
  };
  const slots = ["10:00", "12:00", "14:00", "15:30", "17:00"].map((t, i) => ({ id: t, title: t, enabled: i !== 1 }));
  if (req.action === "INIT" || req.action === "BACK") return { version: "3.0", screen: "DETAILS", data: { ...base, is_city_enabled: false, is_slot_enabled: false, slots: [] } };
  if (req.action === "data_exchange" && req.screen === "DETAILS") {
    const d = req.data ?? {};
    return { version: "3.0", screen: "DETAILS", data: { ...base, is_city_enabled: Boolean(d.parcel_type), is_slot_enabled: Boolean(d.parcel_type && d.city && d.pickup_date), slots } };
  }
  if (req.action === "data_exchange" && req.screen === "SUMMARY") {
    return { version: "3.0", screen: "SUCCESS", data: { extension_message_response: { params: { flow_token: req.flow_token, ...(req.data ?? {}) } } } };
  }
  throw new Error(`Unhandled endpoint request: ${req.action}/${req.screen}`);
};
