# TSC (time stamp counter)

> A 64-bit per-core x86 counter read with `RDTSC`; cheap to read and, on modern CPUs, constant-rate, but nothing architectural tells the kernel its frequency.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Timers](../INDEX.md#timers) · ← [PIT](pit.md) · [Local APIC timer and TSC deadline mode](lapic-timer.md) →

| At a glance | |
|---|---|
| Kind | Per-core 64-bit counter |
| Architecture | x86 |
| Reached through | The `RDTSC` or `RDTSCP` instruction, or an MSR |
| Found through | Invariant TSC: CPUID leaf `0x80000007`, EDX bit 8 (unchecked) |
| seL4 code | `tsc_init()` in [`src/plat/pc99/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c) |
| seL4 config | `CONFIG_PC99_TSC_FREQUENCY` |
| seL4 use | Rate found at boot, in whole MHz, in `x86KStscMhz`; the [MCS](../sel4/mcs.md) kernel expresses every deadline in TSC ticks |
| On the clouds | Measurements in VMs are noisy: a t3a.micro once measured 1% high |

## What it is

Every x86 core has a 64-bit counter, the TSC, read with `RDTSC` or
`RDTSCP` (or as an MSR). It is the cheapest clock on the machine: one
instruction, no device access, no trap even in most VMs.

On early CPUs it counted core clock cycles, so it sped up and slowed with
power management. Modern CPUs have an **invariant TSC** (advertised in
CPUID leaf `0x80000007`, EDX bit 8 (unchecked)) that ticks at a constant
rate whatever the core's speed or sleep state, which makes it a proper
clock.

What it does not do is say how fast it ticks. Ways to find out, best
first:

1. CPUID leaf `0x15` (crystal ratio) on recent Intel parts, where filled
   in.
2. A model-specific register such as `IA32_PLATFORM_INFO`, which gives a
   ratio to a known bus clock on many Intel CPUs. Inside a VM this
   reports the host's value.
3. A hypervisor's timing leaf, `0x40000010` (see
   [hypervisor CPUID leaves](hypervisor-cpuid-leaves.md)).
4. Measuring it against a clock of known rate: the [PIT](pit.md) or
   [HPET](hpet.md). See [timer calibration](timer-calibration.md).

Hypervisors can offset and, on newer hardware, scale the guest's TSC, so a
guest sees a constant rate even after live migration to a different host.

## In seL4

`tsc_init()` in
[`src/plat/pc99/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c)
finds the TSC rate at boot, in whole MHz, into `x86KStscMhz`:

1. `CONFIG_PC99_TSC_FREQUENCY`, if set at build time, wins.
2. Otherwise `IA32_PLATFORM_INFO` on CPUs known to have it.
3. Otherwise `measure_tsc_khz()`, timing one 50 ms PIT period.

The MCS kernel (see [MCS](../sel4/mcs.md)) expresses every deadline in TSC
ticks, so an error here becomes an error in every budget and timeout. The
non-MCS kernel needs the rate only to set its periodic tick.

## Gotchas

- **Whole MHz.** seL4 stores the rate in MHz, so a TSC measured at 2999.994 MHz is
  stored as 2999 MHz (`tsc_khz / 1000u`, which truncates), an error of
  0.03%.
- **Measurements in VMs are noisy.** A vCPU descheduled during the 50 ms
  measurement makes the TSC look fast: a t3a.micro once measured 1% high.
  A wrong PIT wait can make it look slow by a factor of a thousand.
- **The host's MSR.** Inside a VM, `IA32_PLATFORM_INFO` can describe the
  host's CPU rather than the guest's TSC. Prefer the hypervisor's leaf
  when there is one.

## See also

- [Timer calibration](timer-calibration.md): how the kernel measures it
- [Local APIC timer](lapic-timer.md): TSC deadline mode programs the timer in TSC ticks
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): the rate without measuring
- [PIT](pit.md): the reference clock
- [CPUID and MSRs](cpuid-and-msrs.md): how x86 software discovers what the processor can do
- [seL4_libs and util_libs](../sel4/sel4-libs.md): the classic C libraries for building dynamic systems on seL4

## References

- [Linux KVM documentation, "Timekeeping Virtualization for X86-Based Architectures"](https://docs.kernel.org/virt/kvm/x86/timekeeping.html),
  section 3 "TSC Hardware" and its subsections on synchronisation,
  power states and virtualisation. *Checked 2026-11-14.*
- [seL4 `hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c):
  `tsc_init()` and `measure_tsc_khz()`. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html),
  volume 3, the chapter on time-stamp counters, and volume 2, `CPUID`
  leaves `0x15` and `0x80000007`. *Unchecked (intel.com refuses scripted
  fetches; chapter numbers not given for that reason).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
