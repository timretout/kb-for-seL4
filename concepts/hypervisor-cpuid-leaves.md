# Hypervisor CPUID leaves

> CPUID leaves from `0x40000000` that a hypervisor fills in to identify itself; leaf `0x40000010`, where offered, gives the TSC and local APIC timer rates so a guest need not measure them.

## What it is

`CPUID` is the x86 instruction that reports what the processor supports.
A hypervisor intercepts it, so it can change what a guest sees. Two
conventions let a guest find out it is a guest:

- CPUID leaf 1, ECX bit 31, the **hypervisor present** bit, is set by
  hypervisors and clear on real hardware (unchecked).
- Leaves `0x40000000` and up are reserved for hypervisors. Leaf
  `0x40000000` returns the highest hypervisor leaf in EAX and a vendor
  signature in EBX, ECX and EDX: `KVMKVMKVM` for KVM, and others for
  VMware, Hyper-V and Xen.

**The timing leaf, `0x40000010`.** Defined by VMware and offered by other
hypervisors (unchecked: its history): EAX is the TSC rate in kHz and EBX
the local APIC timer's rate in kHz. A guest checks that the maximum leaf
reported by `0x40000000` is at least `0x40000010` before reading it, and
treats a zero as "not offered". It is not part of KVM's documented
leaves, so its presence depends on the host, not on KVM.

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

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
