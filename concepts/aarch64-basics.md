# AArch64 basics

> The 64-bit Arm execution state: 31 general registers, a stack pointer per exception level, PSTATE, and hundreds of system registers read with `MRS` and written with `MSR`; every line of seL4's Arm code assumes them.

Read first: [Privilege levels](privilege-levels.md).

## What it is

**Armv8-A** is the Arm architecture version that added 64-bit execution.
It has two **execution states**: **AArch64** (64-bit registers, the A64
instruction set, every instruction 4 bytes) and **AArch32** (the older
32-bit world of Armv7, kept for compatibility). This page is about
AArch64; AArch32 gets a paragraph at the end.

### General registers

| Register | Role under the calling convention (AAPCS64) |
|---|---|
| `X0` to `X7` | Arguments and return values |
| `X8` | Address for a large returned struct |
| `X9` to `X15` | Temporaries, caller-saved |
| `X16`, `X17` | Scratch for linker veneers (`IP0`, `IP1`), caller-saved |
| `X18` | Platform register: reserved by some ABIs, otherwise a temporary |
| `X19` to `X28` | Callee-saved |
| `X29` | Frame pointer (`FP`) |
| `X30` | Link register (`LR`): the return address |

`W0` to `W30` name the low 32 bits of the same registers; writing a `W`
register clears the upper 32 bits. Register number 31 is not a general
register: depending on the instruction it means the stack pointer `SP` or
a register that reads as zero (`XZR`/`WZR`).

A call is `BL label`, which puts the return address in `X30` and jumps;
`RET` jumps to `X30`. Nothing is pushed by the processor, so a function
that calls another saves `X30` itself, usually with `X29` as a pair
(`stp x29, x30, [sp, #-16]!`). The **AAPCS64** (Procedure Call Standard
for the Arm 64-bit Architecture) also requires `SP` to be 16-byte aligned
at every call, passes floating-point arguments in `V0` to `V7`, and makes
the low halves of `V8` to `V15` callee-saved.

The program counter `PC` is not a general register: it is changed only by
branches, exceptions and exception returns.

### Exception levels and stack pointers

Privilege is an **exception level**: EL0 (applications), EL1 (kernel), EL2
(hypervisor), EL3 (secure firmware). [Privilege levels](privilege-levels.md)
compares them with x86 and RISC-V. The level only changes by taking an
exception (upwards or staying) or returning from one (downwards or
staying); see [AArch64 exceptions](aarch64-exceptions.md).

Each level has its own stack pointer register: `SP_EL0`, `SP_EL1`,
`SP_EL2`, `SP_EL3`. At EL1 and above, the one-bit `SPSel` field chooses
which of two the name `SP` means: the level's own (`SPSel` = 1, written
EL1**h**, "handler") or `SP_EL0` (`SPSel` = 0, written EL1**t**,
"thread"). Taking an exception always selects the target level's own
stack pointer.

### PSTATE

There is no single flags register. The processor state, **PSTATE**, is a
set of fields reached separately:

| Field | Meaning |
|---|---|
| `N`, `Z`, `C`, `V` | Condition flags from arithmetic (negative, zero, carry, overflow) |
| `D`, `A`, `I`, `F` | Masks: debug exceptions, SError, IRQ, FIQ. 1 = masked |
| `CurrentEL` | The current exception level, read only |
| `SPSel` | Stack pointer choice, above |

When an exception is taken, PSTATE is copied into a real register,
`SPSR_ELx` (saved program status register), where the fields have fixed
bit positions: NZCV in bits 31 to 28, D, A, I, F in bits 9, 8, 7, 6, and
a mode field `M` in bits 4 to 0 (0 = EL0t, 4 = EL1t, 5 = EL1h, 9 = EL2h).

### System registers

Everything else that controls the processor is a **system register**,
read with `MRS Xt, <reg>` and written with `MSR <reg>, Xt`. There are no
separate control-register instructions and no model-specific register
numbers as on x86: the register is encoded in the instruction as five
small numbers, `op0, op1, CRn, CRm, op2`. Assemblers know the
architectural names; a register too new for the assembler is written
generically, for example `S3_0_C1_C0_0` for `SCTLR_EL1` (`op0`=3,
`op1`=0, `CRn`=1, `CRm`=0, `op2`=0).

