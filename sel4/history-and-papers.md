# History and key papers

> seL4 is the third generation of the L4 microkernel family, designed from 2004 to be formally verified; this page gives the lineage, the timeline, and an annotated reading list in the order a new contributor should read it.

[Index](../INDEX.md) › [Part 1: Orientation](../INDEX.md#part-1-orientation) · ← [Ecosystem and repositories](ecosystem.md) · [Privilege levels](../concepts/privilege-levels.md) →

Read first: [seL4 overview](overview.md).

| At a glance | |
|---|---|
| Kind | History and annotated reading list |
| Lineage | Third generation of the L4 family, with capabilities from KeyKOS and EROS |
| Project start | 2004, L4.verified at NICTA |
| Proof complete | 29 July 2009, 32-bit Arm |
| Open source | 29 July 2014 |
| Foundation | 7 April 2020 ([Governance and RFCs](governance.md)) |
| Read first | [The whitepaper](https://sel4.systems/About/seL4-whitepaper.pdf) |

## What it is

Much of seL4's design only makes sense as an answer to something that
went before: why IPC is synchronous and so heavily optimised, why
there are capabilities, why the kernel never allocates memory, why the
code reads like transliterated Haskell. Knowing the history also tells
you which papers are still accurate and which describe a kernel that
has since changed.

### The L4 lineage

**Liedtke's L3 and L4.** First-generation microkernels such as Mach
moved operating-system services to user level but were slow: a
message between two processes cost on the order of 100 microseconds, and
systems built on them paid that for every service call. Jochen Liedtke
showed with L3 and then L4 (1993) that this was a property of those
kernels and not of the idea, with IPC 10 to 20 times faster. His
paper "On µ-kernel construction" (SOSP 1995) stated the principle
that still defines the family: a concept belongs in the kernel only if
moving it outside would prevent the system's required functionality
(the **minimality principle**). The original L4 was written entirely in
i486 assembly, and was built on two basic concepts, threads and address
spaces, with IPC between them.

**Pistachio and Fiasco.** The second generation re-implemented the L4
interface in higher-level languages for portability: L4Ka::Hazelnut
(C) and then L4Ka::Pistachio (C++, many architectures, with
UNSW contributing ports) at Karlsruhe, and Fiasco at TU Dresden (C++,
made fully preemptible for real time; as Fiasco.OC it was in 2013 the
oldest L4 codebase still maintained). They showed that a fast microkernel need not be assembly
or tied to one CPU.

**OKL4.** NICTA forked Pistachio for embedded systems as
L4-embedded, which Qualcomm adopted for the firmware of its modem
processors. The NICTA spinout Open Kernel Labs took the kernel over and
renamed it OKL4; it shipped on billions of Qualcomm modem chips, and
L4-embedded itself runs in the secure enclave of iOS devices. This is
where the L4 family proved itself commercially, among the people who
went on to design seL4.

**KeyKOS and EROS.** L4 had weak access control: threads were named
by global identifiers and anyone could send to anyone. The fix came
from a different tradition, the capability systems KeyKOS (1980s) and
its successor EROS (begun in 1991; Shapiro's paper is from 1999), in which every right is an
unforgeable token held by a process, and authority can be reasoned
about by following tokens. seL4 took capabilities for *everything*,
including kernel memory; "From L3 to seL4" calls this model of
kernel memory, managed from user level through
[untyped memory](untyped-memory.md) and recorded in the
[capability derivation tree](capabilities.md), seL4's main
contribution to OS design.

![Liedtke's L3 and L4 lead to the second-generation kernels Hazelnut, Pistachio and Fiasco and to OKL4, then to seL4 as the third generation, which also takes capabilities from the separate line of KeyKOS and EROS.](../images/history-and-papers-lineage.svg)

*Two lines meet in seL4: the L4 family for the kernel design, and the capability systems for access control.*

### seL4's timeline

| When | What |
|---|---|
| 2004 | The L4.verified project starts at NICTA (Australia's ICT research centre, in Sydney, with UNSW): Kevin Elphinstone leads the design of a kernel meant to be verifiable, Gerwin Klein the specification and proof |
| 2004 to 2009 | Design by iterating a Haskell prototype that served both as executable kernel (under a simulator) and as the source of the formal specification; then a manual re-implementation in C |
| 29 July 2009 | The functional-correctness proof is complete: the C code for 32-bit Arm refines the abstract specification |
| October 2009 | "seL4: Formal Verification of an OS Kernel" at SOSP |
| 2012 to 2013 | Integrity and authority confinement, then information-flow noninterference; translation validation extends the proof from C to the binary (S&P and PLDI 2013) |
| 2012 to 2017 | DARPA's HACMS programme puts seL4 in autonomous vehicles, among them Boeing's Unmanned Little Bird helicopter; the x64 port and the first proofs beyond 32-bit Arm date from it |
| 29 July 2014 | Kernel and proofs released as open source (the kernel is under GPLv2, user-level code under BSD) |
| 2015 to 2016 | NICTA is merged into CSIRO as Data61 (announced 28 August 2015, with NICTA a separate legal entity until at least 1 July 2016); the group moves with it |
| 2018 to 2020 | Scheduling-context capabilities published (EuroSys 2018) and merged as the [MCS](mcs.md) configuration; RISC-V port, with functional correctness proved for 64-bit RISC-V in June 2020 |
| 7 April 2020 | The seL4 Foundation is created, set up under the Linux Foundation, with Data61, UNSW, HENSOLDT Cyber, DornerWorks, Cog Systems and Ghost as founding members ([Governance and RFCs](governance.md)) |
| 2021 | CSIRO stops funding the group. Trustworthy Systems continues at UNSW Sydney; Proofcraft is founded by the verification leads to maintain and extend the proofs commercially; Kry10 is founded by other former team members |
| 2020 to 2023 | The seL4 Core Platform is developed by Breakaway Consulting and UNSW (RFC-5 proposed in November 2020), renamed [Microkit](microkit.md) and announced as an official Foundation project in November 2023 |
| 2023 on | AArch64 hypervisor-mode proofs; sDDF and LionsOS; MCS proof configurations (`configs/*_MCS_verified.cmake`) appear; the 2022 ACM Software System Award goes to the seL4 team (announced May 2023) |
| 30 October 2026 | seL4 17.0.0 |

Two threads run through this. First, **verification shaped the
design**, not the reverse: features were admitted when they could be
specified cleanly, and the kernel's event-driven, mostly
non-preemptible structure ([Kernel design](kernel-design.md)) exists
because it makes the proof tractable. Second, the **proofs have grown
unevenly**: the fullest stack (down to binary, up to information flow)
is 32-bit Arm; other architectures have functional correctness and
some of the rest ([The seL4 proofs](verification.md)). Papers state
what was proved at the time for the configuration of the time.

### Reading list

In order of usefulness to someone about to write kernel patches.

1. **Heiser, "The seL4 Microkernel: An Introduction" (the whitepaper),
   seL4 Foundation, 2020, revised since.**
   [PDF](https://sel4.systems/About/seL4-whitepaper.pdf). Twenty-odd
   pages on what seL4 is, what the proofs do and do not say, and what
   it is for. Read it first; it also corrects the common
   misconceptions (it is not an OS; "verified" has assumptions).
2. **The seL4 Reference Manual.**
   [PDF](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf). The
   API as specified: chapters on capabilities, IPC, threads, address
   spaces, interrupts, then every invocation. Not a paper, but the
   document reviewers expect you to have read; a patch that changes
   user-visible behaviour changes this manual.
3. **Klein et al., "seL4: Formal Verification of an OS Kernel",
   SOSP 2009.**
   [Publication page](https://trustworthy.systems/publications/nictaabstracts/Klein_EHACDEEKNSTW_09.abstract).
   Take from it the method: Haskell prototype, abstract and executable
   specifications, refinement to C, and the design decisions verification
   forced (no kernel heap, limited preemption, the restricted C subset).
   Its section on the cost of change explains why upstream cares about
   [proof impact](proof-impact.md).
4. **Klein et al., "Comprehensive Formal Verification of an OS
   Microkernel", ACM TOCS 2014.**
   [Publication page](https://trustworthy.systems/publications/nictaabstracts/Klein_AEMSKH_14.abstract).
   The long form: everything from the SOSP paper plus integrity,
   information flow, binary verification and initialisation, with an
   honest list of assumptions. The best single reference for "what
   exactly is proved"; read the assumptions section even if nothing else.
5. **Elphinstone and Heiser, "From L3 to seL4: What Have We Learnt in
   20 Years of L4 Microkernels?", SOSP 2013.**
   [Publication page](https://trustworthy.systems/publications/nictaabstracts/Elphinstone_Heiser_13.abstract).
   The design history above, feature by feature: what L4 had, what
   seL4 kept, dropped or replaced, and why. The fastest way to
   understand why the kernel is the shape it is.
6. **Lyons, McLeod, Almatary and Heiser, "Scheduling-context
   capabilities: A principled, light-weight operating-system mechanism
   for managing time", EuroSys 2018.**
   [Publication page](https://trustworthy.systems/publications/abstracts/Lyons_MAH_18.abstract).
   The MCS design: time as a capability-controlled resource, budgets,
   passive servers, timeout faults. Needed for any work on timers or
   scheduling, which a port to a new machine soon involves.
7. **Heiser et al., "sDDF design: design, implementation and
   evaluation of the seL4 device driver framework", 2024.**
   [Publication page](https://trustworthy.systems/publications/papers/Heiser_CBDP_24.abstract).
   The driver model, queue design and performance argument behind
   [sDDF](sddf.md).
8. **Heiser et al., "Fast, Secure, Adaptable: LionsOS Design,
   Implementation and Performance", 2025.**
   [arXiv:2501.06234](https://arxiv.org/abs/2501.06234). How Microkit,
   sDDF and libvmm compose into a system, with measurements against
   Linux ([LionsOS and libvmm](lionsos.md)).
9. **RFC-5, "The seL4 Microkit".**
   [RFC text](https://sel4.github.io/rfcs/implemented/0050-microkit.html).
   The rationale for a small static framework and its abstractions. There
   is no RFC for Rust support in `seL4/rfcs` (as of 2026-11-14); the
   rust-sel4 repository's own documentation is the reference
   ([rust-sel4](rust-sel4.md)).
10. **Murray et al., "seL4: From General Purpose to a Proof of
    Information Flow Enforcement", IEEE S&P 2013.**
    [Publication page](https://trustworthy.systems/publications/nictaabstracts/Murray_MBGBSLGK_13.abstract).
    Noninterference for a suitably configured system; the origin of
    the domain scheduler. Read when a change touches scheduling
    domains or anything that could leak between partitions.
11. **Sewell, Myreen and Klein, "Translation Validation for a Verified
    OS Kernel", PLDI 2013.**
    [Publication page](https://trustworthy.systems/publications/nictaabstracts/Sewell_MK_13.abstract).
    How the compiler is removed from the trusted base by proving the
    binary refines the C semantics. Explains some coding restrictions
    and why compiler optimisation level is part of a verified
    configuration.
12. **Ge, Yarom, Chothia and Heiser, "Time Protection: The Missing OS
    Abstraction", EuroSys 2019.**
    [Publication page](https://trustworthy.systems/publications/abstracts/Ge_YCH_19.abstract).
    Preventing timing channels through shared hardware state by
    partitioning caches and cloning the kernel image. A research
    direction: the mainline kernel has no option for either.

A short retrospective worth adding: Heiser, Klein and Andronick,
"seL4 in Australia: From Research to Real-World Trustworthy Systems",
Communications of the ACM, April 2020
([publication page](https://trustworthy.systems/publications/abstracts/Heiser_KA_20.abstract)).

## In seL4

The history is visible in the source.

- **Haskell-derived naming.** The C kernel was written by hand to
  mirror the Haskell prototype function for function, so that the
  refinement proof could match them up. Hence camelCase function names
  unlike most C kernels (`decodeCNodeInvocation`, `handleFault`,
  `setThreadState`), global state named `ks...` for "kernel state"
  (`ksCurThread`, `ksReadyQueues`), small functions that return
  structs in place of out-parameters, and comments such as
  `/* Haskell error: "decodeCNodeInvocation: invalid cap" */` in
  [`src/object/cnode.c`](https://github.com/seL4/seL4/blob/master/src/object/cnode.c)
  marking a branch the prototype treats as unreachable. The prototype
  itself is still maintained as the executable specification in
  [`l4v/spec/haskell`](https://github.com/seL4/l4v/tree/master/spec/haskell)
  and must be updated with the C ([l4v and Isabelle](l4v.md)). Keep to
  the style in patches: renaming to taste breaks the correspondence.
- **`mdb`.** Every capability slot (`cte_t`) holds a capability and an
  `mdb_node` with `mdbPrev`, `mdbNext` and flags
  ([`structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf)).
  MDB stands for *mapping database*, the L4 structure that recorded
  which address space had mapped pages to which, so that mappings
  could be revoked recursively.
  seL4 generalised it to all
  capabilities as the [capability derivation tree](capabilities.md)
  and kept the name.
- **The fastpath.** `src/fastpath/` is Liedtke's lesson preserved: a
  hand-tuned path for the common IPC case
  ([IPC and endpoints](ipc.md)).
- **What L4 had and seL4 dropped** explains some absences: no IPC
  timeouts (only blocking and polling variants), no in-kernel
  long-message copying, no global thread identifiers, no kernel memory
  pool, no recursive address-space `map`/`grant` IPC items.
- **Copyright headers** trace the institutions:
  `General Dynamics C4 Systems` on the files of the 2014 release, then
  `Data61, CSIRO (ABN 41 687 119 230)`, then UNSW, Proofcraft and
  contributing companies such as HENSOLDT Cyber and DornerWorks on
  newer files. NICTA appears only as an affiliation in
  `CONTRIBUTORS.md`.
- **`KernelIsMCS`** is the 2018 paper as a build option, still a
  separate configuration from the original scheduler because the
  proofs for it are separate ([MCS kernel](mcs.md)).

## Gotchas

- **Papers describe the kernel of their year.** The SOSP 2009 kernel
  was 32-bit Arm only, had no MCS, no SMP, a different IPC fault and
  reply model in places, and "8,700 lines of C"; do not quote such
  figures for today's kernel.
- **"seL4 is verified" always needs a configuration.** The claims in
  items 3, 4, 10 and 11 hold for specific architecture and option
  sets. x86-64 has functional correctness only, and the SMP kernel
  is not covered; MCS has its own configurations and proof status ([The seL4 proofs](verification.md)).
- **"From L3 to seL4" predates MCS and Microkit.** Its account of
  scheduling as unfinished business is what item 6 then addressed.
- **The whitepaper is revised in place** at a stable URL; cite its
  revision if a detail matters.
- **Time protection is not a mainline feature.** Reading item 12 as a
  description of what a default seL4 build does is a common mistake.
- **Trustworthy Systems publication pages moved between
  `/publications/nictaabstracts/`, `/publications/abstracts/` and
  `/publications/papers/`** by publication era; a paper key that gives
  "Not Found" under one prefix may resolve under another.

## See also

- [seL4 overview](overview.md): the kernel as it is now
- [Ecosystem and repositories](ecosystem.md): the present-day projects these papers produced
- [The seL4 proofs](verification.md): what is proved, per configuration
- [Kernel design and execution model](kernel-design.md): the design decisions in code
- [Governance and RFCs](governance.md): the Foundation and the RFC process
- [MCS kernel](mcs.md): the scheduling-context paper in practice

## References

- [seL4 history](https://sel4.systems/About/history.html): 1993 L4,
  2004 project start, 29 July 2009 proof, 2012 to 2017 HACMS, 29 July
  2014 open source, 7 April 2020 Foundation, 2021 reorganisation.
  *Checked 2026-11-14.*
- [Klein et al., SOSP 2009](https://trustworthy.systems/publications/nictaabstracts/Klein_EHACDEEKNSTW_09.abstract),
  [Klein et al., TOCS 2014](https://trustworthy.systems/publications/nictaabstracts/Klein_AEMSKH_14.abstract),
  [Elphinstone and Heiser, SOSP 2013](https://trustworthy.systems/publications/nictaabstracts/Elphinstone_Heiser_13.abstract),
  [Murray et al., S&P 2013](https://trustworthy.systems/publications/nictaabstracts/Murray_MBGBSLGK_13.abstract),
  [Sewell et al., PLDI 2013](https://trustworthy.systems/publications/nictaabstracts/Sewell_MK_13.abstract):
  publication pages opened and titles confirmed; the summaries of
  their content above are from memory. *Checked 2026-11-14 (titles
  and links only).*
- [Elphinstone and Heiser, "From L3 to seL4" (PDF)](https://trustworthy.systems/publications/nicta_full_text/6930.pdf),
  sections 1, 2, 3.1, 3.4 and 4.5: IPC of about 100 µs before L4 and
  the factor of 10 to 20, the assembly original, Hazelnut in C,
  Pistachio and Fiasco in C++, L4-embedded, Qualcomm and OKL4, the
  minimality principle, the mapping database, EROS's influence and
  kernel memory as seL4's main contribution. *Checked 2026-11-14.*
- [Klein et al., SOSP 2009 (PDF)](https://trustworthy.systems/publications/nicta_full_text/1852.pdf),
  abstract and sections 2 and 5: 8,700 lines of C and 600 of
  assembler, the Haskell prototype run on a QEMU-derived simulator.
  *Checked 2026-11-14.*
- [Härtig et al., "The Performance of µ-Kernel-Based Systems", SOSP 1997](https://pdos.csail.mit.edu/6.828/2020/readings/microkernel.pdf),
  section 3: L4's two basic concepts, threads and address spaces, and
  IPC. *Checked 2026-11-14.*
- seL4 Foundation news for
  [2020](https://sel4.systems/news/2020.html) (the Foundation set up
  under the Linux Foundation; RISC-V functional correctness, 9 June)
  and [2023](https://sel4.systems/news/2023.html) (the 2022 ACM
  Software System Award, 5 May; Microkit an official Foundation
  project, 20 November), and the
  [awards page](https://sel4.systems/Research/awards.html).
  *Checked 2026-11-14.*
- [iTnews, "NICTA no more as CSIRO takes over"](https://www.itnews.com.au/news/nicta-no-more-as-csiro-takes-over-408536),
  28 August 2015: the merger into CSIRO as Data61. *Checked 2026-11-14.*
- Wikipedia, [KeyKOS](https://en.wikipedia.org/wiki/KeyKOS) and
  [EROS](https://en.wikipedia.org/wiki/EROS_(microkernel)): KeyKOS
  named in 1985, EROS begun in 1991 as its reconstruction.
  *Checked 2026-11-14.*
- [seL4 `LICENSE.md`](https://github.com/seL4/seL4/blob/master/LICENSE.md)
  (GPLv2 kernel, BSD user level),
  [`CONTRIBUTORS.md`](https://github.com/seL4/seL4/blob/master/CONTRIBUTORS.md)
  and [`config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake)
  (no kernel-clone or cache-colouring option); copyright holders
  counted with `git grep` over `src`, `include` and `libsel4`.
  *Checked 2026-11-14.*
- [Lyons et al., EuroSys 2018](https://trustworthy.systems/publications/abstracts/Lyons_MAH_18.abstract),
  [Ge et al., EuroSys 2019](https://trustworthy.systems/publications/abstracts/Ge_YCH_19.abstract),
  [Heiser, Klein, Andronick, CACM 2020](https://trustworthy.systems/publications/abstracts/Heiser_KA_20.abstract),
  [sDDF design, 2024](https://trustworthy.systems/publications/papers/Heiser_CBDP_24.abstract):
  as above. *Checked 2026-11-14 (titles and links only).*
- [LionsOS paper, arXiv:2501.06234](https://arxiv.org/abs/2501.06234):
  title and authors. *Checked 2026-11-14.*
- [seL4 whitepaper](https://sel4.systems/About/seL4-whitepaper.pdf)
  (revision 1.4.1 of 2026-07-17; section 2.2 for OKL4 on Qualcomm
  modems and L4-embedded in the iOS secure enclave) and
  [reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf)
  (for 17.0.0; chapter list). *Checked 2026-11-14.*
- [RFC-5 Microkit](https://sel4.github.io/rfcs/implemented/0050-microkit.html):
  previous title "seL4 Core Platform", proposed 2020-11-19, summary
  and motivation. *Checked 2026-11-14.*
- [Liedtke, "On µ-kernel construction", SOSP 1995](https://dl.acm.org/doi/10.1145/224056.224075);
  [Shapiro, Smith and Farber, "EROS: a fast capability system", SOSP 1999](https://dl.acm.org/doi/10.1145/319151.319163).
  *Unchecked: dl.acm.org refuses scripted fetches; both as cited in
  "From L3 to seL4", which quotes the minimality principle from the
  first.*
- [seL4 `src/object/cnode.c`](https://github.com/seL4/seL4/blob/master/src/object/cnode.c),
  [`include/object/structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf)
  and [l4v `spec/haskell`](https://github.com/seL4/l4v/tree/master/spec/haskell):
  the Haskell comments, `mdb_node`, the prototype's location.
  *Checked 2026-11-14.*
