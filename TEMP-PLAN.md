# Temporary Plan

## Ultra-Wide Post Editor Breakout

- Goal: when the viewport is genuinely wide, let the Markdown editor and Preview together use roughly twice the standard container width, while keeping the rest of the page on the normal `container-lg` rhythm.
- Constraint: do not destabilize the header, footer, page notices, validation messages, or the mobile / narrow-screen layout.
- Candidate approach: keep the form in the normal container, but let only the editor grid opt into a controlled breakout width with a dedicated wrapper and explicit max-width clamp.
- Candidate approach: use a centered editor-only wrapper such as `width: min(200vw, <safe max>)` logic translated into CSS with clamp and calc, instead of letting the whole page body escape the container.
- Validation needed later: desktop widths around 1440, 1680, 1920, and mobile / tablet regression for pane toggling and overflow behavior.
- Not implemented in the current change set.