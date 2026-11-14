# MCS (mixed-criticality system) kernel

> A seL4 build option that replaces the periodic tick with scheduling contexts (a budget of CPU time per period) and one-shot timer deadlines; Microkit uses it, so its timer must be accurate.

## What it is

The classic seL4 kernel schedules threads by priority with a periodic
tick and fixed time slices. The MCS configuration (`KernelIsMCS`, or
`-DMCS=TRUE` in sel4test builds) adds temporal isolation: a thread can be
given a guaranteed share of CPU time and prevented from taking more.

- A **scheduling context** is a kernel object holding a **budget** and a
  **period**: the thread may run for at most budget microseconds out of
  every period. Budget equal to period is a round-robin thread with 100%
  of a core.
- Scheduling contexts are configured through the `seL4_SchedControl`
  capability, one per core.
- A **passive server** has no scheduling context of its own and runs on
  its caller's when called over IPC.
- **Timeout faults** report a thread that exhausts its budget.

Instead of a periodic tick, the kernel programs a one-shot timer for the
next event (budget exhaustion or a period's replenishment), in timer
ticks. Every budget and period is only as accurate as the kernel's idea
of the timer's rate.

## In seL4

- On x86 the kernel sets deadlines in [TSC](../concepts/tsc.md) ticks,
  through TSC deadline mode or the
  [local APIC timer](../concepts/lapic-timer.md) at a measured ratio. On
  Arm, through the [generic timer](../concepts/arm-generic-timer.md).
- Microkit and sDDF use the MCS kernel.
- sel4test's `SCHED*` tests check budgets and periods against user-level
  timers.

## Gotchas

- **Clock errors become scheduling errors.** On x86 an integer TSC to
  APIC ratio made budgets last 32.5% too long on EC2's AMD types and
  twice as long on most boots of Compute Engine's N1. The non-MCS kernel,
  with only a periodic tick, hides such errors.
- **Hangs can look like scheduler bugs.** A timer that never fires stops
  everything at the first deadline, which in Microkit is just after
  "Microkit Monitor started!".

## See also

- [Local APIC timer](../concepts/lapic-timer.md) and [TSC](../concepts/tsc.md): the x86 timer path
- [Timer calibration](../concepts/timer-calibration.md): where the rates come from

## References

- [seL4 tutorial, "MCS"](https://docs.sel4.systems/Tutorials/mcs.html):
  scheduling contexts, budgets and periods, passive servers.
  *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  the chapter on threads and scheduling contexts. *Unchecked (PDF
  resolves; chapter not opened).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
