# Verification: what the seL4 proofs cover

> seL4's proofs show, for a few exact kernel configurations, that the C code behaves as an abstract specification says and that the specification enforces integrity and confidentiality; boot code, assembly, hardware and every other configuration are assumed, not proved.

[Index](../INDEX.md) › [Part 5: Verification](../INDEX.md#part-5-verification) · ← [CHERI-seL4](cheri-sel4.md) · [l4v and Isabelle](l4v.md) →

Read first: [Overview](overview.md), [Kernel design](kernel-design.md).

| At a glance | |
|---|---|
| Kind | Machine-checked proofs in Isabelle/HOL, for a few exact kernel configurations |
| Repository | [`seL4/l4v`](https://github.com/seL4/l4v) (proofs); the kernel holds the C and the verified configuration files |
| Key source | [`CAVEATS.md`](https://github.com/seL4/seL4/blob/master/CAVEATS.md), `configs/<ARCH>_<plat>_verified.cmake` |
| Config options | `KernelVerificationBuild ON`, `KernelMaxNumNodes 1`, `KernelPrinting OFF`, `KernelBenchmarks none` |
| Built on | [Verified C subset](verified-c-subset.md); the domain scheduler for confidentiality |
| Verified | Functional correctness on `ARM`, `ARM_HYP`, `AARCH64`, `RISCV64`, `X64` and RISC-V [MCS](mcs.md); security proofs on some |
| Assumed | [Boot code](boot-code.md), assembly, hardware, compiler and linker, cache and TLB management, timing channels, DMA |

## What it is

"Verified" has a precise meaning for seL4. There are machine-checked
proofs, written in the interactive theorem prover **Isabelle/HOL**, about
several formal descriptions of the kernel, arranged as a stack. Each
layer is shown to **refine** the one above: every behaviour the lower
layer can show is a behaviour the upper layer allows. So a property
proved of the top layer (if it is of the kind refinement preserves)
holds of the bottom one.

![A stack of five layers: security properties are proved about the abstract specification, the design specification refines the abstract one, the C code refines the design specification, and translation validation links the binary to the C code on some architectures.](../images/verification-stack.svg)

*Each arrow is a proof about the layer it points at; the two refinement
proofs together are functional correctness.*

- **Functional correctness** is the two refinement proofs together: the C
  code implements the abstract specification. As a consequence the C code
  has none of the standard C defects: no buffer overrun, no NULL
  dereference, no undefined behaviour the semantics models, and every
  kernel call terminates.
- **Integrity**: a thread cannot modify anything without a
  [capability](capabilities.md) that authorises it. **Authority
  confinement**: authority cannot spread beyond what the current
  capability distribution allows. Together they are the access-control
  proof.
- **Confidentiality** and **intransitive non-interference**: one
  partition cannot learn about another except through channels the policy
  allows. This proof needs the **domain scheduler** (a fixed cyclic
  schedule of partitions, see [Scheduling](scheduling.md)) and a
  restricted system setup, and it excludes timing channels.
- **Binary correctness**: a separate tool chain checks, for one compiled
  binary, that the machine code refines the C semantics, by decompiling
  the binary and using SMT solvers to match it function by function
  (translation validation). It removes the compiler and linker from the
  trusted base.
- **System initialisation**: a proof that a user-level initialiser,
  given a capDL description, creates exactly the described objects and
  capabilities ([CAmkES and capDL](camkes-capdl.md)).
- **Worst-case execution time**: a sound static analysis of the binary's
  kernel paths was done for Armv6 processors as research; the white
  paper says it has since fallen into abeyance.

### What is covered now

From the kernel's `CAVEATS.md` at `master`:

| Architecture (`L4V_ARCH`) | Configuration | Functional correctness | Security proofs | Binary |
|---|---|---|---|---|
| AArch32 (`ARM`) | Armv7-A, no hypervisor, no FPU, no SMMU, fast path | yes | integrity, confidentiality, non-interference; system initialisation | available |
| AArch32 (`ARM_HYP`) | Armv7-A with hypervisor extensions | yes | none listed | not stated |
| AArch64 (`AARCH64`) | Armv8-A, hypervisor mode only, FPU, no SMMU, fast path | yes | integrity; the others "in progress" | no |
| RISC-V (`RISCV64`) | 64-bit, no FPU, no fast path | yes | integrity, confidentiality, non-interference | available |
| x86-64 (`X64`) | `pc99`, no VT-x, no VT-d, FPU, no fast path | yes | none | no |
| RISC-V [MCS](mcs.md) | as RISC-V, `KernelIsMCS` | yes | none | no |

Each row is a set of exact configurations: the files
`configs/<ARCH>_<plat>_verified.cmake` in the kernel. The default
platforms are `imx6` (`sabre`), `tk1`, `tx2`, `hifive` and `pc99`; the
other verified platforms (ten more for AArch32, fourteen for AArch64,
seven for RISC-V) share the architecture's proof with platform constants
changed.

### What is assumed

The proofs are about a model. Where the model meets the world, it
assumes:

- **Boot code.** Everything marked `BOOT_CODE` runs once, before the
  state the proofs start from exists. The proofs assume it leaves the
  kernel in a state satisfying the invariants ([Boot code](boot-code.md)).
- **Assembly and machine interface.** Entry and exit stubs, context
  switching, and the small functions that touch hardware (TLB and cache
  flushes, reading a fault register, programming the interrupt
  controller) are specified by what they are assumed to do.
- **Hardware.** The machine behaves as the model says; no errata, no
  bit flips.
- **Compiler and linker**, unless binary verification was run on the
  binary in use.
- **Cache and TLB management.** `CAVEATS.md` lists these as not covered:
  the model mostly does not track whether a flush was needed.
- **Timing and other side channels** are outside the confidentiality
  statement.
- **DMA.** A device that can write memory by itself bypasses the kernel.
  The verified configurations have the IOMMU drivers off (no SMMU, no
  VT-d), so a system must give DMA-capable devices only to trusted
  components (see [IOMMU](../concepts/iommu.md)).
- **The proof tools**: Isabelle's kernel, the C parser's semantics for C,
  and the specifications meaning what a reader takes them to mean.

## In seL4

- The proofs live in [`seL4/l4v`](https://github.com/seL4/l4v)
  ([l4v](l4v.md)). The kernel repository holds only the C and the
  verified configuration files.
- A verified configuration sets `KernelVerificationBuild ON`,
  `KernelMaxNumNodes 1` (no SMP), `KernelPrinting OFF`,
  `KernelBenchmarks none`, `KernelNumDomains 16`, `-O2`, and per
  architecture such options as `KernelArmHypervisorSupport ON` and
  `KernelArmSMMU OFF` (AArch64) or `KernelFSGSBase inst` (x64); see
  `configs/include/*_verified_include.cmake`.
- `CAVEATS.md` says the proofs "are generally sensitive to changes in
  configuration parameters, and will break if these are changed"; only a
  few (the number of domains and the domain schedule) are proved for any
  value.
- Verified C keeps to the C parser's subset
  ([Verified C subset](verified-c-subset.md)).

## Gotchas

- **Most kernels in use are not the verified one.** Any SMP build, any
  x86 build with VT-x or 32-bit, MCS on anything but RISC-V, a debug
  build with printing, or a platform without a `_verified` file is
  outside the proofs, though it shares most of its source with a verified
  configuration. `CAVEATS.md`: in unverified configurations "standard C
  implementation defects are possible".
- **Files named `_verified` are not a claim of completed proof.**
  `ARM_MCS_verified.cmake` and `AARCH64_MCS_verified.cmake` exist while
  the caveats say only RISC-V MCS is proved and AArch64 MCS is in
  progress; the files define the configuration the proof work targets.
- **x86 has the weakest statement**: functional correctness for one
  64-bit configuration without virtualisation or IOMMU, no security
  proofs, no binary verification.
- **AArch64 is verified only as a hypervisor** (kernel at EL2); the
  non-hypervisor AArch64 kernel is unverified.
- **"Verified" says nothing about user level.** Drivers, Microkit, the
  root task and the elfloader are ordinary code, except where they have
  proofs of their own (the capDL initialiser's specification).
- **A proof is of a commit.** The claims attach to releases and to the
  kernel revisions recorded as proved in the verification manifest, not
  to `master` at an arbitrary moment.

## See also

- [l4v](l4v.md): the repository that holds the specifications and proofs
- [Verified C subset](verified-c-subset.md): the C the proofs can read
- [Proof impact](proof-impact.md): judging whether a patch touches any of this
- [Boot code](boot-code.md): the largest assumed part of the kernel
- [SMP](smp.md): the main unverified configuration
- [History and papers](history-and-papers.md): the papers behind each proof
- [RISC-V basics](../concepts/riscv-basics.md): the RISC-V architecture as a kernel sees it
- [Governance and RFCs](governance.md): who decides what goes into seL4
- [Platform ports](platform-port.md): A platform is the kernel's build-time description of one board or machine family
- [Verifying user-level software](user-level-verification.md): proofs for drivers, components and applications on top of the kernel

## References

- [seL4 `CAVEATS.md`](https://github.com/seL4/seL4/blob/master/CAVEATS.md),
  "Implementation Correctness", "Verified Configurations", "MCS", "SMP":
  the table above, the list of what is not covered, the security
  properties per architecture. *Checked 2026-11-14.*
- [seL4 `configs/`](https://github.com/seL4/seL4/tree/master/configs):
  the verified configuration files and their includes.
  *Checked 2026-11-14.*
- [l4v `README.md`](https://github.com/seL4/l4v/blob/master/README.md):
  the specifications and proofs by directory. *Checked 2026-11-14.*
- [Verified configurations](https://docs.sel4.systems/projects/sel4/verified-configurations.html):
  the docs site's lists per architecture, "Unverified Features".
  *Checked 2026-11-14.*
- [What the proofs assume](https://sel4.systems/Verification/assumptions.html):
  the Foundation's plain-language list. *Checked 2026-11-14.*
- [seL4 `CAVEATS.md`](https://github.com/seL4/seL4/blob/master/CAVEATS.md),
  "Devices, DMA, and Device-Untypeds": the DMA assumption, IOMMU and
  SMMU outside the verified configurations. *Checked 2026-11-14.*
- [The seL4 Microkernel: An Introduction](https://sel4.systems/About/seL4-whitepaper.pdf)
  (white paper, revision 1.4.1), on worst-case execution time: the
  analysis for Armv6 and its lapse. *Checked 2026-11-14.*
- [Klein et al., "Comprehensive formal verification of an OS
  microkernel", ACM TOCS 32(1), 2014](https://trustworthy.systems/publications/nictaabstracts/Klein_AEMSKH_14.abstract):
  the refinement stack, security proofs, binary verification and WCET
  analysis in one paper (publication page and abstract read).
  *Checked 2026-11-14.*
