# Blink Borrow — Testing Instructions

These instructions reproduce the core Blink Borrow challenge flow:

**WebMCP discovery → AI request → remote human approval → direct P2P delivery → one-time revocation**

Live build: https://blink-borrow-webmcp.netlify.app/

## What you need

- A WebMCP-capable ChatGPT/browser environment for the **Agent side**
- A second browser or phone for the **Capability Holder side**
- Both devices/browsers online

The Agent side should show **WebMCP available** and, after a session is created, **6 registered ✓** under WebMCP Tools.

## Core end-to-end test

### 1. Create a session on the Agent side

Open the live Blink Borrow site in the WebMCP-capable Agent browser and click:

**Create Borrow Session**

A short session code appears.

### 2. Join from a second browser

On the second browser, either open the shared invite link or open the live site and enter the session code under:

**Join as Capability Holder**

Then press **Join**.

Wait until the Agent side shows:

- `Connected P2P ✓`
- `DIRECT P2P PIPE ACTIVE`

### 3. Arm a Private Note

On the Capability Holder side:

1. Enter a short test message in **Private Note**.
2. Press **Arm Private Note**.

The Agent-side Capability Wallet should show **1 available**.

### 4. Let the AI discover it

Ask ChatGPT:

```text
List the Blink Borrow capabilities available. Do not request anything yet.
```

Expected result: ChatGPT lists **Private Note** without revealing its contents.

### 5. Request it through WebMCP

Ask ChatGPT:

```text
Request the available Private Note from Blink Borrow.
Tell the capability holder I need it to complete the WebMCP test.
```

Expected result on the holder browser:

- A visible live capability request appears.
- The stated reason is shown.
- The holder can choose **Deny** or **Approve once**.

### 6. Approve once

Press **Approve once** on the holder browser.

Expected result:

- ChatGPT receives the Private Note.
- The capability is consumed.
- The Agent wallet count drops.
- The capability must be re-armed before it can be offered again.

## Deny test

Re-arm a Private Note and ask ChatGPT to request it again.

This time press **Deny**.

Expected result:

- ChatGPT reports that the holder denied the request.
- No note contents are released.
- The Private Note remains available because denial does not consume it.

## Text / JSON test

On the holder side enter, for example:

```json
{"status":"ready","code":42}
```

Press **Arm Text / JSON**.

Ask ChatGPT:

```text
List the available Blink Borrow capabilities, then request the Text / JSON capability.
```

Approve once.

Expected result: ChatGPT receives the JSON payload and the Text / JSON capability is consumed.

## Small Text File test

Blink Borrow supports selected TXT, JSON, CSV and Markdown files up to the demo limit.

### Metadata only

1. Select a supported small text file on the holder browser.
2. Press **Arm Selected File**.
3. Ask ChatGPT:

```text
Inspect the available Blink Borrow Small Text File metadata. Do not request its contents yet.
```

Expected result: metadata such as MIME type, size and filename when available is returned, while file contents remain private.

### Explicit file-content request

Ask ChatGPT:

```text
Request the contents of the available Blink Borrow Small Text File.
Tell the capability holder I need it to test the explicit one-time WebMCP file capability.
```

Approve once on the holder browser.

Expected result:

- The contents of the already-selected remote file are returned.
- The file capability is consumed immediately after approval.
- Blink Borrow does not provide general requester-side filesystem access.

## Sanitized Page Context test

On the holder browser press:

**Capture & Arm Page Context**

Then ask ChatGPT:

```text
List the available Blink Borrow capabilities, then request the Page Context.
Tell the capability holder I need the sanitized page context for a privacy test.
```

Approve once.

Expected result:

- ChatGPT receives the captured title, clean URL and visible page text.
- The response is marked as sanitized.
- The active session code is not present.
- URL query strings and fragments are removed.
- Blink Borrow control-plane UI is excluded.
- The Page Context capability is consumed.

## Session revocation test

On the Agent side press:

**END & FORGET**

Expected result:

- The temporary session is ended.
- WebMCP tools are removed for that session.
- The WebRTC DataChannel is closed.
- The Agent side reports the session as revoked/disconnected.

The holder may also use **LEAVE SESSION** to clear its local restore credential and leave the temporary connection.

## Expected capability lifecycle

The Agent UI visualizes:

```text
DISCOVERED → REQUESTED → APPROVED → BORROWED → REVOKED
```

For a denied request, no private payload should cross the P2P pipe and the capability should remain armed.

## Notes for judges

- Capability payloads are kept in the holder browser until approval.
- Netlify is used for temporary WebRTC rendezvous/signaling, not as the intended capability-payload path.
- Approved payloads are delivered over the WebRTC DataChannel.
- Refreshing the holder browser destroys in-memory armed capabilities by design.
- The demo currently uses STUN without a TURN fallback, so restrictive NAT/firewall environments may prevent P2P establishment.
- Manual **Request once** buttons are included as a browser-only fallback for testing the same permission/P2P path, but the primary competition demo uses real WebMCP tool invocation from ChatGPT.
