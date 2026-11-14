# Threads and TCBs

> A seL4 thread is a thread control block (TCB) object: saved registers plus the capabilities and scheduling parameters that say where it runs, what it can name and who hears about its faults; every user-level system starts by configuring some.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [System calls and invocations](syscalls-and-invocations.md) · [Scheduling](scheduling.md) →

Read first: [Capabilities](capabilities.md), [Kernel objects](kernel-objects.md), [CSpace](cspace.md).

| At a glance | |
|---|---|
| Kind | Kernel object (thread control block, TCB) |
| Key source | [`include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h), [`src/object/tcb.c`](https://github.com/seL4/seL4/blob/master/src/object/tcb.c), [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c) |
| API | `seL4_TCB_Configure`, `seL4_TCB_SetSpace`, `seL4_TCB_SetSchedParams`, `seL4_TCB_WriteRegisters`, `seL4_TCB_Resume`, `seL4_TCB_Suspend` |
| Object size | 2^`seL4_TCBBits` bytes: 2048 on x86-64 and AArch64 by default, 4096 with large FPU state or some options |
| Built on | [Untyped memory](untyped-memory.md), [CSpace](cspace.md), [VSpace](vspace.md) |
| Used by | [Scheduling](scheduling.md), [IPC](ipc.md), [faults](faults.md) |
| Verified | The proofs model every field of `struct tcb` |

## What it is

seL4 has no processes. Its only unit of execution is the **thread**,
represented by a **thread control block** (TCB), a kernel object made by
retyping [untyped memory](untyped-memory.md) and controlled through a
TCB capability. A "process" is a convention at user level: one or more
TCBs that share a capability space and an address space.

A new TCB can do nothing. Whoever holds its capability gives it, piece
by piece:

| Piece | What it is | Set by |
|---|---|---|
| Register context | Saved user registers: program counter, stack pointer, the rest | `WriteRegisters` |
| CSpace root | The CNode where the thread's capability lookups start ([CSpace](cspace.md)), with a guard | `Configure`, `SetSpace` |
| VSpace root | The top-level page table of its address space ([VSpace](vspace.md)) | `Configure`, `SetSpace` |
| IPC buffer | One mapped frame for message words and capability transfer that do not fit in registers ([IPC](ipc.md)) | `Configure`, `SetIPCBuffer` |
| Fault endpoint | Where the kernel sends a message when the thread faults ([Faults](faults.md)) | `Configure`, `SetSpace`; on MCS also `SetSchedParams` |
| Priority | 0 to 255; the scheduler runs the highest runnable priority ([Scheduling](scheduling.md)) | `SetPriority`, `SetSchedParams` |
| MCP | Maximum controlled priority: the highest priority this thread may give to a thread (itself included) | `SetMCPriority`, `SetSchedParams` |
| Bound notification | A [notification](notifications.md) whose signals also arrive while the thread waits on an endpoint | `BindNotification` |
| Scheduling context (MCS only) | The thread's budget of CPU time ([MCS](mcs.md)); without one it cannot run | `SetSchedParams`, `seL4_SchedContext_Bind` |
| Timeout endpoint (MCS only) | Where a timeout fault goes when the budget runs out | `SetTimeoutEndpoint` |
| Affinity (SMP only) | The core the thread runs on; the kernel never migrates threads itself ([SMP](smp.md)) | `SetAffinity` |
| TLS base | The thread-local-storage pointer register (`FS` base on x86-64, `TPIDR_EL0` on AArch64, `tp` on RISC-V) | `SetTLSBase` |

All of these are invocations on the TCB capability, named
`seL4_TCB_<Name>` in [libsel4](libsel4.md). The ones a contributor
meets most:

- **`seL4_TCB_Configure`** sets the CSpace root, VSpace root and IPC
  buffer in one call. On the non-MCS kernel it also takes the fault
  endpoint as its first argument (four message words: fault endpoint,
  CSpace guard data, VSpace data, buffer address); on MCS it takes three
  and the fault endpoint moved to `SetSpace`.
- **`seL4_TCB_SetSpace`** sets fault endpoint, CSpace root and VSpace
  root without touching the IPC buffer.
- **`seL4_TCB_SetPriority`** and **`seL4_TCB_SetMCPriority`** each take
  a second TCB capability, the **authority**: the new value must not
  exceed the authority thread's MCP. **`seL4_TCB_SetSchedParams`** sets
  both at once, and on MCS also binds a scheduling context and sets the
  fault endpoint.
- **`seL4_TCB_WriteRegisters`** writes the first *n* registers of
  `seL4_UserContext` and has a `resume_target` flag;
  **`seL4_TCB_ReadRegisters`** reads them and has a `suspend_source`
  flag. **`seL4_TCB_CopyRegisters`** copies between two TCBs.
- **`seL4_TCB_Resume`** makes a thread runnable; **`seL4_TCB_Suspend`**
  stops it, cancelling any IPC it was blocked in.
- **`seL4_TCB_BindNotification`** and `UnbindNotification`.
- **`seL4_TCB_SetAffinity`**, **`seL4_TCB_SetTLSBase`**, and on debug
  or hardware-debug builds the breakpoint and single-step calls.

The usual recipe to start a thread: retype a TCB, `Configure` it, set
priority, `WriteRegisters` with the entry point and stack pointer, then
`Resume` (or pass `resume_target` to `WriteRegisters`).

### Thread states

A thread is always in exactly one state. Only `Running` and `Restart`
are **runnable**.

| `ThreadState_*` | Meaning |
|---|---|
| `Inactive` | Not runnable and not waiting: freshly created, suspended, or faulted with nobody to tell |
| `Running` | Runnable; resumes where it left off |
| `Restart` | Runnable; when next activated the kernel first sets its program counter to the restart address, so an interrupted system call is re-executed |
| `BlockedOnReceive` | Waiting on an endpoint for a message |
| `BlockedOnSend` | Waiting on an endpoint for a receiver; also the state of a faulted thread whose fault message has not been collected |
| `BlockedOnReply` | Made a `Call` (or faulted) and is waiting for the reply |
| `BlockedOnNotification` | Waiting on a notification |
| `RunningVM` | x86 with VT-x only: running as a guest ([hypervisor](hypervisor.md)) |
| `IdleThreadState` | The idle thread's own state |

"Running" does not mean "on a CPU now": the thread on the CPU is
`ksCurThread`; other `Running` threads sit in the ready queues.

### The idle thread

Each core has one **idle thread**, created by the kernel at boot, with
no capability to it and nothing user level can configure. The scheduler
switches to it when no thread is runnable. It runs in kernel mode and
executes the architecture's wait-for-interrupt instruction in a loop.

## In seL4

`struct tcb` is in
[`include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h).
Its fields, roughly in order: `tcbArch` (the saved register context and
other per-architecture state), `tcbState`, `tcbFlags`,
`tcbBoundNotification`, `tcbFault` and `tcbLookupFailure` (the pending
fault), `tcbDomain`, `tcbMCP`, `tcbPriority`, then either
`tcbSchedContext` and `tcbYieldTo` (MCS) or `tcbTimeSlice` and
`tcbFaultHandler` (non-MCS), `tcbIPCBuffer` (the buffer's user virtual
address), `tcbAffinity` (SMP), and the queue links `tcbSchedNext`/
`tcbSchedPrev` and, non-MCS only, `tcbEPNext`/`tcbEPPrev`.

