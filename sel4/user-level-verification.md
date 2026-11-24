# Verifying user-level software

> seL4's proofs stop at the kernel boundary, so drivers, Microkit components and applications need proofs of their own; the usual approach is to rely on the kernel's isolation proofs and verify only the few components that matter, with tools such as Pancake for drivers, Verus, Kani or Aeneas for Rust, and model checkers for the protocols between components.

[Index](../INDEX.md) › [Part 5: Verification](../INDEX.md#part-5-verification) · ← [Proof impact of a change](proof-impact.md) · [libsel4 and the runtime](libsel4.md) →

Read first: [The seL4 proofs](verification.md), [sDDF](sddf.md).

| At a glance | |
|---|---|
| Kind | Survey of methods and tools |
| Built on | The kernel's integrity and confidentiality proofs; the [capDL](camkes-capdl.md) initialiser proof |
| seL4-native tools | Pancake (drivers, Microkit library), Spin (sDDF signalling), Isabelle with AutoCorres |
| Rust tools | Verus, Kani, Aeneas (to Lean or HOL4), Creusot |
| Verified today | `libmicrokit` on RISC-V; one Pancake Ethernet driver (research); no sDDF queue proofs |
| Not connected | Proofs outside Isabelle rest on their own model of seL4, not on the kernel's specification |

## What it is

[The seL4 proofs](verification.md) say what the kernel does. They say
nothing about the code running on it: every driver, server and
application is ordinary code unless it has a proof of its own. What the
kernel proofs do give user level is **isolation**. A component can touch
only what its [capabilities](capabilities.md) allow (integrity), and
authority cannot spread beyond the capability distribution (authority
confinement). If the system is also set up exactly as specified, which
the capDL initialiser proof covers in part, those properties hold for
the whole running system.

That shapes how user-level verification is done on seL4. Instead of
verifying a whole system, a designer:

1. splits the system so that the property that matters depends on a few
   small components (a driver, a cross-domain filter, a crypto boundary);
2. lets the kernel's isolation confine everything else, unverified code
   included;
3. verifies those few components, and the protocols between them, with
   whatever tool fits their language and the property.

Step 3 is where the choice of tool comes in. Three kinds of evidence are
in use, with different costs:

| Kind | What it gives | Cost | Examples |
|---|---|---|---|
| **Model checking** of a protocol | No deadlock or lost signal in an abstract model of the components' interaction | Low; but the model is not the code | Spin, TLA+ |
| **Bounded model checking** of code | No panic, overflow, undefined behaviour or failed assertion, for inputs and loop counts up to a bound | Low; a harness per property | Kani, CBMC |
| **Deductive verification** of code | Full functional correctness against a specification, for all inputs | High; specifications, invariants, proofs | Pancake with Viper, Verus, Aeneas with Lean, Frama-C, VST, AutoCorres |

### The proof gap at the kernel boundary

A proof about a component has to say what each system call does. Only
Isabelle/HOL holds seL4's own specification ([l4v](l4v.md)). A proof in
any other tool (HOL4, Viper, Z3 through Verus, Lean) writes its own model
of `seL4_Signal`, IPC and shared memory and assumes it matches the
kernel. The Microkit verification project names exactly this as missing:
an "SMT-suitable" abstraction of seL4 proved to correspond to the kernel
proofs, still in progress. Until such a link exists, a component proof
and the kernel proof are two separate results joined by an assumption.

## In seL4

### System initialisation (Isabelle)

The capDL initialiser proof (Boyton et al., 2013) shows in Isabelle/HOL
that a *model* of the initialiser, run on seL4's API specification,
creates exactly the objects and capabilities a [capDL](camkes-capdl.md)
specification describes. The C loader was written by hand to follow that
model; the translation is not proved, and specifications may not contain
untyped, IRQ or ASID-pool capabilities. The proof is in `l4v/sys-init`.
[Microkit](microkit-internals.md) now boots with the Rust capDL
initialiser instead, which a 2024 UNSW report says "is not as yet
verified".

### Pancake (drivers and Microkit)

Pancake is a small imperative language from the seL4 and CakeML groups,
aimed at device drivers. Its data are machine words, code pointers and
structs; it has no undefined behaviour, no static type system and a
static heap. Its compiler reuses the lower part of the **CakeML**
compiler (a verified compiler for an ML dialect, in the HOL4 prover), and
is itself verified in HOL4: a program that does not fail behaves the same
in machine code as in the source, for x86-64, AArch64 and RISC-V. Device
registers and shared memory appear as observable load and store events.

Proving a Pancake program correct is a separate step. The current route
is a **transpiler** from annotated Pancake to Viper, an SMT-based
verifier from ETH Zürich. The transpiler is a prototype and is trusted
(it sits in the trusted computing base). With it:

- a 2025 paper verified an i.MX 8M Ethernet driver for LionsOS, in about
  three person-months, with the theorem covering the driver's main entry
  point;
- the Microkit project reports `libmicrokit`, Microkit's event loop and
  channel library, verified for RISC-V (news of 2026-04-30).

[sDDF](sddf.md) `main` holds Pancake serial drivers and serial
virtualisers alongside the C ones (`docs/pancake.md`); that document
describes how such components can be verified, without claiming these
ones are.

### sDDF and LionsOS

[sDDF](sddf.md)'s design keeps drivers small and single-threaded so that
they can be verified, but none is verified in `main`. What exists is a
Spin model of the signalling protocol (who notifies whom, and when a
signal may be skipped), checked for deadlock freedom in CI. The driver
model is checked with bitstate hashing, which is not exhaustive, and
proving that the models abstract the C code is listed as future work.
[LionsOS](lionsos.md) describes its signalling as model-checked and its
component verification as unfinished.

### Earlier: Cogent

Cogent was a functional language with uniqueness types whose compiler
emitted C together with an Isabelle proof that the C refines the Cogent
program. It was used for file systems (ext2, BilbyFs) and could connect
to the kernel's proof world, being in Isabelle. The project is now listed
under the group's old projects; its repository needs Isabelle 2019.

### Tools from outside the seL4 world

These do not know about seL4; using them means modelling the system calls
a component makes.

**Rust** (Microkit protection domains are often written with
[rust-sel4](rust-sel4.md)):

- **Verus** proves Rust code against specifications written in Rust
  syntax (`requires`, `ensures`, quantifiers, mathematical `int`), using
  the Z3 SMT solver. Specification and proof code is "ghost" code
  alongside the compiled code. It handles a subset of Rust, including raw
  pointers, and has been used for verified kernels (Atmosphere, SOSP
  2025) and memory managers. It is under active development, without
  releases.
- **Kani** is a bounded model checker for Rust built on CBMC. A proof
  harness states inputs and properties; Kani checks panics, overflow,
  undefined behaviour in `unsafe` code and assertions, up to loop bounds
  the user sets. It is the cheapest way to get some machine-checked
  assurance of existing Rust.
- **Aeneas** translates a subset of safe Rust into pure functions in a
  prover, most maturely Lean and HOL4, where they are proved by hand.
  Microsoft verifies its new Rust SymCrypt code (ML-KEM, SHA-3) this way.
  Unsafe code and concurrency are out of scope, which excludes the
  shared-memory parts of a driver.
- **Creusot** (via Why3) and **RefinedRust** (in Rocq, with Iris) are
  further deductive verifiers; **hax** translates Rust to F\* and others,
  mostly for cryptography.

**C**: Frama-C with its WP plug-in proves ACSL contracts with SMT
solvers; VST proves C in the Rocq prover (formerly Coq), connected to the
verified CompCert compiler; CBMC is the bounded model checker under
Kani. The kernel's own tools, Norrish's C parser and **AutoCorres**
(now AutoCorres2), work on any C in their subset, not only the kernel,
and are the only C route that stays in the same logic as the kernel
proofs. They are aimed at Isabelle experts.

**Protocols**: TLA+ (with the TLC model checker) and Spin check models of
concurrent protocols; Iris, in Rocq, proves concurrent code itself.

### Lean

Lean 4 is both a theorem prover and a programming language. As a
language it compiles to C and its runtime manages memory by reference
counting, and its compiler is not verified, so Lean code is not a
candidate for a driver or a protection domain on seL4; no port of its
runtime to seL4 is known (unchecked). Lean's role is as the prover in which
other code is proved:

- Rust through Aeneas, as above;
- a model of a system checked against the real implementation, as AWS
  does for the Cedar policy language (Lean proofs, plus differential
  testing of the Rust implementation against the Lean model);
- machine code through an instruction-set model, as in LNSym for Armv8.

Lean also has its own Hoare-style tooling for monadic programs (the
`mvcgen` tactic in `Std.Tactic.Do`). No seL4 specification exists in
Lean, so a Lean proof meets the kernel proof gap above like any other
non-Isabelle tool.

## Gotchas

- **"Runs on seL4" is not "verified".** A system on a verified kernel
  has verified isolation and nothing else until its own components are
  proved; and only if it uses a verified kernel configuration.
- **A component proof is only as good as its seL4 model.** Outside
  Isabelle, every proof assumes its own description of the system calls;
  check what it assumes about notifications being coalesced, or about
  shared memory changing under the component.
- **Translators are trusted.** The Pancake-to-Viper transpiler, Aeneas
  and Charon, and hax are not verified; neither are the Rust compiler
  behind Verus and Kani, nor the C parser's reading of C (Cogent and
  AutoCorres trust it).
