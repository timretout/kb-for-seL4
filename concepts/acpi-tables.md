# ACPI tables

> The tables PC (and Arm server) firmware leaves in memory to describe the machine: the RSDP points to the XSDT, which lists tables such as the MADT (interrupt controllers), HPET, MCFG (PCI) and DSDT.

## What it is

ACPI (Advanced Configuration and Power Interface) does two jobs: power
management, and describing hardware that cannot be discovered by probing.
The second is what seL4 work meets. Firmware builds the tables in memory
before handing over; the OS finds them from one root pointer.

    RSDP  root pointer: found in the BIOS area, or handed over by UEFI or the bootloader
     └─ XSDT  (or the older 32-bit RSDT): a list of pointers to the tables
         ├─ MADT  "APIC": local APICs, I/O APICs and interrupt source overrides; on Arm, the GIC
         ├─ HPET  where the HPET is
         ├─ MCFG  where PCI Express configuration space (ECAM) is
         ├─ FADT  "FACP": fixed hardware, and the pointer to the DSDT
         │   └─ DSDT  AML bytecode describing devices; needs an interpreter
         └─ ... SPCR (serial console), DMAR or IVRS (IOMMU), and more

Every table starts with the same header (signature, length, checksum), so
a walker can skip signatures it does not know.

**Interrupt source overrides** in the MADT matter for legacy devices: they
say which [I/O APIC](apic.md) pin each [ISA](isa.md) [IRQ](irq.md) arrives on when
it is not the identity mapping, and with which polarity and trigger mode.

## In seL4

- The x86 kernel reads the RSDP and parses only what it needs at boot
  (the MADT for APICs, DMAR for the IOMMU) and passes the RSDP to the root
  task in bootinfo (unchecked: which tables exactly).
- util_libs' `libplatsupport` has an ACPI table walker used by
  user-level drivers, for example to find the [HPET](hpet.md) and the
  [PIT](pit.md)'s interrupt pin.
- On Arm, seL4 platforms describe hardware with a device tree at build
  time instead.

## Gotchas

- **Under UEFI there is no RSDP in the BIOS area.** Code that searches
  `0xe0000` to `0xfffff` finds nothing; take the pointer the bootloader
  passed (seL4 puts it in bootinfo).
- **The PIT's pin.** EC2 Nitro and Compute Engine x86 have overrides for
  IRQs 5, 9, 10 and 11 only, none for IRQ 0, so the PIT arrives on pin 0,
  where most PCs and QEMU route it to pin 2.
- **Large tables.** A walker that copies every table into a fixed heap
  can run out on machines with big tables.
- Newer EC2 types add an MCFG table and a PCIe hierarchy of bridges.

## See also

- [ISA](isa.md): the legacy IRQs that interrupt source overrides remap
- [Local APIC and I/O APIC](apic.md): the interrupt controllers the MADT describes
- [HPET](hpet.md): found through its table
- [PIT](pit.md): its interrupt pin comes from the MADT
- [MSI and MSI-X](msi-msix.md): PCI devices found through MCFG

## References

- [ACPI Specification 6.5](https://uefi.org/specs/ACPI/6.5/), chapter 5
  "ACPI Software Programming Model": the system description tables.
  *Unchecked (uefi.org refuses scripted fetches; chapter from memory).*
- [OSDev wiki, "RSDP"](https://wiki.osdev.org/RSDP) and
  ["ACPI"](https://wiki.osdev.org/ACPI): finding and walking the tables.
  *Unchecked (the site refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