`tcbState` is a `thread_state_t`, a bitfield structure generated from
`include/object/structures_*.bf` (see
[generated code](generated-code.md)). Besides the state type it holds
the object the thread is blocked on, the badge and rights of a blocked
send, and the `tcbQueued` bit that says the thread is in a ready queue.

**The TCB object contains a small CNode.** A TCB object is
`2^seL4_TCBBits` bytes (2048 on x86-64 and AArch64 in the default
configuration, 4096 with large FPU state or some options). The
capability's pointer points to the *middle* of it (`TCB_OFFSET`), where
`struct tcb` sits; the half below holds capability slots, reached with
`TCB_PTR_CTE_PTR(tcb, index)`. Keeping the roots as real capabilities
in real slots means revoking or deleting, say, the VSpace root finds and
clears the thread's copy like any other.

![A TCB object of 2^seL4_TCBBits bytes: the TCB capability points to its middle, where struct tcb begins, and the half below holds capability slots 0 to 4.](../images/threads-tcb-layout.svg)

*The capability points into the middle of the object: `struct tcb`
above, the thread's own capability slots below.*

| `tcb_cnode_index` | non-MCS | MCS |
|---|---|---|
| 0 | `tcbCTable`: CSpace root | same |
| 1 | `tcbVTable`: VSpace root | same |
| 2 | `tcbReply`: the "reply master" from which reply capabilities to this thread are derived | `tcbBuffer`: IPC buffer frame |
| 3 | `tcbCaller`: reply capability to the thread that last called this one | `tcbFaultHandler`: fault endpoint capability |
| 4 | `tcbBuffer`: IPC buffer frame | `tcbTimeoutHandler`: timeout endpoint capability |

