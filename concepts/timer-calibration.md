# Timer calibration

> Finding how fast a clock runs by timing it against another whose rate is known; on x86 seL4 does this at boot for the TSC and the local APIC timer, using the PIT.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Timers](../INDEX.md#timers) · ← [Local APIC timer and TSC deadline mode](lapic-timer.md) · [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md) →

| At a glance | |
|---|---|
| Kind | Boot-time measurement of one clock against another |
| Architecture | x86 only in seL4 |
| Key numbers | One 50 ms [PIT](pit.md) period per measurement; about 100 ms per calibration |
| seL4 code | `measure_tsc_khz()` in [`hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c), `apic_measure_freq()` in [`apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c), `pit_wait_wraparound()` in [`pit.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/pit.c) |
| seL4 config | `CONFIG_PC99_TSC_FREQUENCY` skips the TSC measurement |
| seL4 use | Times the [TSC](tsc.md) and the [local APIC timer](lapic-timer.md) against the PIT |
| On the clouds | Compute Engine's N1 PIT count can rise just after a reload |

## What it is

A kernel that sets timers needs each timer's rate. When the hardware does
not report a rate, the kernel measures it: read clock A, wait for a known
interval on reference clock B, read A again. The rate of A is the
difference divided by the interval.

The answer can only be as good as three things:

- **The reference's rate.** The [PIT](pit.md) is used because its
  1 193 182 Hz is fixed by convention.
- **Detecting the interval's ends.** The PIT gives no interrupt-free
  "now"; the kernel spots the end of a period by watching the count jump
  back up at the reload. Anything else that looks like a rise ends the
  wait early.
- **Not being interrupted.** In a VM the vCPU can be descheduled during
  the measurement; the clock being measured keeps running and the result
  comes out high.

Lining up first matters: a measurement waits for one wraparound
**untimed**, to start exactly at the beginning of a period, then times the
next whole one.

![The PIT count is a sawtooth; the measurement waits untimed for the first reload, reads clock A there, and reads it again at the next reload, one whole period later.](../images/timer-calibration-measure.svg)

*One measurement against the [PIT](pit.md). The first wait only lines the
measurement up with the start of a period; the two reads of clock A are a
whole period apart.*

Retrying until two measurements agree looks robust but is not on its own:
if the code between measurements (a warning printed to a serial port, say)
eats into the next period consistently, consecutive measurements agree
and are both wrong.

The better fix, where available, is not to measure: take the rate from
the hardware or hypervisor (see [TSC](tsc.md) and
[hypervisor CPUID leaves](hypervisor-cpuid-leaves.md)).

## In seL4

x86 only. Arm's generic timer reports its own rate (see
[Arm generic timer](arm-generic-timer.md)).

- `measure_tsc_khz()` in
  [`hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c)
  times the [TSC](tsc.md) over one 50 ms PIT period, retrying if the
  result is implausibly high.
- `apic_measure_freq()` in
  [`apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c)
  times the [local APIC timer](lapic-timer.md) the same way, when the CPU
  has no TSC deadline mode.
- Both rely on `pit_wait_wraparound()` in
  [`pit.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/pit.c).
- `CONFIG_PC99_TSC_FREQUENCY` skips the TSC measurement for a known
  machine. seL4 issue [#306](https://github.com/seL4/seL4/issues/306)
  records that each calibration costs about 100 ms and runs more than once
  per boot.

util_libs measures the TSC again at user level for its ltimer, in
`tsc_calculate_frequency_pit()`.

## Gotchas

- **A failed calibration rarely fails loudly.** A TSC measured at 1 MHz
  instead of 2000 MHz made the APIC ratio 0, which the kernel reads as
  "TSC deadline mode", and the machine hung at its first deadline. Check
  results for plausibility and fail with a message.
- **Integer arithmetic.** Rates in whole MHz and an integer ratio throw
  away up to half the precision when the ratio is near 1 or 2.
- **The cloud's PIT may be quirky.** Compute Engine's N1 PIT count can
  rise just after a reload; see [PIT](pit.md).

## See also

- [Timers: a map](timers.md): every timer on each architecture in one diagram, and how this one fits in
- [PIT](pit.md): the reference
- [TSC](tsc.md) and [local APIC timer](lapic-timer.md): what is measured
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): how to avoid measuring
- [Boot code](../sel4/boot-code.md): why this code is outside the proofs
- [CPUID and MSRs](cpuid-and-msrs.md): how x86 software discovers what the processor can do
- [EC2 instance types](ec2-instance-types.md): how to read an EC2 instance type name
- [QEMU](qemu.md): QEMU emulates whole machines
- [MCS kernel](../sel4/mcs.md): A seL4 build option that replaces the periodic tick with scheduling contexts
- [seL4_libs and util_libs](../sel4/sel4-libs.md): the classic C libraries for building dynamic systems on seL4
- [sel4test and sel4bench](../sel4/sel4test.md): sel4test is the kernel's functional test suite, a root task that runs each test in a fresh process and...

## References

- [seL4 issue #306](https://github.com/seL4/seL4/issues/306): measuring
  the TSC against the PIT takes about 100 ms and `tsc_init()` can run
  twice per boot; proposes a static frequency for known machines.
  *Checked 2026-11-14.*
- [Linux KVM documentation, "Timekeeping Virtualization for X86-Based Architectures"](https://docs.kernel.org/virt/kvm/x86/timekeeping.html):
  why timekeeping in a guest is hard, including lost time during
  measurement. *Checked 2026-11-14.*
- [FreeBSD `sys/x86/x86/tsc.c`](https://github.com/freebsd/freebsd-src/blob/main/sys/x86/x86/tsc.c):
  another kernel's order of preference (hypervisor leaf, CPUID `0x15`,
  then measurement). *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
