# seL4 Knowledge Base

A knowledge base for seL4 work: one page per concept, linked to each other
and out to primary sources. It covers the hardware and OS ideas that seL4
work keeps running into (the PIT, the HPET, the TSC, the GIC, ACPI, MSI-X)
and seL4's own (MCS, capabilities, Microkit, sDDF).

Read it at **<https://timretout.github.io/sel4-kb/>**, or start at
[INDEX.md](INDEX.md) here.

It is written to explain things, and to be read by Claude Code sessions as
well as by people. Pages are written with Claude Code, which also adds to
them as work turns up new concepts; see `CLAUDE.md`. Every reference says
whether it was checked against its source, and a claim no checked source
supports is marked "(unchecked)". Corrections are welcome as issues or
pull requests.

This is an unofficial reference, not affiliated with or endorsed by the
seL4 Foundation. seL4 is a trademark of LF Projects, LLC.

## Licence

To the extent possible under law, Tim Retout has waived all copyright and
related rights to this knowledge base: its text, diagrams, website and
scripts are dedicated to the public domain under
[CC0 1.0 Universal](LICENSE). Copy and reuse them freely, with or without
credit. Linked sources and quoted names remain their owners'.

## Layout

    INDEX.md      every page, one line each, in reading order
    GLOSSARY.md   terms and abbreviations, with the page for each
    TEMPLATE.md   the shape of a page
    concepts/     hardware and generic OS ideas
    sel4/         seL4, Microkit, sDDF and rust-sel4 ideas
    claude/       the /kb skill
    images/       SVG diagrams, and their style guide
    ci/check      link and structure check
    ci/sync-index copy page summaries into INDEX.md, and each page's
                  breadcrumb line (part, group, previous, next) into it
    _config.yml, _layouts/, assets/
                  the website: layout, stylesheet and script

## What belongs here

Things that are true whatever project you are in: what a device is, how it
behaves, where seL4 touches it, what goes wrong with it, and where to read
more. Findings from particular projects (boot logs, patch dossiers, notes
on a machine) live in those projects and link here. Nothing here links
back to them, so this repository stands on its own.

## Shape of a page

Every page opens the same way: a one-sentence summary, a breadcrumb line
(where the page sits in the course, with the pages before and after), the
pages to read first, and an "At a glance" table of the facts someone
returning to the page wants (what kind of thing it is, how it is reached,
the numbers, where seL4's code for it lives). Then: What it is, In seL4,
Gotchas, See also, References. Diagrams are SVG, in one style
with one colour code (blue hardware, purple firmware and hypervisors,
orange the seL4 kernel, green user level, grey data).

## Reading it

On the web: <https://timretout.github.io/sel4-kb/>, laid out for phones
as well as desktops, with a search box over the index and the glossary.
GitHub Pages builds it with Jekyll from `main` on every push; the pages
themselves stay plain Markdown with no front matter. To preview it
locally, `bundle install` then `bundle exec jekyll serve`.

The pages also render on GitHub itself with working links. To edit, open
a page there and use the pencil button, or press `.` anywhere in the
repository for the browser editor (github.dev), which can change several
files in one commit.

Locally, any Markdown viewer works: VS Code, or Obsidian opened on this
directory (its graph view shows how the pages connect). Links are plain
relative Markdown links, so they work everywhere.

GitHub runs `ci/check` on every push, web edits included; a red cross on
the commit means a broken link or a page off the template.

## Checking it

    ci/check

reports broken relative links, pages missing from the index, pages that
do not follow the template or lack an infobox, stale breadcrumb lines,
references with no checked or unchecked mark, and diagrams that are
malformed or unused.
