# CHERI-seL4

> CHERI-seL4 is an experimental, unverified fork of seL4 that saves and restores CHERI capability registers and builds user threads' initial CHERI capabilities through three new TCB invocations, so that memory-safe purecap programs and unmodified ones can run in separate protection domains on CHERI-RISC-V and Morello; a reduced form is proposed upstream and not accepted as of November 2026.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Inside the kernel](../INDEX.md#inside-the-kernel) · ← [Debugging](debugging.md) · [The seL4 proofs](verification.md) →

Read first: [CHERI](../concepts/cheri.md), [Threads and TCBs](threads.md), [Address spaces (VSpace)](vspace.md), [Microkit](microkit.md).

| At a glance | |
|---|---|
| Kind | Kernel fork, experimental; state as of November 2026 |
| Repository | [`CHERI-Alliance/CHERI-seL4`](https://github.com/CHERI-Alliance/CHERI-seL4), branch `cheri-microkit` |
| Key source | `src/cheri/cheri.c`, `src/object/tcb.c`, `src/arch/riscv/kernel/vspace.c`, `src/arch/riscv/c_traps.c` |
| Config options | `KernelRiscvExtY` or `KernelArmMorello`, which set `CONFIG_HAVE_CHERI` |
| API | `seL4_TCB_CheriWriteRegister`, `seL4_TCB_CheriReadRegister`, `seL4_TCB_CheriWriteMemoryCap` |
| Object size | TCB 2^11 bytes on RISC-V, 2^12 on AArch64 |
| Used by | A CHERI fork of [Microkit](microkit.md) |
| Verified | Nothing: the CHERI configuration is not verified |

## What it is

### Why combine them

seL4's proofs guarantee isolation *between* protection domains: one
cannot reach another's memory or objects without a capability that
allows it. Nothing protects a protection domain from its own bugs. A C
network stack, file system or virtual machine monitor in one address
space can still overflow a buffer and be taken over; seL4 limits the
damage to what that domain holds, but cannot stop it.
[CHERI](../concepts/cheri.md) does the opposite job: it makes C and
C++ pointers bounded, unforgeable hardware capabilities, protecting
code inside one address space, but on its own it does not give the
verified isolation seL4 does.

CHERI-seL4 puts the two together. The kernel is changed so that user
threads can run CHERI code: purecap programs, in which every pointer is
a capability, beside hybrid and unmodified programs, and programs in
other languages such as Rust, each in its own protection domain. A
typical configuration the authors give is a legacy 64-bit Arm virtual
machine isolated by seL4 from a hardened CHERI task.

### A hybrid kernel

The kernel itself is compiled as hybrid CHERI code: its own pointers
stay 64-bit integers, as in upstream seL4, and only values that belong
to user level are capabilities. The kernel needs no memory safety from
CHERI, since its correctness is what the proofs are for; it needs only
to carry user capabilities without destroying them. So:

- every saved user register is a capability, 16 bytes wide, so a TCB's
  register context doubles in size;
- trap entry and exit save and restore whole capability registers,
  including `ddc` and the saved program counter;
- the kernel runs with a root capability in its own `pcc`, from which
  it derives anything it gives to user level.

### Only the kernel makes CHERI capabilities

A CHERI capability can only be made from another one. In a system of
mutually distrusting components, some piece of software has to create
each component's first capabilities, and whoever does so holds the
power to create any capability. CHERI-seL4 keeps that power in the
kernel and puts it behind seL4 capabilities. User level describes the
CHERI capability it wants as integers (base, address, length and a
word of metadata: permissions, sealed or not, pointer mode, tagged or
not) and invokes a TCB capability; the kernel builds the CHERI
capability from its own root, narrowing it to what was asked, and
writes it into the target.

![A component holding seL4 capabilities to a thread and an address space asks the kernel, with integer arguments, for a CHERI capability; the kernel derives it from its root pcc and writes it into the target thread's saved registers.](../images/cheri-sel4-write-register.svg)

*No CHERI capability passes from one component to another. The caller
hands over integers and seL4 capabilities; the only tagged capability
in the picture is the one the kernel derives and writes into the
target thread.*

Three invocations on a TCB capability do this:

| Invocation | Extra caps | Does |
|---|---|---|
| `CheriWriteRegister` | a VSpace root, optionally a VCPU | Builds a capability from base, address, size and metadata and writes it into one of the target thread's general registers, its program counter or its `ddc` |
| `CheriReadRegister` | none | Returns one register of the target thread taken apart: base, address, length and metadata, as four message words |
| `CheriWriteMemoryCap` | a VSpace root and a frame | Builds a capability and stores it, tag and all, at a 16-byte aligned virtual address in that frame |

`CheriWriteRegister` derives from the kernel's root only when a valid
VSpace capability is passed; without one it derives from the value
already in the register, so it can narrow but not widen it. A thread
cannot use it on itself. Capabilities made for user level lose the ASR
permission (privileged instructions and control registers) unless,
in a hypervisor build, the caller passes the VCPU bound to that
thread, which a guest operating system needs. `CheriWriteMemoryCap`
requires the frame to be mapped writable in the given address space at
that address.

Everything else carries integers only. System call arguments and IPC
messages are words, as upstream, and the IPC buffer is not a place
capabilities can travel: the root task's capability to its IPC buffer
lacks the C permission, so tags stored there are dropped. A tagged
pointer therefore cannot leave the address space it was made for by
accident; the review of the design upstream settled on this rule.

### Starting threads

At boot the kernel gives the root task capabilities instead of
integers: the `seL4_BootInfo` pointer and the IPC buffer pointer are
CHERI capabilities bounded to those regions and without execute
permission. The entry point decides the pointer mode. If the root task
starts in integral pointer mode (legacy, hybrid, Rust), its `ddc` is
derived from the kernel's root without execute permission, so that
its ordinary loads and stores work; if it starts in capability pointer
mode (purecap), its `ddc` is null, so that it cannot fall back to
unchecked integer addresses. The kernel turns on CHERI for user mode at
boot.

Every other thread gets its capabilities from whoever builds it. In the
CHERI fork of Microkit, the `microkit` tool reads each protection
domain's ELF flags to see whether it is purecap and adds the matching
`CheriWriteRegister` invocations to those it generates to build the
system:

- **Purecap domain**: a null `ddc`; a `pcc` sealed as an entry
  capability, in capability mode, spanning the code and data segments,
  without store or ASR permission; a stack capability bounded to the
  stack, without execute; and in the first two argument registers a code
  capability and a data capability, from which libmicrokit's start-up
  code derives capabilities for the program's globals. The ELF must have
  exactly one code and one data segment.
- **Legacy or hybrid domain**: `pcc` and `ddc` spanning the whole
  address space, in integral pointer mode, so the program runs as it
  would without CHERI.

### Faults and page tables

A CHERI exception (a bounds, tag or permission violation) is delivered
to the thread's fault handler as an ordinary
[VM fault](faults.md) message, with the CHERI cause code in its fault
status field, which the fork widens to fit.

On RISC-V every user leaf mapping is created with the page table bit
that lets capabilities be loaded and stored through the page; a comment
in the source marks exposing it to user level as still to do. The
Microkit fork's tool defines VM attributes for it on RISC-V and for
separate capability-read and capability-write bits on Morello.

### Hardware

| Platform | Architecture | Notes |
|---|---|---|
| `ariane` with `KernelRiscvExtY` | CHERI-RISC-V | CVA6-CHERI on FPGA; top 8 MiB of memory reserved for tags |
| `hobgoblin-vcu118` | CHERI-RISC-V | A Codasip FPGA platform; code that runs on its QEMU model also runs on Codasip's X730 |
| `toooba-besspin`, `toooba-de10` | CHERI-RISC-V | Toooba core on FPGA |
| `morello-qemu` | Morello | QEMU's Morello machine with GICv2; hypervisor build supported |

The project page names QEMU, CVA6-CHERI and Morello as the main
targets.

### Where it came from

CHERI on seL4 has been tried several times:

- A 2018 prototype added a CHERI-RISC-V register context to seL4
  9.0.1, with a variant for machines without an MMU in which user code
  ran in M-mode sandboxed by CHERI.
- A research prototype, presented at the 2024 seL4 Summit, ported the
  kernel itself to purecap as well as hybrid, ported sel4test, sel4bench
  and the libraries they use to purecap, and passed all of sel4test. It
  also explored passing CHERI capabilities in IPC. It supported Morello
  and two versions of CHERI-RISC-V and is no longer maintained.
- The current variant, released in 2025 with the Microkit fork and a
  book of exercises, keeps only the minimal changes, aiming at
  upstreaming and at eventual verification.
- A proof of concept on Morello runs CHERI-seL4 as a hypervisor, with
  CheriBSD and CHERI Linux guests and memory-safe virtual machine
  monitors side by side.

The project reports that seL4 tasks get spatial and referential safety
but not yet temporal safety or compartmentalisation, which need
run-time support that does not exist yet; guest operating systems such
as CheriBSD get all of CHERI's features.

## In seL4

None of this is in upstream seL4. The fork's `cheri-microkit` branch is
seL4's `microkit` branch (merged with upstream `master` of May 2025)
plus 20 CHERI commits, which change 88 files by some 3300 lines.

### Source

- **Types.** `rword_t`, a new type for a saved register, and `vptr_t`
  become `__uintcap_t` (a capability-sized integer) when
  `CONFIG_HAVE_CHERI` is set, and stay `word_t` otherwise. In libsel4,
  `__user` expands to `__capability` when the compiler supports
  capabilities and to nothing otherwise.
- **Building capabilities.** `cheri_sel4_build_cap()` in
  `src/cheri/cheri.c` narrows a source capability with compiler
  built-ins: clear permissions, set address, set bounds, set mode, strip
  ASR for user capabilities, seal as an entry if asked.
  `CheriArch_BuildCap()` in `src/arch/{riscv,arm}/cheri/cheri.c` unpacks
  the metadata word for each architecture.
- **Invocations.** Declared in `libsel4/include/interfaces/object-api.xml`
  under the TCB interface, decoded in `src/object/tcb.c`
  (`decodeCheriWriteRegister`, `decodeCheriReadRegister`) and, for
  memory, in `src/arch/riscv/kernel/vspace.c`
  (`decodeCheriWriteMemoryCap`). The metadata word's layout is the
  bitfield block `CheriCapMeta` in each architecture's
  `shared_types.bf`.
- **Entry and exit.** On RISC-V, `LOAD` and `STORE` in `hardware.h`
  become the capability instructions `ly` and `sy` and `REGBYTES` 16;
  `restore_user_context()` in `c_traps.c` switches to capability pointer
  mode to reload the registers and `ddc` before `sret`. At boot `stvec`
  is set to a capability for `trap_entry` derived from the kernel's
  `pcc`.
- **Boot.** `src/arch/riscv/kernel/boot.c` builds the BootInfo and
  IPC buffer capabilities and enables CHERI for user mode;
  `CheriArch_initContext()` sets the root task's `pcc` and `ddc`.
- **Faults.** New RISC-V cause codes 32 to 36 in
  `include/arch/riscv/arch/machine/hardware.h`, turned into VM faults in
  `handleVMFault()`.

### Configuration

`KernelRiscvExtY` (RISC-V; "Y" stands for the CHERI base, and a
comment notes the name may change) or `KernelArmMorello` sets
`HaveCheri`, which becomes `CONFIG_HAVE_CHERI` in `gen_config.h` and
adds the CHERI source files. The kernel then needs a CHERI-capable
Clang: `-march` gains `_zyhybrid_zylg` on RISC-V and becomes `morello`
on Arm, with the hybrid ABI. See
[Build system and configuration](build-system.md).

### Upstream status

- [RFC-15, "Support CHERI/Morello in seL4"](https://github.com/seL4/rfcs/pull/21)
  ([governance](governance.md)) has been open since 2024. Review
  established two requirements: non-CHERI user programs must keep
  working beside purecap ones, and there must be a sound model for who
  may hold capabilities to which address space. The review proposed
  replacing CHERI capabilities that cross address spaces with a system
  call that builds them from integers; that became `CheriWriteRegister`.
- A first implementation pull request, with a hybrid kernel and
  CHERI capabilities in IPC, was closed in March 2026.
- [seL4/seL4#1469, "Minimal CHERI support"](https://github.com/seL4/seL4/pull/1469),
  is open: hybrid kernel, standard CHERI-RISC-V only, no CHERI
  capabilities in IPC, the three invocations. Review asked for
  `CheriWriteMemoryCap` to require a frame capability, which it now
  does, and questioned retyping `vptr_t` as a capability instead of
  marking each use. After updating to the 0.9.10 draft of the RISC-V
  specification it changes about 930 lines.

### Proof impact

The CHERI code is behind `CONFIG_HAVE_CHERI`, which no verified
configuration sets, but the changes are not all inside it: generic code
such as `getRegister()` and `setRegister()` in
`include/machine/registerset.h` now uses `rword_t`, and `vptr_t` and
the IPC buffer pointer in `seL4_BootInfo` gain new types, which are the
old ones when CHERI is off. Even a change that leaves the compiled code
the same can change what the C parser sees.
Anything a verified configuration compiles needs the proofs rerun; see
[Proof impact of a change](proof-impact.md). The CHERI configuration
itself, like [SMP](smp.md), would be an unverified configuration.

## Gotchas

- **A VSpace capability unlocks the root.** As of the fork's commit
  `219d72e3` (October 2026), `CheriWriteRegister` checks only that the
  VSpace capability is a valid address space root, not that it is the
  target thread's. A TCB capability plus any VSpace capability is
  therefore enough to give that thread any CHERI capability.
- **Structures shared with non-CHERI code.** The BootInfo pointer to the
  IPC buffer is 16 bytes in a CHERI kernel; when the root task is built
  without CHERI support, a padding word in `seL4_BootInfo` keeps the
  later fields where it expects them.
- **Bigger TCBs.** Doubling the saved registers makes `seL4_TCBBits`
  11 on RISC-V even without an FPU (10 upstream) and 12 on AArch64
  (11 upstream without the debug options); tools that size objects
  themselves, such as Microkit's, must know.
- **Tag memory.** On CVA6-CHERI the top 8 MiB of memory hold the tags,
  and the device tree overlay reserves it so the kernel does not hand it
  out as untyped memory.
- **A moving specification.** The RISC-V side follows a draft
  (instruction names such as `ymodeswy`, cause codes, the config name);
  the fork has been updated as the draft changed and will need to be
  again.
- **Old emulator.** In 2025 the QEMU fork carrying the Codasip
  machine was based on QEMU 6.2.

## See also

- [CHERI](../concepts/cheri.md): the architecture, purecap and hybrid code, Morello and CHERI-RISC-V
- [Capabilities](capabilities.md): seL4's own capabilities, which here guard the power to make CHERI ones
- [Threads and TCBs](threads.md): the object the new invocations are on
- [Microkit](microkit.md): the framework the CHERI fork of Microkit extends
- [Faults and fault handlers](faults.md): how CHERI exceptions reach user level
- [Virtualisation support](hypervisor.md): the hypervisor build used on Morello
- [Governance and RFCs](governance.md): how the upstream proposal is decided

## References

- [CHERI-seL4 kernel fork](https://github.com/CHERI-Alliance/CHERI-seL4),
  branch `cheri-microkit` at `219d72e3`, compared with upstream at the
  merge base `5e6f7c2b`: every source detail on this page. *Checked 2026-11-24.*
- [CHERI-Microkit](https://github.com/CHERI-Alliance/CHERI-Microkit),
  branch `cheri`: `tool/microkit/src/cheri.rs` (per-domain register
  set-up), `tool/microkit/src/sel4.rs` (TCB sizes, VM attributes),
  `libmicrokit/src/cheri.c`. *Checked 2026-11-24.*
- [CHERI-seL4 Exercises](https://github.com/CHERI-Alliance/CHERI-seL4-Exercises):
  the book of exercises and missions for CHERI-seL4 and CHERI-Microkit.
  *Checked 2026-11-24.*
- [CHERI-seL4 project page](https://www.cl.cam.ac.uk/research/security/ctsrd/cheri/cheri-sel4.html),
  University of Cambridge: the two variants, main targets, what safety
  tasks get, the hypervisor proof of concept. *Checked 2026-11-24.*
- [CHERI-seL4: Enhancing seL4's C/C++ userspace memory safety using CHERI](https://sel4.systems/Summit/2024/slides/cheri-morello.pdf),
  seL4 Summit 2024: goals, the hybrid and purecap kernel options, the
  research prototype's results. *Checked 2026-11-24.*
- [seL4/rfcs#21](https://github.com/seL4/rfcs/pull/21), RFC-15 and its
  discussion. *Checked 2026-11-24.*
- [seL4/seL4#1469](https://github.com/seL4/seL4/pull/1469), "Minimal
  CHERI support", and its review; [seL4/seL4#1344](https://github.com/seL4/seL4/pull/1344),
  the earlier pull request. *Checked 2026-11-24.*
- [Experimental prototype of CHERI-enabled seL4 is released](https://www.mail-archive.com/devel@sel4.systems/msg04530.html),
  seL4 devel list, July 2025: the Codasip QEMU machine and X730. *Checked 2026-11-24.*
- [sel4-cheri](https://github.com/heshamelmatary/sel4-cheri), branches
  `cheri` and `mmuless`: the 2018 prototype. *Checked 2026-11-24.*
- [Research prototype](https://github.com/CTSRD-CHERI/seL4): the
  earlier, unmaintained variant. *Unchecked; only its branch list was read.*
