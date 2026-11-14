# MSI and MSI-X (message signalled interrupts)

> A PCI device interrupts by writing a value to an address instead of asserting a wire; MSI allows up to 32 vectors set in configuration space, MSI-X up to 2048 from a table in a BAR.

## What it is

Legacy PCI interrupts are four shared wires (INTA to INTD) routed through
an interrupt controller. Message signalled interrupts replace the wire
with a memory write: the OS gives the device an **address** and a
**data** value, and to interrupt, the device writes the data to the
address. The interrupt controller recognises writes to that address.

| | MSI | MSI-X |
|---|---|---|
| Vectors per device | 1 to 32, a power of two | 1 to 2048 |
| Where configured | The MSI capability in configuration space | A table in one of the device's BARs, located by the MSI-X capability |
| Address per vector | One shared address, data values consecutive | Each entry has its own address and data |
| Per-vector masking | Optional | Always |

What the address and data mean depends on the architecture:

- **x86:** the address is in the `0xfee00000` range and names a target
  [local APIC](apic.md); the data holds the vector.
- **Arm GICv3:** the address is the ITS's `GITS_TRANSLATER` register and
  the data is an EventID, which the ITS translates to an LPI (see
  [GICv3 and the ITS](gicv3-its.md)).

Modern devices such as NVMe and cloud network cards (ENA, gVNIC) are
designed around MSI-X, one vector per queue.

## In seL4

- **x86:** seL4 gives user level an [IRQ](irq.md) handler capability for an MSI
  vector, and the user-level driver programs the device (unchecked: the
  invocation name).
- **Arm:** upstream seL4 has no ITS support, so no MSI on Arm. A
  prototype kernel API, `seL4_IRQControl_GetMSI`, maps one event of one
  device to an LPI.

## Gotchas

- **Some devices need MSI-X.** A device that polls fine can still need
  MSI-X for interrupt-driven operation; on Compute Engine, gVNIC round
  trips fell from about 1 ms polled to 0.07 ms with MSI-X.
- The MSI-X table lives in a BAR, so the driver needs that BAR mapped as
  well as configuration space.

## See also

- [IRQ](irq.md): what an interrupt is, and how seL4 hands one to user level
- [Local APIC and I/O APIC](apic.md): where an x86 MSI is delivered
- [GICv3 and the ITS](gicv3-its.md): how Arm turns the write into an interrupt
- [ACPI tables](acpi-tables.md): MCFG says where PCI configuration space is

## References

- [Linux kernel documentation, "The MSI Driver Guide HOWTO"](https://docs.kernel.org/PCI/msi-howto.html):
  what MSI and MSI-X are and their limits (32 against 2048 vectors).
  *Checked 2026-11-14.*
- PCI Local Bus Specification 3.0, section 6.8 "Message Signaled
  Interrupts". *Unchecked (PCI-SIG documents need a membership; section
  from memory).*
- [OSDev wiki, "PCI"](https://wiki.osdev.org/PCI), the section on message
  signalled interrupts. *Unchecked (the site refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
