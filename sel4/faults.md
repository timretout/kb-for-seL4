# Faults and fault handlers

> When a thread does something the kernel cannot complete (a bad capability, a page fault, an illegal instruction, on MCS an exhausted budget), the kernel turns it into an IPC message to the thread's fault endpoint, so paging, debugging and crash handling are all user-level servers.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [Notifications](notifications.md) · [Trapping foreign system calls](foreign-syscalls.md) →

Read first: [IPC and endpoints](ipc.md), [Threads and TCBs](threads.md), [Exceptions and traps](../concepts/exceptions-and-traps.md).

| At a glance | |
|---|---|
| Kind | Kernel mechanism |
| Key source | [`src/kernel/faulthandler.c`](https://github.com/seL4/seL4/blob/master/src/kernel/faulthandler.c), [`src/api/faults.c`](https://github.com/seL4/seL4/blob/master/src/api/faults.c) |
| Config options | `CONFIG_HARDWARE_DEBUG_API` (for `DebugException`) |
| API | Fault endpoint set with `seL4_TCB_Configure` or `seL4_TCB_SetSpace`; on MCS also `seL4_TCB_SetTimeoutEndpoint`; the handler answers with an IPC reply |
| Built on | [IPC and endpoints](ipc.md) |
| Used by | Pagers, [virtual machine monitors](hypervisor.md), the [Microkit](microkit.md) monitor |

## What it is

A monolithic kernel handles a page fault itself and sends `SIGSEGV`
when it cannot. seL4 has no pager, no signals and no policy. When a
thread faults, the kernel:

1. records the fault in the thread's TCB;
2. makes the thread **send a message describing the fault** to its
   **fault endpoint**, as if the thread had done `seL4_Call` there;
3. leaves the thread blocked until a **fault handler** thread, which
   was waiting on that endpoint, replies.

The handler receives an ordinary IPC message whose *label* is the
fault type and whose message registers describe it. It can fix the
cause (map a page, emulate an instruction, adjust registers) and
**reply**, which resumes the faulting thread; or not reply, which
leaves the thread blocked for good; or suspend, inspect or delete it
through its TCB capability. A badge on the fault endpoint capability
tells a handler serving many threads which one faulted.

![A faulting thread traps to the kernel, which records the fault and sends a message to the fault endpoint; the fault handler fixes the cause and replies, and the thread is resumed.](../images/faults-delivery.svg)

*The three steps above as a sequence. The thread is blocked from the
fault until the handler's reply.*

### Fault types

| Type (`seL4_Fault_*`) | Label | Raised when |
|---|---|---|
| `NullFault` | 0 | No fault (the value of `tcbFault` normally) |
| `CapFault` | 1 | A system call named a capability that could not be looked up, or (non-MCS) is of the wrong kind for the call |
| `UnknownSyscall` | 2 | A system call number the kernel does not know; the basis of system-call emulation and of virtualising another OS's ABI |
| `UserException` | 3 | An architecture exception with no more specific type: illegal instruction, divide error, alignment and so on |
| `DebugException` | 4 | Breakpoint, watchpoint or single step; only with `CONFIG_HARDWARE_DEBUG_API` |
| `Timeout` | 5 | MCS only: the thread's scheduling context ran out of budget and it has a timeout endpoint ([MCS](mcs.md)) |
| `VMFault` | 5, or 6 on MCS | A page fault: an access to an unmapped address or one the mapping does not permit |
| `VGICMaintenance`, `VCPUFault`, `VPPIEvent` | after `VMFault` | Arm [hypervisor](hypervisor.md) builds: events from a guest that its virtual machine monitor must handle |

The numbers come from the `seL4_Fault` tagged union in libsel4's
per-architecture `shared_types.bf` and shift with configuration, so
code compares against the `seL4_Fault_*` constants.

### Message layouts

Indices are `seL4_<Fault>_<Field>` enumerators in libsel4; libsel4
also generates `seL4_Fault_t` accessors (`seL4_getFault()`,
`seL4_Fault_VMFault_get_Addr()` and so on) from the same definitions.

**Cap fault**

| MR | Content |
|---|---|
| `seL4_CapFault_IP` | Program counter to restart at |
| `seL4_CapFault_Addr` | The CPtr that failed |
| `seL4_CapFault_InRecvPhase` | 1 if it failed in the receive phase of a call |
| `seL4_CapFault_LookupFailureType` and following | Why the lookup failed: invalid root, missing capability, depth mismatch, guard mismatch, with details ([CSpace](cspace.md)) |

**VM fault** (`seL4_VMFault_Length` = 4)

| MR | Content |
|---|---|
| `seL4_VMFault_IP` | Program counter of the faulting instruction |
| `seL4_VMFault_Addr` | The address accessed |
| `seL4_VMFault_PrefetchFault` | 1 if it was an instruction fetch |
| `seL4_VMFault_FSR` | The architecture's fault status: the page-fault error code on x86, the exception syndrome register (`ESR_EL1`, or `ESR_EL2` in a hypervisor build) on AArch64; RISC-V gets a constant naming the kind of access (load, store or instruction) |

**Unknown syscall**: the thread's general registers in an
architecture-defined order (on x86-64 `RAX`, `RBX`, ... then the fault
IP, stack pointer and flags), then the system call number as the last
word. **User exception** (x86-64): `FaultIP`, `SP`, `FLAGS`, `Number`
(the exception vector), `Code` (its error code). Both layouts let the
handler *reply with new register values*.

**Timeout** (MCS): `seL4_Timeout_Data` (the scheduling context's
badge) and `seL4_Timeout_Consumed` (time used).

### Replying

The reply's content matters:

- For unknown syscall, user exception and timeout faults the kernel
  copies the reply's message registers back into the thread's
  registers (as many as the reply's length says), and resumes the
  thread **only if the reply's label is 0**. A non-zero label leaves
  it `Inactive`.
- For cap faults and VM faults the reply's content is ignored and the
  thread is restarted: it re-executes the faulting instruction or
  system call. So a pager simply maps the page and replies with an
  empty message (`Arch_handleFaultReply()` returns true for
  `VMFault` on x86, Arm and RISC-V).
- To skip an instruction, or emulate it, the handler changes the
  program counter: in the reply for the register-carrying faults, or
  with `seL4_TCB_WriteRegisters` before replying for the others.

### Naming the fault endpoint

This differs between the two kernels and is a common source of
confusion:

| | Non-MCS | MCS |
|---|---|---|
| Stored as | A CPtr, a number (`tcbFaultHandler` field) | A capability in the TCB's `tcbFaultHandler` slot |
| Set by | `seL4_TCB_Configure`, `SetSpace` with a CPtr argument | `seL4_TCB_SetSpace`, `SetSchedParams` with a capability argument |
| Resolved | At fault time, by `lookupCap()` in the **faulting thread's own CSpace** | At configuration time, in the **configurer's** CSpace |
| Rights needed | Send, and Grant or GrantReply (checked at fault time) | Checked when installed (`validFaultHandler()`) |
| No handler | CPtr 0, or anything that does not resolve to a suitable endpoint | Null capability in the slot |

The non-MCS design means the faulting thread must hold a capability to
its own fault endpoint, which it could also use to send forged fault
messages or which it could delete. MCS fixed that: the thread need not
be able to name its handler at all. MCS also adds the separate
**timeout endpoint** (`seL4_TCB_SetTimeoutEndpoint`).

### Double faults

On the non-MCS kernel, looking up the handler can itself fail (the
CPtr is bad, or the capability is not a sendable endpoint). That is a
**double fault**: `handleDoubleFault()` makes the thread `Inactive`,
and on a kernel built with printing writes a message of the form
"Caught cap fault in send phase at address 0 while trying to handle:
vm fault on data at address ..." with the thread's name, program
counter and a stack dump. Most developers first meet seL4's fault
mechanism through that message: it means "a thread crashed and had no
fault handler". On MCS the equivalent is `handleNoFaultHandler()`:
"Found thread has no fault handler while trying to handle: ...".

Nothing is sent to anyone in either case; on a release kernel the
thread just stops.

## In seL4

- Detection. Faults are raised wherever the kernel finds it cannot
  proceed, by setting the global `current_fault` (and
  `current_lookup_fault`) and returning `EXCEPTION_FAULT`. The entry
  points in
  [`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c)
  then call `handleFault()`: `handleUnknownSyscall()`,
  `handleUserLevelFault()` (user exceptions), `handleVMFaultEvent()`
  (page faults, after the architecture's `handleVMFault()` has decoded
  the address and status), and `handleInvocation()`/`handleRecv()` for
  cap faults. The architecture's trap code decides which of these a
  hardware exception becomes; see
  [x86 exceptions and syscalls](../concepts/x86-exceptions-syscalls.md)
  and [AArch64 exceptions](../concepts/aarch64-exceptions.md).
- Delivery.
  [`src/kernel/faulthandler.c`](https://github.com/seL4/seL4/blob/master/src/kernel/faulthandler.c):
  `handleFault()` calls `sendFaultIPC()`, which finds the endpoint as
  the table above describes, copies `current_fault` into
  `tptr->tcbFault`, and calls `sendIPC()` with `blocking` true, on
  behalf of the faulting thread. Non-MCS passes `do_call` true; MCS
  passes false and `sendIPC()` treats any sender with a pending fault
  as a caller.
- Message. In
  [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c)
  `doIPCTransfer()` sees `tcbFault` is not `NullFault` and calls
  `doFaultTransfer()`, which uses `setMRs_fault()` in
  [`src/api/faults.c`](https://github.com/seL4/seL4/blob/master/src/api/faults.c)
  to fill the handler's message registers and builds a tag with the
  fault type as label. Architecture-specific types go through
  `Arch_setMRs_fault()` in `src/arch/*/api/faults.c`.
- Reply. `doReplyTransfer()` sees the receiver has a fault, calls
  `handleFaultReply()` (same file; `Arch_handleFaultReply()` for
  architecture types), clears `tcbFault`, and sets the thread to
  `Restart` or `Inactive` according to the result.
- The register lists for unknown-syscall and exception messages are
  the `fault_messages` tables (`MessageID_Syscall`,
  `MessageID_Exception`, `MessageID_TimeoutReply`) in each
  architecture's `registerset.h`/`faults.c`.
- Timeouts: `endTimeslice()` in `thread.c` raises
  `seL4_Fault_Timeout` and calls `handleTimeout()`.

The fault types and the user-side layouts are defined in
`libsel4/arch_include/*/sel4/arch/shared_types.bf`,
`libsel4/include/sel4/constants.h` and the per-architecture
`constants.h`, and decoded by `libsel4/include/sel4/faults.h` and
`libsel4/sel4_arch_include/*/sel4/sel4_arch/faults.h`.

## Gotchas

- **A fault is a blocking send.** If the handler is not waiting, the
  faulting thread sits in the endpoint's queue (`BlockedOnSend`) until
  it is; if the handler never receives, nothing reports the fault.
- **A fault handler that faults** sends to *its own* handler; a thread
  that is its own handler deadlocks.
- **Non-MCS: the CPtr is resolved in the faulting thread's CSpace**,
  not the creator's. Passing a CPtr valid only in the parent's CSpace
  gives a double fault on the child's first fault, not an error from
  `seL4_TCB_Configure`.
- **Replying with a non-zero label does not resume** for the
  register-carrying fault types. A handler reusing a tag variable from
  the received fault (whose label is the fault type) will leave the
  thread stopped.
- **A restarted cap fault repeats.** Replying without fixing the
  CSpace loops fault, reply, fault.
- **Every fault restarts *at* the instruction that raised it,
  `UnknownSyscall` included.** The entry code saves the address of the
  trap instruction itself as `FaultIP`, a restarted thread resumes at
  `getRestartPC()`, which is `FaultIP`, and that is the IP in the
  message. A handler that emulates an unknown system call must put a
  `FaultIP` advanced past the instruction in its reply, or the thread
  traps again.
- **The "Caught cap fault ... while trying to handle" message blames
  the wrong fault.** The interesting one is the second line; the cap
  fault only says no handler was found.
- **Fault messages arrive on the same endpoint as ordinary IPC** if
  the handler shares it. The label is the only distinction, and an
  ordinary client can choose label values that look like faults unless
  badges separate them. Microkit reserves a badge bit
  (`BADGE_FAULT_BIT`) for this.
- **MCS: a timeout fault is not sent for round-robin scheduling
  contexts** (budget equal to period) nor when no valid timeout
  endpoint is set; the thread is just postponed until its budget
  refills.
- **Message layouts are ABI.** Changing the order or number of words
  breaks every pager and virtual machine monitor, and the `Arch_`
  variants must change together with libsel4.

## See also

- [IPC and endpoints](ipc.md): the transport
- [Threads and TCBs](threads.md): the TCB slot and field that name the handler
- [MCS](mcs.md): timeout faults and scheduling contexts
- [Exceptions and traps](../concepts/exceptions-and-traps.md): the hardware events underneath
- [VSpace](vspace.md): what a pager does on a VM fault
- [Hypervisor support](hypervisor.md): VCPU and virtual interrupt faults
- [Debugging](debugging.md): reading the double-fault message
- [Microkit](microkit.md): the monitor as every protection domain's fault handler
- [RISC-V paging and traps](../concepts/riscv-paging-and-traps.md): how an S-mode kernel on RISC-V translates addresses
- [Virtual memory](../concepts/virtual-memory.md): how an MMU translates the addresses programs use into physical ones through multi-level page tables, with...
- [Kernel design and execution model](kernel-design.md): the rules every line of seL4 follows
- [System calls and invocations](syscalls-and-invocations.md): seL4 has only about a dozen real system calls, all forms of sending to or receiving from a capability
- [Trapping foreign system calls](foreign-syscalls.md): which foreign system calls reach the handler and which do not
- [A Linux personality on seL4](linux-personality.md): an operating system interface built on `UnknownSyscall` and VM faults

## References

- [`src/kernel/faulthandler.c`](https://github.com/seL4/seL4/blob/master/src/kernel/faulthandler.c):
  `handleFault()`, `sendFaultIPC()` in both variants,
  `handleDoubleFault()`/`handleNoFaultHandler()` and the messages they
  print. *Checked 2026-11-14.*
- [`src/api/faults.c`](https://github.com/seL4/seL4/blob/master/src/api/faults.c):
  `setMRs_fault()`, `handleFaultReply()`. *Checked 2026-11-14.*
- [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c):
  `doFaultTransfer()`, `doReplyTransfer()`. *Checked 2026-11-14.*
- [`libsel4/arch_include/x86/sel4/arch/shared_types.bf`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/sel4/arch/shared_types.bf)
  (and the `arm`, `riscv` siblings): fault type numbers.
  *Checked 2026-11-14.*
- [`libsel4/sel4_arch_include/x86_64/sel4/sel4_arch/constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/x86_64/sel4/sel4_arch/constants.h):
  `seL4_VMFault_*`, `seL4_UserException_*`, `seL4_Timeout_*` indices.
  *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  version 17.0.0, section 6.2 "Faults": the fault types, message
  tables and what a reply does. *Checked 2026-11-14.*
- [seL4 tutorial, "Fault handling"](https://docs.sel4.systems/Tutorials/fault-handlers.html):
  resuming with a reply whose label is 0, or with `seL4_TCB_Resume`.
  *Checked 2026-11-14.*
- [`src/arch/x86/api/faults.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/api/faults.c)
  (and the `arm`, `riscv` siblings): `Arch_handleFaultReply()`,
  `Arch_setMRs_fault()`. *Checked 2026-11-14.*
- [`src/arch/x86/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/vspace.c),
  [`src/arch/arm/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c)
  and [`src/arch/riscv/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/vspace.c):
  `handleVMFault()`, what goes in the FSR word. *Checked 2026-11-14.*
- [`src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S),
  [`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c)
  and [`src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S):
  `FaultIP` on a system call is the address of the trap instruction.
  *Checked 2026-11-14.*
