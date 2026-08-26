# Blink Borrow — Temporary Powers for AI Agents

> **Let AI borrow a capability. Take it back when you're done.**

**Blink Borrow** is a WebMCP experiment for temporary, human-approved AI capabilities across connected browsers.

Instead of giving an AI agent permanent access to data or a service, Blink Borrow lets another person or browser temporarily offer a capability. The agent can discover that capability through WebMCP, request it for a stated reason, and receive it only after the remote human explicitly approves the request.

The approved payload travels over a direct WebRTC DataChannel between the two browsers. Netlify is used only for temporary session rendezvous/signaling.

**Live demo:** https://blink-borrow-webmcp.netlify.app/

---

## The idea

AI agents are becoming increasingly capable, but access is often modeled as a long-lived permission: connect an account, grant a scope, keep the integration enabled.

Blink Borrow explores a different model:

**Discover → Request → Approve → Borrow → Revoke**

A capability exists only when a human deliberately arms it. The AI can see metadata about what is available, but not the private payload. If the AI requests it, the capability holder sees the request and the reason. The holder can approve once or deny it.

Approved one-time capabilities are consumed immediately after delivery.

---

## What the demo can borrow

Blink Borrow currently demonstrates four temporary capability types:

| Capability | What the agent can discover | What crosses after approval |
| --- | --- | --- |
| **Private Note** | Type and availability | One-time private text |
| **Text / JSON** | Type, MIME and size | Text or structured JSON |
| **Small Text File** | File metadata such as MIME and size | Contents of the already-selected TXT/JSON/CSV/Markdown file |
| **Page Context** | Type and size | Sanitized title, URL and visible page text |

The Small Text File path deliberately separates **metadata inspection** from **content access**. The file is selected and armed by the capability holder; Blink Borrow does not give the requesting agent general filesystem access.

Page Context is sanitized before it is armed: Blink Borrow removes its control-plane UI, strips URL query strings/fragments, and redacts the active session code.

---

## End-to-end flow

1. The **Agent browser** creates a Blink Borrow session.
2. A second browser joins as the **Capability Holder** using the short code or invite link.
3. WebRTC establishes a direct peer-to-peer DataChannel.
4. The holder arms one or more capabilities locally.
5. Only a capability manifest — metadata, not the private payload — is advertised to the agent browser.
6. Blink Borrow registers session-scoped tools with WebMCP using `document.modelContext.registerTool()`.
7. The AI lists the currently available capabilities.
8. The AI requests one capability and supplies a human-readable reason.
9. The holder receives a visible approval prompt and chooses **Approve once** or **Deny**.
10. If approved, the payload crosses the direct P2P pipe and the capability is immediately consumed.
11. **END & FORGET** destroys the agent session, closes the P2P pipe and removes the WebMCP tools.

A denied request releases no payload and does **not** consume the capability.

---

## Architecture

```text
┌───────────────────────────────┐
│ AI / ChatGPT                  │
│ WebMCP tool call              │
└──────────────┬────────────────┘
               │ document.modelContext
               ▼
┌───────────────────────────────┐
│ Blink Borrow — Agent Browser  │
│ capability manifest + request │
└──────────────┬────────────────┘
               │
               │ WebRTC DataChannel
               │ direct P2P payload path
               ▼
┌───────────────────────────────┐
│ Capability Holder Browser     │
│ local payload + human gate    │
└───────────────────────────────┘

      Netlify Function + Blobs
      ─────────────────────────
      temporary SDP rendezvous /
      signaling only
```

### Separation of responsibilities

- **WebMCP** — structured AI-facing capability interface
- **WebRTC DataChannel** — direct browser-to-browser capability transport
- **Human approval** — permission gate before payload release
- **Netlify Function / Blobs** — temporary WebRTC rendezvous/signaling
- **Browser memory** — armed capability payloads remain local until approved

Capability payloads are not intentionally stored in the signaling service.

