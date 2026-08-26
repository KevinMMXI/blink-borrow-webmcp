# Blink Borrow — Devpost Submission Draft

## Project name

**Blink Borrow — Temporary Powers for AI Agents**

## Tagline

**Let AI borrow a capability. Take it back when you're done.**

## Short description

Blink Borrow gives AI agents temporary, human-approved capabilities across browsers. An agent discovers what is available through WebMCP, requests a capability for a stated reason, and receives the payload only after the remote human explicitly approves it. Approved payloads travel over a direct WebRTC DataChannel and one-time capabilities are consumed immediately after delivery.

## Inspiration

Most AI integrations are built around persistent access: connect an account, grant a scope, and leave that permission available until someone revokes it later.

I wanted to explore a different model: what if an AI could **borrow** a capability instead of permanently owning it?

Blink Borrow treats access as temporary authority. A person can arm a capability only when they want to make it available. The AI can discover that it exists, but it cannot see the private payload. When the AI requests it, the holder sees the reason and chooses whether to approve the request once or deny it.

The core lifecycle is:

**Discover → Request → Approve → Borrow → Revoke**

## What it does

Blink Borrow connects two browsers:

- an **Agent browser** exposing session-scoped tools through WebMCP
- a **Capability Holder browser** containing the temporary payload and the human approval gate

The current challenge build demonstrates four capability types:

- **Private Note** — one-time private text
- **Text / JSON** — structured JSON or larger text
- **Small Text File** — selected TXT, JSON, CSV or Markdown content with metadata-only inspection before content access
- **Page Context** — locally captured, sanitized title, URL and visible page text

The agent first receives only a manifest describing what capabilities are available. When it requests one, the holder sees the capability name and the AI's stated reason. The holder can choose **Approve once** or **Deny**.

On approval, the payload travels over the WebRTC DataChannel and the capability is consumed. On denial, no payload is released and the capability remains available.

Blink Borrow also includes **END & FORGET**, which closes the temporary P2P session and removes the session-scoped WebMCP tools.

## How I built it

The project uses a deliberately small architecture:

- **WebMCP / `document.modelContext.registerTool()`** for the AI-facing tool interface
- **WebRTC DataChannel** for the direct browser-to-browser capability payload path
- **Netlify Functions + Netlify Blobs** for temporary SDP rendezvous/signaling
- **Plain HTML, CSS and JavaScript** for the frontend
- **Browser memory** for armed capability payloads until they are approved

Netlify is not intended to carry the private capability payload. It is used only to help the browsers establish their peer-to-peer connection.

The Agent side currently registers six WebMCP tools:

- `blink_borrow_list_capabilities`
- `blink_borrow_request_capability`
- `blink_borrow_request_private_note`
- `blink_borrow_inspect_text_file`
- `blink_borrow_request_text_file_contents`
- `blink_borrow_session_status`

The Small Text File path intentionally separates metadata inspection from contents access. The selected file is armed on the remote holder browser; the requesting agent is not given general filesystem access.

## Privacy and safety choices

The project is designed around temporary authority and explicit human control:

- capability payloads remain local until approval
- discovery exposes metadata, not private payloads
- every request can include a reason shown to the holder
- denial releases nothing
- approved one-time capabilities are consumed immediately
- refreshing the holder browser destroys armed in-memory capabilities
- the holder can leave the session locally
- END & FORGET removes the temporary agent-side session

Page Context adds another privacy layer before approval. Blink Borrow sanitizes the captured context locally by removing its control-plane UI, stripping URL query strings/fragments, and redacting the active session code. This means privacy does not depend only on the user clicking Approve.

## Challenges I ran into

One interesting challenge was file access. A generic capability tool was initially blocked by the browser security layer before the request reached the holder. Instead of trying to bypass that safeguard, I redesigned the flow:

1. expose a dedicated read-only metadata inspection tool
2. use a separate explicit tool for one-time file contents
3. state clearly that it accesses only the already-selected remote file capability
4. require the same human approval gate before the contents cross the P2P connection

That explicit design successfully worked with the WebMCP flow.

Another challenge was Page Context privacy. The first working version captured the Blink Borrow page including its visible session code. I changed the capture process so control-plane details are sanitized locally before the capability is armed.

## Accomplishments that I'm proud of

The working build demonstrates the complete flow with a real WebMCP-capable ChatGPT browser environment:

- ChatGPT discovers remote capabilities through WebMCP
- the private payload stays hidden during discovery
- ChatGPT requests a capability with a reason
- a second browser receives a live human approval prompt
- approval releases the payload over the P2P DataChannel
- denial releases nothing
- one-time capabilities disappear after successful delivery
- file metadata can be inspected without requesting contents
- file contents can then be explicitly requested and approved once
- Page Context is sanitized before it can be shared

The part I find most important is that the human approval screen is not decorative — it is genuinely in the data path.

## What I learned

WebMCP makes websites far more useful to agents when tools are structured and explicit, but tool design also needs a permission model that humans can understand.

This project reinforced that agent access does not always need to be represented as a permanent integration. Temporary capability leases can make the request, reason, scope and revocation much more visible.

I also learned that security restrictions can improve the architecture. The browser blocking the generic file path pushed me toward a clearer two-stage design: inspect metadata first, then explicitly request sensitive contents.

## What's next for Blink Borrow

The challenge build intentionally stays small and understandable. Possible future directions include:

- capability receipts that record metadata about what was approved without logging the private payload
- clearer lease expiration timers
- richer capability manifests
- optional TURN support for more restrictive networks
- capability providers for additional browser/device services
- standardized temporary-capability semantics that could work across different agents and applications

The larger idea is a reusable **temporary capability fabric** where AI systems borrow narrowly scoped abilities instead of receiving broad permanent access.

## Testing instructions

Full reproducible instructions are in `TESTING.md` in the public repository.

The shortest demonstration is:

1. Open Blink Borrow in a WebMCP-capable Agent browser and create a session.
2. Join from a second browser.
3. Wait for `DIRECT P2P PIPE ACTIVE`.
4. Arm a Private Note on the holder browser.
5. Ask ChatGPT to list the available Blink Borrow capabilities.
6. Ask ChatGPT to request the Private Note with a reason.
7. Approve once on the holder browser.
8. Observe ChatGPT receive the note and the capability disappear.

## Built with

- WebMCP
- JavaScript
- WebRTC
- HTML5
- CSS
- Netlify Functions
- Netlify Blobs

## Live demo

https://blink-borrow-webmcp.netlify.app/

## Source code

https://github.com/KevinMMXI/blink-borrow-webmcp

## License

Mozilla Public License 2.0 (MPL-2.0)

## Suggested Devpost gallery captions

**Connected Capability Wallet**  
A WebMCP-capable agent browser connected directly to a remote Capability Holder over WebRTC. The agent sees only the temporary capability manifest until a request is approved.

**Human approval in the data path**  
The remote holder sees exactly which capability the AI wants and the reason it supplied, then chooses Deny or Approve once.

**One-time WebMCP borrow**  
After approval, ChatGPT receives the requested capability and the temporary lease is immediately consumed.

**Sanitized Page Context**  
Before Page Context can be approved, Blink Borrow removes its session code, query string/fragment and control-plane UI locally.
