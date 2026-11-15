# Timers: a map

> A map of every clock and timer seL4 work meets, by architecture: which device counts time, which raises the interrupt, where each one's rate comes from, and whether the kernel or user level uses it.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Timers](../INDEX.md#timers) · ← [GICv3 and the ITS](gicv3-its.md) · [PIT](pit.md) →

| At a glance | |
|---|---|
| Kind | Survey of the timer pages |
| x86 | [PIT](pit.md), [TSC](tsc.md), [local APIC timer](lapic-timer.md), [HPET](hpet.md), [hypervisor CPUID leaves](hypervisor-cpuid-leaves.md), [timer calibration](timer-calibration.md) |
| Arm | [Arm generic timer](arm-generic-timer.md) |
| RISC-V | [RISC-V interrupts and timers](riscv-interrupts.md) |
| seL4 kernel use | x86: TSC and local APIC timer. Arm: generic timer. RISC-V: `rdtime` and `sbi_set_timer` |

## What it is

A kernel wants two things from timer hardware, and they are often two
different devices:

- a **counter**: a number that rises at a steady rate, read to learn
  what time it is now;
- a **comparator**: something that raises an interrupt when the counter
  reaches a chosen value (or when a countdown reaches zero), so the
  kernel gets control back at a deadline.

To use either it needs a third thing, the **rate**: how many counts make
a second. Where the rate comes from is the main difference between the
architectures, and the source of most of the timer bugs met on the
clouds. Each device below has its own page; this one shows how they fit
together.

### x86

x86 has several devices, of different ages, and no one of them does
everything:

| Device | Counter | Interrupt | One per | Rate comes from |
|---|---|---|---|---|
| [PIT](pit.md) | 16 bits, counts down | [ISA](isa.md) IRQ 0 | machine | Convention: 1 193 182 Hz |
| [HPET](hpet.md) | Main counter, 32 or 64 bits | From each comparator | machine | Its own capabilities register |
| [TSC](tsc.md) | 64 bits, read with `RDTSC` | None of its own | core | Not reported: a CPUID leaf or MSR on some CPUs, a hypervisor leaf, or measurement |
| [Local APIC timer](lapic-timer.md) | Countdown | Yes, to its own core | core | Not reported: measurement. In TSC deadline mode it compares against the TSC, so only the TSC's rate matters |

The two per-core devices are the ones a kernel wants (the TSC is the
cheapest clock on the machine, and the local APIC timer interrupts the
core it belongs to), and they are the two whose rate is not reported. So
their rates are found from something else:

- **Measurement.** seL4 times both against the PIT at boot, one 50 ms
  PIT period each: see [timer calibration](timer-calibration.md).
- **Being told.** A hypervisor may offer CPUID leaf `0x40000010`, which
  gives the TSC's and the local APIC timer's rates in kHz: see
  [hypervisor CPUID leaves](hypervisor-cpuid-leaves.md). Upstream seL4
  does not read it.

![On x86 the PIT, a hypervisor CPUID leaf and the HPET have known rates; the per-core local APIC timer and TSC do not, so seL4 times both against the PIT at boot; the kernel takes its interrupt from the local APIC timer and the time from the TSC, and user-level drivers use the TSC, the HPET and the PIT.](../images/timers-x86.svg)

*The top row can say how fast it runs; the per-core pair cannot, and
gets its rates from the top row. The kernel keeps the per-core pair for
itself, which leaves the HPET and the PIT to user level.*

The PC's real-time clock (RTC), another [ISA](isa.md) device, keeps the
calendar date. It is not a timer in this page's sense and has no page of
its own.

### Arm

Arm has one architectural design, the
[generic timer](arm-generic-timer.md), which does all three jobs:

- one **system counter** for the machine, 64 bits, at a constant rate
  shared by all cores;
- per-core **timers** that compare against it and each raise a private
  peripheral interrupt (PPI) at the [GIC](gicv3-its.md);
- the **rate** in a register, `CNTFRQ_EL0`, which firmware sets at boot.

Nothing needs measuring. The trap is different: seL4 does not read
`CNTFRQ_EL0` to learn the rate. Each platform's `config.cmake` fixes
`TIMER_FREQUENCY` at build time, and a debug build of the kernel only
warns if a non-zero `CNTFRQ_EL0` disagrees. User-level code generally
reads `CNTFRQ_EL0` itself.

