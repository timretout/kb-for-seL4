# AArch64 exceptions

> How an AArch64 core enters and leaves a higher exception level: a 16-entry vector table at `VBAR_ELx`, the syndrome in `ESR_ELx`, the return state in `ELR_ELx` and `SPSR_ELx`, and `ERET`; seL4's whole kernel entry and exit is built on it.

Read first: [AArch64 basics](aarch64-basics.md), [Exceptions, interrupts and traps](exceptions-and-traps.md).

## What it is

In Arm's vocabulary an **exception** is any event that makes the
processor stop what it is doing and enter a handler at a fixed address:
system calls, faults and interrupts alike.
[Exceptions, interrupts and traps](exceptions-and-traps.md) has the
picture common to all architectures; this page is the AArch64 mechanism.

### Four kinds

| Kind | Cause | Synchronous? |
|---|---|---|
| Synchronous | The instruction being executed: `SVC`/`HVC`/`SMC`, a page fault (Arm says **abort**), an undefined or trapped instruction, a breakpoint | Yes |
| IRQ | The interrupt controller's normal interrupt signal ([GICv2](gicv2.md), [GICv3](gicv3-its.md)) | No |
| FIQ | A second interrupt signal, in practice used by the secure world | No |
| SError | System error: an asynchronous abort, typically a bus or memory error reported late | No |

Three instructions exist only to cause a synchronous exception to a
particular level: `SVC` (supervisor call) goes to EL1, `HVC` (hypervisor
call) to EL2 and `SMC` (secure monitor call) to EL3. Each carries a
16-bit immediate that the handler may read from the syndrome.
[PSCI and SMCCC](psci-smccc.md) covers what firmware does with `SMC`.

### What the processor does

An exception is taken *to* an exception level, never a lower one than
the current. Synchronous exceptions from EL0 go to EL1 unless a
hypervisor has asked for them; interrupts go to EL1, EL2 or EL3 according
to routing bits (`HCR_EL2.IMO`/`FMO`, `SCR_EL3.IRQ`/`FIQ`). Taking one to
ELx does exactly this, and pushes nothing on any stack:

1. `PSTATE` is saved in `SPSR_ELx`.
2. The return address is saved in `ELR_ELx` (exception link register).
3. For synchronous exceptions and SError, `ESR_ELx` (exception syndrome
   register) receives the reason; for aborts `FAR_ELx` (fault address
   register) receives the virtual address that faulted.
4. `PSTATE.D`, `A`, `I` and `F` are all set, masking further asynchronous
   exceptions; the level becomes ELx and `SP` becomes `SP_ELx`.
5. Execution continues at an entry of the vector table whose address is
   in `VBAR_ELx`.

`ERET` reverses it: `PSTATE` is restored from `SPSR_ELx` (which may
select a lower level) and the PC from `ELR_ELx`. Because the saved state
is in single registers, a handler that could take a second exception to
the same level must save `ELR` and `SPSR` first.

### The vector table

The table is 16 entries of 0x80 bytes (32 instructions) each, so 2 KiB,
aligned to 2 KiB. The entry is chosen by where the exception came from
(four sources) and its kind (four kinds):

| Offset | Source | +0x000 | +0x080 | +0x100 | +0x180 |
|---|---|---|---|---|---|
| 0x000 | Current EL, using `SP_EL0` | Sync | IRQ | FIQ | SError |
| 0x200 | Current EL, using `SP_ELx` | Sync | IRQ | FIQ | SError |
| 0x400 | Lower EL, in AArch64 | Sync | IRQ | FIQ | SError |
| 0x600 | Lower EL, in AArch32 | Sync | IRQ | FIQ | SError |

Unlike x86's IDT there is no entry per interrupt number or per fault
type. One synchronous handler reads `ESR_ELx` to find out which fault it
is, and one IRQ handler asks the interrupt controller which interrupt.

### The syndrome register

`ESR_ELx` has the **exception class** (EC) in bits 31 to 26, an
instruction-length bit (IL, bit 25) and 25 bits of class-specific detail
(ISS, **instruction-specific syndrome**). Classes worth knowing:

| EC | Meaning |
|---|---|
| 0x00 | Unknown reason, including undefined instructions |
| 0x01 | Trapped `WFI` or `WFE` |
| 0x07 | Trapped access to floating point or SIMD ([FPU state](fpu-state.md)) |
| 0x15 | `SVC` from AArch64 |
| 0x16 | `HVC` from AArch64 |
| 0x17 | `SMC` from AArch64, when trapped to EL2 |
| 0x18 | Trapped `MSR`, `MRS` or system instruction |
| 0x20, 0x21 | Instruction abort from a lower EL, from the current EL |
| 0x24, 0x25 | Data abort from a lower EL, from the current EL |
| 0x22, 0x26 | PC alignment fault, SP alignment fault |
| 0x2F | SError |
| 0x3C | `BRK` instruction (software breakpoint) |

For aborts the low six ISS bits are a **fault status code**: translation
fault (no valid mapping), access flag fault or permission fault, each
with the page table level at which it happened; bit 6 (`WnR`) says
whether a data abort was a write. For EC 0x18 the ISS holds the
`op0..op2` encoding of the register and the general register involved,
which is what a hypervisor needs to emulate the access.

The return address differs by kind: after `SVC`, `ELR` points at the
instruction after the call; after an abort it points at the faulting
instruction, so that `ERET` retries it.

### Masking

`PSTATE.I` set means IRQs stay pending and are not taken. The fields are
changed with `msr daifset, #imm` and `msr daifclr, #imm` (bit 1 of the
immediate is I, bit 0 is F, bit 2 is A, bit 3 is D), or wholesale by
`ERET` loading `SPSR`. Synchronous exceptions cannot be masked.

## In seL4

