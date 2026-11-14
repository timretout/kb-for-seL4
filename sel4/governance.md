# Governance: the seL4 Foundation, the TSC and RFCs

> Who decides what goes into seL4: the seL4 Foundation's Technical Steering Committee sets process and grants the reviewer and committer roles, and substantial changes pass through a public RFC before any pull request is accepted.

Read first: [Contributing a patch](contributing.md).

## What it is

### The Foundation

The **seL4 Foundation** owns the seL4 trademark and hosts the code and
proofs in the GitHub organisation `seL4`. It was set up in 2020 as a
project under the Linux Foundation (unchecked year). As of November 2026
its website says it is established as a Swiss association with the legal
name "seL4 International", and the members page says it is "transitioning
from being hosted by the Linux Foundation to being its own organisation".
During the transition some policies (the trademark guidelines, for one)
still refer to LF Projects, LLC.

It has two bodies:

| Body | Does | Governed by |
|---|---|---|
| Governing Board | outreach, funds, protecting the brand | the Fund Charter |
| Technical Steering Committee (TSC) | all technical matters: direction, code of conduct, procedures, quality control | the Technical Charter |

Members are organisations, in tiers: Premium (NIO), General (among them
Apple, DornerWorks, Gapfruit, Kry10, Proofcraft, RTX) and Associate
(universities and non-profits such as the Australian National University
and ETH Zurich). Membership funds the Foundation; it does not buy commit
rights. Some members are also "Endorsed Service Providers", companies the
Foundation lists for commercial seL4 work.

### The TSC and the roles

The TSC is a committee of kernel developers, proof engineers and
technical leads. In November 2026 it has thirteen members, chaired by
Gerwin Klein (Proofcraft); the others are from Proofcraft, UNSW, Kry10
and NIO, plus two unaffiliated. Its meetings are public, with minutes on
the TSC page, and many decisions are taken by email vote between
meetings (the page records nine meetings between 2020 and December 2025).

Development roles, all but the first granted by TSC vote on a nomination
emailed to the chair:

| Role | Can | 
|---|---|
| Contributor | open issues and pull requests; anyone |
| Reviewer | review and approve pull requests, be assigned issues; member of the GitHub organisation, no merge rights |
| Committer | merge pull requests; push access to the repositories |
| System admin | administer the organisation and CI |
| TSC member | vote on direction, process, roles and RFCs; has at least committer access |

The route to a role is sustained, visible contribution: the roles page
says reviewers are typically already active contributors. The recorded
votes show the usual progression of reviewer, then committer, then TSC
over some years.

Who maintains what, in practice (unchecked beyond the affiliations listed
on the roles and TSC pages):

- **Proofcraft**: the proofs (`l4v`) and the verified kernel
  configurations; its engineers form most of the GitHub `verification`
  team that judges proof impact.
- **UNSW Trustworthy Systems**: where seL4 was created (as NICTA, later
  Data61); now Microkit, sDDF, LionsOS and much kernel work. sDDF and
  LionsOS live in UNSW's own organisation `au-ts`, outside the
  Foundation's process.
- **Kry10**, **DornerWorks**, **NIO** and individuals: platform ports,
  kernel features, reviews.

### The RFC process

