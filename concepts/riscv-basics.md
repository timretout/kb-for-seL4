# RISC-V basics

> The RISC-V architecture as a kernel sees it: 31 integer registers, named extensions, three privilege modes, control and status registers, and firmware services reached through the SBI; seL4 runs in S-mode on top of OpenSBI, and its 64-bit RISC-V port is one of the verified configurations.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [RISC-V](../INDEX.md#risc-v) · ← [Arm virtualisation (EL2)](arm-virtualisation.md) · [RISC-V paging and traps](riscv-paging-and-traps.md) →

Read first: [Privilege levels](privilege-levels.md).

| At a glance | |
|---|---|
| Kind | Processor architecture |
| Architecture | RISC-V |
| Reached through | CSRs, with the `Zicsr` instructions; firmware through `ecall` (the SBI) |
| Found through | Extensions from the `riscv,isa` strings in the [device tree](device-tree.md) |
| Key numbers | 32 integer registers `x0` to `x31`, `x0` always zero; three modes M, S, U; up to 4096 CSRs |
| seL4 code | [`src/arch/riscv/`](https://github.com/seL4/seL4/tree/master/src/arch/riscv) |
| seL4 config | `KernelArch` = `riscv`; `KernelSel4Arch` = `riscv64` or `riscv32` |
| seL4 use | Kernel in S-mode on OpenSBI, using only legacy SBI calls; `RISCV64` is a verified configuration |

## What it is

RISC-V is an open instruction set, specified in two volumes: the
unprivileged ISA (what a user program can rely on) and the privileged
architecture (modes, traps, paging). It is small and regular compared
with x86-64 and AArch64, and much of what those architectures do in
hardware is left to software or to optional extensions. That makes it
the easiest of the three to read kernel code for, and it is the
architecture on which seL4's proofs are most complete.

### Base and extensions

A RISC-V processor implements a *base* integer instruction set plus
any number of *extensions*, and its name spells them out:

| Part | Meaning |
|---|---|
| `RV32I`, `RV64I` | base integer set with 32-bit or 64-bit registers. The register width is called XLEN |
| `M` | integer multiply and divide |
| `A` | atomic instructions (load-reserved/store-conditional, `lr`/`sc`, and atomic memory operations) |
| `F`, `D` | single- and double-precision floating point |
| `C` | compressed 16-bit encodings of common instructions |
| `G` | shorthand for `IMAFD` plus `Zicsr` and `Zifencei` |
| `Zicsr` | the instructions that access control and status registers |
| `Zifencei` | `fence.i`, which synchronises the instruction cache after code is written |
| `H` | the hypervisor extension |
| `Sstc` | supervisor-mode timer compare register (see [RISC-V interrupts](riscv-interrupts.md)) |

So `RV64GC`, the usual "general purpose" target, is
`RV64IMAFDC_Zicsr_Zifencei`. Names beginning `Z` are unprivileged
extensions, `S` supervisor-level and `Sm` machine-level ones. `S` and
`U` on their own are also used loosely for "has supervisor mode" and
"has user mode". A kernel learns which extensions a machine has from
the `riscv,isa` strings in the [device tree](device-tree.md), not from
a CPUID-like instruction.

### Registers

There are 32 integer registers, `x0` to `x31`, each XLEN bits wide,
and a separate program counter `pc`. `x0` is hardwired to zero, which
leaves 31 real ones. The hardware treats them all alike (there is no
dedicated stack pointer or link register); the roles come from the
calling convention, and assembly is written with the ABI names:

| Register | ABI name | Role | Preserved across calls |
|---|---|---|---|
| `x0` | `zero` | always zero | |
| `x1` | `ra` | return address | no |
| `x2` | `sp` | stack pointer | yes |
| `x3` | `gp` | global pointer | not allocatable |
| `x4` | `tp` | thread pointer (thread-local storage) | not allocatable |
| `x5` to `x7` | `t0` to `t2` | temporaries | no |
| `x8`, `x9` | `s0`, `s1` | callee-saved (`s0` is the frame pointer if there is one) | yes |
| `x10` to `x17` | `a0` to `a7` | arguments; `a0` and `a1` also carry return values | no |
| `x18` to `x27` | `s2` to `s11` | callee-saved | yes |
| `x28` to `x31` | `t3` to `t6` | temporaries | no |

A call is `jal ra, target` (jump and link: put the return address in
`ra`) and a return is `jalr zero, 0(ra)`, written `ret`. `gp` points
into the middle of the small-data section so that globals can be
reached with one instruction; the linker rewrites accesses to use it
(*relaxation*), which is why code that sets `gp` itself brackets the
load with `.option norelax`. With `F` or `D` there are also 32
floating-point registers `f0` to `f31` and a control register `fcsr`.

Instructions are 32 bits (16 with `C`), with no condition flags:
conditional branches compare two registers directly.

### Harts

RISC-V calls an independent stream of execution a *hart* (hardware
thread): what other architectures call a logical CPU, whether a whole
core or one hyperthread. Each hart has an integer *hart ID*. IDs need
not be contiguous or start at zero.

### Privilege modes

Three modes, described on [Privilege levels](privilege-levels.md):
**M** (machine) for firmware, **S** (supervisor) for a kernel, **U**
(user). Only S and U use paged virtual memory. M-mode is always
present and by default takes every trap; firmware *delegates* chosen
exceptions and interrupts to S-mode through the `medeleg` and
`mideleg` registers so that a kernel handles its own page faults and
system calls without a detour.

### CSRs

Processor control state lives in *control and status registers*
(CSRs), a separate 12-bit address space of up to 4096 registers
reached only by the `Zicsr` instructions. The address encodes the
lowest mode allowed to access it, and touching a CSR from too low a
mode raises an illegal-instruction exception. Names carry the mode as
a prefix: `mstatus` for M, `sstatus` for S.

| Instruction | Effect |
|---|---|
| `csrrw rd, csr, rs` | atomically swap: old CSR value to `rd`, `rs` to the CSR |
| `csrrs rd, csr, rs` | read to `rd`, then set the bits that are 1 in `rs` |
| `csrrc rd, csr, rs` | read to `rd`, then clear the bits that are 1 in `rs` |
| `csrr rd, csr` | read only: assembler shorthand for `csrrs rd, csr, x0` |
| `csrw csr, rs` | write only: shorthand for `csrrw x0, csr, rs` |
| `csrs`, `csrc` | set or clear bits without reading |

The supervisor CSRs an S-mode kernel uses:

| CSR | Purpose |
|---|---|
| `sstatus` | status: `SIE` (bit 1, interrupts enabled), `SPIE` (bit 5, the previous `SIE`), `SPP` (bit 8, mode the last trap came from), `FS` (bits 13 and 14, floating-point state), `SUM` and `MXR` (bits 18 and 19, memory access rules) |
| `sie`, `sip` | interrupt enable and pending bits, one per source |
| `stvec` | address of the trap handler |
| `sepc` | program counter saved at a trap |
| `scause` | why the trap happened |
| `stval` | extra information: the faulting address or instruction |
| `sscratch` | a free register for the trap handler's use |
| `satp` | page table root, address-space ID and paging mode |
| `time` | read-only view of the platform's timer, read with `rdtime` |

`sstatus`, `sie` and `sip` are restricted views of the machine-mode
`mstatus`, `mie` and `mip`. How these registers work together on a
trap is on [RISC-V paging and traps](riscv-paging-and-traps.md).

### The SBI

An S-mode kernel cannot reach everything. The machine timer, the
means of interrupting another hart, and reset all belong to M-mode on
a classic platform. The *Supervisor Binary Interface* (SBI) is the
standard set of calls from S-mode to M-mode firmware (the *SEE*,
supervisor execution environment), and
[OpenSBI](https://github.com/riscv-software-src/opensbi) is the usual
implementation. It plays roughly the part that PSCI and secure
firmware play on Arm, but is used far more heavily at run time.

A call is an `ecall` instruction executed in S-mode, the same
instruction a user program uses to call the kernel; the mode it comes
from decides who receives it. The convention:

| Register | Use |
|---|---|
| `a7` | extension ID (EID) |
| `a6` | function ID (FID) within the extension |
| `a0` to `a5` | arguments |
| `a0`, `a1` | returned error code and value; all other registers are preserved |

| Extension | EID | Provides |
|---|---|---|
| Legacy | `0x00` to `0x08` | set timer (0), console putchar (1) and getchar (2), clear IPI (3), send IPI (4), remote `fence.i` (5), remote `sfence.vma` (6, 7), shutdown (8). One function per EID, `a6` unused, a single return value. Deprecated |
| Base | `0x10` | specification version, and probing which extensions exist |
| TIME | `0x54494D45` | set the next timer interrupt |
| IPI | `0x735049` | send a software interrupt to a set of harts |
| RFENCE | `0x52464E43` | ask other harts to flush TLBs or instruction caches |
| HSM | `0x48534D` | hart state management: start, stop, suspend a hart |
| DBCN | `0x4442434E` | debug console: write and read bytes |

The EIDs are the extension names in ASCII. HSM's "hart start" is how
secondary harts are brought up: the caller names a hart ID, a start
address and an opaque value, and the hart begins there in S-mode with
`satp` zero (paging off), interrupts disabled, its hart ID in `a0` and
the opaque value in `a1` (see [SMP bring-up](smp-bringup.md)).

## In seL4

The RISC-V port is in
[`src/arch/riscv/`](https://github.com/seL4/seL4/tree/master/src/arch/riscv)
and
[`include/arch/riscv/`](https://github.com/seL4/seL4/tree/master/include/arch/riscv).
`KernelArch` is `riscv` and `KernelSel4Arch` is `riscv64` or `riscv32`
(`KernelSel4ArchRiscV64`, `KernelSel4ArchRiscV32`); word-size-specific
code is under `64/` and `32/` subdirectories.

**Mode.** The kernel runs in S-mode and user threads in U-mode. It is
not the first thing to run: OpenSBI starts in M-mode, then the
[elfloader](https://github.com/seL4/seL4_tools/tree/master/elfloader-tool/src/arch-riscv)
(or the Microkit loader) in S-mode, which loads the kernel, starts
secondary harts with SBI HSM calls and jumps to `_start` in
[`head.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/head.S).
`_start` sets `gp` and the kernel stack, zeroes `sscratch`, calls
`init_kernel` and then "returns" into `restore_user_context` to start
the root task. There is no upstream support for the H extension, so
seL4 is not a hypervisor on RISC-V.

![OpenSBI runs in M-mode and starts the elfloader in S-mode, which jumps to the seL4 kernel, also in S-mode, with user threads above in U-mode; an `ecall` from U-mode is an seL4 system call and an `ecall` from S-mode is an SBI call to OpenSBI.](../images/riscv-basics-modes.svg)

*The same instruction, `ecall`, crosses both boundaries; the mode it
comes from decides who answers.*

**Platforms** (directories of
[`src/plat/`](https://github.com/seL4/seL4/tree/master/src/plat) whose
`config.cmake` declares a RISC-V platform):

| `KernelPlatform` | Directory | Machine |
|---|---|---|
| `spike` | `spike` | the Spike instruction-set simulator |
| `qemu-riscv-virt` | `qemu-riscv-virt` | QEMU's `virt` machine |
| `hifive` | `hifive` | SiFive HiFive Unleashed (64-bit only) |
| `hifive-p550` | `eswin` | SiFive HiFive Premier P550 |
| `polarfire` | `polarfire` | Microchip PolarFire SoC (64-bit only) |
| `star64` | `star64` | Pine64 Star64 |
| `bananapi-f3` | `spacemit-k1` | Banana Pi BPI-F3 |
| `ariane`, `cheshire`, `rocketchip` | same names | FPGA soft cores |

**SBI.** The kernel's wrappers are in
[`include/arch/riscv/arch/sbi.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/sbi.h).
It uses only the *legacy* calls: `sbi_call` loads `a7` with a number
from 0 to 8 and executes `ecall`. The callers are few:

| Wrapper | Used by |
|---|---|
| `sbi_set_timer` | the kernel timer, [`machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/machine/hardware.c) and `include/arch/riscv/arch/machine/timer.h` (MCS) |
| `sbi_console_putchar`, `sbi_console_getchar` | kernel debug output, [`machine/io.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/machine/io.c): the kernel has no UART driver of its own on RISC-V |
| `sbi_send_ipi`, `sbi_clear_ipi` | SMP, [`smp/ipi.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/smp/ipi.c) |
| `sbi_remote_sfence_vma`, `sbi_remote_fence_i`, `sbi_shutdown` | defined; see the header |

**User context.** The registers saved for each thread are the enum in
[`include/arch/riscv/arch/machine/registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/registerset.h):
slots 0 to 30 are `ra`, `sp`, `gp`, `tp`, `t0` to `t2`, `s0`, `s1`,
`a0` to `a7`, `s2` to `s11`, `t3` to `t6` (`x1` to `x31` in order),
then `SCAUSE` (31), `SSTATUS` (32), `FaultIP` (33, the saved `sepc`)
and `NextIP` (34, where the thread resumes). The system call ABI is
in the same enum: `a0` is the capability register on entry and the
badge on return, `a1` the message info, `a2` to `a5` the four message
registers (`n_msgRegisters = 4`), `a7` the system call number, and on
[MCS](../sel4/mcs.md) `a6` carries the reply capability. `tp` is the
thread's TLS base (`TLS_BASE`).

**Floating point.** `KernelRiscvExtF` and `KernelRiscvExtD` (both on
by default) say which floating-point state the kernel saves;
`sstatus.FS` tells it whether a thread has touched the registers.

**Verification.** `RISCV64` is one of the verified configurations,
with the functional correctness, binary and security proofs; see
[The seL4 proofs](../sel4/verification.md) for exactly which options
that covers (no FPU, no fast path, no SMP). The comment on
`sbi_send_ipi` records one consequence: SMP is not verified on RISC-V,
so code there may do things the verified subset of C forbids.

## Gotchas

- `ecall` means "call the next level up". From U-mode it is a seL4
  system call; from S-mode it is an SBI call. Under a hypervisor a
  guest kernel's SBI calls go to the hypervisor instead of to
  firmware, which is how RISC-V paravirtualises timers and IPIs.
- seL4 depends on the legacy SBI extensions, which the SBI
  specification deprecates. Firmware built without them (they are a
  build option in OpenSBI, `SBI_ECALL_LEGACY`, on by default) cannot
  run upstream seL4.
- The legacy `send IPI` call takes a *pointer* to a hart mask, as a
  virtual address that M-mode firmware then reads through the
  caller's page tables. `sbi_send_ipi` hides this by taking the mask
  by value and passing the address of its own parameter, which limits
  seL4 to as many harts as bits in a word.
- Hart IDs are not CPU indices. seL4's `_start` on SMP takes the
  core's index from `a7`, placed there by the elfloader, and keeps a
  separate mapping to hart IDs for SBI calls.
- seL4's enum numbers registers from `ra = 0`, so its index is the
  `x` number minus one. `t0` is slot 4, not 5.
- There is no flags register and no implicit stack use by the
  processor, so nothing is pushed on a trap. Everything a trap saves
  is in CSRs ([RISC-V paging and traps](riscv-paging-and-traps.md)).
- `rdtime` may itself trap to M-mode and be emulated on hardware
  without a `time` CSR, making timestamp reads slow;
  `KernelRiscvUseClintMtime` exists to read the timer's memory-mapped
  register directly where S-mode is allowed to.

## See also

- [Privilege levels](privilege-levels.md): M, S and U beside the x86 and Arm equivalents
- [RISC-V paging and traps](riscv-paging-and-traps.md): `satp`, Sv39, and what happens on a trap
- [RISC-V interrupts and timers](riscv-interrupts.md): `sie`/`sip`, the PLIC, the SBI timer
- [Exceptions, interrupts and traps](exceptions-and-traps.md): the cross-architecture picture
- [x86-64 basics](x86-64-basics.md) and [AArch64 basics](aarch64-basics.md): the same ground for the other architectures
- [Device trees](device-tree.md): how a RISC-V kernel learns what hardware it has
- [The seL4 proofs](../sel4/verification.md): what "verified on RISC-V" covers
- [FPU and SIMD state](fpu-state.md): the floating-point and vector registers are extra per-thread state, hundreds to thousands of bytes, that a...
- [PSCI and SMCCC](psci-smccc.md): arm's standard way for a kernel to call firmware or a hypervisor

## References

- [The RISC-V Instruction Set Manual, Volume I: introduction](https://github.com/riscv/riscv-isa-manual/blob/main/src/unpriv/intro.adoc),
  [naming conventions](https://github.com/riscv/riscv-isa-manual/blob/main/src/unpriv/naming.adoc)
  and [Zicsr](https://github.com/riscv/riscv-isa-manual/blob/main/src/unpriv/zicsr.adoc):
  harts, extension names (`G` = `IMAFDZicsr_Zifencei`), the CSR
  instructions and their `csrr`/`csrw` shorthands. *Checked 2026-11-14.*
- [The RISC-V Instruction Set Manual, Volume II: supervisor-level ISA](https://github.com/riscv/riscv-isa-manual/blob/main/src/priv/supervisor.adoc),
  "Supervisor CSRs": one section per register in the table. Bit positions are from seL4's
  headers and memory. *Checked 2026-11-14.*
- [RISC-V ELF psABI, calling convention](https://github.com/riscv-non-isa/riscv-elf-psabi-doc/blob/master/riscv-cc.adoc),
  "Integer Register Convention": the ABI names table. *Checked 2026-11-14.*
- [RISC-V SBI specification](https://github.com/riscv-non-isa/riscv-sbi-doc/tree/master/src):
  `binary-encoding.adoc` (the calling convention), `ext-legacy.adoc`
  (EIDs 0 to 8), `ext-time.adoc`, `ext-ipi.adoc`, `ext-rfence.adoc`,
  `ext-hsm.adoc` (hart start state), `ext-debug-console.adoc`.
  *Checked 2026-11-14.*
- [seL4 `include/arch/riscv/arch/sbi.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/sbi.h):
  the legacy call numbers and the hart mask comment. *Checked 2026-11-14.*
- [seL4 `include/arch/riscv/arch/machine/registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/registerset.h),
  [`src/arch/riscv/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/head.S),
  [`src/arch/riscv/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/config.cmake)
  and the `src/plat/*/config.cmake` files: the context layout, entry,
  options and platform list. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/arch-riscv/`](https://github.com/seL4/seL4_tools/tree/master/elfloader-tool/src/arch-riscv):
  `boot.c` calls `sbi_hart_start` for secondary harts. Seen by grep only. *Checked 2026-11-14.*
- [OpenSBI](https://github.com/riscv-software-src/opensbi): the
  reference M-mode firmware (its README), and
  [`lib/sbi/Kconfig`](https://github.com/riscv-software-src/opensbi/blob/master/lib/sbi/Kconfig)
  for `SBI_ECALL_LEGACY`. *Checked 2026-11-14.*
- [seL4 documentation, hardware pages](https://github.com/seL4/docs/tree/master/Hardware)
  (`polarfire.md`, `bananapi-f3.md`, `ariane.md`, `cheshire.md`,
  `rocketchip.md`, `spike.md`, `qemu-riscv-virt.md`) and the `model`
  strings in seL4's [`tools/dts/`](https://github.com/seL4/seL4/tree/master/tools/dts):
  what machine each platform is. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
