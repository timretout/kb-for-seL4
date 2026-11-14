# Local APIC timer and TSC deadline mode

> The per-core x86 timer built into each local APIC, programmed either as a countdown at an unknown bus-derived rate or, in TSC deadline mode, as an absolute TSC value.

## What it is

Each x86 core has a local APIC (Advanced Programmable Interrupt
Controller), which receives interrupts for that core and sends
inter-processor interrupts. It also has a timer, configured through the
timer entry of the local vector table (LVT) and a divide register. It has
three modes:

| Mode | How it works |
|---|---|
| One-shot | Write a count; it counts down at the timer's rate and interrupts at zero |
| Periodic | The same, reloading the count each time |
| TSC deadline | Write an absolute [TSC](tsc.md) value to the `IA32_TSC_DEADLINE` MSR; it interrupts when the TSC reaches it |

In the first two the rate is the bus or core crystal clock divided down,
and nothing architectural tells software what it is, so it has to be
measured (see [timer calibration](timer-calibration.md)). TSC deadline
mode avoids that: deadlines are in TSC ticks, so only the TSC's rate
matters. CPUID leaf 1, ECX bit 24, says whether the CPU has it.

The local APIC is reached through memory-mapped registers at
`0xfee00000` (xAPIC mode) or through MSRs (x2APIC mode).

## In seL4

[`src/arch/x86/kernel/apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c),
`apic_init()`:

- With TSC deadline mode, `x86KSapicRatio` is set to 0, and 0 means "use
  TSC deadline mode" from then on.
- Without it, `apic_measure_freq()` times the APIC timer's countdown
  over one 50 ms [PIT](pit.md) period, and the kernel keeps
  `x86KSapicRatio`, the TSC rate divided by the APIC timer rate, to turn
  TSC-tick deadlines into APIC counts.

The [MCS](../sel4/mcs.md) kernel sets a one-shot deadline for every
scheduling decision, so this ratio's accuracy is the accuracy of every
budget and period. The non-MCS kernel uses a periodic tick.

## Gotchas

- **The ratio is an integer upstream.** On EC2's AMD Nitro types the APIC
  timer runs at 1 GHz, so a 2.65 GHz TSC gives a ratio of 2 rather than
  2.65, and every MCS budget lasts 32.5% too long. On Compute Engine's N1
  the true ratio is 2.0, and a measurement a hair over 1 GHz truncates it
  to 1, doubling every budget.
- **A ratio of 0 is ambiguous.** If a bad TSC measurement makes the
  ratio 0 on a CPU without TSC deadline mode, the kernel takes it for TSC
  deadline mode and the timer never fires: the system hangs at its first
  deadline.
- **Which clouds have TSC deadline mode.** EC2's Intel Nitro types do,
  its AMD ones (t3a, m6a, m7a) do not, and Compute Engine's N1 does not.
- QEMU's `-cpu ...,-tsc-deadline` removes the feature, to test the APIC
  path locally.

## See also

- [TSC](tsc.md): the clock deadlines are expressed in
- [Timer calibration](timer-calibration.md): how the APIC timer's rate is measured
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): EBX of `0x40000010` gives the APIC timer's rate
- [MCS](../sel4/mcs.md): the kernel configuration that depends on it

## References

- [seL4 `apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c):
  `apic_init()`, `apic_measure_freq()` and the use of `x86KSapicRatio`.
  *Checked 2026-11-14.*
- [Linux KVM documentation, "Timekeeping Virtualization for X86-Based Architectures"](https://docs.kernel.org/virt/kvm/x86/timekeeping.html),
  section 2.3 "APIC": a short overview and why it is awkward to
  virtualise. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html),
  volume 3, the APIC chapter's section on the APIC timer, including TSC
  deadline mode. *Unchecked (intel.com refuses scripted fetches).*
- [OSDev wiki, "APIC Timer"](https://wiki.osdev.org/APIC_Timer): a
  practical guide, including calibrating it against the PIT. *Unchecked
  (the site refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
