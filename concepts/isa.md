# ISA (Industry Standard Architecture)

> The IBM PC's original expansion bus; long gone as a slot, it lives on as the fixed set of legacy PC devices (PIT, 8259 PICs, COM ports, RTC, keyboard) at their old I/O ports and IRQ numbers 0 to 15, which every x86 machine and hypervisor still provides.

## What it is

The IBM PC (1981) had an 8-bit expansion bus, a buffered copy of the 8088
CPU's own bus with interrupt and DMA lines added. The PC/AT (1984)
widened it to 16 bits for the 80286. IBM called it the I/O Channel; others
called it the PC or AT bus. "Industry Standard Architecture" is a
retronym coined by the clone makers in the late 1980s, after IBM tried to
replace it with its proprietary Micro Channel. [PCI](pci.md) pushed ISA slots off
motherboards during the 1990s.

What survives is not the bus but what was on it. The PC's motherboard
devices were ISA devices, software found them at fixed addresses with no
discovery, and every PC since has kept them there:

| ISA IRQ | Device | I/O ports |
|---|---|---|
| 0 | [PIT](pit.md), the system timer | `0x40`–`0x43` |
| 1 | Keyboard controller | `0x60`, `0x64` (unchecked) |
| 2 | Cascade from the second 8259 PIC | — |
| 3 | COM2 (and COM4) | `0x2f8` (unchecked) |
| 4 | COM1 (and COM3) | `0x3f8` |
| 8 | Real-time clock | `0x70`, `0x71` (unchecked) |
| 12 | PS/2 mouse | — |
| 14, 15 | Primary and secondary ATA disk channels | — |

The **ISA IRQ numbers** come from the two 8259 PICs: the first takes
IRQs 0 to 7 and signals the CPU; the second takes 8 to 15 and signals
the first on its IRQ 2, which leaves 15 usable lines. ISA interrupts are
edge-triggered and active high (unchecked); see [IRQ](irq.md).

On a modern machine:

- The devices sit in the chipset, on the LPC (Low Pin Count) bus or its
  successor eSPI, which looks like ISA to software.
- Hypervisors emulate them, usually behind an emulated PIIX ISA bridge on
  PCI. EC2's Nitro types present one.
- The 8259s are still there but are normally masked, and the
  [I/O APIC](apic.md) receives the ISA interrupts instead. In the
  [ACPI](acpi-tables.md) MADT, ISA IRQ *n* arrives on global system
  interrupt (GSI) *n*, unless an **interrupt source override** names
  another GSI, polarity or trigger mode.

The usual override is ISA IRQ 0 to GSI 2: the 8259's output takes I/O
APIC pin 0, so the PIT is moved to pin 2 (unchecked: the reason; QEMU's
code states the mapping).

## In seL4

- **Vectors and IRQ numbers.** seL4's IRQs 0 to 15 are the ISA IRQs, at
  vectors `0x20`–`0x2f`
  ([`plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h)).
  At boot `pic_remap_irqs()` moves the 8259s to those vectors
  ([`pic.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/pic.c)),
  and with the I/O APIC (the default) `pic_disable()` then masks them.
