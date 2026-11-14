# Diagrams

SVG diagrams used by the pages, drawn by hand in a shared style. A page
embeds one with `![alt text](../images/<page>-<what>.svg)` and puts a
caption in italics on the next line. `ci/check` requires every file here
to be well-formed, to carry a `<title>`, and to be used by a page.

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
- Render it and look before committing (text that overflows its box is
  the usual fault):

      chromium --headless --no-sandbox --screenshot=/tmp/x.png \
          --window-size=760,<height> images/<file>.svg

## Style

Every file starts from this skeleton. The width is always 760; choose the
height to fit. The white background keeps it legible on GitHub's dark
theme.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 300" width="760" height="300" role="img">
  <title>Short title</title>
  <desc>One or two sentences saying what the diagram shows.</desc>
  <style>
    text { font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 14px; fill: #1f2328; }
    .small { font-size: 12px; }
    .head { font-weight: 600; }
    .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 13px; }
    .dim { fill: #57606a; }
    .hw { fill: #ddebff; stroke: #3b6bb5; }
    .fw { fill: #eee3fb; stroke: #7a52b3; }
    .kernel { fill: #ffe8cc; stroke: #b86e14; }
    .user { fill: #dcf3e1; stroke: #3d8a50; }
    .data { fill: #f3f4f6; stroke: #6e7781; }
    .hw, .fw, .kernel, .user, .data { stroke-width: 1.5; }
    .line { stroke: #1f2328; stroke-width: 1.5; fill: none; }
    .dash { stroke-dasharray: 5 4; }
    .accent { stroke: #cf222e; }
    .accent-fill { fill: #cf222e; }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#1f2328"/>
    </marker>
  </defs>
  <rect width="760" height="300" fill="#ffffff"/>
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

Red (`accent`) marks the one thing the diagram is about, sparingly.

Other conventions:

- Boxes have `rx="6"`. Arrows are `class="line"` with
  `marker-end="url(#arrow)"`; a dashed line is something indirect or
  optional. A red arrow needs a red head: add a second marker,
  `arrow-accent`, the same shape filled `#cf222e`.
- Text is 14 px (12 px for `small`), never smaller. Allow 7.5 px a
  character for 14 px text and 8 px for `mono`, plus 10 px padding each
  side of a box.
- Code names (registers, functions, fields) are `mono`.
- At most about a dozen boxes. If it needs more, it is two diagrams.
- No text outside the 760-wide canvas, and 16 px clear at each edge.
