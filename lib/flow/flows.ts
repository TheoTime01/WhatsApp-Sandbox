import { FlowJson, FlowRecord } from "./types";
import customerFeedback from "./samples/customer-feedback.json";

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
          id: "SUMMARY", title: "Summary", terminal: true, success: true,
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
            { type: "Footer", label: "Send request", "on-click-action": { name: "data_exchange", payload: {
              parcel_type: "${data.parcel_type}", city: "${data.city}", pickup_date: "${data.pickup_date}", pickup_time: "${data.pickup_time}", weight: "${data.weight}", receiver_phone: "${data.receiver_phone}", notes: "${data.notes}" } } },
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
    id: "flow_customer_feedback", name: "Customer feedback", categories: ["SURVEY"], status: "PUBLISHED", endpoint: false,
    json: customerFeedback as unknown as FlowJson,
  },
  {
    id: "flow_gallery", name: "Component gallery", categories: ["OTHER"], status: "DRAFT", endpoint: false,
    json: {
      version: "7.3",
      screens: [
        { id: "INPUTS", title: "Text & inputs", data: {}, sensitive: ["secret"], layout: { type: "SingleColumnLayout", children: [
          { type: "TextHeading", text: "Text heading" }, { type: "TextSubheading", text: "Text subheading" },
          { type: "TextBody", text: "Body with **bold**, *italic* and ~~strike~~ markdown, a [link](https://example.com) and a list:\n+ First\n+ Second", markdown: true },
          { type: "TextCaption", text: "Caption in bold", "font-weight": "bold" },
          { type: "Form", name: "form", "init-values": { name: "Alex" }, children: [
            { type: "TextInput", name: "name", label: "Name", "input-type": "text", required: true, "min-chars": 2 },
            { type: "TextInput", name: "email", label: "Email", "input-type": "email", "helper-text": "We never share it" },
            { type: "TextInput", name: "code", label: "Code", "input-type": "text", pattern: "^[A-Z]{3}-\\d{3}$", "helper-text": "Format: ABC-123" },
            { type: "TextInput", name: "secret", label: "PIN", "input-type": "passcode", "max-chars": 6 },
            { type: "TextArea", name: "about", label: "About you", "max-length": 120, "helper-text": "Optional" },
            { type: "OptIn", name: "optin", label: "Subscribe to updates", "on-click-action": { name: "navigate", next: { type: "screen", name: "TERMS" }, payload: {} } },
            { type: "Footer", label: "Next", "center-caption": "Step 1 of 4", "on-click-action": { name: "navigate", next: { type: "screen", name: "CHOICES" }, payload: { name: "${form.name}", email: "${form.email}" } } },
          ] },
        ] } },
        { id: "TERMS", title: "Terms", layout: { type: "SingleColumnLayout", children: [
          { type: "RichText", text: ["# Terms of use", "", "## Summary", "Please read **carefully**.", "", "1. Be kind", "2. Be honest", "", "| Plan | Price |", "| --- | --- |", "| Basic | Free |", "| Pro | $9 |"] },
        ] } },
        { id: "CHOICES", title: "Choices", data: { name: { type: "string", __example__: "Alex" }, email: { type: "string", __example__: "a@b.co" } }, layout: { type: "SingleColumnLayout", children: [
          { type: "RadioButtonsGroup", name: "plan", label: "Plan", required: true, "data-source": [
            { id: "free", title: "Free", description: "Up to 3 projects", metadata: "$0" }, { id: "pro", title: "Pro", description: "Unlimited projects", metadata: "$9" }, { id: "team", title: "Team", enabled: false }] },
          { type: "CheckboxGroup", name: "extras", label: "Extras", "min-selected-items": 1, "max-selected-items": 2, required: true, "data-source": [
            { id: "a", title: "Priority support" }, { id: "b", title: "Analytics", color: "16865a" }, { id: "c", title: "SSO" }] },
          { type: "Dropdown", name: "country", label: "Country", required: true, "data-source": [{ id: "pt", title: "Portugal" }, { id: "fr", title: "France" }, { id: "other", title: "Other" }] },
          { type: "If", condition: "${form.country} == 'other'", then: [{ type: "TextInput", name: "country_other", label: "Which country?", "input-type": "text", required: true }] },
          { type: "Switch", value: "${form.plan}", cases: { pro: [{ type: "TextCaption", text: "Pro includes a 14-day trial." }], free: [{ type: "TextCaption", text: "Free forever." }] } },
          { type: "Footer", label: "Next", "on-click-action": { name: "navigate", next: { type: "screen", name: "DATES" }, payload: { plan: "${form.plan}", extras: "${form.extras}", country: "${form.country}" } } },
        ] } },
        { id: "DATES", title: "Dates", data: {}, layout: { type: "SingleColumnLayout", children: [
          { type: "DatePicker", name: "birthday", label: "Birthday", "max-date": "2026-10-12", "helper-text": "Pick a past date" },
          { type: "CalendarPicker", name: "day", label: "Appointment", mode: "single", required: true, "min-date": "2026-10-12", "include-days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "unavailable-dates": ["2026-10-14"] },
          { type: "CalendarPicker", name: "stay", label: "Stay", title: "Choose your stay", description: "2 to 5 nights", mode: "range", "min-date": "2026-10-12", "min-days": 2, "max-days": 5, required: { "start-date": true, "end-date": true } },
          { type: "Footer", label: "Next", "on-click-action": { name: "navigate", next: { type: "screen", name: "MEDIA" }, payload: { birthday: "${form.birthday}", day: "${form.day}", stay: "${form.stay}" } } },
        ] } },
        { id: "MEDIA", title: "Upload", terminal: true, success: true, data: {}, layout: { type: "SingleColumnLayout", children: [
          { type: "Image", src: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==", "alt-text": "Pixel", height: 60, "scale-type": "cover" },
          { type: "DocumentPicker", name: "docs", label: "Attachments", description: "PDF or images, up to 2 MB each", "max-file-size-kb": 2048, "min-uploaded-documents": 0, "max-uploaded-documents": 3, "allowed-mime-types": ["application/pdf", "image/jpeg", "image/png"] },
          { type: "Footer", label: "Finish", "on-click-action": { name: "complete", payload: { name: "${screen.INPUTS.form.name}", secret: "${screen.INPUTS.form.secret}", plan: "${screen.CHOICES.form.plan}", stay: "${screen.DATES.form.stay}", docs: "${form.docs}" } } },
        ] } },
      ],
    },
  },
];