- **Getting an ISA interrupt.** With `KernelIRQController=PIC`,
  `seL4_IRQControl_Get` hands out ISA IRQs 0 to 15 directly. With the I/O
  APIC, it refuses them, and user level asks for the pin with
  `seL4_IRQControl_GetIOAPIC` instead
  ([`interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/interrupt.c)),
  so it has to know which pin the ISA IRQ is on.
- **I/O ports.** ISA devices are reached through x86 I/O ports, which
  seL4 controls with I/O port capabilities (unchecked: the details), and
  Microkit with the `ioport` element.
- The kernel's own uses of ISA devices: the [PIT](pit.md) for
  [timer calibration](timer-calibration.md) at boot, and COM1 for its
  debug console.

## Gotchas

- **The kernel prints the MADT's overrides but does not use them.**
  `acpi_madt_scan()` logs each one ("ACPI: MADT_ISO ...") and moves on.
  User level must read the overrides itself to turn an ISA IRQ into an
  I/O APIC pin.
- **IRQ 0 is on pin 2 in QEMU, pin 0 on the clouds.** QEMU's MADT has an
  override for ISA IRQ 0 to GSI 2, and its I/O APIC model routes IRQ 0 to
  pin 2. EC2's Nitro types and Compute Engine's x86 types have no override
  for IRQ 0, so the PIT is on pin 0; code that assumes pin 2 waits forever
  for its first timer interrupt. See [PIT](pit.md).
- **Not every IRQ under 16 is ISA.** QEMU's MADT also has level-triggered
  overrides for those IRQs below 16 that it gives to PCI devices, and
  EC2's Nitro types override IRQs 5, 9, 10 and 11.
- **"ISA" also means instruction set architecture** (x86-64, AArch64,
  RV64), in seL4 and Rust documentation and in verification. Next to
  IRQs, I/O ports or the PIT, it means the bus.

## See also

- [IRQ](irq.md): ISA IRQ numbers against pins and vectors, edge and level
- [Local APIC and I/O APIC](apic.md): what receives ISA interrupts now
- [ACPI tables](acpi-tables.md): the MADT's interrupt source overrides
- [PIT](pit.md): ISA IRQ 0, and the device seL4 still needs at boot
- [PCI and PCI Express](pci.md): the bus that replaced ISA
- [MSI and MSI-X](msi-msix.md): how PCI devices interrupt instead
- [I/O ports and MMIO](io-ports.md): x86's separate 16-bit address space for device registers, reached with the `in` and `out` instructions
- [8259 PIC](pic-8259.md): the PC's original interrupt controller, a pair of 8259A chips giving 15 IRQ lines through I/O ports
- [UARTs: 16550 and PL011](uart.md): A UART is the serial port

## References

- [Wikipedia, "Industry Standard Architecture"](https://en.wikipedia.org/wiki/Industry_Standard_Architecture),
  "History" and "Current use": the 1981 and 1984 buses, "I/O Channel",
  the retronym, MCA, and LPC looking like ISA to software.
  *Checked 2026-11-14.*
- [Wikipedia, "Interrupt request"](https://en.wikipedia.org/wiki/Interrupt_request),
  section "x86 IRQs": the two 8259s, the cascade on IRQ 2, the standard
  assignments. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h):
  ISA IRQs at vectors `0x20`–`0x2f`. *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/pic.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/pic.c)
  and
  [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c):
  remapping and masking the 8259s, and the cascade. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/interrupt.c):
  `Arch_checkIRQ()`, which allows ISA IRQs only in PIC mode.
  *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/acpi.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/acpi.c):
  `acpi_madt_scan()`, which only prints interrupt source overrides.
  *Checked 2026-11-14.*
- [QEMU `hw/i386/acpi-common.c`](https://github.com/qemu/qemu/blob/master/hw/i386/acpi-common.c)
  and [`hw/intc/ioapic.c`](https://github.com/qemu/qemu/blob/master/hw/intc/ioapic.c):
  `acpi_build_madt()`'s overrides (IRQ 0 to GSI 2; level-triggered PCI
  IRQs) and `ioapic_set_irq()` routing IRQ 0 to pin 2.
  *Checked 2026-11-14.*
- ACPI Specification, section 5.2.12 "Multiple APIC Description Table",
  interrupt source overrides and the ISA defaults. *Unchecked (uefi.org
  refuses scripted fetches; section number from memory).*
- [OSDev wiki, "8259 PIC"](https://wiki.osdev.org/8259_PIC) and
  ["I/O Ports"](https://wiki.osdev.org/I/O_Ports): the PIC and the
  standard port assignments. *Unchecked (the site refuses scripted
  fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
