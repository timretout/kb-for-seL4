# SMP (symmetric multiprocessing)

> seL4 built for more than one core runs a single kernel image under one big lock, with per-core scheduler state, threads pinned to cores and IPIs for anything one core must do to another; this configuration is not verified, which is why a one-kernel-per-core "multikernel" design is being pursued instead.

Read first: [Multiprocessor bring-up and IPIs](../concepts/smp-bringup.md), [Scheduling](scheduling.md), [Threads and TCBs](threads.md).

## What it is

Setting the CMake option `KernelMaxNumNodes` above 1 (C macro
`CONFIG_MAX_NUM_NODES`) builds an SMP kernel; `include/config.h` then
defines `ENABLE_SMP_SUPPORT`, which is what the source tests. "Node"
means core. The design choices are deliberately conservative:

- **One big kernel lock.** A core takes the lock on every kernel entry
  and releases it on exit, so at most one core executes kernel code
  that touches shared state. seL4's system calls are short and the
  kernel is not preemptible, so the lock is held briefly; the argument
  is that for a microkernel this costs little up to a moderate number
  of cores (unchecked: the measurements are in Peters et al., below).
- **Per-core scheduling.** Each core has its own ready queues, current
  thread and idle thread. There is no load balancing and no migration
  by the kernel: a thread runs on the core it has been assigned to, and
  only user level moves it.
- **IPIs** (inter-processor interrupts) carry the few operations that
  must happen on another core.

### Thread affinity

A [TCB](threads.md) has a `tcbAffinity` field, the core it runs on.

| Kernel | How a thread is placed |
|---|---|
| non-MCS | `seL4_TCB_SetAffinity(tcb, core)`; new threads start on core 0 |
| [MCS](mcs.md) | the thread runs on the core of its scheduling context, which is set when the context is configured through that core's `SchedControl` cap (`seL4_SchedControl_ConfigureFlags`); BootInfo carries one `SchedControl` cap per core |

Moving a thread stalls it if it is running on its old core (an IPI),
takes it off that core's queues, releases the old core's FPU if the
thread owned it, updates `tcbAffinity` (`migrateTCB`) and enqueues it on
the new core.

[IPC](ipc.md) between threads on different cores works but is not
fast: the receiver is made runnable on its own core and that core is
sent a reschedule IPI. The [fastpath](ipc.md) only handles the case
where both threads are on the calling core.

### Interrupts

Each device interrupt is delivered to one core. On Arm,
`seL4_IRQControl_GetTriggerCore` chooses the core for a shared
interrupt and names per-core private interrupts; on x86 the I/O APIC
and MSI invocations address the boot core's local APIC (unchecked for
current master). The notification signalled may wake a thread on any
core, at the cost of an IPI. See [Interrupt delivery](irq-handling.md).

### Not verified

None of the [proofs](verification.md) cover SMP: the verified
configurations all have one core, and the concurrency reasoning the big
lock would need does not exist in [l4v](l4v.md). An SMP kernel is
therefore "the verified code plus unverified locking, IPI and per-core
changes", and SMP-only code paths get review and
[testing](sel4test.md) only.

### The multikernel alternative

