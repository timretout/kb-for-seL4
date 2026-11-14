# IRQ (interrupt request)

> A device's signal that it needs the CPU, carried on a wire or as a message to an interrupt controller, which turns it into a numbered interrupt; seL4 hands each IRQ to user level as a capability that signals a notification.

## What it is

A device that has finished something (a packet arrived, a timer expired,
a UART byte came in) needs to tell the CPU without the CPU polling it. It
raises an **interrupt request**. Between the device and the CPU sits an
**interrupt controller**, which collects requests from many sources,
decides which CPU gets each, and lets software mask, prioritise and
acknowledge them. On x86 that is the [local APIC and I/O APIC](apic.md)
(earlier, the 8259 PIC); on Arm, the [GIC](gicv3-its.md).

The word "IRQ" is used for three different things, and most confusion
comes from mixing them up:

| Meaning | Example |
|---|---|
| The **line or pin** a device drives | I/O APIC pin 0; [PCI](pci.md) `INTA` |
| The **source number** in a numbering scheme | [ISA](isa.md) IRQ 4 (COM1); Arm INTID 37 |
| The **vector** the CPU is interrupted with | x86 vector `0x30` |

On x86 the three are separate and something must map one to the next: the
[ACPI](acpi-tables.md) MADT maps ISA IRQs to I/O APIC pins, and the I/O
APIC maps each pin to a vector. On Arm the GIC's INTID is both source
number and what the CPU reads back, so the three nearly collapse into one.

### Edge and level

A wired interrupt is either:

- **Edge-triggered:** the device makes a transition (low to high, say),
  and the controller latches that one event. A second edge while the
  first is still pending is lost: the two merge. ISA devices such as the
  [PIT](pit.md) and the 16550 UART are edge-triggered (unchecked).
- **Level-triggered:** the device holds the line asserted until software
  has dealt with the cause, usually by reading or writing a device
  register. Several devices can share one line, since it stays asserted
  while any of them wants service. Legacy PCI `INTx` is level-triggered
  and active low (unchecked).

Each also has a **polarity**: whether asserted means high or low.
Programming the controller with the wrong trigger mode or polarity gives
an interrupt that never arrives, or one that arrives forever.

[Message signalled interrupts](msi-msix.md) have no line: the device
writes a value to an address, which behaves like an edge.

### The handling cycle

Whatever the hardware, handling an interrupt follows the same shape:

1. The controller delivers it; the CPU stops what it was doing and enters
   the kernel's handler for that vector.
2. The handler **acknowledges** it at the controller, so the controller
   will deliver further interrupts (on the local APIC, a write to the EOI,
   end of interrupt, register).
3. Someone services the **device**, which for a level-triggered line is
   what deasserts it.

The order matters for level-triggered lines. If the controller is
acknowledged before the device has deasserted the line, the same
interrupt is delivered again at once. The usual answer is to **mask** the
source, acknowledge the controller, service the device, then unmask:
Linux's default level flow handler does exactly that (`mask_ack`, handle,
unmask).

## In seL4

seL4 drivers run at user level, so the kernel never services a device.
It does steps 1 and 2 and hands step 3 to a thread through capabilities,
defined in
[`src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c):

- **IRQControl**, one capability given to the root task, creates IRQ
  handler capabilities: `seL4_IRQControl_Get` generically,
  `seL4_IRQControl_GetTrigger` on Arm (to set edge or level), and on x86
  `seL4_IRQControl_GetIOAPIC` and `seL4_IRQControl_GetMSI`.
- An **IRQHandler** capability stands for one IRQ. Its methods are
  `seL4_IRQHandler_SetNotification` (which notification object to
  signal), `seL4_IRQHandler_Ack` and `seL4_IRQHandler_Clear`.

When an interrupt arrives, `handleInterrupt()` looks the IRQ up. If it is
in state `IRQSignal` it signals the bound notification with that
capability's badge, **masks** the IRQ (except on GICv3, which uses
deactivation instead), and always acknowledges it at the controller. The
IRQ stays masked until the driver calls `seL4_IRQHandler_Ack`, which
unmasks it (or, on GICv3, deactivates it). This is the mask, acknowledge,
service, unmask cycle above, with the driver's `Ack` as the unmask. The
kernel's own timer and IPIs use the states `IRQTimer` and `IRQIPI`.

What an IRQ number means differs by architecture:

- **Arm:** the GIC INTID, so the UART on EC2's Graviton2 (t4g) is
  IRQ 37 (SPI 5).
- **x86:** the CPU vector minus `0x20`
  ([`plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h)).
  With the I/O APIC (the default), the caller chooses the vector and
  names the I/O APIC pin or the PCI device separately; see
  [Local APIC and I/O APIC](apic.md).

