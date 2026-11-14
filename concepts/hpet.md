# HPET (High Precision Event Timer)

> A memory-mapped x86 timer, found through an ACPI table, with one main counter and several comparators; meant to replace the PIT and RTC, absent or only 32 bits wide on the clouds.

## What it is

Intel and Microsoft specified the HPET in the early 2000s to replace the
[PIT](pit.md) and the RTC's periodic interrupt. It is one block of
memory-mapped registers per system:

- a **main counter** that counts up at a fixed rate, 32 or 64 bits wide;
- a **capabilities register** giving the counter's period in
  femtoseconds, its width and the number of comparators (unchecked:
  register layout from memory);
- at least three **comparators** ("timers"), each raising an interrupt
  when the main counter reaches its value, one-shot or periodic.

The rate is not fixed by convention as the PIT's is: software reads it
from the capabilities register. The specification sets only limits on
frequency, error and drift. Firmware announces the block in the ACPI
`HPET` table (see [ACPI tables](acpi-tables.md)), usually at
`0xfed00000`.

Because there is one HPET per machine, unlike the per-core
[TSC](tsc.md) and [local APIC timer](lapic-timer.md), it is a stable
system-wide reference, but every read is an uncached memory access, and a
trap to the hypervisor when emulated.

## In seL4

The kernel does not use it. At user level, util_libs' pc99 ltimer
(`libplatsupport`) prefers the HPET and falls back to the PIT. Its HPET
driver needs a 64-bit comparator, so a 32-bit HPET has to make it choose
the PIT before committing to the HPET.

Upstream seL4's x86 CI machines have a 64-bit HPET, so the PIT paths of
util_libs are not exercised there.

## Gotchas

- **EC2 Nitro types** present an HPET at `0xfed00000` with a 32-bit
  counter at 62.5 MHz. A 32-bit counter at that rate wraps every 68.7 s.
- **Compute Engine x86 types** have no HPET at all (no ACPI table); Linux
  uses `tsc`, `kvm-clock` or `acpi_pm` there.
- **QEMU** has an HPET by default; `-machine pc,hpet=off` removes it,
  which is how to reproduce the clouds' PIT paths locally.
- Under UEFI, a driver that searches the BIOS area for the ACPI root
  pointer finds nothing, never sees the `HPET` table and silently takes
  another timer.

## See also

- [PIT](pit.md): what it was meant to replace, and the usual fallback
- [ACPI tables](acpi-tables.md): how it is found
- [TSC](tsc.md): what Linux prefers on modern machines
- [seL4_libs and util_libs](../sel4/sel4-libs.md): the classic C libraries for building dynamic systems on seL4

## References

- [Linux KVM documentation, "Timekeeping Virtualization for X86-Based Architectures"](https://docs.kernel.org/virt/kvm/x86/timekeeping.html),
  section 2.4 "HPET": what it is for and why its specification is loose.
  *Checked 2026-11-14.*
- [IA-PC HPET Specification 1.0a](https://www.intel.com/content/dam/www/public/us/en/documents/technical-specifications/software-developers-hpet-spec-1-0a.pdf),
  Intel, 2004: the register map. *Unchecked (intel.com refuses scripted
  fetches).*
- [OSDev wiki, "HPET"](https://wiki.osdev.org/HPET): a practical driver
  guide. *Unchecked (the site refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
