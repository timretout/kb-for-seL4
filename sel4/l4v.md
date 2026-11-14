# l4v: the proof repository

> `seL4/l4v` holds the Isabelle/HOL specifications and proofs of seL4; it reads the kernel's C as one preprocessed file per verified configuration, and a manifest repository records which kernel commit the proofs currently match.

Read first: [Verification](verification.md).

## What it is

[`seL4/l4v`](https://github.com/seL4/l4v) ("L4.verified") is where the
proofs live. It contains no kernel code. A proof run takes a kernel
checkout beside it (`../seL4`), builds the kernel's C into a single
preprocessed file for one verified configuration, parses that into
Isabelle, and checks every proof against it.

### Layout

| Path | Contents |
|---|---|
| `spec/abstract` | the **abstract specification** (ASpec): what each system call does, written as Isabelle functions in a nondeterministic state monad |
| `spec/haskell` | the **Haskell prototype** of the kernel, an executable model "kept in sync with the C code" |
| `spec/design` | the **design** (executable) specification, *generated* from the Haskell by `tools/haskell-translator`; partly generated files, not all tracked in git |
| `spec/machine` | the **machine interface**: the hardware operations both specifications call, with assumed behaviour |
| `spec/cspec` | the entry point that imports the kernel C into Isabelle; `spec/cspec/c/` holds the make rules that build `kernel_all.c_pp` |
| `spec/capDL`, `spec/sep-abstract`, `spec/take-grant` | the capDL model of protection state; a separation-kernel variant; a classical take-grant model |
| `proof/invariant-abstract` | invariants of the abstract specification (AInvs): hundreds of properties every kernel state satisfies |
| `proof/refine` | refinement, abstract to design (Refine) |
| `proof/crefine` | refinement, design to C (CRefine): the largest and slowest part |
| `proof/access-control` | integrity and authority confinement |
| `proof/infoflow` | confidentiality and non-interference |
| `proof/drefine` | refinement, capDL to abstract |
| `proof/asmrefine` | the Isabelle half of binary verification (exports the C semantics for the SMT-based checker) |
| `lib/` | proof libraries: machine words (`Word_Lib`), monads and their Hoare logic, the `crunch` tool that proves simple invariants across many functions automatically |
| `tools/c-parser` | the C-to-Isabelle parser and its memory model |
| `tools/autocorres` | a tool that abstracts parsed C into simpler monadic functions; used for user-level proofs, not the kernel refinement |
| `sys-init` | the capDL system initialiser's specification and proof |
| `camkes` | a formalisation of CAmkES, described as work in progress |
| `docs/` | conventions, commit message rules, `setup.md`, notes on the architecture split |
| `run_tests`, `misc/` | the test runner and scripts |

### Architectures

Every proof is selected by the environment variable `L4V_ARCH`: one of
`ARM` (AArch32), `ARM_HYP` (AArch32 with hypervisor extensions),
`AARCH64`, `RISCV64`, `X64`. Most directories have a subdirectory per
architecture (`proof/refine/RISCV64/`), plus generic theories shared by
all; moving shared material out of the per-architecture copies is the
ongoing "arch split" (`docs/arch-split.md`). `ARM` has the most complete
set of proofs. Two more variables refine the choice: `L4V_FEATURES`
(for example `MCS`) and `L4V_PLAT` (a platform other than the default).
Together they name the kernel configuration file:

```
configs/${L4V_ARCH}[_${L4V_FEATURES}][_${L4V_PLAT}]_verified.cmake
```

### How the C gets in

`spec/cspec/c/kernel.mk` runs the kernel's own CMake build with that
configuration file and the target `kernel_all_pp_wrapper`. The kernel
build concatenates every source file into one translation unit and runs
the C preprocessor over it; the result is copied to
`spec/cspec/c/build/$L4V_ARCH/kernel_all.c_pp`. That file has no macros,
no `#ifdef`s and no includes left: it is exactly the C that this
configuration compiles.

The C parser reads `kernel_all.c_pp` and produces, inside Isabelle, a
program in **Simpl** (a small imperative language with a formal
semantics) for each C function, and a typed model of the heap. Functions
generated from the kernel's bitfield specifications (`structures.bf`)
get their specifications and proofs generated alongside
([Generated code](generated-code.md)). CRefine then proves, function by
function, that the Simpl program corresponds to the design
specification's function of the same name.

The design specification follows the Haskell: a kernel change is made
three times (C, Haskell, abstract specification if behaviour visible at
that level changes), and then the proofs are repaired.

### Running it

`L4V_ARCH=ARM ./run_tests` runs everything for one architecture;
`./run_tests <name>` runs one test and what it depends on (names such as
`AInvs`, `Refine`, `CRefine` come from the `tests.xml` files). Isabelle
caches each finished **session** as a heap image, so a second run redoes
only what changed. The README gives the resources: most proofs fit in
4 GB of memory, the C refinement wants about 16 GB, and up to about 8
cores are useful. A full run from nothing for one architecture takes
some hours of machine time (unchecked: no figure in the README). The
exact Isabelle version is pinned: the `repo` manifest checks it out as
`l4v/isabelle`.

To get a consistent set of checkouts:

```sh
mkdir verification && cd verification
repo init -u https://git@github.com/seL4/verification-manifest.git
repo sync
```

Upstream runs the proofs on AWS machines started by the `aws-proofs`
action ([CI](ci.md)), inside the Foundation's Docker images.

## In seL4

How kernel and proofs stay in step:

- [`seL4/verification-manifest`](https://github.com/seL4/verification-manifest)
  holds `repo` manifests. `default.xml` pins the last kernel and `l4v`
  commits for which the proofs passed together; `devel.xml` tracks the
  `master` branches; `mcs.xml` and `mcs-devel.xml` do the same for the
  MCS proofs; there are manifests for releases.
- After a push to the kernel's `master`, the "Proof Sync" workflow runs
  the preprocess check against the manifest. If `kernel_all.c_pp` is
  unchanged for every verified configuration, it advances the kernel
  revision in the manifest without running proofs. Otherwise the `l4v`
  "Proofs" workflow runs everything and advances the manifest when it
  passes.
- A kernel change that breaks proofs is merged together with the `l4v`
  change that repairs them: two pull requests, one in each repository,
  linked, and merged by the committers at the same time. Between the
  two merges `devel.xml` is briefly inconsistent; `default.xml` never
  is.
- `l4v` has its own commit message rules (`docs/commit-messages.md`):
  the subject may be up to 78 characters because it begins with tags
  naming the affected part, such as `riscv crefine:` (unchecked example).

In the kernel repository the proofs are visible only as the
`configs/*_verified.cmake` files, the `kernel_all_pp_wrapper` build
target, the `KernelVerificationBuild` option, and comments of the form
`/** MODIFIES: ... */` or `/** DONT_TRANSLATE */` that are annotations
for the C parser.

## Gotchas

- **A proof failure is rarely where the change was.** Changing one C
  function can break its CRefine proof, an invariant in AInvs if the
  specification had to change, and access-control or infoflow proofs
  that depend on the specification.
- **Five architectures means up to five repairs.** A change to generic
  kernel code must be repaired for every `L4V_ARCH` whose configuration
  compiles it.
- **The Haskell is not the source of truth for the kernel, and not
  optional either.** A C change without the matching Haskell change
  fails Refine or CRefine, not a compiler.
- **`spec/design` looks hand-written but is generated.** Edit
  `spec/haskell` and the skeleton files, then regenerate.
- **Using `devel.xml` can give a kernel the proofs do not match yet.**
  For a known-good pair use the default manifest.
- **Platform variants.** Proving for a non-default platform
  (`L4V_PLAT`) needs the platform to be one the proofs are set up for;
  constants such as physical address ranges enter the proofs.

## See also

- [Verification](verification.md): what these proofs claim and assume
- [Verified C subset](verified-c-subset.md): what the C parser accepts
- [Proof impact](proof-impact.md): deciding whether a kernel patch needs any of this
- [Generated code](generated-code.md): the bitfield generator and its proof output
- [CI](ci.md): the workflows that run proofs and move the manifest

## References

- [l4v `README.md`](https://github.com/seL4/l4v/blob/master/README.md):
  layout by directory, `L4V_ARCH`, memory and core needs, `run_tests`.
  *Checked 2026-11-14.*
- [l4v `spec/cspec/c/kernel.mk`](https://github.com/seL4/l4v/blob/master/spec/cspec/c/kernel.mk):
  the configuration name from `L4V_ARCH`, `L4V_FEATURES`, `L4V_PLAT`;
  the `kernel_all_pp_wrapper` target and the copy to `kernel_all.c_pp`.
  *Checked 2026-11-14.*
- [l4v `docs/setup.md`](https://github.com/seL4/l4v/blob/master/docs/setup.md):
  the `repo` commands, `devel.xml` against the default manifest.
  *Checked 2026-11-14.*
- [l4v `docs/commit-messages.md`](https://github.com/seL4/l4v/blob/master/docs/commit-messages.md):
  78-character subject with tags. *Checked 2026-11-14.*
- [seL4 `preprocess-deploy.yml`](https://github.com/seL4/seL4/blob/master/.github/workflows/preprocess-deploy.yml):
  the Proof Sync flow and the `devel.xml`, `mcs-devel.xml` manifests.
  *Checked 2026-11-14.*
- [`seL4/verification-manifest`](https://github.com/seL4/verification-manifest):
  the manifest files. *Unchecked: file names taken from the workflows,
  repository not opened.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
