# Blink Borrow — WebMCP Challenge

> **Let AI borrow a capability. Take it back when you're done.**

Blink Borrow is a WebMCP experiment for temporary, human-approved AI capabilities across connected browsers.

Instead of giving an agent permanent access, Blink Borrow creates a short-lived session in which another browser can offer a capability. The agent may request that capability, the human on the remote browser can approve or deny it, and ending the session removes the capability.

## Core flow

1. Browser A creates a temporary Blink Borrow session.
2. Browser B joins with a short code.
3. Browser B offers a capability, starting with a private note.
4. Browser A registers session-scoped WebMCP tools through `document.modelContext`.
5. An agent requests the remote capability through WebMCP.
6. Browser B visibly approves or denies the request.
7. The approved result returns to the agent.
8. **End & Forget** closes the session and unregisters the WebMCP tools.

## Why this matters

WebMCP gives websites structured tools for agents. Blink Borrow explores a permission model around those tools: **capabilities are borrowed, not permanently granted**.

The project focuses on explicit human approval, temporary sessions, visible capability state, revocation by design, cross-browser collaboration, and minimal retained data.

## Stack

- HTML5
- CSS
- JavaScript
- WebMCP (`document.modelContext`)
- Netlify Functions
- Netlify Blobs

## WebMCP status

The current Chromium WebMCP imperative API is exposed through `document.modelContext`. Blink Borrow feature-detects this API and keeps the normal human UI usable when WebMCP is unavailable.

## Project status

🚧 WebMCP Challenge build in progress.

This public repository is the competition project only and does not contain private Blink Bridge implementation code.

## License

Mozilla Public License 2.0. See `LICENSE`.
