# Arm generic timer

> The architectural timer of every Armv8 core: a system counter whose rate is in `CNTFRQ_EL0`, and per-core comparators that raise PPIs; its rate varies by machine, which seL4 platforms have fixed at build time.

## What it is

Armv8 defines one **system counter**, a 64-bit count rising at a constant
rate shared by all cores, and per-core **timers** that compare against it
and raise an interrupt. Software reads the count from `CNTPCT_EL0` (or
`CNTVCT_EL0`, minus a hypervisor's offset) and the rate from
`CNTFRQ_EL0`, which firmware sets at boot.

Each core has several timers (physical, virtual, hypervisor, secure),
each a private peripheral interrupt (PPI) at the [GIC](gicv3-its.md). The
usual PPIs are 30 (non-secure physical), 27 (virtual), 26 (hypervisor) and
29 (secure physical).

Unlike x86, no calibration is needed: `CNTFRQ_EL0` gives the rate. From
Armv8.6 the rate is fixed at 1 GHz (unchecked); older cores use whatever
the system designer chose.

## In seL4

The kernel's Arm timer driver uses the generic timer. Each platform's
`config.cmake` sets `TIMER_FREQUENCY` at build time, and the kernel warns
at boot if `CNTFRQ_EL0` disagrees (`gpt_cntfrq ... expected ...`)
(unchecked: file and message location in the source). User-level code
generally reads `CNTFRQ_EL0` itself.

## Gotchas

- **The rate varies between machines of one cloud.** Compute Engine's
  C4A and N4A (Axion) run at 1000 MHz, T2A (Ampere Altra) at 25 MHz.
  `qemu-arm-virt` assumes 62.5 MHz, so a kernel built for it ticks 16
  times too fast on C4A and 2.5 times too slow on T2A.
- **Only some tests notice.** User level reads `CNTFRQ_EL0` and is right,
  so only tests comparing the kernel's idea of time with user level's
  fail (sel4test's SCHED0021).
- Linux's reported rate is rounded; read `CNTFRQ_EL0` for the exact
  value.

## See also

- [GICv3 and the ITS](gicv3-its.md): where the timer's PPIs go
- [Timer calibration](timer-calibration.md): what x86 has to do instead

## References

- [Arm, "Learn the architecture: Generic Timer"](https://developer.arm.com/documentation/102379/latest/):
  the counter, the timers and their registers. *Unchecked
  (developer.arm.com refuses scripted fetches).*
- Arm Architecture Reference Manual for A-profile (DDI 0487), chapter
  "The Generic Timer in AArch64 state". *Unchecked.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
