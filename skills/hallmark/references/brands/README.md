# Brands — a swappable accent layer over the theme catalog

A brand file locks an organisation's identity into every Hallmark build without
forking the skill or becoming a 22nd theme. Brand and theme stay orthogonal:

| Concern | Owner |
| --- | --- |
| Macrostructure, section rhythm, paper band, display style, spacing, motion | **theme** (unchanged) |
| Accent hue (and its deep / wash / focus variants), the wordmark glyph, optional display/body face | **brand** (overrides the theme's accent tokens) |
| Every slop-test gate | fires unchanged either way |

## How a brand activates

Pre-flight signal 6 ([`preflight.md`](../preflight.md)): a `brand.css` at the
project root, `--brand-*` custom properties in any stylesheet, or a `brand:`
field in `design.md`. When it fires, the pre-flight block reports it and
SKILL.md § 2.6's **brand-lock clause** applies: the theme still picks structure
and paper band; the accent comes from the brand file; diversification runs on
the remaining two axes (paper band · display style) only.

## Authoring a brand file

One file, token block only, no prose beyond the header comment:
`references/brands/<name>.css` (vendored into a project as `brand.css`).

Required tokens: `--brand`, `--color-accent`, `--color-accent-ink`,
`--color-accent-deep`, `--color-accent-wash`, `--color-focus`. Provide a
`[data-paper="dark"]` block whenever the brand will meet dark-paper themes —
most corporate accents need a lightness lift there (hold the hue).

## Preconditions — not advice

1. **Contrast is a hard gate.** Any accent that will carry text must reach
   **4.5:1** against every paper token it sits on (3:1 for large text and UI
   edges, WCAG 2.x). The mechanical check runs in `tools/verify/gates.mjs`
   (gate B1) — a brand file that fails does not ship. Compute it; don't
   eyeball it.
2. **State your provenance.** The header comment names the design-system
   source and the date the values were verified. A brand file with no source
   is a guess wearing a token block.
3. **Decorative-only colours must say so.** If a brand colour cannot carry
   text (the LPG wordmark orange at 2.94:1 on white is the canonical example),
   the file constrains it by name (`--brand-plus`, "wordmark only") rather
   than leaving a tempting `--color-accent-2` lying around.
4. **Mind the status ramp.** If the platform renders status colours, exclude
   the brand hue's neighbourhood from status use (DESIGN-004 reserves hue
   190–230 for LPG blue) and never let a decorative brand colour share a hue
   with a semantic state.