---

## WebMCP tools

The current build registers six WebMCP tools on the Agent side:

- `blink_borrow_list_capabilities`
- `blink_borrow_request_capability`
- `blink_borrow_request_private_note`
- `blink_borrow_inspect_text_file`
- `blink_borrow_request_text_file_contents`
- `blink_borrow_session_status`

The generic request tool handles non-file capabilities. File metadata and file-content access use explicit tools so discovery and sensitive content access remain separate.

WebMCP support is feature-detected. The human-facing interface remains usable in browsers that do not expose `document.modelContext`.

---

## Privacy and security model

Blink Borrow is intentionally built around temporary authority rather than permanent access.

- Capabilities must be explicitly **armed** by the holder.
- Discovery exposes metadata, not private payloads.
- Each request carries a reason visible to the holder.
- The holder can **Approve once** or **Deny**.
- A denied capability remains available and no payload is released.
- An approved one-time capability is consumed immediately after delivery.
- Armed capability payloads live in browser memory and are lost on refresh/reload.
- Page Context is sanitized before sharing.
- The holder can leave locally; the Agent can use **END & FORGET** to revoke the session.
- The P2P connection is closed when the session is ended.

This is a demonstration architecture, not a claim that WebRTC or browser applications eliminate every possible endpoint or network threat.

---

## Quick test

### 1. Create the session

Open the live site in a WebMCP-capable agent browser and choose **Create Borrow Session**.

### 2. Join from another browser

Open the invite link or enter the displayed session code on a second browser, then choose **Join**.

Wait until both sides show that the **DIRECT P2P PIPE** is active.

### 3. Arm a capability

On the Capability Holder browser, arm a **Private Note**, **Text / JSON**, **Small Text File**, or **Page Context**.

### 4. Ask the AI

Example prompt:

```text
List the Blink Borrow capabilities available, then request the one you need.
```

For Page Context:

```text
List the available Blink Borrow capabilities, then request the Page Context.
Tell the capability holder I need the sanitized page context for a privacy test.
```

### 5. Approve or deny

The holder receives the request and reason. Choose **Approve once** or **Deny**.

On approval, the AI receives the result and the capability disappears from the holder's available capability manifest.

---

## Tested flows

The current challenge build has been manually tested end-to-end with a WebMCP-capable ChatGPT desktop browser flow for:

- Private Note — approve
- Private Note — deny without consumption
- Text / JSON — approve and consume
- Small Text File — metadata-only inspection
- Small Text File — explicit approved contents request and consume
- Page Context — sanitized approved request and consume
- Session revocation through END & FORGET

---

## Local development

Blink Borrow is deliberately small and has no frontend build step.

Requirements:

- Node.js for Netlify Functions dependencies
- Netlify-compatible local or hosted environment for the signaling function
- Two modern browsers for the P2P demo
- A WebMCP-capable browser/client to exercise the AI tools

Install dependencies:

```bash
npm install
```

The frontend is plain HTML, CSS and JavaScript. Netlify publishes the repository root and serves the signaling function from `netlify/functions/borrow.js`.

---

## Current limitations

- The demo currently uses public STUN servers and has no TURN fallback, so some restrictive NAT/firewall combinations may prevent a P2P connection.
- Small files are intentionally limited to text-oriented formats and a demo-size limit.
- Page Context currently captures the Blink Borrow capability-holder page itself; it is a proof of the sanitized context capability pattern, not a general browser-extension page scraper.
- WebMCP availability depends on the browser/client exposing the current `document.modelContext` API.

---

## Repository boundary

This repository contains the public **Blink Borrow WebMCP Challenge** implementation only.

It does **not** contain private Blink Bridge production code or private transport/reliability implementations from other Kanverse projects.

---

## License

Licensed under the **Mozilla Public License 2.0 (MPL-2.0)**. See [`LICENSE`](LICENSE).