![On Arm, firmware sets the rate in CNTFRQ_EL0; one system counter feeds per-core timers, which interrupt the seL4 kernel with a PPI through the GIC; the kernel reads the count but takes its rate from TIMER_FREQUENCY, fixed at build time, while user level reads the rate from CNTFRQ_EL0.](../images/timers-arm.svg)

*One device does everything. The kernel and user level get the rate
from two different places, which agree only if the kernel was built for
this machine.*

Arm boards also carry SoC-specific timers, which user-level drivers use
because the kernel has the generic timer: sDDF's timer drivers (see
[sDDF](../sel4/sddf.md)) include `imx`, `meson` and `bcm2835` as well as
`arm` for the generic timer.

### RISC-V

RISC-V sits between the two (see
[RISC-V interrupts and timers](riscv-interrupts.md)). There is one
free-running 64-bit counter for the platform, `mtime`, which an S-mode
kernel reads itself with the `rdtime` instruction. The compare register,
`mtimecmp`, one per hart (RISC-V's word for a hardware thread), belongs
to M-mode firmware, so the kernel cannot set its own deadline: it makes
the SBI call `sbi_set_timer(t)`, firmware programs `mtimecmp`, takes the
machine timer interrupt when it fires, and sets the `STIP` bit to
interrupt the kernel. The Sstc extension adds a compare register the
kernel can write itself, `stimecmp`; upstream seL4 does not support it.

The rate is not discoverable from the hardware: it is the
`timebase-frequency` property in the [device tree](device-tree.md). As
on Arm, seL4 does not read it at boot: the rate is `TIMER_FREQUENCY` in
the platform's `config.cmake`, fixed at build time.

![On RISC-V the kernel reads the platform counter mtime with rdtime; the compare register mtimecmp belongs to M-mode firmware, so the kernel calls sbi_set_timer, firmware programs mtimecmp, takes the machine timer interrupt and sets STIP for the kernel; the kernel's rate is TIMER_FREQUENCY, fixed at build time.](../images/timers-riscv.svg)

*Reading the time is one instruction, but every deadline is a round
trip through firmware.*

### Side by side

| | x86 | Arm | RISC-V |
|---|---|---|---|
| Counter | [TSC](tsc.md) | System counter, `CNTPCT_EL0` or `CNTVCT_EL0` | `mtime`, read with `rdtime` |
| Interrupt | [Local APIC timer](lapic-timer.md) | Per-core timer, a PPI | `sbi_set_timer`, or `stimecmp` with Sstc |
| Rate | Measured against the [PIT](pit.md), or given by a CPUID leaf or MSR | `CNTFRQ_EL0` | `timebase-frequency` in the device tree |
| seL4 gets the rate | At boot (or `CONFIG_PC99_TSC_FREQUENCY`) | At build time, `TIMER_FREQUENCY` | At build time, `TIMER_FREQUENCY` |

## In seL4

**The kernel** needs one counter and one interrupt per core. On
[MCS](../sel4/mcs.md) its whole interface to the timer is two functions,
`getCurrentTime()` and `setDeadline()`; without MCS it takes a periodic
tick instead (see [scheduling](../sel4/scheduling.md)).

| | `getCurrentTime()` | `setDeadline()` | Source |
|---|---|---|---|
| x86 | Reads the TSC | Writes the TSC-deadline MSR, or the local APIC timer's count when `x86KSapicRatio` is non-zero | [`include/arch/x86/arch/machine/timer.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine/timer.h) |
| Arm | Reads the generic timer's count | Writes its compare value | [`include/drivers/timer/arm_generic.h`](https://github.com/seL4/seL4/blob/master/include/drivers/timer/arm_generic.h) |
| RISC-V | `rdtime` | `sbi_set_timer` | [`include/arch/riscv/arch/machine/timer.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/timer.h) |

On x86 the kernel also touches the PIT, at boot only, to measure the
other two (`tsc_init()` and `apic_init()`). It never uses the HPET.

**User level** gets no timer from the kernel, and must not share a
device with it, so it drives whatever the kernel left alone:

- util_libs' `ltimer` (see
  [seL4_libs and util_libs](../sel4/sel4-libs.md)): on x86 the HPET if
  there is a usable one, otherwise the PIT for timeouts and the TSC for
  the time, with the TSC's rate measured again against the PIT.
- sDDF's timer class (see [sDDF](../sel4/sddf.md)): on x86 the
  `tsc_hpet` driver reads the time from the TSC when it knows the TSC's
  rate and takes its interrupts from the HPET; on Arm a driver for the
  generic timer or for an SoC timer.

## Gotchas

Each device's page has its own; these are the ones that come from how
the devices fit together.

- **A wrong rate is silent.** On every architecture the kernel can run
  with the wrong idea of the rate and nothing fails loudly: on x86 from
  a bad measurement, on Arm and RISC-V from a build-time constant that
  does not match the machine. Every MCS budget is then wrong by the
  same factor.
- **The kernel and user level can disagree.** They find the rate
  separately (on x86 two separate calibrations, on Arm
  `TIMER_FREQUENCY` against `CNTFRQ_EL0`), so tests that compare the
  two notions of time are the ones that fail.
- **On x86 the fallback chain ends at the PIT.** Without a usable HPET
  (Compute Engine's x86 types have none, EC2's Nitro types a 32-bit
  one) user level falls back to the PIT, and without TSC deadline mode
  or a rate from elsewhere the kernel calibrates against it too. An
  emulated PIT that misbehaves then breaks both.

## See also

- [PIT](pit.md): x86's reference clock, with a rate fixed by convention
- [TSC](tsc.md): x86's per-core counter
- [Local APIC timer and TSC deadline mode](lapic-timer.md): x86's per-core interrupt source
- [Timer calibration](timer-calibration.md): measuring one clock against another
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): the rates without measuring, in a VM
- [HPET](hpet.md): x86's memory-mapped timer, left to user level
- [Arm generic timer](arm-generic-timer.md): Arm's counter, timers and rate register
- [RISC-V interrupts and timers](riscv-interrupts.md): `rdtime`, the SBI timer call and Sstc
- [MCS kernel](../sel4/mcs.md): why the kernel's timer must be accurate
- [Scheduling](../sel4/scheduling.md): the periodic tick of the non-MCS kernel
- [seL4_libs and util_libs](../sel4/sel4-libs.md): the `ltimer` and its x86 choice between HPET and PIT
- [sDDF](../sel4/sddf.md): its timer drivers
- [Interrupts: a map](interrupts.md): every interrupt controller on x86, Arm and RISC-V side by side, and how this one fits in

## References

- [`include/arch/x86/arch/machine/timer.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine/timer.h):
  `getCurrentTime()` reads the TSC; `setDeadline()` writes
  `IA32_TSC_DEADLINE_MSR` or the APIC timer count. *Checked 2026-11-15.*
- [`src/arch/x86/kernel/apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c)
  and [`src/plat/pc99/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c):
  `apic_measure_freq()` and `measure_tsc_khz()` wait on the PIT.
  *Checked 2026-11-15.*
- [`include/drivers/timer/arm_generic.h`](https://github.com/seL4/seL4/blob/master/include/drivers/timer/arm_generic.h)
  and [`src/drivers/timer/generic_timer.c`](https://github.com/seL4/seL4/blob/master/src/drivers/timer/generic_timer.c):
  the count and compare accessors, and the `CNTFRQ` warning against
  `TIMER_CLOCK_HZ`. *Checked 2026-11-15.*
- [`include/arch/riscv/arch/machine/timer.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/timer.h):
  `riscv_read_time()` and `sbi_set_timer()`. *Checked 2026-11-15.*
- [`libplatsupport/src/plat/pc99/ltimer.c`](https://github.com/seL4/util_libs/blob/master/libplatsupport/src/plat/pc99/ltimer.c):
  the HPET-else-PIT choice and `tsc_calculate_frequency_pit`.
  *Checked 2026-11-15.*
- [`drivers/timer/tsc_hpet/timer.c`](https://github.com/au-ts/sddf/blob/main/drivers/timer/tsc_hpet/timer.c):
  "using TSC as clocksource, HPET as clockevent", and the HPET alone
  when the TSC's rate is unknown. *Checked 2026-11-15.*
- The device pages listed under See also carry the references for each
  device's own facts (datasheets, architecture manuals), which this page
  restates. *Unchecked here: see each page's marks.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
