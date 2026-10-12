export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Dict = Record<string, unknown>;

export type DataItem = { id: string; title: string; description?: string; enabled?: boolean };

export type Action =
  | { name: "navigate"; next: { type: "screen"; name: string }; payload?: Dict }
  | { name: "data_exchange"; payload?: Dict }
  | { name: "complete"; payload?: Dict };

export type Component = {
  type: string;
  name?: string;
  text?: string;
  label?: string;
  required?: boolean;
  visible?: boolean | string;
  enabled?: boolean | string;
  "helper-text"?: string;
  "error-message"?: string;
  "input-type"?: string;
  "init-value"?: string;
  "min-date"?: string;
  "max-date"?: string;
  "min-chars"?: number;
  "max-chars"?: number;
  "data-source"?: DataItem[] | string;
  "on-click-action"?: Action;
  "on-select-action"?: Action;
  "on-unselect-action"?: Action;
  "init-values"?: string[] | string;
  src?: string;
  "alt-text"?: string;
  width?: number;
  height?: number;
  "min-selected-items"?: number;
  "max-selected-items"?: number;
  children?: Component[];
  [key: string]: unknown;
};

export type Screen = {
  id: string;
  title?: string;
  terminal?: boolean;
  success?: boolean;
  data?: Record<string, { type: string; __example__?: unknown }>;
  layout: { type: "SingleColumnLayout"; children: Component[] };
  refresh_on_back?: boolean;
};

export type FlowJson = {
  version: string;
  data_api_version?: string;
  routing_model?: Record<string, string[]>;
  screens: Screen[];
};

export type FlowStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED";
export type FlowRecord = { id: string; name: string; categories: string[]; status: FlowStatus; json: FlowJson; endpoint: boolean };

export type EndpointRequest = { version: "3.0"; action: "ping" | "INIT" | "data_exchange" | "BACK"; screen?: string; data?: Dict; flow_token: string };
export type EndpointResponse = { version?: "3.0"; screen?: string; data: Dict };
export type EndpointLog = { id: string; at: string; request: EndpointRequest | Dict; response: EndpointResponse | Dict; ms: number; error: boolean };

export type FlowMessageConfig = {
  flowId: string;
  cta: string;
  header: string;
  body: string;
  footer: string;
  flowToken: string;
  action: "navigate" | "data_exchange";
  screen: string;
  mode: "draft" | "published";
};
