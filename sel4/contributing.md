# Contributing a patch

> The path of a change into upstream seL4: a pull request from a fork on GitHub, signed-off commits in a fixed message format, astyle-formatted C with SPDX headers, review by committers, and, for the kernel, a proof that still holds.

[Index](../INDEX.md) › [Part 7: Contributing](../INDEX.md#part-7-contributing) · ← [rust-sel4](rust-sel4.md) · [Upstream CI](ci.md) →

Read first: [Source layout](source-layout.md), [Verification](verification.md).

| At a glance | |
|---|---|
| Kind | Process: a pull request from a personal fork, reviewed and merged by a committer |
| Repository | GitHub organisation [`seL4`](https://github.com/seL4) |
| Key source | [`CONTRIBUTING.md`](https://github.com/seL4/seL4/blob/master/CONTRIBUTING.md), `seL4_tools/misc/.gitlint`, `seL4_tools/misc/astylerc` |
| Sign-off | `Signed-off-by` on every commit (DCO); no contributor licence agreement |
| Key numbers | Subject at most 50 characters, body lines 72, C lines 120; at least one approving review |
| Licences | Kernel `GPL-2.0-only`; `libsel4` and user-level libraries `BSD-2-Clause`; documentation `CC-BY-SA-4.0` |
| Built on | [CI](ci.md) checks; an RFC first for large changes ([Governance](governance.md)) |
| Verified | A kernel change is invisible to the proofs or comes with a proof update ([Proof impact](proof-impact.md)) |

## What it is

All seL4 Foundation code lives in the GitHub organisation
[`seL4`](https://github.com/seL4): the kernel (`seL4/seL4`), the proofs
(`seL4/l4v`), `sel4test`, `seL4_tools`, `microkit`, `sddf` and the rest.
A change reaches any of them the same way.

1. **Talk first if it is large.** Bugs and small changes go straight to an
   issue or pull request on the repository. A new kernel feature, an API
   change or an architecture port needs an RFC first (see
   [Governance](governance.md)). Discussion happens on the developer
   mailing list (`devel@sel4.systems`), the Discourse forum, the
   Mattermost chat and a fortnightly open video call; all are linked from
   the Foundation's support page.
2. **Fork, branch, rebase.** Pull requests come from personal forks. The
   workflow is "fork-rebase": no merge commits, and no commits that revert
   earlier commits of the same pull request. A pull request that is for
   comment only is marked Draft and says so.
3. **Sign off every commit.** `git commit -s` adds
   `Signed-off-by: Name <email>`, which declares the Developer Certificate
   of Origin (DCO): you have the right to submit the change under the
   file's licence. It is the same mechanism as Linux, and it applies to
   documentation and proofs too.
4. **Pass the checks** ([CI](ci.md)): commit message lint, whitespace,
   style, licence headers, links, compilation, sel4test in simulation and,
   for the kernel, the "preprocess" check that says whether verified code
   changed.
5. **Review.** Anyone may review. A pull request needs at least one
   approving review and should aim for two if it is not trivial. Only a
   **committer** (a role granted by the Technical Steering Committee) can
   merge.

### Commit messages

The rules are checked by `gitlint` with the configuration in
`seL4_tools/misc/.gitlint`, unless the repository has its own `.gitlint`
(the kernel does not).

| Rule | Value |
|---|---|
| Subject line length | at most 50 characters |
| Body line length | at most 72 characters; lines that are only a URL, `Signed-off-by` or `Co-authored-by` are exempt |
| Words banned from the subject | `wip`, `squash`, `tosquash` |
| Body | may be empty for the linter, but reviewers expect the why |
| Merge commits | ignored by the linter, prohibited by the conventions |
| Subject starting `trivial` | exempt from the body rule |

The subject is in the imperative mood, without a full stop, and by habit
starts with a tag for the area. Recent kernel history uses `arm:`,
`aarch64:`, `x86:`, `riscv:`, `mcs:`, `libsel4:`, `cmake:`, `manual:`,
`tools:`, `github:`, `boot:` and narrower ones such as `x86/vcpu:` or
`pc99/acpi:`; `trivial:` marks a commit with no functional content. The
conventions page capitalises the subject; with a tag, kernel commits
mostly leave the word after the colon in lower case ("check the
repository history and follow it" is the stated rule). The body says why
the change is needed and, if it is not obvious, how it works.

History is reviewed as well as code. Each commit should build and work,
so that `git bisect` stays usable, and should be one logical change: move
a function in one commit and alter it in the next; keep whitespace and
style changes apart from functional ones. Review feedback is added as
extra commits and squashed before merge.

### Code style

C is formatted by `astyle` (version 3.1 is the stated one) with
`seL4_tools/misc/astylerc`: One True Brace Style, four-space indents, no
tabs, braces on every block, `*` attached to the name, lines of at most
120 characters. `seL4_tools/misc/style.sh <files>` applies the right
formatter by file type (C, Python, CMake), `style-changed.sh` does the
modified and untracked files of the working tree, and the C script also rewrites include
guards to `#pragma once`. A `.stylefilter` file in a repository lists
paths the checker skips.

The conventions that formatters cannot check:

- `snake_case` names; a `typedef` for every `struct`, ending `_t`; no
  `typedef` for pointer types; `SCREAMING_SNAKE_CASE` only for
  preprocessor symbols.
- `static inline` functions in place of macros where possible, and only
  `static inline` functions in headers.
- A comment naming the condition after each `#endif`.
- In the kernel: `word_t` for word-sized values; conversions between
  pointers and integer references through the object's macros (`TCB_PTR`,
  `TCB_REF`), not bare casts; a system call's **decode** stage only
  checks and its **invoke** stage only changes state; no dynamic
  allocation (the kernel has no heap: all memory comes from
  [untyped memory](untyped-memory.md) that user level retypes).
- Code that runs only during boot is marked `BOOT_CODE`
  ([Boot code](boot-code.md)).
- Verified code keeps to a restricted C subset
  ([Verified C subset](verified-c-subset.md)).

### Licences

Every file carries a copyright line and an
`SPDX-License-Identifier:` tag, or is covered by the repository's
`.reuse/dep5` file; the licence texts are in `LICENSES/`. The licence
check in CI uses the REUSE tool. Kernel code is `GPL-2.0-only`.
`libsel4`, the system call headers and the user-level libraries are
`BSD-2-Clause`, and the kernel's `LICENSE.md` carries a note, like
Linux's, that making system calls does not make user code a derived
work. Documentation is `CC-BY-SA-4.0`. A new file takes the licence of
its neighbours, with the contributor's own copyright line.

## In seL4

What differs for the kernel repository:

- **Proofs.** `CONTRIBUTING.md` requires that a change to `master` is
  either invisible to the proofs (comments, documentation, an unverified
  platform or option) or comes with a proof update in `l4v`. The
  `preprocess` check decides the first case mechanically; reviewers add
  the label `verification` when a proof change is needed and can add
  `proof-test` to run the C proofs against the pull request. A change may
  be proposed without proofs but is not merged until they exist. See
  [Proof impact](proof-impact.md) for how to judge this before sending.
- **Tests.** Changes should pass `sel4test`; a new feature or platform
  adds tests there, in a linked pull request ([sel4test](sel4test.md)).
- **Hardware.** Simulation runs on every pull request. Runs on the
  Foundation's boards happen only when a reviewer adds `hw-build`,
  `hw-test` or `hw-bench`, because they need secrets a fork does not
  have.
- **Platforms.** A new board on an architecture that is already supported
  needs no RFC, but the Foundation asks for a named maintainer and has
  its own checklist ([Platform port](platform-port.md)).
- **Change log.** A comment at the top of `CHANGES.md` asks kernel
  engineers to add an entry there for every change to code (not for
  documentation or comments), at the end of the list for the upcoming
  release; such commits are often tagged `CHANGES:`.

A first pull request description should give: why the change is needed,
how it works, what was tested and on which machines, links to companion
pull requests in other repositories, and a statement of proof impact.

## Gotchas

- **Slow is normal for the kernel.** The guidelines say quality
  requirements are highest for kernel contributions and that user-level
  repositories move faster. Bump a quiet pull request after a couple of
  days; proof-affecting ones wait for the verification team.
- **Style-only pull requests are unwelcome.** The pull request guide says
  cleaning up style alone is not a sufficient reason for a change; tidy
  only what the change touches anyway, in a separate commit.
- **The linter counts the tag.** `x86/vcpu: ` uses ten of the fifty
  characters.
- **Pushes after approval.** Once approved, push only history edits and
  trivial fixes, and say what changed.
- **Checks on a fork's pull request are partial.** Hardware runs, the
  proof run and anything that deploys need a maintainer's label or run
  only after merge ([CI](ci.md)).
- **DCO is not a CLA.** There is no contributor licence agreement to
  sign; the sign-off line is the whole of it. The Foundation's DCO page
  says the repositories are configured to accept only pull requests in
  which every commit is signed off.

## See also

- [CI](ci.md): what each check runs and how to reproduce it
- [Proof impact](proof-impact.md): judging whether a change touches verified code
- [Governance](governance.md): roles, the TSC and the RFC process
- [Platform port](platform-port.md): the extra steps for a new board
- [Verified C subset](verified-c-subset.md): what verified kernel code may not do
- [Boot code](boot-code.md): the `BOOT_CODE` marking

## References

- [seL4 `CONTRIBUTING.md`](https://github.com/seL4/seL4/blob/master/CONTRIBUTING.md):
  bisectable small commits, sel4test, the proof condition, DCO.
  *Checked 2026-11-14.*
- [Contributing to seL4](https://sel4.systems/Contribute/guidelines.html):
  where contributions go, when an RFC is needed, who merges.
  *Checked 2026-11-14.*
- [Git conventions](https://sel4.systems/Contribute/git-conventions.html):
  message format, `trivial:`, no merge or revert commits.
  *Checked 2026-11-14.*
- [Pull requests](https://sel4.systems/Contribute/pull-requests.html):
  description contents, review counts, required tests, the labels
  `hw-build`, `hw-test`, `hw-bench`, `proof-test`, `verification`.
  *Checked 2026-11-14.*
- [Coding conventions](https://sel4.systems/Contribute/style.html):
  astyle 3.1, naming, kernel and verification requirements.
  *Checked 2026-11-14.*
- [`seL4_tools/misc/.gitlint`](https://github.com/seL4/seL4_tools/blob/master/misc/.gitlint)
  and [`astylerc`](https://github.com/seL4/seL4_tools/blob/master/misc/astylerc):
  the enforced limits and formatter options. *Checked 2026-11-14.*
- [`ci-actions/gitlint/steps.sh`](https://github.com/seL4/ci-actions/blob/master/gitlint/steps.sh):
  falls back to the `seL4_tools` configuration when a repository has no
  `.gitlint`. *Checked 2026-11-14.*
- [seL4 `LICENSE.md`](https://github.com/seL4/seL4/blob/master/LICENSE.md):
  GPLv2 kernel, BSD user level, the system call note.
  *Checked 2026-11-14.*
- [Help and open source support](https://sel4.systems/support.html):
  mailing list, Discourse, Mattermost, the fortnightly hangout.
  *Checked 2026-11-14.*
- [Developer Certificate of Origin](https://developercertificate.org/):
  the text the sign-off declares (version 1.1). *Checked 2026-11-14.*
- [Developer Certificate of Origin (DCO)](https://sel4.systems/Contribute/dco.html)
  on the Foundation's site: no other agreement, how sign-off is
  enforced. *Checked 2026-11-14.*
- [seL4 `CHANGES.md`](https://github.com/seL4/seL4/blob/master/CHANGES.md),
  the comment at the top: when to add an entry. *Checked 2026-11-14.*