[Microkit](https://github.com/seL4/microkit/blob/main/docs/manual.md)
wraps this: an `<irq>` element in the system description gives a
protection domain a channel for the IRQ, its `notified()` entry point
runs when it fires, and `microkit_irq_ack()` acknowledges it. The manual
notes that the kernel keeps the interrupt masked until then.

## Gotchas

- **Forgetting `Ack` looks like a dead device.** The first interrupt is
  delivered; every later one waits, masked, until the driver acknowledges.
- **Ack before servicing a level-triggered device, and it fires again.**
  The driver should clear the cause in the device first, then `Ack`.
- **x86 MSIs cannot be masked by seL4.** `maskInterrupt()` does nothing
  for them, so the masking above does not hold back a device that keeps
  writing; it relies on the device, or the driver masking the MSI-X entry.
- **ISA IRQ numbers are not I/O APIC pins.** The PIT's ISA IRQ 0 is on
  pin 2 on most PCs and in QEMU, but pin 0 on EC2's Nitro types and
  Compute Engine's x86 types; see [PIT](pit.md).
- **One IRQ, one handler capability.** `Get` on an IRQ that already has
  one fails with `seL4_RevokeFirst`, and Microkit lets only one protection
  domain have each IRQ.

## See also

- [ISA](isa.md): where the legacy IRQ numbers 0 to 15 come from
- [Local APIC and I/O APIC](apic.md): x86's interrupt controllers
- [GICv3 and the ITS](gicv3-its.md): Arm's interrupt controller
- [MSI and MSI-X](msi-msix.md): interrupts as memory writes instead of wires
- [PCI and PCI Express](pci.md): where INTx pins and MSI-capable devices come from
- [ACPI tables](acpi-tables.md): the MADT maps ISA IRQs to I/O APIC pins
- [PIT](pit.md): the classic edge-triggered ISA interrupt, IRQ 0
- [Local APIC timer](lapic-timer.md): the interrupt seL4's own scheduler runs on

## References

- [seL4 `src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c):
  `decodeIRQControlInvocation()`, `decodeIRQHandlerInvocation()`,
  `invokeIRQHandler_AckIRQ()` and `handleInterrupt()`, including the mask
  on signal and the GICv3 exception. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h):
  x86 vectors (`IRQ_INT_OFFSET` = `0x20`) and the IRQ numbers derived
  from them. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine/interrupt.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine/interrupt.h):
  `maskInterrupt()`, which does nothing for MSIs, and `ackInterrupt()`.
  *Checked 2026-11-14.*
- [libsel4 `object-api.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/interfaces/object-api.xml)
  and the
  [Arm](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/arm/interfaces/object-api-arch.xml)
  and
  [x86](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml)
  files: the names of the IRQControl and IRQHandler methods.
  *Checked 2026-11-14.*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md),
  section "Interrupts" and the `irq` element: channels, `microkit_irq_ack`
  and the masking until acknowledged. *Checked 2026-11-14.*
- [Linux kernel documentation, "Linux generic IRQ handling"](https://docs.kernel.org/core-api/genericirq.html),
  sections "Default Level IRQ flow handler" and "Default Edge IRQ flow
  handler": the mask, acknowledge, handle, unmask cycle.
  *Checked 2026-11-14.*
- [Linux kernel documentation, "IO-APIC"](https://docs.kernel.org/arch/x86/i386/IO-APIC.html):
  how PCI `INTA` to `INTD` are wired to slots and shared, and edge against
  level in `/proc/interrupts`. *Checked 2026-11-14.*
- [OSDev wiki, "Interrupts"](https://wiki.osdev.org/Interrupts): a
  general introduction, including edge and level. *Unchecked (the site
  refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
