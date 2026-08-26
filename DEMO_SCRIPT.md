# Blink Borrow — Under-3-Minute Demo Script

Target length: **2:30–2:50**

Goal: prove the core idea quickly and visibly:

**AI discovers a capability → requests it → human approves → payload crosses direct P2P → capability disappears → sanitized context proves privacy-by-design.**

## 0:00–0:15 — Hook

**On screen:** Blink Borrow home screen.

**Say:**

“Blink Borrow lets an AI temporarily borrow a capability from another browser — with explicit human approval and automatic revocation. Instead of granting permanent access, the capability exists only for the moment it is needed.”

## 0:15–0:35 — Create and connect

**On screen:** Create session in the ChatGPT/WebMCP browser. Join from the second browser or phone.

Show:

- `WebMCP available`
- session creation
- second browser joining
- `Connected P2P ✓`
- `DIRECT P2P PIPE ACTIVE`

**Say:**

“The AI-facing browser exposes temporary tools through WebMCP. The second browser is the capability holder. Netlify is used only for rendezvous; approved payloads travel over this direct WebRTC DataChannel.”

## 0:35–0:55 — Arm without revealing

**On screen:** Holder enters a short Private Note and presses **Arm Private Note**. Agent wallet changes to `1 available`.

**Say:**

“The holder arms a Private Note locally. The agent receives only a capability manifest — type and availability — not the private contents.”

## 0:55–1:15 — Real WebMCP discovery

**On screen:** Ask ChatGPT:

```text
List the Blink Borrow capabilities available. Do not request anything yet.
```

Show ChatGPT listing **Private Note** without the value.

**Say:**

“This is a real WebMCP tool call. ChatGPT can discover what is available, but it still cannot see the payload.”

## 1:15–1:45 — Request + human approval + one-time consumption

**On screen:** Ask ChatGPT:

```text
Request the available Private Note from Blink Borrow.
Tell the capability holder I need it to complete the WebMCP demo.
```

Switch/show holder approval card with the reason. Press **Approve once**.

Show ChatGPT receiving the note, then show wallet count dropping / capability disappearing.

**Say:**

“The AI requests the capability and states why. The holder sees that reason and approves once. Only now does the payload cross the direct P2P pipe. Immediately after delivery, the capability is consumed and must be re-armed to exist again.”

## 1:45–2:05 — Deny proves the gate

**On screen:** Re-arm a Private Note, request it again, then press **Deny**.

Show ChatGPT reporting denial and the capability remaining available.

**Say:**

“If the holder denies the request, no payload is released — and the capability remains available because denial does not consume it.”

## 2:05–2:30 — Privacy-by-design Page Context

**On screen:** Press **Capture & Arm Page Context**. Ask ChatGPT:

```text
Request the Page Context.
Tell the capability holder I need the sanitized page context for a privacy test.
```

Approve once. Show ChatGPT confirming:

- session code redacted
- URL query and fragment removed
- control-plane UI excluded
- content marked sanitized

**Say:**

“Blink Borrow also sanitizes Page Context before it can even be approved. Session codes, query strings and control-plane UI are removed locally first. Approval is important, but privacy does not rely on approval alone.”

## 2:30–2:45 — Close

**On screen:** Capability lifecycle and **END & FORGET** button. Press END & FORGET if timing allows.

**Say:**

“Blink Borrow models AI access as temporary authority: Discover, Request, Approve, Borrow, Revoke. The human stays in control, the capability is one-time, and the private transport disappears when the session ends.”

**Final on-screen text:**

**Blink Borrow — Temporary Powers for AI Agents**

`https://blink-borrow-webmcp.netlify.app/`

## Recording checklist

Before recording:

- Use a fresh session.
- Confirm `WebMCP available` and `6 registered ✓`.
- Confirm the direct P2P pipe is active before starting the main demo.
- Use a very short Private Note that is safe to show publicly.
- Keep both browsers visible when practical so the human approval moment is obvious.
- Do not expose real secrets, API keys, personal files, email addresses or private browser data.
- Use Page Context only after the privacy-hardened build is deployed.
- If a network reconnect is needed during rehearsal, restart before recording rather than explaining recovery in the final video.

## Optional file capability cutaway

If the main recording is comfortably under 2:30, add a 10–15 second cutaway showing:

1. Small Text File armed on the holder.
2. ChatGPT inspects metadata without contents.
3. ChatGPT requests contents explicitly.
4. Holder approves once.
5. File capability disappears.

This is optional because the Private Note + Page Context sequence already demonstrates the core WebMCP, permission and privacy model clearly within the time limit.
