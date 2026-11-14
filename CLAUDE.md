# sel4-kb

A knowledge base of concepts met in seL4 work, one page each. Its readers
are Tim, learning the material well enough to defend patches upstream, and
Claude sessions looking a concept up. Accuracy beats coverage: a confident
wrong page teaches the wrong thing to both.

## Pages

- One concept per page, in `concepts/` (hardware, generic OS) or `sel4/`
  (seL4, Microkit, sDDF, rust-sel4). File names are lower case with
  hyphens: `lapic-timer.md`.
- Follow `TEMPLATE.md`: a title, a one-sentence summary in a `>` line,
  then the sections in its order. `ci/check` enforces this.
- Every page has a line in `INDEX.md` under the right group, carrying the
  page's summary sentence.
- Link related pages to each other with relative links, in both
  directions. A page that mentions a concept with its own page links to it
  the first time.
- Pages here link only to this repository and to public sources. Project
  findings (boot logs, dossiers, notes) live in their projects and link
  here; a page may state a finding as a fact about a machine ("Compute
  Engine's x86 types have no HPET") without pointing at the project.
- `## My notes` belongs to Tim. Leave it and everything under it as it is.

## References

Cite primary sources first (datasheets, architecture manuals,
specifications, the source code), then good secondary ones (OSDev wiki,
Linux kernel documentation, papers). Give the section where it helps.

Mark every reference:

- *Checked YYYY-MM-DD.* You opened it that day and it says what the page
  uses it for, section numbers included.
- *Unchecked.* Anything else, including a link you only saw resolve, and
  sites that refuse scripted fetches (wiki.osdev.org, intel.com,
  developer.arm.com, uefi.org); say so in a few words.

A claim from memory that no checked reference supports gets "(unchecked)"
after it in the text.

## Changes

- Run `ci/check` before committing; it must pass.
- Commit small, one topic per commit, with a plain message ("kb: HPET
  page", "kb: PIT: emulated counts can rise after a reload"). Never add
  `Signed-off-by`, and never bypass the pre-commit secret scan.
- Pushing needs Tim's say-so.

Use the `/kb` skill to write or refresh a page.
