# sel4-kb

A knowledge base for seL4 work: one page per concept, linked to each other
and out to primary sources. It covers the hardware and OS ideas that seL4
work keeps running into (the PIT, the HPET, the TSC, the GIC, ACPI, MSI-X)
and seL4's own (MCS, capabilities, Microkit, sDDF).

It is written to explain things, and to be read by Claude Code sessions as
well as by people. Sessions add pages as they work; see `CLAUDE.md`.

Start at [INDEX.md](INDEX.md).

## Layout

    INDEX.md      every page, one line each, grouped
    TEMPLATE.md   the shape of a page
    concepts/     hardware and generic OS ideas
    sel4/         seL4, Microkit, sDDF and rust-sel4 ideas
    claude/       the /kb skill
    ci/check      link and structure check

## What belongs here

Things that are true whatever project you are in: what a device is, how it
behaves, where seL4 touches it, what goes wrong with it, and where to read
more. Findings from particular projects (boot logs, patch dossiers, notes
on a machine) live in those projects and link here. Nothing here links
back to them, so this repository stands on its own and could be published.

## Reading it

On the web: <https://github.com/timretout/sel4-kb> (private). Pages
render with working links. To edit, open a page and use the pencil
button, or press `.` anywhere in the repository for the browser editor
(github.dev), which can change several files in one commit.

Locally, any Markdown viewer works: VS Code, or Obsidian opened on this
directory (its graph view shows how the pages connect). Links are plain
relative Markdown links, so they work everywhere.

GitHub runs `ci/check` on every push, web edits included; a red cross on
the commit means a broken link or a page off the template.

## Checking it

    ci/check

reports broken relative links, pages missing from the index, pages that
do not follow the template, and references with no checked or unchecked
mark.
