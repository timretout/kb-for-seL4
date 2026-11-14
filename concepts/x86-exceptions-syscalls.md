# x86-64 exceptions, interrupts and system calls

> How an x86-64 CPU enters the kernel (through the IDT for exceptions and interrupts, through `syscall` or `sysenter` for system calls), what it saves and where, and how seL4's `traps.S` turns each entry into a saved register context in the current TCB.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [x86-64](../INDEX.md#x86-64) · ← [x86-64 paging](x86-paging.md) · [I/O ports and MMIO](io-ports.md) →

Read first: [Exceptions and traps](exceptions-and-traps.md), [x86-64 basics](x86-64-basics.md).

| At a glance | |
|---|---|
| Kind | Kernel entry mechanisms: the IDT, and `syscall` or `sysenter` |
| Architecture | x86-64 |
| Reached through | `lidt` for the IDT; MSRs `LSTAR`, `STAR` and `FMASK` for `syscall` |
| Key numbers | Up to 256 vectors, 0 to 31 for CPU exceptions (unchecked); seL4 gives user level vectors 48 to 155 |
| seL4 code | [`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S), [`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c) |
| seL4 config | `KernelSyscall` (default `syscall` on x86_64), `KernelFSGSBase` |
| seL4 use | Each entry saves the user registers into the current TCB; one kernel stack per core |

## What it is

x86-64 has two unrelated kernel entry mechanisms. The architecture
facts here are from the Intel and AMD manuals, not opened today
(unchecked), except where seL4's source restates them.

### The IDT

The **IDT** (interrupt descriptor table) has up to 256 16-byte
**gates**, indexed by **vector**. A gate names a handler address, a
code segment, a DPL (the lowest privilege allowed to invoke it with an
`int n` instruction) and an optional IST index. The `lidt` instruction
tells the CPU where the table is. Vectors 0 to 31 belong to the CPU's
own exceptions; 32 to 255 are for device interrupts (delivered by the
local [APIC](apic.md)) and software.

| Vector | Name | Cause | Error code |
|---|---|---|---|
| 0 | #DE | divide error | no |
| 1 | #DB | debug: single step, breakpoint register | no |
| 2 | NMI | non-maskable interrupt | no |
| 3 | #BP | `int3` breakpoint instruction | no |
| 6 | #UD | undefined opcode | no |
| 7 | #NM | FPU used while `CR0.TS` set ([FPU state](fpu-state.md)) | no |
| 8 | #DF | double fault: an exception while delivering another | yes (0) |
| 13 | #GP | general protection: privileged instruction, bad selector, non-canonical address, bad MSR | yes |
| 14 | #PF | page fault; address in `CR2` | yes |
| 18 | #MC | machine check: hardware error | no |

