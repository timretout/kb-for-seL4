# History and key papers

> seL4 is the third generation of the L4 microkernel family, designed from 2004 to be formally verified; this page gives the lineage, the timeline, and an annotated reading list in the order a new contributor should read it.

Read first: [seL4 overview](overview.md).

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
message between two processes cost on the order of 100 microseconds
(unchecked), and
systems built on them paid that for every service call. Jochen Liedtke
showed with L3 and then L4 (1993) that this was a property of those
kernels and not of the idea, with IPC 10 to 20 times faster. His
paper "On µ-kernel construction" (SOSP 1995) stated the principle
that still defines the family: a concept belongs in the kernel only if
moving it outside would prevent the system's required functionality
(the **minimality principle**). The original L4 was hand-written
i486 assembly, offering three abstractions: address spaces, threads
and IPC (unchecked: paper not opened today).

**Pistachio and Fiasco.** The second generation re-implemented the L4
interface in higher-level languages for portability: L4Ka::Hazelnut
and then L4Ka::Pistachio at Karlsruhe (C++, many architectures, with
UNSW contributing ports), and Fiasco at TU Dresden (C++, preemptible,
aimed at real time; its descendant Fiasco.OC / L4Re is still
developed). They showed that a fast microkernel need not be assembly
or tied to one CPU (unchecked).

**OKL4.** NICTA's embedded group spun out Open Kernel Labs in 2006
with a Pistachio-derived kernel for phones. OKL4 shipped in the
baseband (modem) processors of Qualcomm chipsets, reaching billions of
devices, and a later L4-family kernel runs in the secure enclave of
Apple devices. This is where the L4 family proved itself commercially,
and where the people who designed seL4 learned what deployment needs
(unchecked: figures as given in "From L3 to seL4").

**KeyKOS and EROS.** L4 had weak access control: threads were named
by global identifiers and anyone could send to anyone. The fix came
from a different tradition, the capability systems KeyKOS (1980s) and
its successor EROS (Shapiro, 1999), in which every right is an
unforgeable token held by a process, and authority can be reasoned
about by following tokens. seL4 took capabilities for *everything*,
including kernel memory, from that line; its
[capability derivation tree](capabilities.md) and the idea of
user-level memory management through [untyped memory](untyped-memory.md)
are the seL4 team's additions (unchecked).

### seL4's timeline

| When | What |
|---|---|
| 2004 | The L4.verified project starts at NICTA (Australia's ICT research centre, in Sydney, with UNSW): Kevin Elphinstone leads the design of a kernel meant to be verifiable, Gerwin Klein the specification and proof |
| 2004 to 2007 | Design by iterating a Haskell prototype that served both as executable kernel (under a simulator) and as the source of the formal specification; then a manual re-implementation in C (unchecked: dates) |
| 29 July 2009 | The functional-correctness proof is complete: the C code for 32-bit Arm refines the abstract specification |
| October 2009 | "seL4: Formal Verification of an OS Kernel" at SOSP |
| 2012 to 2013 | Integrity and authority confinement, then information-flow noninterference; translation validation extends the proof from C to the binary (S&P and PLDI 2013) |
| 2012 to 2017 | DARPA's HACMS programme puts seL4 in autonomous vehicles, among them Boeing's Unmanned Little Bird helicopter; the x64 port and the first proofs beyond 32-bit Arm date from it |
| 29 July 2014 | Kernel and proofs released as open source (GPLv2 kernel, BSD libraries: licences unchecked) |
| 2016 | NICTA is merged into CSIRO as Data61; the group becomes Trustworthy Systems at Data61 (unchecked: year) |
| 2018 to 2020 | Scheduling-context capabilities published (EuroSys 2018) and merged as the [MCS](mcs.md) configuration; RISC-V port, with functional correctness proved for 64-bit RISC-V in 2020 (unchecked: year) |
| 7 April 2020 | The seL4 Foundation is created (under the Linux Foundation: unchecked), with Data61, UNSW, HENSOLDT Cyber, DornerWorks, Cog Systems and Ghost as founding members ([Governance and RFCs](governance.md)) |
| 2021 | CSIRO stops funding the group. Trustworthy Systems continues at UNSW Sydney; Proofcraft is founded by the verification leads to maintain and extend the proofs commercially; Kry10 is founded by other former team members |
| 2021 to 2023 | The seL4 Core Platform is developed at UNSW and Breakaway Consulting, adopted by the Foundation and renamed [Microkit](microkit.md) (RFC-5) (unchecked: years) |
| 2023 on | AArch64 hypervisor-mode proofs; sDDF and LionsOS; MCS proof configurations (`configs/*_MCS_verified.cmake`) appear; ACM Software System Award to the seL4 team in 2023 for the 2022 award year (unchecked) |
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
   scheduling, which a cloud port involves at once.
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
   The rationale for a small static framework and its abstractions. A
   Rust RFC was asked for in the brief for this page, but no
   Rust-language RFC was found in `seL4/rfcs` on 2026-11-14; the
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
    direction, mostly not in mainline (unchecked).

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
  could be revoked recursively (unchecked: expansion from memory).
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
- **Copyright headers** trace the institutions: NICTA, then
  `Data61, CSIRO (ABN 41 687 119 230)`, then Proofcraft, UNSW and
  contributing companies on newer files (unchecked beyond the Data61
  form).
- **`KernelIsMCS`** is the 2018 paper as a build option, still a
  separate configuration from the original scheduler because the
  proofs for it are separate ([MCS kernel](mcs.md)).

## Gotchas

- **Papers describe the kernel of their year.** The SOSP 2009 kernel
  was 32-bit Arm only, had no MCS, no SMP, a different IPC fault and
  reply model in places, and "8,700 lines of C" (unchecked); do not quote such
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
- [Lyons et al., EuroSys 2018](https://trustworthy.systems/publications/abstracts/Lyons_MAH_18.abstract),
  [Ge et al., EuroSys 2019](https://trustworthy.systems/publications/abstracts/Ge_YCH_19.abstract),
  [Heiser, Klein, Andronick, CACM 2020](https://trustworthy.systems/publications/abstracts/Heiser_KA_20.abstract),
  [sDDF design, 2024](https://trustworthy.systems/publications/papers/Heiser_CBDP_24.abstract):
  as above. *Checked 2026-11-14 (titles and links only).*
- [LionsOS paper, arXiv:2501.06234](https://arxiv.org/abs/2501.06234):
  title and authors. *Checked 2026-11-14.*
- [seL4 whitepaper](https://sel4.systems/About/seL4-whitepaper.pdf)
  and [reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf).
  *Unchecked: links resolve, PDFs not opened today.*
- [RFC-5 Microkit](https://sel4.github.io/rfcs/implemented/0050-microkit.html).
  *Unchecked: link resolves and the file is in `seL4/rfcs`
  `src/implemented/`, text not read today.*
- Liedtke, "On µ-kernel construction", SOSP 1995
  ([ACM](https://dl.acm.org/doi/10.1145/224056.224075)); Shapiro,
  Smith and Farber, "EROS: a fast capability system", SOSP 1999.
  *Unchecked: cited from memory, DOI not opened.*
- [seL4 `src/object/cnode.c`](https://github.com/seL4/seL4/blob/master/src/object/cnode.c),
  [`include/object/structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf)
  and [l4v `spec/haskell`](https://github.com/seL4/l4v/tree/master/spec/haskell):
  the Haskell comments, `mdb_node`, the prototype's location.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