Note the two meanings of "fault handler": on the non-MCS kernel
`tcbFaultHandler` is a field of `struct tcb` holding a CPtr (a number,
looked up in the thread's own CSpace when it faults); on MCS it is a
slot holding a capability. [Faults](faults.md) explains the
consequences.

Code:

- [`src/object/tcb.c`](https://github.com/seL4/seL4/blob/master/src/object/tcb.c):
  `decodeTCBInvocation()` dispatches to `decodeTCBConfigure()`,
  `decodeSetSpace()`, `decodeSetPriority()`, `decodeSetSchedParams()`
  and the rest, which check arguments and call
  `invokeTCB_ThreadControl()` (non-MCS) or
  `invokeTCB_ThreadControlCaps()`/`invokeTCB_ThreadControlSched()`
  (MCS), `invokeTCB_ReadRegisters()`, `invokeTCB_WriteRegisters()`,
  `invokeTCB_Suspend()`, `invokeTCB_Resume()`. `checkPrio()` is the MCP
  check: `prio > auth->tcbMCP` fails with `seL4_RangeError`. The same
  file has the queue primitives `tcbSchedEnqueue()`,
  `tcbSchedAppend()`, `tcbSchedDequeue()`, `tcbEPAppend()` and
  `tcbEPDequeue()`.
- [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c):
  `suspend()` (cancel IPC, dequeue, set `Inactive`), `restart()` (if
  the thread is stopped: cancel IPC, set `Restart`, enqueue),
  `setThreadState()`, `setPriority()`, `setMCPriority()`, and
  `activateThread()`, which runs on the way out of the kernel and turns
  `Restart` into `Running` after fixing the program counter.
- Register access goes through `getRegister()`/`setRegister()` and the
  `register_t` enumeration in each architecture's
  `include/arch/*/arch/*/mode/machine/registerset.h`; the order of
  `frameRegisters` followed by `gpRegisters` there is the order of
  `seL4_UserContext`.
- The idle thread is made by `create_idle_thread()` in
  [`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c);
  `Arch_configureIdleThread()` points it at `idle_thread()`. It lives in
  `ksIdleThread`, per core.

The decode/invoke split is deliberate and applies to every invocation:
decode functions may fail and must not change state; invoke functions
change state and (with few exceptions) cannot fail. The proofs rely on
it ([syscalls and invocations](syscalls-and-invocations.md)).

## Gotchas

- **A thread with priority above its creator's MCP cannot be made.**
  The check is against the *authority* TCB's MCP, not its priority, and
  the root task starts with MCP 255 (`seL4_MaxPrio`; see
  [BootInfo and the root task](bootinfo-and-root-task.md)). A new TCB
  has priority 0 and MCP 0, so a child that must create threads needs
  its MCP set too.
- **`Resume` on a thread blocked in IPC restarts the system call**: it
  cancels the IPC and sets `Restart`, so the thread re-executes the
  call. On a thread that is already `Running` it does nothing
  (`restart()` acts only if `isStopped()`).
- **`Suspend` of a thread with a pending fault discards the fault**, as
  `cancelIPC()` clears it.
- **`Configure` and `SetSpace` copy capabilities into the TCB's slots**
  (after `deriveCap()`), so deleting the caller's originals later does
  not unconfigure the thread, but revoking them does.
- **The IPC buffer is given twice**: a virtual address and a frame
  capability. The kernel writes through its own mapping of the frame
  and never checks that the address really maps that frame in the
  thread's VSpace; a mismatch gives a thread that sees different
  message words from the kernel.
- **MCS: a thread without a scheduling context is not schedulable**
  even when `Running`. `isSchedulable()` rather than `isRunnable()` is
  the test in MCS code paths.
- **Layout changes ripple.** `struct tcb` must fit in half the object,
  the fastpath and the assembly entry code use fixed offsets into
  `tcbArch`, and the proofs model every field, so adding a field is a
  [proof-impacting](proof-impact.md) change.

## See also

- [Scheduling](scheduling.md): what priority, MCP and domain do
- [IPC](ipc.md) and [Notifications](notifications.md): what the blocked states wait for
- [Faults](faults.md): the fault endpoint in use
- [MCS](mcs.md): scheduling contexts and timeout handlers
- [CSpace](cspace.md) and [VSpace](vspace.md): the two roots
- [Kernel objects](kernel-objects.md): the other object types
- [FPU state](../concepts/fpu-state.md): why the TCB size depends on it

## References

- [`include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h):
  `struct tcb`, `tcb_cnode_index`, the `ThreadState_*` values,
  `TCB_OFFSET`. *Checked 2026-11-14.*
- [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c):
  `suspend()`, `restart()`, `activateThread()`, `setPriority()`.
  *Checked 2026-11-14.*
- [`src/object/tcb.c`](https://github.com/seL4/seL4/blob/master/src/object/tcb.c):
  `checkPrio()`, `decodeTCBConfigure()` and the list of decode and
  invoke functions. *Checked 2026-11-14.*
- [`libsel4/include/interfaces/object-api.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/interfaces/object-api.xml):
  the TCB invocations and their MCS variants. *Checked 2026-11-14
  (method list; argument documentation not read in full).*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  chapter 6 "Threads and Execution": the user's view of all of this;
  section 6.1.6 for the initial thread's priority and MCP.
  *Checked 2026-11-14 (version 17.0.0; sections 6.1.1 to 6.1.6 read).*
- The `registerset.h` files for
  [x86-64](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/machine/registerset.h),
  [AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine/registerset.h)
  and [RISC-V](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/registerset.h):
  what `TLS_BASE` names (on AArch64, `TPIDR_EL0` with the default
  `KernelArmTLSReg`). *Checked 2026-11-14.*
- [`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c),
  `create_initial_thread`: priority and MCP set to `seL4_MaxPrio`.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