The suffix `_ELn` is the lowest level that may access the register.
Accessing one from a lower level is an exception (a trap), which is how
hypervisors intercept guest accesses. Many registers exist once per
level (`SCTLR_EL1`, `SCTLR_EL2`, `SCTLR_EL3`), each controlling its own
level.

The registers a kernel always meets:

| Register | What it holds |
|---|---|
| `SCTLR_EL1` | System control: MMU enable (bit 0, `M`), data cache (bit 2, `C`), instruction cache (bit 12, `I`), alignment checks |
| `TCR_EL1` | Translation control: address-space sizes and page granule ([AArch64 paging](aarch64-paging.md)) |
| `TTBR0_EL1`, `TTBR1_EL1` | Page table roots for the low and high halves of the address space |
| `MAIR_EL1` | Memory attribute encodings that page table entries index |
| `VBAR_EL1` | Address of the exception vector table |
| `ESR_EL1`, `ELR_EL1`, `SPSR_EL1`, `FAR_EL1` | Why an exception happened, where to return, the saved PSTATE, and the faulting address |
| `TPIDR_EL0`, `TPIDRRO_EL0` | Thread pointers for user code (read-write, and read-only at EL0): thread-local storage |
| `TPIDR_EL1` | A spare word for the kernel, typically a per-core pointer |
| `CPACR_EL1` | Whether floating-point and SIMD instructions trap ([FPU and SIMD state](fpu-state.md)) |
| `MIDR_EL1` | Which core this is: implementer, part number, revision |
| `MPIDR_EL1` | This core's address among the cores: affinity fields `Aff3.Aff2.Aff1.Aff0` |
| `ID_AA64*_EL1` | Read-only feature registers, the equivalent of CPUID: `ID_AA64PFR0_EL1` (which ELs exist, FP, GIC system registers), `ID_AA64MMFR0_EL1` (physical address size, granules), `ID_AA64ISAR0_EL1` (instruction extensions) |

Changes to system registers are not guaranteed to affect following
instructions until a **context synchronisation event**, in practice an
`ISB` instruction or an exception return.

### AArch32 and Armv7

AArch32 has 16 registers (`R0` to `R15`, where `R13` is SP, `R14` LR and
`R15` the PC), processor *modes* (user, supervisor, IRQ, abort, hyp, ...)
with banked copies of some registers in place of exception levels, a
`CPSR` flags register, and system control through "coprocessor 15"
instructions (`MRC`/`MCR`). An Armv8 core may support AArch32 at some or
all levels; a lower level can be AArch32 under an AArch64 higher level,
never the reverse. Many recent server cores are AArch64-only (unchecked).

## In seL4

