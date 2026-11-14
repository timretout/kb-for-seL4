# Diagrams

SVG diagrams used by the pages, drawn by hand in a shared style. A page
embeds one with `![alt text](../images/<page>-<what>.svg)` and puts a
caption in italics on the next line. `ci/check` requires every file here
to be well-formed, to carry a `<title>` and a dark palette, and to be
used by a page.

## Rules

- **A diagram shows only what its page's text states.** It is a second
  view of checked prose, never a place for new facts. If the text changes,
  the diagram changes with it.
- Draw one where a picture carries structure that prose makes hard:
  a layout in memory or in a register, a chain of stages, who sends what
  to whom and in what order, who owns what. A list or a table that already
  works needs no picture.
- Name the file after its page: `pit-mode2.svg` for `concepts/pit.md`.
- The alt text says what the diagram shows in a sentence, for readers
  (and Claude sessions) who get only the text.
- Render it in both themes and look before committing (text that
  overflows its box is the usual fault); `--force-dark-mode` gives the
  dark one:

      chromium --headless --no-sandbox --screenshot=/tmp/x.png \
          --window-size=760,<height> images/<file>.svg
      chromium --headless --no-sandbox --force-dark-mode \
          --screenshot=/tmp/x-dark.png \
          --window-size=760,<height> images/<file>.svg

## Style

Every file starts from this skeleton. The width is always 760; choose the
height to fit.

Each diagram works in GitHub's light and dark themes. Colours are CSS
variables, set once for light and again under
`@media (prefers-color-scheme: dark)`; GitHub's theme reaches an SVG shown
through `<img>` that way. Never write a hex colour anywhere else in the
file: use a class, or `style="fill: var(--bg)"` for a one-off (a
presentation attribute such as `fill="..."` cannot hold `var()`). The
background rectangle is `var(--bg)`, so a box that should look like the
page behind it, or a label that blanks out a line under it, uses
`var(--bg)` too.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 300" width="760" height="300" role="img">
  <title>Short title</title>
  <desc>One or two sentences saying what the diagram shows.</desc>
  <style>
    svg { --bg: #ffffff; --fg: #1f2328; --dim: #57606a; --accent: #cf222e; --hw-fill: #ddebff; --hw-stroke: #3b6bb5; --fw-fill: #eee3fb; --fw-stroke: #7a52b3; --kernel-fill: #ffe8cc; --kernel-stroke: #b86e14; --user-fill: #dcf3e1; --user-stroke: #3d8a50; --data-fill: #f3f4f6; --data-stroke: #6e7781; --data-filled: #c8d1da; }
    @media (prefers-color-scheme: dark) { svg { --bg: #0d1117; --fg: #e6edf3; --dim: #9198a1; --accent: #ff7b72; --hw-fill: #112d52; --hw-stroke: #58a6ff; --fw-fill: #2c1f4a; --fw-stroke: #b48aff; --kernel-fill: #3d2812; --kernel-stroke: #e3a250; --user-fill: #13301c; --user-stroke: #56c26e; --data-fill: #21262d; --data-stroke: #8b949e; --data-filled: #484f58; } }
    text { font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; fill: var(--fg); }
    .small { font-size: 12px; }
    .head { font-weight: 600; }
    .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 13px; }
    .dim { fill: var(--dim); }
    .hw { fill: var(--hw-fill); stroke: var(--hw-stroke); }
    .fw { fill: var(--fw-fill); stroke: var(--fw-stroke); }
    .kernel { fill: var(--kernel-fill); stroke: var(--kernel-stroke); }
    .user { fill: var(--user-fill); stroke: var(--user-stroke); }
    .data { fill: var(--data-fill); stroke: var(--data-stroke); }
    .hw, .fw, .kernel, .user, .data { stroke-width: 1.5; }
    .line { stroke: var(--fg); stroke-width: 1.5; fill: none; }
    .dash { stroke-dasharray: 5 4; }
    .accent { stroke: var(--accent); }
    .accent-fill { fill: var(--accent); }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" style="fill: var(--fg)"/>
    </marker>
  </defs>
  <rect width="760" height="300" style="fill: var(--bg)"/>
  <!-- content -->
</svg>
```

Colour says what kind of thing a box is, the same in every diagram:

| Class | Colour | Meaning |
|---|---|---|
| `hw` | blue | hardware: a device, a register, a CPU |
| `fw` | purple | firmware, boot loader or hypervisor |
| `kernel` | orange | the seL4 kernel and its objects |
| `user` | green | user level: root task, drivers, protection domains |
| `data` | grey | memory, tables, files, anything neutral |

`--data-filled`, a darker grey, marks used slots in a row of `data` cells.

Red (`accent`) marks the one thing the diagram is about, sparingly.

Other conventions:

- Boxes have `rx="6"`. Arrows are `class="line"` with
  `marker-end="url(#arrow)"`; a dashed line is something indirect or
  optional. A red arrow needs a red head: add a second marker,
  `arrow-accent`, the same shape with `style="fill: var(--accent)"`.
- Text is 14 px (12 px for `small`), never smaller. Allow 7.5 px a
  character for 14 px text and 8 px for `mono`, plus 10 px padding each
  side of a box.
- Code names (registers, functions, fields) are `mono`.
- At most about a dozen boxes. If it needs more, it is two diagrams.
- No text outside the 760-wide canvas, and 16 px clear at each edge.
