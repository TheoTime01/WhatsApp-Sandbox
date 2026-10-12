import { FlowRecord } from "./types";

const complete = (payload: Record<string, string>) => ({ name: "complete" as const, payload });

export const initialFlows = (): FlowRecord[] => [
  {
    id: "flow_delivery", name: "Delivery request", categories: ["OTHER"], status: "PUBLISHED", endpoint: true,
    json: {
      version: "7.2", data_api_version: "3.0", routing_model: { DETAILS: ["SUMMARY"], SUMMARY: [] },
      screens: [
        {
          id: "DETAILS", title: "Request a delivery",
          data: {
            parcel_types: { type: "array" }, cities: { type: "array" }, slots: { type: "array" },
            is_city_enabled: { type: "boolean", __example__: false }, is_slot_enabled: { type: "boolean", __example__: false },
          },
          layout: { type: "SingleColumnLayout", children: [
            { type: "TextHeading", text: "Tell the traveler what you are sending" },
            { type: "Form", name: "details_form", children: [
              { type: "Dropdown", name: "parcel_type", label: "Parcel type", required: true, "data-source": "${data.parcel_types}", "on-select-action": { name: "data_exchange", payload: { parcel_type: "${form.parcel_type}" } } },
              { type: "Dropdown", name: "city", label: "Destination", required: true, enabled: "${data.is_city_enabled}", "data-source": "${data.cities}", "on-select-action": { name: "data_exchange", payload: { parcel_type: "${form.parcel_type}", city: "${form.city}" } } },
              { type: "DatePicker", name: "pickup_date", label: "Pickup date", required: true, "min-date": "2026-10-12", "on-select-action": { name: "data_exchange", payload: { parcel_type: "${form.parcel_type}", city: "${form.city}", pickup_date: "${form.pickup_date}" } } },
              { type: "Dropdown", name: "pickup_time", label: "Pickup time", required: true, enabled: "${data.is_slot_enabled}", "data-source": "${data.slots}" },
              { type: "TextInput", name: "weight", label: "Weight (kg)", "input-type": "number", required: true, "helper-text": "Up to 10 kg" },
              { type: "TextInput", name: "receiver_phone", label: "Receiver phone", "input-type": "phone", required: true },
              { type: "TextArea", name: "notes", label: "Notes", required: false, "max-chars": 200, "helper-text": "Anything the traveler should know" },
              { type: "OptIn", name: "terms", label: "I confirm the parcel is legal to transport", required: true },
              { type: "Footer", label: "Continue", "on-click-action": { name: "navigate", next: { type: "screen", name: "SUMMARY" }, payload: {
                parcel_type: "${form.parcel_type}", city: "${form.city}", pickup_date: "${form.pickup_date}", pickup_time: "${form.pickup_time}", weight: "${form.weight}", receiver_phone: "${form.receiver_phone}", notes: "${form.notes}" } } },
            ] },
          ] },
        },
        {
          id: "SUMMARY", title: "Summary",
          data: {
            parcel_type: { type: "string", __example__: "" }, city: { type: "string", __example__: "" }, pickup_date: { type: "string", __example__: "" },
            pickup_time: { type: "string", __example__: "" }, weight: { type: "string", __example__: "" }, receiver_phone: { type: "string", __example__: "" }, notes: { type: "string", __example__: "" },
          },
          layout: { type: "SingleColumnLayout", children: [
            { type: "TextHeading", text: "Review your request" },
            { type: "TextSubheading", text: "${data.parcel_type} to ${data.city}" },
            { type: "TextBody", text: "Pickup ${data.pickup_date} at ${data.pickup_time}" },
            { type: "TextBody", text: "Weight: ${data.weight} kg · Receiver: ${data.receiver_phone}" },
            { type: "TextCaption", text: "${data.notes}", visible: "${data.notes}" },
            { type: "EmbeddedLink", text: "Delivery terms", "on-click-action": { name: "navigate", next: { type: "screen", name: "TERMS" }, payload: {} } },
            { type: "Footer", label: "Send request", "on-click-action": { name: "data_exchange", payload: {
              parcel_type: "${data.parcel_type}", city: "${data.city}", pickup_date: "${data.pickup_date}", pickup_time: "${data.pickup_time}", weight: "${data.weight}", receiver_phone: "${data.receiver_phone}", notes: "${data.notes}" } } },
          ] },
        },
        {
          id: "TERMS", title: "Terms",
          layout: { type: "SingleColumnLayout", children: [
            { type: "TextHeading", text: "Delivery terms" },
            { type: "TextBody", text: "The traveler may refuse any parcel. Never send prohibited items. This is a sandbox: nothing is shipped." },
          ] },
        },
        {
          id: "SUCCESS", title: "Request sent", terminal: true, success: true,
          layout: { type: "SingleColumnLayout", children: [
            { type: "TextHeading", text: "Request sent" },
            { type: "TextBody", text: "The traveler and receiver have been notified." },
            { type: "Footer", label: "Done", "on-click-action": complete({ status: "requested" }) },
          ] },
        },
      ],
    },
  },
  {
    id: "flow_feedback", name: "Delivery feedback survey", categories: ["SURVEY"], status: "DRAFT", endpoint: false,
    json: {
      version: "7.2",
      screens: [{
        id: "SURVEY_SCREEN", title: "Feedback", terminal: true, success: true, data: {},
        layout: { type: "SingleColumnLayout", children: [
          { type: "TextHeading", text: "How was your delivery?" },
          { type: "TextCaption", text: "Your feedback helps travelers and senders." },
          { type: "Form", name: "form", children: [
            { type: "RadioButtonsGroup", name: "rating", label: "Overall rating", required: true, "data-source": [
              { id: "5", title: "5 - Excellent" }, { id: "4", title: "4 - Good" }, { id: "3", title: "3 - Average" }, { id: "2", title: "2 - Poor" }] },
            { type: "CheckboxGroup", name: "highlights", label: "What went well?", required: false, "min-selected-items": 0, "max-selected-items": 3, "data-source": [
              { id: "fast", title: "Fast", description: "Arrived early" }, { id: "careful", title: "Careful handling" }, { id: "comms", title: "Good communication" }, { id: "price", title: "Fair price", enabled: false }] },
            { type: "TextArea", name: "comment", label: "Comments", required: false, "max-chars": 300 },
            { type: "Footer", label: "Submit feedback", "on-click-action": complete({ rating: "${form.rating}", highlights: "${form.highlights}", comment: "${form.comment}" }) },
          ] },
        ] },
      }],
    },
  },
  {
    id: "flow_gallery", name: "Component gallery", categories: ["OTHER"], status: "DRAFT", endpoint: false,
    json: {
      version: "7.2",
      screens: [
        { id: "INPUTS", title: "Inputs", data: {}, layout: { type: "SingleColumnLayout", children: [
          { type: "TextHeading", text: "Text heading" }, { type: "TextSubheading", text: "Text subheading" },
          { type: "TextBody", text: "Text body" }, { type: "TextCaption", text: "Text caption" },
          { type: "Form", name: "form", children: [
            { type: "TextInput", name: "name", label: "Name", "input-type": "text", required: true, "min-chars": 2 },
            { type: "TextInput", name: "email", label: "Email", "input-type": "email" },
            { type: "TextInput", name: "secret", label: "Password", "input-type": "password" },
            { type: "DatePicker", name: "date", label: "Date" },
            { type: "Dropdown", name: "choice", label: "Dropdown", "data-source": [{ id: "a", title: "Option A" }, { id: "b", title: "Option B" }] },
            { type: "OptIn", name: "optin", label: "Subscribe to updates" },
            { type: "Footer", label: "Next", "on-click-action": { name: "navigate", next: { type: "screen", name: "DONE" }, payload: { name: "${form.name}", email: "${form.email}", date: "${form.date}", choice: "${form.choice}", optin: "${form.optin}" } } },
          ] },
        ] } },
        { id: "DONE", title: "Done", terminal: true, success: true, data: { name: { type: "string", __example__: "" } }, layout: { type: "SingleColumnLayout", children: [
          { type: "TextHeading", text: "Thanks ${data.name}" },
          { type: "Footer", label: "Finish", "on-click-action": complete({ name: "${data.name}", email: "${data.email}", date: "${data.date}", choice: "${data.choice}", optin: "${data.optin}" }) },
        ] } },
      ],
    },
  },
];
