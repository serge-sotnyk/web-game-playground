<!--
Implementer session prompt.

Substitute both placeholders before pasting:
  {{LETTER}}  →  the plan's letter, "a" or "b" (the first character of the cell)
  {{CELL}}    →  the cell id: "a1", "a2", "b1", or "b2"

So cell a1 → LETTER=a, CELL=a1 ; cell b2 → LETTER=b, CELL=b2.

Paste EVERYTHING BELOW the divider into the session. Do not paste this comment.
The clone contains AGENTS.md and exactly one plan (no sibling variants). Run the
four implementer sessions independently — carry nothing from one into another,
not a bug fix, not a hint, not a rephrasing. Every exchange beyond this prompt
is an intervention — log it per cell.
-->

---

You are the **implementer** for this round. Read `AGENTS.md` first.

Your plan is `docs/plans/plan-{{LETTER}}.md`. Build it into
`experiments/flappy/{{CELL}}/`, and touch nothing outside that directory.

Record every deviation from the plan in
`experiments/flappy/{{CELL}}/NOTES.md`: what the plan said, what you did, why.
Commit and push when the definition of done in `AGENTS.md` is met.