A **Request for Comments** is a design document proposed as a pull
request to [`seL4/rfcs`](https://github.com/seL4/rfcs). The README lists
what must go through it:

- adding an architecture to the kernel, or removing a platform;
- a new kernel API feature, object type, capability type or invocation,
  or removing one;
- changing the user-facing model of Microkit or CAmkES;
- adding or removing a repository the Foundation maintains;
- changing the versioning scheme.

And what need not: bug fixes, clarifications, refactoring that affects
neither function nor verification, a driver in an existing layer, changes
to sel4test or sel4bench. A new platform on a supported architecture
"usually does not need" one. A small, clearly beneficial API change can
be a plain pull request that asks the TSC for an exemption.

```
pull request to seL4/rfcs  ("under discussion", anyone comments)
        |
        v  TSC decision, with a written disposition
  +-----+----------+-----------+-----------+----------+
  |                |           |           |          |
approve      stage 1 approval  postpone   defer     reject
  |          (build a          (closed,   (approved,
  v           candidate,       label      not now)
merged into   then re-review)  postponed;
src/active                     anyone may
  |                            adopt it)
  v  implementation merged
src/implemented
```

Approved RFCs are rendered as a book at
[sel4.github.io/rfcs](https://sel4.github.io/rfcs/). The numbered ones
in `src/implemented` and `src/active` today:

| RFC | State |
|---|---|
| 0010 The RFC process itself | implemented |
| 0020 Dedicated C runtime; 0030 Cross-platform thread-local storage | implemented |
| 0050 The seL4 Microkit (adopting it as a Foundation project) | implemented |
| 0080 Remove ARMv6 support | implemented |
| 0090 SMC capability (forwarding Arm secure monitor calls) | implemented |
| 0100 Refactor AArch64 VSpace | implemented |
| 0170 Multikernel IPI API | implemented |
| 0180 FPU switching | implemented |
| 0200 Domain schedules | implemented |
| 0110 MCS: configure fault handlers; 0130 MCS: grant reply | active |
| 0190 Deprecation process | active |

The [MCS](mcs.md) kernel itself and rust-sel4 are not in this list as
RFCs of their own: MCS predates the repository, and only refinements of
its API appear (unchecked whether older RFCs for either exist elsewhere).

### Releases and versions

There are two channels. **Bleeding edge** is the head of each repository,
recorded in a manifest whenever tests (and for the kernel, proofs) pass
([CI](ci.md)). **Versioned releases** are made by hand, less often. The
kernel, Microkit and rust-sel4 use semantic versioning
(`MAJOR.MINOR.PATCH`: incompatible API change, compatible feature, fix).
The kernel's is tagged in git and recorded in its `VERSION` file, which
reads `17.0.0-dev` on `master` now; the latest releases are seL4 17.0.0
and Microkit 2.4.0. Each Microkit SDK embeds a specific kernel revision.
The docs site says working proofs are guaranteed only for released
versions, and that old releases are not maintained. CAmkES and capDL
number differently (their minor number follows kernel releases).

### Trademark and code of conduct

"seL4" is a registered trademark. The guidelines' spirit is that the name
refers to the official code and proofs from the Foundation's
repositories, and that any verification claim made with it is accurate: a
fork or an unverified configuration must not be passed off as "verified
seL4". The code of conduct applies to every repository and channel; each
repository's `CODE_OF_CONDUCT.md` points to the one on the docs site,
which is based on the Contributor Covenant (unchecked).

## In seL4

- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` and `VERSION`
  at the top of [the kernel repository](https://github.com/seL4/seL4);
  `CHANGES.md` is the release notes in progress, and `CAVEATS.md` the
  known limitations.
- GitHub teams in the organisation mirror the roles: `Committers`, and
  `verification`, which can be pinged on a pull request with proof
  impact.
- Labels on pull requests (`verification`, `proof-test`, `hw-test`) are
  applied by reviewers and committers.

## Gotchas

- **The Foundation's legal home is changing.** Pages written before 2026
  (and much secondary material) say "a Linux Foundation project". Check
  the Foundation page before repeating either form.
- **An RFC is for the design, not the code.** A draft pull request may
  accompany it as a prototype, but a substantial change sent as a pull
  request alone "is likely to be rejected".
- **Approval is not implementation.** An approved RFC is `active` until
  someone implements it, and for kernel changes until the proofs follow;
  two MCS RFCs are in that state.
- **sDDF and LionsOS are not Foundation projects.** Their conventions
  and reviewers are UNSW's; the roles above do not apply there.
- **`-dev` versions.** A kernel built from `master` reports a `-dev`
  version, which carries no verification statement.

## See also

- [Contributing a patch](contributing.md): the day-to-day path of a change
- [Platform port](platform-port.md): platform maintainers and their duties
- [Verification](verification.md): what the verification statements attached to a release cover
- [History and papers](history-and-papers.md): NICTA, Data61 and how the Foundation came about
- [Ecosystem](ecosystem.md): the repositories and who owns them

## References

- [The seL4 Foundation](https://sel4.systems/Foundation/): the two
  bodies, the Swiss association "seL4 International". *Checked 2026-11-14.*
- [Technical Steering Committee](https://sel4.systems/Foundation/TSC/):
  members, chair, meeting and vote record. *Checked 2026-11-14.*
- [Foundation members](https://sel4.systems/Foundation/Membership/):
  tiers, the transition note. *Checked 2026-11-14.*
- [Development roles](https://sel4.systems/Contribute/roles.html):
  the five roles and current holders. *Checked 2026-11-14.*
- [`seL4/rfcs` README](https://github.com/seL4/rfcs/blob/main/README.md):
  when an RFC is needed, decisions, states; and the
  [`src/implemented`](https://github.com/seL4/rfcs/tree/main/src/implemented)
  and [`src/active`](https://github.com/seL4/rfcs/tree/main/src/active)
  listings. *Checked 2026-11-14.*
- [Releases](https://docs.sel4.systems/releases.html): channels, semantic
  versioning, latest versions. *Checked 2026-11-14.*
- [Platform contributions](https://sel4.systems/Contribute/platform-ports.html):
  no RFC for a platform on a supported architecture. *Checked 2026-11-14.*
- [Trademark guidelines](https://sel4.systems/Legal/trademark.html):
  permitted use of the name. *Checked 2026-11-14.*
- [Code of conduct](https://docs.sel4.systems/processes/conduct.html):
  the text itself. *Unchecked: only the pointer in `CODE_OF_CONDUCT.md`
  was read.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
