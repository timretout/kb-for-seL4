# Hypervisor CPUID leaves

> CPUID leaves from `0x40000000` that a hypervisor fills in to identify itself; leaf `0x40000010`, where offered, gives the TSC and local APIC timer rates so a guest need not measure them.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Timers](../INDEX.md#timers) · ← [Timer calibration](timer-calibration.md) · [HPET](hpet.md) →

| At a glance | |
|---|---|
| Kind | CPUID leaves a hypervisor fills in |
| Architecture | x86 |
| Reached through | The `CPUID` instruction, leaves `0x40000000` and up |
| Found through | CPUID leaf 1, ECX bit 31; the highest leaf is in EAX of `0x40000000` |
| Key numbers | Leaf `0x40000010`: EAX is the TSC rate in kHz, EBX the local APIC timer's rate in kHz |
| seL4 use | None upstream: seL4 measures instead (see [timer calibration](timer-calibration.md)) |
| On the clouds | Every EC2 Nitro type tried offers `0x40000010`, with 1 000 000 kHz in EBX |

## What it is

`CPUID` is the x86 instruction that reports what the processor supports.
A hypervisor intercepts it, so it can change what a guest sees. Two
conventions let a guest find out it is a guest:

- CPUID leaf 1, ECX bit 31, the **hypervisor present** bit, is set by
  hypervisors and clear on real hardware: Intel's manual says its
  processors always return 0 there and leaves the bit to software.
- Leaves `0x40000000` and up are reserved for hypervisors. Leaf
  `0x40000000` returns the highest hypervisor leaf in EAX and a vendor
  signature in EBX, ECX and EDX: `KVMKVMKVM` for KVM, and others for
  VMware, Hyper-V and Xen.

**The timing leaf, `0x40000010`.** A VMware convention that other
hypervisors offer too (QEMU's option for it under KVM is
`vmware-cpuid-freq`): EAX is the TSC rate in kHz and EBX
the local APIC timer's rate in kHz. A guest checks that the maximum leaf
reported by `0x40000000` is at least `0x40000010` before reading it, and
treats a zero as "not offered". It is not part of KVM's documented
leaves, so its presence depends on the host, not on KVM.

![Leaf 0x40000000 returns the highest hypervisor leaf in EAX and a vendor signature in EBX, ECX and EDX; leaf 0x40000010 returns the TSC rate in kHz in EAX and the local APIC timer's rate in kHz in EBX.](../images/hypervisor-cpuid-leaves-registers.svg)

*What the two leaves return. EAX of the first leaf (outlined in red) says
whether the timing leaf is there to read.*

## In seL4

Upstream seL4 does not read it: it measures (see
[timer calibration](timer-calibration.md)). Reading the leaf when present
would replace both measurements, and is how FreeBSD finds the TSC rate in
VMs. Inside a VM it must come before `IA32_PLATFORM_INFO`, which can
describe the host.

## Gotchas

- **Seen on:** every EC2 Nitro type tried offers `0x40000010` (TSC kHz in
  EAX, 1 000 000 kHz for the APIC timer in EBX).
- Leaf `0x40000000`'s EAX is the *maximum* leaf; old KVM hosts set it to
  0, meaning "only `0x40000001`".
- The signature tells you who claims to be the hypervisor, not which
  leaves exist: Xen can present Hyper-V's leaves too, and FreeBSD reads
  the generic leaf before Xen's own for that reason.

## See also

- [TSC](tsc.md) and [local APIC timer](lapic-timer.md): the rates it gives
- [Timer calibration](timer-calibration.md): what it lets a guest skip
- [PIT](pit.md): the reference it replaces
- [Cloud virtual machines](cloud-vms.md): what hardware Amazon EC2, Google Compute Engine and Azure present to a guest kernel, and how that differs...
- [CPUID and MSRs](cpuid-and-msrs.md): how x86 software discovers what the processor can do
- [EC2 instance types](ec2-instance-types.md): how to read an EC2 instance type name
- [x86 virtualisation (VT-x)](x86-virtualisation.md): intel's hardware support for running guest operating systems

## References

- [Linux KVM documentation, "KVM CPUID bits"](https://docs.kernel.org/virt/kvm/x86/cpuid.html):
  leaf `0x40000000`, its signature and the meaning of EAX.
  *Checked 2026-11-14.*
- [FreeBSD `sys/x86/x86/tsc.c`](https://github.com/freebsd/freebsd-src/blob/main/sys/x86/x86/tsc.c),
  `tsc_freq_cpuid_vm()`: reads EAX of `0x40000010` as kHz on any
  hypervisor whose maximum leaf reaches it. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual, combined volumes](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
  ([PDF](https://cdrdv2.intel.com/v1/dl/getContent/671200), September 2026 edition), volume 1, chapter 21, sections
  21.1.3 and 21.3: leaf 1 ECX bit 31 is "Not Used", always 0 on Intel
  processors and allocated to software emulation, as is the range
  `0x40000000` to `0x4FFFFFFF`. *Checked 2026-11-14.*
- [Linux `arch/x86/include/asm/cpufeatures.h`](https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/cpufeatures.h):
  `X86_FEATURE_HYPERVISOR`, leaf 1 ECX bit 31, "Running on a
  hypervisor". *Checked 2026-11-14.*
- [QEMU `target/i386/kvm/kvm.c`](https://github.com/qemu/qemu/blob/master/target/i386/kvm/kvm.c)
  and the `vmware-cpuid-freq` property in
  [`target/i386/cpu.c`](https://github.com/qemu/qemu/blob/master/target/i386/cpu.c):
  leaf `0x40000010` filled with the TSC rate in kHz in EAX and the APIC
  bus rate in kHz in EBX, and the maximum leaf raised to match.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
