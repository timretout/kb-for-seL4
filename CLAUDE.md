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
  page's summary sentence. `INDEX.md` is arranged as a course, in reading
  order; `ci/sync-index` copies every page's summary into it.
- A page whose summary starts "Stub:" is planned and unwritten. Writing
  it means replacing the whole stub, summary included.
- Under the summary comes the breadcrumb line, which starts with a link
  to the index: the page's part and group in `INDEX.md` and the pages before and after
  it in the course. `ci/sync-index` writes it; never edit it by hand. To
  move a page, move its line in `INDEX.md` and run `ci/sync-index`.
- Under that a page may carry one line, "Read first:" and relative links,
  naming the pages it builds on.
- Then the infobox: a two-column table headed `| At a glance | |`, of at
  most eight rows, for the reader who wants the facts without the
  explanation. See "Infobox" below.
- In `sel4/` pages, "What it is" explains the concept and its API as a
  user of the kernel sees it, and "In seL4" says where it lives in the
  source (files, functions, configuration options) and how it is
  implemented.
- The reader knows C and operating systems as a long-time Linux user
  does, and has followed seL4 from a distance, but has not studied x86,
  Arm or RISC-V. Define each term of art on first use or link the page
  that does. Aim for the depth a new contributor needs to read the
  relevant kernel code and review a patch to it: typically 800 to 2000
  words, with the numbers, register and function names that matter.
- `GLOSSARY.md` lists terms and abbreviations, each with a link to the
  page that explains it. Add a page's new terms to it.
- Link related pages to each other with relative links, in both
  directions. A page that mentions a concept with its own page links to it
  the first time.
- Pages here link only to this repository and to public sources. Project
  findings (boot logs, dossiers, notes) live in their projects and link
  here; a page may state a finding as a fact about a machine ("Compute
  Engine's x86 types have no HPET") without pointing at the project.
- `## My notes` belongs to Tim. Leave it and everything under it as it is.

## Infobox

The "At a glance" table restates facts from the page's own text; it never
holds a fact the text lacks, and a fact marked "(unchecked)" in the text
is left out or keeps its mark. Leave a row out when the page does not say.
Values are a few words, with code names in backticks and links where a
page exists. The first row is always **Kind**. Choose the rest from these,
in this order, so that pages of a kind can be compared:

- `concepts/` pages: Kind, Architecture, Introduced, Reached through
  (I/O ports, MMIO, system registers, an instruction, a PCI BAR), Found
  through (an ACPI table, a device tree node, a CPUID bit, fixed by
  convention), Interrupt, Key numbers, seL4 code, seL4 config, seL4 use,
  On the clouds.
- `sel4/` pages: Kind (kernel object, kernel mechanism, build option,
  tool, library, framework, process), Repository, Key source, Config
  options, API (the main system calls or invocations), Object size, Built
  on, Used by, Verified (what the proofs cover of it).

A page that fits neither list (a survey, a history) takes Kind and
whatever three or four rows a reader would look up.

## Diagrams

SVG files in `images/`, one house style, rules in
[images/README.md](images/README.md). The rule that matters most: a
diagram shows only what the page's text states. Give each a sentence of
alt text and a caption in italics below it. Render a diagram and look at
it before committing.

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

Tim also edits pages in GitHub's web editor, so `origin` (the private
repository `timretout/sel4-kb`) can be ahead of this checkout.

- Run `git pull --rebase` before editing.
- Run `ci/check` before committing; it must pass.
- Commit small, one topic per commit, with a plain message ("kb: HPET
  page", "kb: PIT: emulated counts can rise after a reload"). Never add
  `Signed-off-by`, and never bypass the pre-commit secret scan.
- Pushing needs Tim's say-so. End by saying how many commits are
  unpushed, so the web view is not silently behind.

Use the `/kb` skill to write or refresh a page.
