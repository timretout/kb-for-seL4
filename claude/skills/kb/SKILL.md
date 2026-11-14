---
name: kb
description: Write, refresh or check a page of the seL4 knowledge base (sel4-kb). Use when asked to add a concept to the knowledge base, explain a hardware or seL4 concept for keeps, or when work turns up a concept or gotcha the knowledge base lacks.
---

The knowledge base is `sel4-kb` (at `~/src/sel4/sel4-kb`). Its
`CLAUDE.md` holds the rules for pages and references; read it first.

Argument: a concept ("HPET", "MSI-X"), a page path, or "check". With
none, take the first page marked "Stub" in `INDEX.md`.

## Writing or refreshing a page

1. Search first: `grep -ril <term> sel4-kb` and `INDEX.md`. If a page
   covers it, refresh that page; if the concept is part of a broader
   page, add a section there instead of a new page.
2. Gather from primary sources: the datasheet or specification, then the
   seL4 source on GitHub (upstream `master`, not a local branch). Open
   each one you cite. Project findings in the session's workspace (notes,
   boot logs) may supply Gotchas, stated as facts about the machine.
3. Write from `TEMPLATE.md`. Explain for someone who knows C and
   operating systems but not this device: the reason it exists comes
   before the register detail. Mark every reference *Checked* or
   *Unchecked* by the rules in `CLAUDE.md`, and put "(unchecked)" after
   any claim no checked reference supports.
4. Link it: relative links to related pages, in both directions; its
   summary line in `INDEX.md` under the right group (`ci/sync-index`
   refreshes summaries); its terms in `GLOSSARY.md`. For a concept the
   page leans on that has no page, add a stub and its index line.
5. `ci/check` passes. Commit in `sel4-kb` alone ("kb: <page>: <what>").

Done when the page passes `ci/check`, every reference carries a mark,
and every related page links to it.

## Checking

Run `ci/check`. Then read the pages named, or every page if none: look
for claims the cited sources do not support, pages gone stale against
upstream seL4, and *Unchecked* references that can now be opened. Report
what you would change; change it only if asked.