**The vector table** is `arm_vector_table` in
[`src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S),
installed by `setVtable`. Only five entries do anything: `cur_el_sync`
and `cur_el_irq` (current EL with `SP_ELx`), `lower_el_sync` and
`lower_el_irq` (lower EL, AArch64), and SError, which is either ignored
with a bare `eret` (`CONFIG_AARCH64_SERROR_IGNORE`) or invalid. The rest
go to `invalid_vector_entry`, which halts. FIQs and AArch32 user code are
therefore not supported on an AArch64 kernel. The file defines `ELR`,
`ESR`, `SPSR` and `TPIDR` as the `_el1` or `_el2` register according to
`CONFIG_ARM_HYPERVISOR_SUPPORT`, so one table serves both.

**Finding the thread and the stack.** seL4 uses the stack pointer in an
unusual way. While a thread runs in user mode, `SP_EL1` (the kernel's
`SP`) points at that thread's saved-register array inside its TCB,
because the last thing `restore_user_context` did was `mov sp, <address
of ksCurThread's registers>`. So on entry:

1. The `kernel_enter` macro stores `X0` to `X30`, `SP_EL0`, `ELR`,
   `SPSR`, `TPIDR_EL0` and `TPIDRRO_EL0` at fixed offsets from `sp`,
   straight into the TCB.
2. The `lsp_i` macro then loads the real kernel stack: `mrs tmp, TPIDR;
   mov sp, tmp`. `TPIDR_EL1` (or `_EL2`) was set once per core at boot by
   `setKernelStack` to the top of that core's `kernel_stack_alloc`
   entry. On SMP the low 12 bits carry the core index, which `lsp_i`
   clears.

There is one kernel stack per core, not per thread, and it is empty on
every entry: the kernel never blocks inside itself.

**Dispatch.** `lower_el_sync` shifts `ESR` right by `ESR_EC_SHIFT` (26)
and compares the class:

| EC | Goes to | C handler |
|---|---|---|
| 0x24 data abort | `lel_da` | `c_handle_data_fault` → `handleVMFaultEvent(seL4_DataFault)` |
| 0x20 instruction abort | `lel_ia` | `c_handle_instruction_fault` → `handleVMFaultEvent(seL4_InstructionFault)` |
| 0x15 `SVC` (and 0x16 `HVC` in hypervisor builds) | `lel_syscall` | fastpath, or `c_handle_syscall` |
| anything else, EL1 kernel | `el0_user` | `c_handle_undefined_instruction` → `handleUserLevelFault(esr, 0)` |
| anything else, EL2 kernel | | `c_handle_vcpu_fault(esr)` → `handleVCPUFault` |

The C handlers are in
[`src/arch/arm/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/c_traps.c),
shared with AArch32. Each takes the kernel lock (`NODE_LOCK_SYS`, a no-op
on a single core), calls the generic handler and ends in
`restore_user_context`. `handleVMFaultEvent` turns the abort into a fault
message for the thread's fault handler ([Faults](../sel4/faults.md)),
reading the address with `getFAR` and the status with `getESR`.

**System calls.** User code puts the system call number in `X7` and
executes `svc #0` (libsel4's `arm_sys_send` and friends declare `register
seL4_Word scno asm("x7")`). `X0` is the capability, `X1` the message
info, `X2` to `X5` message registers. `lel_syscall` records `ELR - 4` as
`FaultIP` (the address of the `svc` itself, used to restart the call),
then compares `X7` with `SYSCALL_CALL` and `SYSCALL_REPLY_RECV` to branch
to the IPC fastpath, and otherwise calls `c_handle_syscall(x0, x1, x7)`.
Its `slowpath` passes numbers between `SYSCALL_MIN` and `SYSCALL_MAX` to
`handleSyscall` and everything else to `handleUnknownSyscall`, which,
despite the name, also implements the debug and benchmark system calls
before raising an unknown-syscall fault. See
[System calls and invocations](../sel4/syscalls-and-invocations.md).

**Interrupts.** `lower_el_irq` saves the context and calls
`c_handle_interrupt`, which calls `handleInterruptEntry`
([Interrupt delivery](../sel4/irq-handling.md)). `cur_el_irq` is taken
only while the idle thread runs, since the idle thread executes in kernel
mode (`PSTATE_IDLETHREAD`, EL1h or EL2h) with IRQs unmasked; it skips
`kernel_enter` because the idle thread has no state worth saving. All
other kernel code runs with IRQs masked, as left by exception entry.

**Return.** `restore_user_context` in
[`src/arch/arm/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/c_traps.c)
writes the TLS registers (`arm_load_thread_id`), releases the kernel
lock, points `sp` at the current thread's register array, loads
`SP_EL0`, `ELR` and `SPSR` from it, restores `X0` to `X30` and executes
`eret`. The thread it returns to may differ from the one that entered:
that is the whole of a context switch.

**Kernel faults.** `cur_el_sync` handles a data or instruction abort
taken from the kernel itself: in a debug build it prints
(`kernelDataAbort`, `kernelPrefetchAbort`) and then halts.

## Gotchas

- **Exception entry does not save general registers.** Only `ELR`,
  `SPSR`, `ESR` and `FAR` are written. A handler that uses `X0` before
  saving it has lost user state; `kernel_enter` must come first, and it
  relies on `sp` already pointing into the TCB.
- **`FaultIP` and `NextIP` differ for system calls.** `NextIP`
  (`ELR_EL1` slot) is the instruction after `svc`; `FaultIP` is the `svc`
  itself. A patch touching restart behaviour must keep them straight.
- **`ESR` is not valid for IRQs.** It holds whatever the last
  synchronous exception left there.
- **A hypervisor-build kernel treats `HVC` from EL1 guests as a system
  call entry** along with `SVC` from EL0 native threads; both reach
  `lel_syscall`.
- **System call numbers are negative** in seL4 (`seL4_SysCall` is -1 and
  the rest count down) (unchecked: values are generated at build time
  from `libsel4/include/api/syscall.xml`).

## See also

- [Exceptions, interrupts and traps](exceptions-and-traps.md): the
  architecture-neutral picture
- [AArch64 basics](aarch64-basics.md): the registers used here
- [AArch64 paging](aarch64-paging.md): what causes the aborts
- [Arm virtualisation](arm-virtualisation.md): exceptions taken to EL2
- [x86-64 exceptions and system calls](x86-exceptions-syscalls.md): the
  same job on x86
- [Faults and fault handlers](../sel4/faults.md): where the kernel sends
  a fault once it has decoded it

## References

- Arm Architecture Reference Manual for A-profile (DDI 0487), chapter
  "The AArch64 System Level Programmers' Model", sections "Exception
  entry", "Exception return" and "Exception vectors", and the register
  description of `ESR_EL1`. *Unchecked (developer.arm.com refuses
  scripted fetches).*
- [seL4 `traps.S` for AArch64](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S):
  the vector table, `kernel_enter`, `lsp_i` and the dispatch on `ESR`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/c_traps.c):
  the C entry points and `slowpath`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/c_traps.c):
  `restore_user_context`.
  *Checked 2026-11-14.*
- [seL4 `registerset.h` for AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine/registerset.h):
  the `ESR_EC_*` values and `PSTATE_IDLETHREAD`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c):
  `setKernelStack` with the core index in the low bits.
  *Checked 2026-11-14.*
- [libsel4 AArch64 `syscalls.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/syscalls.h):
  the system call number in `x7`.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
