# GICv3 and the ITS (interrupt translation service)

> Arm's interrupt controller (distributor, per-core redistributors, CPU interface) and its ITS, which turns devices' MSI writes into LPIs using tables in memory.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Interrupts](../INDEX.md#interrupts) · ← [Local APIC and I/O APIC](apic.md) · [PIT](pit.md) →

| At a glance | |
|---|---|
| Kind | Interrupt controller, with an optional translation service (ITS) for message signalled interrupts |
| Architecture | Arm |
| Reached through | `GICD_*` and `GICR_*` registers; system registers `ICC_*_EL1` for the CPU interface; the ITS's command queue in memory |
| Key numbers | INTIDs: SGIs 0 to 15, PPIs 16 to 31, SPIs 32 to 1019, LPIs 8192 and up |
| seL4 config | `KernelArmGicV3ITS` (a prototype, not upstream) |
| seL4 use | Upstream handles SPIs, PPIs and SGIs; no LPIs or ITS |
| On the clouds | EC2: 128 LPIs on t4g, 256 on m9g. Compute Engine's bare-metal types have six ITSes |

## What it is

The Generic Interrupt Controller, version 3, has these parts:

- the **distributor** (`GICD_*`), which routes shared peripheral
  interrupts (SPIs) to cores;
- one **redistributor** per core (`GICR_*`), which handles that core's
  private interrupts and LPIs;
- the **CPU interface**, reached through system registers (`ICC_*_EL1`),
  where a core acknowledges and ends interrupts;
- optionally one or more **ITS**es.

![A wired device's SPI goes through the distributor to a core; each core has a redistributor and a CPU interface; a PCI device sends an EventID to the ITS, which sends an LPI to one core's redistributor.](../images/gicv3-its-parts.svg)

*The parts of a GICv3 and the two routes an interrupt takes. The lower
route, through the ITS, is explained under "LPIs and the ITS" below.*

Interrupt IDs (INTIDs) come in ranges:

| INTIDs | Kind | Example |
|---|---|---|
| 0 to 15 | SGIs, software generated | inter-processor interrupts |
| 16 to 31 | PPIs, private per core | the [generic timer](arm-generic-timer.md) |
| 32 to 1019 | SPIs, shared | a UART, a wired device interrupt |
| 8192 and up | LPIs, locality-specific | message signalled interrupts |

**LPIs and the ITS.** LPIs are configured in tables in normal memory
rather than registers: a configuration table (priority, enable) shared by
all cores and a pending table per core. A device does not raise an LPI
directly. It writes an **EventID** to the ITS's `GITS_TRANSLATER`
register, and the ITS identifies the device by its **DeviceID** (for [PCI](pci.md),
derived from the requester ID). The ITS then looks up:

    DeviceID ── device table ──▶ that device's interrupt translation table
    EventID  ── ITT ───────────▶ LPI INTID + collection
    collection ─ collection table ─▶ target redistributor (core)

Software fills these tables by writing commands (`MAPD`, `MAPTI`,
`MAPC`, `INV`, `SYNC`, ...) to the ITS's command queue in memory.

LPIs are edge-triggered and have no active state.

## In seL4

Upstream seL4 supports GICv3 SPIs, PPIs and SGIs but not LPIs or the
ITS, so there are no message signalled interrupts on Arm. A prototype
(behind `KernelArmGicV3ITS`) keeps all the tables in static kernel memory
and adds `seL4_IRQControl_GetMSI(irq, device_id, event_id, ...)`; an
upstream API would need an RFC. One question it must answer is where the
kernel gets memory for the tables; the x86 pull request for VT-d
interrupt remapping ([#1098](https://github.com/seL4/seL4/issues/1098))
needs kernel table memory too.

## Gotchas

- **EC2 limits LPIs.** Its hypervisor reports a "restricted LPI range":
  128 LPIs on t4g, 256 on m9g. Take the limit from `GICD_TYPER`.
- **Both clouds** use 64 KiB ITS pages and 8-byte table entries, and
  firmware leaves LPIs disabled.
- **Several ITSes.** Compute Engine's bare-metal types have six; a driver
  handling one sees only the devices behind it.
- Compute Engine's Arm VMs put the ITS at `0x08080000`, QEMU's address.

## See also

- [IRQ](irq.md): interrupts in general, and seL4's IRQ handler capabilities
- [Local APIC and I/O APIC](apic.md): the x86 counterpart
- [MSI and MSI-X](msi-msix.md): what the device writes
- [PCI and PCI Express](pci.md): the requester ID that becomes a DeviceID
- [Arm generic timer](arm-generic-timer.md): the PPIs
- [Arm virtualisation (EL2)](arm-virtualisation.md): what exception level 2 adds to an Arm core so that a hypervisor can run guests
- [EC2 instance types](ec2-instance-types.md): how to read an EC2 instance type name
- [GICv2](gicv2.md): arm's older standard interrupt controller, with at most eight cores and every register memory-mapped
- [gVNIC](gvnic.md): compute Engine's own paravirtual network card, the only NIC on third-generation and later machine series...
- [IOMMUs: VT-d and SMMU](iommu.md): an IOMMU translates and restricts the memory addresses devices use for DMA, which is what keeps a...
- [Interrupt delivery](../sel4/irq-handling.md): seL4 turns each device interrupt into a signal on a notification
- [SMP](../sel4/smp.md): seL4 built for more than one core runs a single kernel image under one big lock, with per-core scheduler...

## References

- [Arm GICv3 and GICv4 Architecture Specification (IHI 0069)](https://developer.arm.com/documentation/ihi0069/latest/):
  chapter 5, "Locality-specific Peripheral Interrupts and the ITS", and
  the INTID ranges in chapter 2. *Checked 2026-11-14, issue G, read as
  the [PDF](https://documentation-service.arm.com/static/601412d54ccc190e5e681269)
  because developer.arm.com refuses scripted fetches.*
- [Arm, "Learn the architecture: Generic Interrupt Controller v3 and v4, Overview"](https://developer.arm.com/documentation/198123/latest/):
  a readable overview of the parts and the INTID ranges.
  *Checked 2026-11-14, version 3.2, read as the
  [PDF](https://documentation-service.arm.com/static/678108763f2a9a07789e1d9e).*
- [Arm, "Learn the architecture: Generic Interrupt Controller v3 and v4, LPIs"](https://documentation-service.arm.com/static/65ba2901c2052a35156cc629)
  (document 102923): the LPI configuration and pending tables, the
  ITS's tables, `GITS_TRANSLATER` and the commands. *Checked 2026-11-14.*
- [seL4 pull request #1098](https://github.com/seL4/seL4/issues/1098),
  "VT-d: add remappable MSI and IOAPIC support": interrupt remapping on
  x86, open. *Checked 2026-11-14 (description only, not the discussion).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
