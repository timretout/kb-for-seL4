# Exceptions, interrupts and traps

> The three ways a CPU leaves user code for the kernel (a faulting instruction, a system call instruction, an asynchronous interrupt), what hardware saves and what software must, and how the kernel returns; every seL4 architecture funnels these into the same five C functions in `src/api/syscall.c`.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [Common ideas](../INDEX.md#common-ideas) · ← [Privilege levels](privilege-levels.md) · [Virtual memory](virtual-memory.md) →

Read first: [Privilege levels](privilege-levels.md).

| At a glance | |
|---|---|
| Kind | CPU mechanism: how control passes from user code to the kernel and back |
| Architecture | x86, Arm, RISC-V |
| Reached through | A faulting instruction, a system call instruction (`syscall`, `svc`, `ecall`), or an interrupt |
| Key numbers | Three causes; five C entry functions in seL4 |
| seL4 code | `traps.S` and `c_traps.c` per architecture; [`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c) |
| seL4 config | `CONFIG_FASTPATH`, `CONFIG_MAX_NUM_WORK_UNITS_PER_PREEMPTION` |
| seL4 use | Interrupts masked for the whole entry; a fault becomes a message to a [fault handler](../sel4/faults.md) |

## What it is

A CPU runs one instruction after another until something forces it to
run kernel code instead. Every architecture has the same three causes,
and the same mechanism for all of them: the processor raises its
[privilege level](privilege-levels.md), records where it was, and
jumps to an address the kernel registered beforehand. This page gives
the common picture; the per-architecture pages give the registers.

### Three ways in

| Cause | Timing | Example | Returns to |
|---|---|---|---|
| Synchronous exception | caused by the instruction being executed | page fault, undefined instruction, divide by zero (x86) | the same instruction (to retry it) or nowhere (the thread is stopped) |
| System call instruction | synchronous, and intended | `syscall` (x86-64), `svc` (Arm), `ecall` (RISC-V) | the next instruction |
| Interrupt | asynchronous: a device, timer or other core wants attention | timer tick, network packet, [IPI](smp-bringup.md) | the instruction that had not yet run |

A system call is architecturally just an exception that a program
raises on purpose, and Arm and RISC-V deliver it exactly like one.
x86-64 gives it a separate, faster path that bypasses the table used
for everything else.

The words differ between architectures and cause real confusion:

| Architecture | Vocabulary |
|---|---|
| x86 | *interrupt* is asynchronous. *Exception* is synchronous and comes as a *fault* (reported before the instruction, which can be restarted: page fault), a *trap* (reported after it: breakpoint) or an *abort* (no reliable restart: machine check). |
| Arm | *exception* covers everything, interrupts included. Synchronous exceptions, IRQ, FIQ and SError are its four kinds; a memory fault is an *abort*. |
| RISC-V | *exception* is synchronous, *interrupt* is asynchronous, and *trap* is the transfer of control that either causes. |

In this knowledge base "exception" means synchronous unless the page
is about Arm, and "kernel entry" means any of the three.

### Vectors

The kernel tells the CPU where to go by loading a *vector table*: one
entry point per cause, or per class of cause.

| | x86-64 | AArch64 | RISC-V |
|---|---|---|---|
| Table | IDT, 256 gates, each holding a handler address | 16 fixed-size code slots at `VBAR_ELx` | one address in `stvec` (optionally one slot per interrupt) |
| What selects the entry | vector number: 0 to 31 exceptions, 32 to 255 interrupts | kind (sync, IRQ, FIQ, SError) × where it came from | nothing, or the interrupt number in vectored mode |
| Where the precise cause is | the vector number, plus an error code and `CR2` | `ESR_ELx` (syndrome), `FAR_ELx` (address) | `scause`, `stval` |
| System call | `syscall` jumps to the address in the `LSTAR` MSR | `svc` is a synchronous exception | `ecall` is an exception, cause 8 |
| Return instruction | `iretq`, `sysretq` | `eret` | `sret` |
| Details | [x86-64 exceptions and system calls](x86-exceptions-syscalls.md) | [AArch64 exceptions](aarch64-exceptions.md) | [RISC-V paging and traps](riscv-paging-and-traps.md) |

The trend from left to right is less work in hardware: x86 looks up a
table in memory and pushes a frame on a stack; RISC-V sets three
registers and jumps to one address, and software decodes the rest.

### What hardware saves, and what software must

On entry the processor does the minimum that software could not do for
itself:

1. saves the interrupted program counter (pushed on the stack on x86,
   in `ELR_ELx` on Arm, in `sepc` on RISC-V);
2. saves the interrupted status: privilege level and interrupt-enable
   state (pushed `RFLAGS` and `CS`; `SPSR_ELx`; the `SPP` and `SPIE`
   bits of `sstatus`);
3. records the cause (vector number, `ESR_ELx`, `scause`);
4. raises the privilege level and masks interrupts;
5. jumps to the vector.

Nothing else is preserved. All general-purpose registers still hold
the user's values, so the first instructions of the handler must store
them somewhere without destroying any of them. That takes a stack or a
save area the handler can find with no free register, and each
architecture has a trick for it. x86-64 switches the stack pointer in
hardware for IDT entries (from the TSS, see
[x86-64 basics](x86-64-basics.md)) but not for `syscall`, which needs
`swapgs`. AArch64 gives each exception level its own banked stack
pointer. RISC-V provides a spare register, `sscratch`, that the
handler swaps with a general register in one instruction.

Floating-point and vector state is large and usually saved lazily or
only on a thread switch.

### Returning

The return instruction undoes steps 1, 2 and 4 atomically: it restores
the program counter, the privilege level and the interrupt-enable
state together. It has to be one instruction: if lowering privilege
and jumping were separate, there would be a moment of user code with
kernel rights or kernel code with user rights.

For a fault that the kernel has fixed, the saved program counter still
points at the faulting instruction and it runs again. For a system
call the handler must return to the following instruction: x86 and Arm
save that address already, while RISC-V saves the address of the
`ecall` itself and software adds 4.

### Masking and nesting

Synchronous exceptions cannot be masked: the instruction cannot
complete. Interrupts can, by a status bit (`RFLAGS.IF`, the `DAIF`
bits, `sstatus.SIE`), and the entry sequence sets the mask so that a
handler is not interrupted before it has saved state. A kernel that
re-enables interrupts inside a handler gets *nested* entries, and so
needs a stack frame per level and re-entrant code. Linux does this;
seL4 does not.

An exception raised while the kernel is already handling one still
nests, masked or not. If that second entry itself faults (a bad kernel
stack, say), x86 raises a *double fault* and then resets the machine
(a triple fault); the other architectures simply loop or hang. Some
events ignore the mask: x86's NMI (non-maskable interrupt) and machine
check, Arm's SError when unmasked, and anything taken to a more
privileged level (firmware in EL3 or M-mode, a hypervisor), which
happens invisibly to the kernel.

## In seL4

Each architecture has a small assembly file that saves the user
registers and a `c_traps.c` that calls the shared code. The assembly
stores registers straight into the current thread's TCB (`tcbContext`,
see [Threads and TCBs](../sel4/threads.md)), not onto a stack, because
the kernel never needs to return to where a kernel entry came from: it
runs to completion and then resumes whichever thread the scheduler
chose (see [Kernel design](../sel4/kernel-design.md)).

| Architecture | Assembly | C entry |
|---|---|---|
| x86-64 | [`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S) | [`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c) |
| AArch64 | [`src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S) | [`src/arch/arm/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/c_traps.c) |
| RISC-V | [`src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S) | [`src/arch/riscv/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/c_traps.c) |

The `c_handle_*` functions in those files take the big kernel lock on
SMP (`NODE_LOCK_SYS` or `NODE_LOCK_IRQ`, see [SMP](../sel4/smp.md)),
decode the cause, and call one of five functions in
[`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c).
A comment there explains that these are the cases of one function,
`handleEvent`, in the Haskell and abstract specifications:

| Function | Entered for | What it does |
|---|---|---|
| `handleSyscall(syscall)` | a system call number in the valid range (`SYSCALL_MIN` to `SYSCALL_MAX`) | Send, Recv, Call, Reply, Yield and so on (see [IPC](../sel4/ipc.md)) |
| `handleUnknownSyscall(w)` | any other number | debug and benchmark calls such as `SysDebugPutChar` when configured, otherwise an `UnknownSyscall` fault to the thread's handler |
| `handleVMFaultEvent(type)` | a page fault or access fault from user level | `handleVMFault` records address and cause as a `VMFault`, then `handleFault` sends it to the fault handler |
| `handleUserLevelFault(a, b)` | every other synchronous exception from user level | a `UserException` fault carrying two words (the cause number, an error code) |
| `handleInterruptEntry()` | an interrupt | `checkInterrupt` reads the pending [IRQ](irq.md) from the interrupt controller and `handleInterrupt` signals a notification or runs the kernel timer tick (see [Interrupt delivery](../sel4/irq-handling.md)) |

All five end with `schedule()` and `activateThread()`, and their
caller then calls `restore_user_context()`. That function never
returns: it reloads the registers of `ksCurThread` from its TCB and
executes the return instruction. So the general shape of every kernel
entry is: assembly saves into the old thread's TCB, C does the work
and perhaps changes `ksCurThread`, `restore_user_context` loads from
the (possibly different) current TCB. A thread switch is nothing more
than that pointer changing in between. With `CONFIG_FASTPATH`, the
assembly sends Call and ReplyRecv to `c_handle_fastpath_call` and
`c_handle_fastpath_reply_recv` first, which fall back to `slowpath()`
and so `handleSyscall` when their conditions fail.

![Every seL4 kernel entry has the same shape: assembly saves the user registers into the old thread's TCB, a c_handle function calls one of five functions in syscall.c, and restore_user_context loads the registers of the current thread from its TCB and returns.](../images/exceptions-and-traps-sel4-entry.svg)

*Nothing is saved on a stack and nothing returns to the point of entry: a thread switch is `ksCurThread` changing between the save and the load.*

seL4 handles no fault itself. There is no demand paging, no
copy-on-write and no signal delivery in the kernel: a fault becomes an
IPC message to a user-level handler ([Faults](../sel4/faults.md)).

Two properties make this simple and are part of what the
[proofs](../sel4/verification.md) rely on:

- **The kernel does not take exceptions from itself.** Its code is
  proved not to dereference bad pointers or execute undefined
  instructions, and all its memory is mapped up front
  ([Virtual memory](virtual-memory.md)). The entry code treats an
  exception from kernel mode as fatal: RISC-V's `c_handle_exception`
  checks `sstatus.SPP` and halts with "KERNEL ABORT", and AArch64's
  `cur_el_sync` handler (a synchronous exception from the kernel's own
  level) ends in `halt`. The one legitimate entry from kernel mode is
  an interrupt that wakes the idle thread, which runs in kernel mode.
- **Interrupts stay masked for the whole kernel entry.** Nothing
  nests, so one kernel stack per core suffices and kernel data needs no
  interrupt-safe locking. To keep interrupt latency bounded, long
  operations (deleting a large CNode, clearing a big untyped) call
  `preemptionPoint()`
  ([`src/model/preemption.c`](https://github.com/seL4/seL4/blob/master/src/model/preemption.c)),
  which every `CONFIG_MAX_NUM_WORK_UNITS_PER_PREEMPTION` calls asks
  the interrupt controller whether anything is pending
  (`isIRQPending()`). If so the operation returns
  `EXCEPTION_PREEMPTED` having left the system in a consistent state,
  the interrupt is handled as if freshly taken, and the system call is
  restarted when the thread next runs. The interrupt is polled for; it
  is never taken as a nested entry.

## Gotchas

- "Trap" means three different things: on x86 a kind of exception
  reported after the instruction, on RISC-V any kernel entry, and
  loosely "an instruction that a hypervisor intercepts". seL4's file
  names (`traps.S`, `c_traps.c`) use the RISC-V sense on every
  architecture.
- seL4's `exception_t` and `EXCEPTION_NONE`, `EXCEPTION_FAULT`,
  `EXCEPTION_PREEMPTED` are C return codes inside the kernel. They
  have nothing to do with processor exceptions.
- A user-level "fault" in seL4 terms (a message to a fault handler)
  can come from a hardware exception or from a system call that
  failed capability lookup; the two arrive by different entry
  functions but end in the same `handleFault`.
- On RISC-V the saved program counter for a system call is the
  `ecall` itself. seL4's `traps.S` stores `sepc + 4` in the `NextIP`
  slot for system calls and plain `sepc` for everything else; a patch
  that mixes the two either skips or repeats an instruction.
- A hypervisor or firmware above the kernel can take interrupts and
  exceptions the kernel never sees, and can inject ones it did not
  expect. On cloud machines this is the normal case
  ([Privilege levels](privilege-levels.md)).
- The entry path is not covered by the C-level proofs: the assembly
  and `restore_user_context` (marked `DONT_TRANSLATE`) are trusted, so
  a change there needs testing and careful review instead of a proof
  update.

## See also

- [Privilege levels](privilege-levels.md): the modes a kernel entry moves between
- [x86-64 exceptions and system calls](x86-exceptions-syscalls.md): the IDT, `syscall`, and seL4's x86 entry code
- [AArch64 exceptions](aarch64-exceptions.md): `VBAR`, `ESR`, `ERET`
- [RISC-V paging and traps](riscv-paging-and-traps.md): `stvec`, `scause`, `sret`
- [IRQ](irq.md): where interrupts come from before they reach the CPU
- [Kernel design and execution model](../sel4/kernel-design.md): why seL4 runs with interrupts off and one stack per core
- [Faults and fault handlers](../sel4/faults.md): what user level sees of an exception
- [Virtual memory](virtual-memory.md): the source of the most common exception
- [RISC-V basics](riscv-basics.md): the RISC-V architecture as a kernel sees it
- [Interrupts: a map](interrupts.md): every interrupt controller on x86, Arm and RISC-V side by side, and how this one fits in

## References

- [seL4 `src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c):
  `handleInterruptEntry`, `handleUnknownSyscall`,
  `handleUserLevelFault`, `handleVMFaultEvent`, `handleSyscall`, and
  the `handleEvent` comment. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/c_traps.c)
  and [`src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S):
  the shortest complete entry and exit path to read; the kernel-abort
  check and the `sepc + 4` adjustment. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/c_traps.c)
  and [`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c):
  the `c_handle_*` functions and which shared function each calls.
  *Checked 2026-11-14.*
- [seL4 `src/model/preemption.c`](https://github.com/seL4/seL4/blob/master/src/model/preemption.c):
  `preemptionPoint`. *Checked 2026-11-14.*
- [The RISC-V Instruction Set Manual, Volume I, introduction](https://github.com/riscv/riscv-isa-manual/blob/main/src/unpriv/intro.adoc),
  "Exceptions, Traps, and Interrupts": the definitions of the three
  words. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual, combined volumes](https://cdrdv2.intel.com/v1/dl/getContent/671200)
  (order number 325462-093US, September 2026), volume 3, chapter 7
  "Interrupt and Exception Handling" (chapter 6 in older revisions):
  7.1 for interrupt and exception, 7.5 "Exception Classifications" for
  fault, trap and abort, table 7-1 for each vector's class.
  *Checked 2026-11-14.*
- [Arm Architecture Reference Manual for A-profile (DDI 0487)](https://developer.arm.com/documentation/ddi0487/latest),
  chapter D1 "The AArch64 System Level Programmers' Model": exception
  kinds and entry. *Unchecked: developer.arm.com refuses scripted
  fetches.*
- [Linux `arch/arm64/kernel/entry.S`](https://github.com/torvalds/linux/blob/master/arch/arm64/kernel/entry.S):
  the AArch64 vector table, one entry for each of synchronous, IRQ, FIQ
  and SError from each of four origins. *Checked 2026-11-14.*