seL4's `KernelSel4Arch` option takes three Arm values: `aarch64`,
`aarch32` (Armv7 or Armv8 in AArch32 state) and `arm_hyp` (AArch32 with
the kernel in hyp mode). Code common to them is in `src/arch/arm/`,
AArch64-only code in
[`src/arch/arm/64/`](https://github.com/seL4/seL4/tree/master/src/arch/arm/64)
and headers under `include/arch/arm/arch/64/mode/`.

- **User context.**
  [`registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine/registerset.h)
  defines `enum _register`, the layout of a thread's saved registers:
  `X0` to `X30` at indices 0 to 30, then `SP_EL0` (31), `ELR_EL1` (32,
  alias `NextIP`), `SPSR_EL1` (33), `FaultIP` (34), `TPIDR_EL0` (35) and
  `TPIDRRO_EL0` (36). `struct user_context` is that array followed by
  the FPU state (`vregs[64]`: 32 registers of 128 bits). The same file
  names the registers seL4's ABI uses: `capRegister` and `badgeRegister`
  are `X0`, `msgInfoRegister` is `X1`, and under MCS `replyRegister` is
  `X6`.
- **Initial PSTATE.** A new thread's `SPSR_EL1` is `PSTATE_USER`: mode
  EL0t with FIQ masked (and SError masked when
  `CONFIG_AARCH64_SERROR_IGNORE` is set). IRQs are unmasked in user mode
  and the kernel itself runs with them masked.
- **Accessors.** The `MRS(reg, v)` and `MSR(reg, v)` macros in
  [`armv/armv8-a/64/armv/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/machine.h)
  wrap the instructions in inline assembly, taking the register name as
  a string. Typed wrappers are in
  [`mode/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine.h):
  `readSystemControlRegister` (`SCTLR_EL1`), `writeTPIDR_EL0`,
  `setCurrentKernelVSpaceRoot` and `setCurrentUserVSpaceRoot` (the
  `TTBR`s), `setVtable` (`VBAR`), `getESR`, `getFAR`.
- **Which level.** Without `KernelArmHypervisorSupport` the kernel runs
  at EL1 and uses the `_EL1` registers. With it the kernel runs at EL2
  and the same functions use `_EL2` registers (`vbar_el2`, `esr_el2`,
  `ttbr0_el2`); see [Arm virtualisation](arm-virtualisation.md).
- **TPIDR_EL1** (or `TPIDR_EL2`) holds the address of the core's kernel
  stack; [AArch64 exceptions](aarch64-exceptions.md) shows its use.

## Gotchas

- **Register 31 is two things.** `mov x0, sp` and `mov x0, xzr` have the
  same register field; which one an instruction means is fixed per
  instruction. `stp`/`ldp` and address bases use SP, most arithmetic
  operands use the zero register.
- **Writing `Wn` zeroes the top half** of `Xn`. It does not preserve it
  as writing `AX` preserves the rest of `RAX` on x86.
- **The saved-register names say `_EL1` even in a hypervisor build.**
  seL4's context slots are called `ELR_EL1` and `SPSR_EL1` in every
  configuration; at EL2 they are filled from `ELR_EL2` and `SPSR_EL2`.
- **`MSR` without `ISB`.** A write to a control register such as
  `SCTLR_EL1` or `TTBR0_EL1` may not take effect for the next
  instruction. Reviewing a patch that adds such a write, look for the
  `isb` or a following exception return.
- **`X18`.** Code built for an ABI that reserves `X18` must not be mixed
  with code that uses it as a temporary.

## See also

- [Privilege levels](privilege-levels.md): EL0 to EL3 against x86 rings
  and RISC-V modes
- [AArch64 exceptions](aarch64-exceptions.md): how the level changes and
  what `ESR`, `ELR`, `SPSR` and `FAR` receive
- [AArch64 paging](aarch64-paging.md): `TCR`, `TTBR` and `MAIR` in use
- [Arm virtualisation](arm-virtualisation.md): the `_EL2` registers
- [Arm generic timer](arm-generic-timer.md): the `CNT*` system registers
- [RISC-V basics](riscv-basics.md): the same ground for RISC-V

## References

- Arm Architecture Reference Manual for A-profile (DDI 0487), chapters
  "The AArch64 Application Level Programmers' Model", "The AArch64
  System Level Programmers' Model" and "AArch64 System Register
  Descriptions". *Unchecked (developer.arm.com refuses scripted
  fetches).*
- [Procedure Call Standard for the Arm 64-bit Architecture (AAPCS64)](https://github.com/ARM-software/abi-aa/blob/main/aapcs64/aapcs64.rst),
  section "The Base Procedure Call Standard": register roles and stack
  alignment. *Unchecked (written from memory).*
- [seL4 `registerset.h` for AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine/registerset.h):
  `enum _register`, `PSTATE_USER`, `struct user_context`. 
  *Checked 2026-11-14.*
- [seL4 `mode/machine.h` for AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine.h):
  the system register accessors and their EL1/EL2 variants. 
  *Checked 2026-11-14.*
- [seL4 `armv/machine.h` for Armv8 AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/machine.h):
  the `MRS` and `MSR` macros. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