Others that push an error code: 10 (#TS), 11 (#NP), 12 (#SS), 17
(#AC). The page-fault error code has bit 0 = page was present, bit 1 =
write, bit 2 = from user mode, bit 4 = instruction fetch.

### What the CPU does on delivery

1. If the gate has an IST index, load `rsp` from that **IST** slot of
   the TSS. Otherwise, if coming from ring 3, load `rsp` from the
   TSS's `RSP0`. Otherwise keep the current stack.
2. Align `rsp` to 16 bytes and push `SS`, `RSP`, `RFLAGS`, `CS`,
   `RIP`, and for some vectors an error code. In 64-bit mode all five
   are pushed always, as 8-byte values.
3. Clear IF (for an interrupt gate), TF and a few other flags, load
   `CS:RIP` from the gate, and run the handler in ring 0.

```
 +40  SS
 +32  RSP        the interrupted stack pointer
 +24  RFLAGS
 +16  CS         low 2 bits = ring that was interrupted
  +8  RIP
   0  error code (only some vectors)   <- rsp at handler entry
```

`iretq` pops the five words and resumes, changing ring if the saved
`CS` says so. The handler must pop the error code first. Nothing else
is saved: general registers, the `gs` base and `CR3` are the handler's
business. An IST stack is used unconditionally, so it gives a known
good stack even when the kernel's own stack is the problem (#DF, NMI).

### System calls

Going through the IDT is slow, so there are two fast paths:

| | `syscall` / `sysret` | `sysenter` / `sysexit` |
|---|---|---|
| Origin | AMD; the 64-bit standard | Intel; 32-bit era, also valid in Intel long mode |
| Entry point | MSR `LSTAR` | MSR `IA32_SYSENTER_EIP` |
| Segments | from MSR `STAR` | from `IA32_SYSENTER_CS` |
| Return address | CPU puts it in `rcx` | not saved; user must pass it |
| Flags | saved in `r11`, then masked by MSR `FMASK` | IF cleared |
| Stack | **not switched**: `rsp` is still the user's | loaded from `IA32_SYSENTER_ESP` |
| Enable | `EFER.SCE` | always |

So after `syscall` the kernel runs in ring 0 on the user's stack
pointer with `rcx` and `r11` destroyed, and must find its own stack
without trusting any general register. That is what `gs` is for:
**`swapgs`** exchanges the `GS_BASE` MSR with `KERNEL_GS_BASE`, giving
the kernel a per-CPU pointer, and must be executed exactly once on
each entry from user mode and once on each exit. The **FSGSBASE**
instructions (`rdfsbase`, `wrgsbase`, ...) let any ring read and write
the bases without a slow `wrmsr`, once `CR4.FSGSBASE` is set
([MSRs](cpuid-and-msrs.md)).

## In seL4

seL4 does not have a kernel stack per thread. The kernel is not
preemptible, so one small stack per core suffices, and each entry
saves the user's registers directly into the current thread's TCB
(`tcbArch.tcbContext.registers[]`, in the order of `enum _register`
in [`registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/machine/registerset.h)).
The assembly in
[`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S)
does this by pointing `rsp` at the right slot of the TCB and using
`push`:

- **`LOAD_USER_CONTEXT`** sets `rsp` to the end of the current
  thread's saved registers (through `%gs:16` on SMP, through
  `ksCurThread` otherwise). **`LOAD_KERNEL_STACK`** then switches to
  the per-core kernel stack before calling C. **`LOAD_KERNEL_AS`**
  writes `CR3` to bring in the full kernel address space when
  `KernelSkimWindow` is on ([paging](x86-paging.md)), and
  **`MAYBE_SWAPGS`** is `swapgs` on SMP builds only (a uniprocessor
  build does not use `gs` for itself).
- **`handle_fastsyscall`** is the `LSTAR` target. It pushes `-1` as
  the `Error` register (the mark for "entered by `syscall`"), `rcx`
  as `NextIP`, `r11` as `FLAGS`, then the rest, and jumps to
  `c_handle_syscall(cptr, msgInfo, syscall)`: `rdi`, `rsi` and `rdx`
  already hold the user's capability pointer, message info and system
  call number, matching the C calling convention on purpose.
  **`handle_syscall`** is the `sysenter` equivalent.
- **`int_00` to `int_ff`** are generated by `INT_HANDLER_COMMON`. Each
  pushes a zero if the CPU pushed no error code, tests the saved `CS`
  for ring 3, and jumps to `handle_interrupt` with the vector in
  `rcx`. If the interruption came from ring 0 instead, vectors below
  32 go to `kernel_exception` (a kernel bug, or an expected fault from
  `x86_rdmsr_safe()`) and higher ones to `nested_interrupt`, which
  only records the IRQ as pending; the single legitimate case is the
  idle thread, which runs in ring 0.
- `init_idt_entry()` in
  [`src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c)
  builds the gates: DPL 0 for vectors below `int_trap_min` except
  vector 3, DPL 3 for the rest so user `int n` reaches the kernel as a
  fault. `init_tss()` leaves `RSP0` zero and points **IST 1** at
  `x64KSIRQStack`, a per-core array just big enough for the CPU's
  frame (`IRQ_STACK_SIZE` is 6 words); the saved values are then
  transferred into the TCB (unchecked exactly where; `INT_SAVE_STATE`
  skips those slots). On ia32, by contrast, the TSS stack pointer aims
  into the TCB so the CPU pushes straight into it (unchecked).

C side:
[`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c)
has `c_handle_syscall()` (tries the IPC [fastpath](../sel4/ipc.md),
else `slowpath()`), `c_handle_interrupt()` (dispatches by vector:
page fault, FPU fault, IRQ, user exception, unknown system call) and
`c_nested_interrupt()`. None returns: each ends in
`restore_user_context()` in
[`src/arch/x86/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/c_traps.c),
which first handles any pending interrupt, then restores the possibly
different current thread: `swapgs` on SMP, the user `CR3` for the SKIM
window, the IBRS setting, then pops the TCB and leaves by `sysretq`
(or `sysexit`) if `Error` is `-1` and by `iretq` otherwise.
`init_syscall_msrs()` writes `LSTAR`, `STAR` and `FMASK`
(`FLAGS_SYSCALL_MASK`, which includes IF, so the kernel always runs
with interrupts off).

![The two entry paths side by side: syscall goes through LSTAR to handle_fastsyscall and c_handle_syscall, an exception or interrupt goes through an IDT gate to the int_NN stubs and c_handle_interrupt; both save registers in the TCB and leave through restore_user_context.](../images/x86-exceptions-syscalls-entry-paths.svg)

*Both paths meet twice: in the TCB, where the user registers are saved, and
in `restore_user_context()`, which picks `sysretq` or `iretq` from the
`Error` register.*

**Vectors**
([`include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h)):

| Vectors | Name | Use |
|---|---|---|
| 0 to 31 | | CPU exceptions (`int_debug` 1, `int_software_break_request` 3, `int_unimpl_dev` 7, `int_gp_fault` 13, `int_page_fault` 14) |
| 32 to 47 | `int_irq_isa_min`..`max` | legacy [PIC](pic-8259.md) IRQs; `IRQ_INT_OFFSET` is `0x20` |
| 48 to 155 | `int_irq_user_min`..`max` | user-assignable (I/O APIC pins, MSIs): 108 vectors |
| 156, 157 | `int_iommu`, `int_timer` | kernel's own |
| 158, 159 | `int_remote_call_ipi`, `int_reschedule_ipi` | SMP only |
| above `int_irq_max` to 254 | traps | reach user level as faults |
| 255 | `int_spurious` | APIC spurious vector |

A seL4 IRQ number is the vector minus `IRQ_INT_OFFSET`; see
[IRQ handling](../sel4/irq-handling.md).

`KernelSyscall` (CMake; `CONFIG_SYSCALL` or `CONFIG_SYSENTER`) picks
the mechanism at build time, default `syscall` on x86_64; `head.S`
checks CPUID for it and sets `EFER.SCE`. `KernelFSGSBase` picks how
bases are set (`inst`, `msr`).

## Gotchas

- **The register order is an ABI between `traps.S`, `registerset.h`
  and `restore_user_context()`.** The header says so; a patch that
  adds a saved register must change all three, and the offsets in
  `LOAD_USER_CONTEXT_OFFSET` (which also counts `CONFIG_XSAVE_SIZE`).
- **`sysret` with a non-canonical return address faults in ring 0**
  on Intel CPUs, on the user's stack. seL4 avoids it by making
  `USER_TOP` `0x7fffffffffff`, so the last user page cannot be mapped
  and the address after a `syscall` is always canonical (comment in
  `plat_mode/machine/hardware.h`).
- **`syscall` destroys `rcx` and `r11`**, so they cannot carry
  arguments; libsel4's stubs use `r10, r8, r9, r15` for message
  registers.
- **Unbalanced `swapgs` is fatal and silent.** Every path into the
  kernel must decide whether it came from user mode (the `CS` test)
  before swapping. Exceptions taken inside the kernel must not swap.
- **Interrupts in the kernel are never taken**, only noticed: IF is
  clear throughout, and long operations poll with preemption points
  (see [kernel design](../sel4/kernel-design.md)). The idle thread is
  the exception.
- **The error-code column matters.** `INT_HANDLER_WITH_ERR_CODE` and
  `WITHOUT` must match what the CPU does for that vector, or every
  later stack slot is off by 8.

## See also

- [Exceptions and traps](exceptions-and-traps.md): the general idea and vocabulary
- [x86-64 basics](x86-64-basics.md): GDT, TSS, `RFLAGS`
- [CPUID and MSRs](cpuid-and-msrs.md): `STAR`, `LSTAR`, `FMASK`, the GS base MSRs
- [x86 paging](x86-paging.md): the page fault, and the SKIM window's `CR3` switch
- [APIC](apic.md): where vectors 32 and up come from
- [Faults](../sel4/faults.md): what user level sees after `c_handle_interrupt()`
- [System calls and invocations](../sel4/syscalls-and-invocations.md): what `c_handle_syscall()` dispatches
- [AArch64 exceptions](aarch64-exceptions.md) and [RISC-V paging and traps](riscv-paging-and-traps.md): the same step elsewhere
- [Privilege levels](privilege-levels.md): the CPU modes that separate user code, kernel, hypervisor and firmware on x86

## References

- [seL4 `src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S):
  the header comment (what is pushed, with offsets), the `LOAD_*`
  macros, `INT_HANDLER_COMMON`, which vectors have error codes,
  `handle_interrupt`, `handle_fastsyscall`. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c)
  and [`src/arch/x86/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/c_traps.c):
  the C entry points and `restore_user_context()`. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c):
  `init_idt_entry()`, `init_tss()`, `init_syscall_msrs()`.
  *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h):
  the vector layout. *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/64/mode/model/statedata.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/model/statedata.h):
  `x64KSIRQStack` and `IRQ_STACK_SIZE`. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/64/plat_mode/machine/hardware.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/64/plat_mode/machine/hardware.h):
  the `USER_TOP` comment about `syscall` at the last address.
  *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html),
  volume 3 chapter 6 "Interrupt and Exception Handling" (vector table
  6-1, 6.14 "Exception and Interrupt Handling in 64-bit Mode",
  IST); volume 2 for `SYSCALL`, `SYSRET`, `SYSENTER`, `SWAPGS`.
  *Unchecked (intel.com refuses scripted fetches).*
- [AMD64 Architecture Programmer's Manual, volume 2](https://www.amd.com/en/search/documentation/hub.html),
  chapter 8 "Exceptions and Interrupts" and section 6.1 "Fast System
  Call". *Unchecked (not opened today).*
- [Linux kernel documentation, "Kernel Entries"](https://docs.kernel.org/arch/x86/entry_64.html):
  the `swapgs` rules and IST use, from Linux's point of view.
  *Unchecked (not opened today).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
