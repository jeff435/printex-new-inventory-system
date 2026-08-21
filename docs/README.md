# Reference documents

**Printex_Engineers_Parts_Inventory.xlsx / .pdf** — the parts register
transcribed from six photographs of the handwritten book. 134 parts across
Columns A–F.

These are the *source of truth for the import*, not a live view. The seeded
database diverges from them the moment stock moves. Treat them as the opening
balance and an audit trail back to the original photographs.

Both carry a transcription-notes section listing entries where the handwriting
was unclear. Worth resolving before the data is relied on commercially:

- **Feeder Sucker Rod (C)** — $10 buying against KSh 100 selling; inverted margin
- **Rubber Sucker 45×13×0.8 / 45×13×1 (C)** — $10 buying, but comparable
  suckers are $0.10–$0.30, so a decimal may be missing
- **Tapered Pin 00.540.0081 (E)** — middle digits ambiguous, could be 00.500.0081
- **Diaphragm Clips "CPI" / Friction Wheels "CPh" (B)** — trailing letters unclear
- **Cam Follower F-237858.01 (D)** — quantity and both prices blank

31 parts had no selling price recorded. They import at zero with
`needs_pricing = true` and cannot be sold until priced — enforced by a database
check constraint, not just the UI.
