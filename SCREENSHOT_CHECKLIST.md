# Blink Borrow — Screenshot Checklist

Use clean, readable screenshots with no personal data, API keys, private messages, or unrelated browser tabs visible.

## Required hero screenshots

1. **Home / project identity**
   - Blink Borrow title
   - tagline: “Let AI borrow a capability. Take it back when you're done.”
   - WebMCP badge visible
   - Create / Join choices visible

2. **Connected Agent-side Capability Wallet**
   - `Connected P2P ✓`
   - `DIRECT P2P PIPE ACTIVE`
   - `6 registered ✓`
   - lifecycle bar visible
   - at least one capability shown in the Remote Manifest

3. **Human approval moment**
   - Capability Holder side
   - live capability request visible
   - AI reason visible
   - **Deny** and **Approve once** buttons visible
   - no real secret in the payload

4. **Successful one-time borrow**
   - ChatGPT response showing an approved capability result
   - ideally use a harmless Private Note or small JSON payload
   - if possible, show the capability wallet count decreasing afterward

5. **Deny path**
   - ChatGPT reports the holder denied the request
   - capability remains available
   - demonstrates that denial releases nothing and does not consume the capability

6. **Small Text File — metadata only**
   - ChatGPT shows file MIME / size / filename if available
   - explicit confirmation that contents were not requested

7. **Small Text File — approved contents**
   - ChatGPT shows a harmless JSON/TXT result after holder approval
   - capability consumed after approval

8. **Sanitized Page Context**
   - ChatGPT confirms:
     - session code redacted
     - query / fragment removed
     - control-plane UI excluded
     - content marked sanitized

9. **Revocation / END & FORGET**
   - Agent side after session end
   - disconnected/revoked state visible

## Best 4 images for Devpost gallery

If only a few screenshots are allowed, prioritize:

1. Connected Agent-side Capability Wallet
2. Holder approval card
3. ChatGPT successful one-time borrow
4. Sanitized Page Context privacy confirmation

These four together explain the entire product story without requiring judges to read much text.

## Framing tips

- Keep the Blink Borrow UI large enough to read.
- Avoid excessive browser chrome when cropping.
- Preserve the ChatGPT prompt and result when it proves real WebMCP use.
- For the approval screenshot, show the reason text clearly.
- Use the same visual session for related screenshots when possible.
- Do not show a real session code in public screenshots unless the session is already destroyed; safer option is to crop or blur it.
- Do not show private Blink Bridge source code or unrelated Kanverse project internals.

## Suggested filenames

- `01-blink-borrow-home.png`
- `02-p2p-capability-wallet.png`
- `03-human-approval.png`
- `04-webmcp-approved-borrow.png`
- `05-denied-no-release.png`
- `06-file-metadata-only.png`
- `07-file-approved-once.png`
- `08-sanitized-page-context.png`
- `09-end-and-forget.png`