- **Bounded means bounded.** Kani and CBMC results hold only up to the
  loop unwinding the harness sets; an unwinding assertion checks that the
  bound was big enough.
- **Isolation needs the IOMMU or trust.** A DMA-capable device can write
  anywhere unless an [IOMMU](../concepts/iommu.md) confines it, and the
  verified kernel configurations have none; so a driver for such a device
  is trusted whatever its own proof says.
- **The initialiser in use is not the verified one.** Microkit boots
  with the Rust capDL initialiser, which is unverified; the proved
  algorithm is the one behind the older C capDL loader.

## See also

- [The seL4 proofs](verification.md): what is proved of the kernel and what user level inherits
- [l4v and Isabelle](l4v.md): where the kernel specification lives
- [CAmkES and capDL](camkes-capdl.md): capDL and the initialiser
- [Microkit internals](microkit-internals.md): `libmicrokit` and the boot image
- [sDDF](sddf.md): the driver framework and its Spin models
- [LionsOS](lionsos.md): the operating system that uses Pancake components
- [rust-sel4](rust-sel4.md): Rust at seL4 user level
- [IOMMUs: VT-d and SMMU](../concepts/iommu.md): why DMA undoes isolation

## References

- [Pancake project page](https://trustworthy.systems/projects/pancake/):
  aims, verified compiler built on CakeML, LionsOS integration as
  current work. *Checked 2026-11-24.*
- [Pohjola et al., "Pancake: Verified Systems Programming Made Sweeter",
  PLOS 2023](https://cakeml.org/plos23.pdf), sections 1–3: the language,
  the compiler through CakeML's backend and its HOL4 proof, FFI and
  shared memory, sDDF case study. *Checked 2026-11-24.*
- [CakeML `pancake/`](https://github.com/CakeML/cakeml/tree/master/pancake):
  semantics, proofs, compiler targets. *Checked 2026-11-24.*
- [Zhao et al., "Verifying Device Drivers with Pancake", arXiv:2501.08249](https://arxiv.org/abs/2501.08249),
  sections 2.4 and 6: shared-memory events, the Ethernet driver, the
  transpiler in the trusted base, effort. *Checked 2026-11-24.*
- [Pancake transpiler](https://www.trustworthy.systems/projects/pancake-transpiler):
  prototype status, in the trusted base. *Checked 2026-11-24.*
- [Microkit verification](https://trustworthy.systems/projects/microkit/verification):
  the four proof items, the SMT-suitable kernel abstraction still
  required, `libmicrokit` news. *Checked 2026-11-24.*
- [Gordian report on Microkit verification, UNSW, June 2024](https://trustworthy.systems/projects/microkit/gordian-report.pdf),
  section 9.3: the Rust capDL initialiser not yet verified.
  *Checked 2026-11-24.*
- [sDDF `docs/pancake.md`](https://github.com/au-ts/sddf/blob/main/docs/pancake.md):
  Pancake components in sDDF and the Viper route. *Checked 2026-11-24.*
- [sDDF design, release 0.7](https://trustworthy.systems/projects/drivers/sddf-design.pdf),
  section 8: model-checked signalling, driver verification as an aim.
  *Checked 2026-11-24.*
- [sDDF `spin-models.yaml`](https://github.com/au-ts/sddf/blob/main/.github/workflows/spin-models.yaml):
  Spin in CI, bitstate hashing for the driver model. *Checked 2026-11-24.*
- [Darville, seL4 Summit 2024 slides on sDDF models](https://sel4.systems/Summit/2024/slides/using-model.pdf):
  Promela models of sDDF and the open step of relating them to the C.
  *Checked 2026-11-24.*
- [Boyton et al., "Formally verified system initialisation", ICFEM 2013](https://trustworthy.systems/publications/nicta_full_text/7047.pdf):
  the initialiser model proof and its restrictions. *Checked 2026-11-24.*
- [Cogent (old projects)](https://trustworthy.systems/projects/OLD/cogent/)
  and [`au-ts/cogent`](https://github.com/au-ts/cogent): the certifying
  compiler, file systems, Isabelle 2019 requirement. *Checked 2026-11-24.*
- [AutoCorres `README.md`](https://github.com/seL4/l4v/blob/master/tools/autocorres/README.md)
  and [AutoCorres2](https://www.isa-afp.org/entries/AutoCorres2.html):
  abstraction of parsed C, the recommendation to consider AutoCorres2.
  *Checked 2026-11-24.*
- [Verus guide](https://verus-lang.github.io/verus/guide/), "Modes", and
  [publications](https://verus-lang.github.io/verus/publications-and-projects/):
  specifications in Rust syntax, Z3, ghost code, Atmosphere.
  *Checked 2026-11-24.*
- [Kani documentation](https://model-checking.github.io/kani/), "Loop
  unwinding", and [arXiv:2607.01504](https://arxiv.org/abs/2607.01504):
  what Kani checks, bounds, CBMC. *Checked 2026-11-24.*
- [Aeneas `README.md`](https://github.com/AeneasVerif/aeneas): backends,
  limitations. *Checked 2026-11-24.*
- [Microsoft Research, "Verifying Rust cryptography in SymCrypt"](https://www.microsoft.com/en-us/research/blog/verifying-rust-cryptography-in-symcrypt-from-standards-to-code/):
  Aeneas and Lean in use. *Checked 2026-11-24.*
- [Creusot](https://github.com/creusot-rs/creusot),
  [RefinedRust](https://plv.mpi-sws.org/refinedrust/),
  [hax](https://github.com/cryspen/hax): one-line descriptions.
  *Checked 2026-11-24.*
- [Frama-C WP](https://frama-c.com/fc-plugins/wp.html),
  [VST](https://vst.cs.princeton.edu/), [CBMC](https://www.cprover.org/cbmc/):
  one-line descriptions. *Checked 2026-11-24.*
- [de Moura and Ullrich, "The Lean 4 Theorem Prover and Programming Language"](https://lean-lang.org/papers/lean4.pdf)
  and [Lean reference, "Reference counting"](https://lean-lang.org/doc/reference/latest/Run-Time-Code/Reference-Counting/):
  compilation to C, reference counting. *Checked 2026-11-24.*
- [Lean reference, "The `mvcgen` tactic"](https://lean-lang.org/doc/reference/4.32.2/The--mvcgen--tactic/):
  monadic verification conditions. *Checked 2026-11-24.*
- [Lean Zulip, "Lean's TCB for executable programs"](https://leanprover-community.github.io/archive/stream/113488-general/topic/Lean's.20TCB.20for.20executable.20programs.html):
  the compiler to C as a trusted step. *Checked 2026-11-24.*
- [`cedar-policy/cedar-spec`](https://github.com/cedar-policy/cedar-spec)
  and [LNSym](https://github.com/leanprover/LNSym): Lean models with
  differential testing; an Armv8 model in Lean. *Checked 2026-11-24.*
- [TLA+](https://lamport.azurewebsites.net/tla/tla.html),
  [Spin](https://spinroot.com/spin/whatispin.html),
  [Iris](https://iris-project.org/): one-line descriptions.
  *Checked 2026-11-24.*