The direction favoured by the kernel's developers at UNSW Trustworthy
Systems is to stop extending the big-lock kernel and instead run one
*unicore* kernel instance per core, each with its own memory and its
own verified image, cooperating only through user level: shared memory
and interrupts sent from one instance to another. The
`seL4_IRQControl_IssueSGISignal` invocation on Arm, which produces a cap
that raises a software-generated interrupt on a chosen core, is in
upstream master as a building block for this. Tooling to boot and
describe such a system (in the elfloader and Microkit) was still
proposal and prototype work when this page was written (unchecked: the
RFC and pull request state was not looked up; search
[the RFC repository](https://github.com/seL4/rfcs) for "multikernel").

## In seL4

| What | Where |
|---|---|
| The lock | [`include/smp/lock.h`](https://github.com/seL4/seL4/blob/master/include/smp/lock.h), `src/smp/lock.c` |
| Generic IPI machinery | [`src/smp/ipi.c`](https://github.com/seL4/seL4/blob/master/src/smp/ipi.c), `include/smp/ipi.h` |
| Remote operations per architecture | `src/arch/*/smp/ipi.c`, `include/arch/*/arch/smp/ipi.h`, `ipi_inline.h` |
| Per-core state | `include/model/smp.h`, `include/model/statedata.h`, `src/model/smp.c` |
| Starting the other cores | `src/arch/*/kernel/boot.c`, x86 `src/arch/x86/kernel/smp_sys.c` ([bring-up](../concepts/smp-bringup.md)) |

### The lock

`big_kernel_lock` is a **CLH lock** (Craig, Landin and Hagersten): a
queue lock in which each waiting core spins on a flag owned by the core
ahead of it, so the lock is granted in arrival order and each waiter
spins on its own cache line. `clh_lock_acquire(irqPath)` swaps the
core's request node into the queue tail and spins while the
predecessor's state is `CLHState_Pending`; `clh_lock_release` sets its
own to `CLHState_Granted`.

Kernel entry points in `src/arch/*/c_traps.c` take it with
`NODE_LOCK_SYS` (system calls, faults) or `NODE_LOCK_IRQ` (interrupts),
and the exit path releases it (`NODE_UNLOCK_IF_HELD`). The macros
expand to nothing in a unicore build, which is how the verified
configurations stay untouched. The fastpath runs with the lock held.

One subtlety: a core spinning for the lock has interrupts off, yet the
lock holder may need it to act on an IPI. So the spin loop polls a
per-core flag (`clh_is_ipi_pending`) and, if set, handles the remote
call there and then (`handleIPI` inside `clh_lock_acquire`). Likewise
the Arm interrupt entry does not take the lock at all when the
interrupt is the remote-call IPI.

### Per-core state

`NODE_STATE(x)` names a per-core variable; on SMP it is
`ksSMP[core].system.x`, on unicore the plain global `x`. Per-core:
`ksReadyQueues` and their bitmaps, `ksCurThread`, `ksIdleThread`,
`ksSchedulerAction`, `ksCurFPUOwner` and, under MCS, `ksReleaseQueue`,
`ksCurSC`, `ksCurTime`, `ksConsumed`, `ksReprogram`. Each `ksSMP` entry
is padded to a cache line. `NODE_STATE_ON_CORE(x, core)` reaches
another core's copy, legal because the lock is held. Still global:
`intStateIRQTable`, `intStateIRQNode`, the domain schedule
(`ksCurDomain`, `ksDomainTime`), the ASID tables and all objects.

### IPIs

Two interrupt numbers are reserved (state `IRQIPI`):

- `irq_reschedule_ipi`: "look at your ready queues". Sent by
  `doMaskReschedule` when a thread becomes runnable on another core.
  The target just takes an interrupt and reschedules.
- `irq_remote_call_ipi`: "run this function". `doRemoteMaskOp(func,
  args, mask)` stores an `IpiRemoteCall_t` and up to three arguments,
  sends the IPI to the cores in `mask`, and waits (`ipi_wait`) until
  all have run `handleRemoteCall`. `doRemoteOp` is the one-core form.

The remote calls, from the per-architecture `IpiRemoteCall_t`:

| Call | Why |
|---|---|
| `IpiRemoteCall_Stall` (`doRemoteStall`) | make a core stop running its current thread and wait for the lock, before that thread is modified, suspended or deleted (`remoteTCBStall`) |
| `InvalidateTranslationSingle`, `…ASID`, `…All`; x86 `InvalidatePageStructureCacheASID` | TLB shootdown after an unmap: other cores may hold stale translations ([VSpace](vspace.md)) |
| `switchFpuOwner` | save or drop FPU state held lazily in another core's registers ([FPU state](../concepts/fpu-state.md)) |
| Arm `MaskPrivateInterrupt`, `DeactivatePrivateInterrupt` | a per-core interrupt can only be handled on its own core |
| Arm `VCPUInjectInterrupt`; x86 `ClearCurrentVCPU`, `VMCheckBoundNotification` | [virtual CPU](hypervisor.md) state loaded on another core |

## Gotchas

- A patch to generic code must still compile and behave with
  `ENABLE_SMP_SUPPORT`: use `NODE_STATE()` for per-core variables and
  the `SMP_COND_STATEMENT()` / `SMP_TERNARY()` wrappers, never a bare
  `ksCurThread`. The [CI](ci.md) builds SMP configurations; the proofs
  will not catch a mistake here.
- Modifying a thread that may be running elsewhere needs
  `remoteTCBStall` first. Missing it is a race that tests rarely hit.
- Threads do not spread themselves out. A system that never calls
  `SetAffinity` (or, on MCS, uses only core 0's `SchedControl`) runs
  entirely on core 0 with the other cores idle.
- Kernel time on one core delays kernel entry on all others, so a long
  operation (a large revoke, between preemption points) is a latency
  cost everywhere.
- `numNodes` in [BootInfo](bootinfo-and-root-task.md) is the number of
  cores the kernel is using, at most `CONFIG_MAX_NUM_NODES`.
- Cloud virtual CPUs can be descheduled by the host while holding or
  queueing for a strict-order lock, which makes a CLH lock behave badly
  under overcommit (unchecked: a general property of queue locks, not
  measured on seL4).

## See also

- [Multiprocessor bring-up and IPIs](../concepts/smp-bringup.md): how the hardware starts cores and sends IPIs
- [Scheduling](scheduling.md), [MCS kernel](mcs.md): the per-core scheduler and `SchedControl`
- [Interrupt delivery](irq-handling.md): `IRQIPI`, core-tagged interrupts on Arm
- [Local APIC and I/O APIC](../concepts/apic.md), [GICv3 and the ITS](../concepts/gicv3-its.md): what an IPI is on each architecture
- [Kernel design and execution model](kernel-design.md): the non-preemptible, single-stack kernel the lock protects
- [The seL4 proofs](verification.md): which configurations are verified
- [Governance and RFCs](governance.md): where the multikernel direction is decided
- [RISC-V interrupts and timers](../concepts/riscv-interrupts.md): how interrupts reach an S-mode kernel on RISC-V

## References

- [seL4 `include/smp/lock.h`](https://github.com/seL4/seL4/blob/master/include/smp/lock.h):
  the CLH lock, IPI polling while spinning, the `NODE_LOCK_*` macros.
  *Checked 2026-11-14.*
- [seL4 `src/smp/ipi.c`](https://github.com/seL4/seL4/blob/master/src/smp/ipi.c):
  `handleIPI`, `doRemoteMaskOp`, `doMaskReschedule`, `ipi_wait`,
  `ipiStallCoreCallback`. *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/smp/ipi.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/smp/ipi.h)
  and [`include/arch/x86/arch/smp/ipi.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/smp/ipi.h):
  the `IpiRemoteCall_t` lists. *Checked 2026-11-14.*
- [seL4 `include/model/smp.h`](https://github.com/seL4/seL4/blob/master/include/model/smp.h)
  and [`include/model/statedata.h`](https://github.com/seL4/seL4/blob/master/include/model/statedata.h):
  `ksSMP`, which state is per core. *Checked 2026-11-14.*
- [seL4 `src/model/smp.c`](https://github.com/seL4/seL4/blob/master/src/model/smp.c),
  [`src/object/tcb.c`](https://github.com/seL4/seL4/blob/master/src/object/tcb.c),
  [`src/object/schedcontrol.c`](https://github.com/seL4/seL4/blob/master/src/object/schedcontrol.c):
  `migrateTCB`, `remoteTCBStall`, `TCBSetAffinity`, `scCore`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/c_traps.c):
  where the lock is taken. *Checked 2026-11-14.*
- Peters, Danis, Elphinstone and Heiser, "For a Microkernel, a Big Lock
  Is Fine", APSys 2015: the design argument and measurements.
  *Unchecked (cited from memory).*
- [seL4 RFCs](https://github.com/seL4/rfcs): the place to look for the
  multikernel proposals. *Unchecked (not opened today).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
