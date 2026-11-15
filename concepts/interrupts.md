# Interrupts: a map

> A map of how an interrupt reaches the kernel on x86, Arm and RISC-V: which controller sits in each core, which one routes device interrupts, how message signalled interrupts and IPIs travel, and what number seL4 knows each interrupt by.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Interrupts](../INDEX.md#interrupts) · ← [Device trees](device-tree.md) · [IRQ](irq.md) →

| At a glance | |
|---|---|
| Kind | Survey of the interrupt pages |
| x86 | [Local APIC and I/O APIC](apic.md), [8259 PIC](pic-8259.md), [MSI and MSI-X](msi-msix.md) |
| Arm | [GICv2](gicv2.md), [GICv3 and the ITS](gicv3-its.md) |
| RISC-V | [RISC-V interrupts and timers](riscv-interrupts.md): the PLIC, the CLINT, AIA |
| seL4 IRQ number | x86: the vector minus `0x20`. Arm: the GIC INTID. RISC-V: the PLIC source number |
| seL4 kernel use | Drives the local APIC and I/O APIC, the GIC, or the PLIC; MSIs on x86 only |

## What it is

An interrupt is an event from outside the running program that makes
the CPU enter the kernel
([Exceptions, interrupts and traps](exceptions-and-traps.md) covers the
entry itself). They come from three kinds of source:

- a **device**, which raises an interrupt request ([IRQ](irq.md)) on a
  wire or, for a [PCI](pci.md) device, as a message
  ([MSI or MSI-X](msi-msix.md));
- the core's own **timer** ([Timers: a map](timers.md));
- **another core**, sending an inter-processor interrupt (IPI; see
  [Multiprocessor bring-up and IPIs](smp-bringup.md)).

Every architecture has to fill the same jobs to get these to a core,
and differs in which piece of hardware fills each:

- a **per-core part**, which holds the sources private to one core (its
  timer, IPIs sent to it) and is where the handler says it has taken an
  interrupt and later that it has finished;
- a **router** shared by the machine, which takes the wired device
  interrupts and holds, for each, whether it is enabled, whether it is
  edge or level triggered, and which core it goes to;
- a **path for messages**, so that a device can interrupt by writing to
  an address;
- a way to **send an IPI**;
- a **number** by which the handler learns which interrupt it has.

[IRQ](irq.md) explains what is common to all three architectures (edge
and level, masking, the acknowledge cycle). Each controller below has
its own page; this one shows how they fit together.

![Three columns. On x86 wired devices go through the I/O APIC, and PCI MSIs go directly, to the local APIC in each core, which interrupts the core with a vector. On Arm with GICv3 wired devices go through the distributor and PCI MSIs through the ITS to the redistributor and CPU interface of each core, which raise one IRQ exception. On RISC-V wired devices go through the PLIC to the SEIP bit of a hart's sip register, while the timer and IPIs go through M-mode firmware to STIP and SSIP.](../images/interrupts-side-by-side.svg)

*The same two layers on each architecture: a shared router above, a
per-core part below. RISC-V's per-core part is only three bits, and
firmware stands where the other two have hardware.*

### x86

x86 has two generations of controller, and a modern PC carries both:

| Device | Job | One per |
|---|---|---|
| [8259 PIC](pic-8259.md) | The original controller: 15 IRQ lines to one CPU | machine (a pair of chips) |
| [I/O APIC](apic.md) | Routes device pins to vectors on chosen cores | machine, sometimes several |
| [Local APIC](apic.md) | Takes interrupts for its core, sends IPIs, holds a timer, takes the end of interrupt (EOI) | core |

The CPU is interrupted with a **vector**, an 8-bit number indexing its
interrupt descriptor table
([x86-64 exceptions and system calls](x86-exceptions-syscalls.md)).
Vectors 0 to 31 are the CPU's own exceptions, so devices use 32 to 255.
The vector says which interrupt it is: the handler does not have to ask
the controller.

- **Wired devices** drive I/O APIC pins. Each pin has a redirection
  entry giving its vector, trigger mode, polarity, mask and target local
  APIC.
- **MSIs** bypass the I/O APIC: the device writes straight into the
  `0xfee00000` range, naming a local APIC and a vector.
- **IPIs** are sent through the local APIC's interrupt command register.
- **The timer** is a local source inside the local APIC
  ([local APIC timer](lapic-timer.md)).
- **Finishing** is a write to the local APIC's EOI register.

A wired interrupt goes by several numbers on the way: an
[ISA](isa.md) IRQ, a global system interrupt (GSI), an I/O APIC pin,
then a vector. The [ACPI](acpi-tables.md) MADT gives the first steps
and software chooses the last; [APIC](apic.md) follows the whole chain.

### Arm

Arm has one design, the Generic Interrupt Controller (GIC), in two
versions that seL4 work meets: [GICv2](gicv2.md) on older and smaller
boards, [GICv3](gicv3-its.md) on servers and cloud instances. An Arm
core has only two interrupt inputs, IRQ and FIQ
([AArch64 exceptions](aarch64-exceptions.md)), so the handler asks the
GIC which interrupt it has. The answer is an **INTID**, and the INTID's
range says what kind of interrupt it is:

| INTID | Kind | Source |
|---|---|---|
| 0 to 15 | SGI, software generated | Another core: Arm's IPI |
| 16 to 31 | PPI, private peripheral | A device that exists once per core, such as the [generic timer](arm-generic-timer.md) |
| 32 to 1019 | SPI, shared peripheral | Wired devices |
| 8192 and up | LPI (GICv3 only) | Message signalled interrupts |

- **Wired devices** raise SPIs at the **distributor**, one per machine,
  which holds each interrupt's enable, priority, trigger mode and target.
- **The per-core part** is the **CPU interface**, where the handler
  acknowledges and completes interrupts. On GICv2 it is memory-mapped;
  on GICv3 it is system registers, and each core also has a
  **redistributor** for its private interrupts and LPIs.
- **MSIs** on GICv3 go to an **ITS** (interrupt translation service),
  which turns the device's write into an LPI for one core's
  redistributor. GICv2 has only the optional GICv2m frame.
- **IPIs** are SGIs, sent by writing `GICD_SGIR` (GICv2) or
  `ICC_SGI1R_EL1` (GICv3).
- **The timer** is a PPI.
- **Finishing** is a write of the INTID to the end-of-interrupt
  register (`GICC_EOIR`, or `ICC_EOIR1_EL1` on GICv3).

### RISC-V

The RISC-V architecture itself defines very little: each hart (hardware
thread) has three interrupt lines per privilege mode, seen in the `sip`
register for S-mode, where a kernel runs
([RISC-V interrupts and timers](riscv-interrupts.md)). Everything that
drives them is a separate platform specification.

| Line | `sip` bit | Driven by |
|---|---|---|
| External | `SEIP` | The platform interrupt controller: every device |
| Timer | `STIP` | M-mode firmware, when the kernel's `sbi_set_timer` deadline passes |
| Software | `SSIP` | M-mode firmware, when another hart calls `sbi_send_ipi` |

- **Wired devices** go to the **PLIC** (platform-level interrupt
  controller), shared by all harts. It holds a priority for each source
  and, for each hart and privilege mode (a *context*), an enable bitmap.
- **The per-core part** is only the three bits. "External" is a single
  line with no vector, so the handler **claims** from the PLIC, which
  returns the source number.
- **IPIs and the timer** go through firmware: the CLINT (core-local
  interruptor), which generates them, can interrupt M-mode only.
- **MSIs** have no path through a PLIC. The newer Advanced Interrupt
  Architecture (AIA) adds an IMSIC in each hart to receive them, and an
  APLIC in place of the PLIC.
- **Finishing** is **completing** the claim: writing the source number
  back to the PLIC.

### Side by side

| | x86 | Arm | RISC-V |
|---|---|---|---|
| Per-core part | [Local APIC](apic.md) | CPU interface (GICv3: and redistributor) | Three bits in `sip` |
| Router for wired devices | [I/O APIC](apic.md) (earlier, the [8259 PIC](pic-8259.md)) | Distributor | PLIC |
| MSIs | Written to the local APIC | ITS, giving LPIs ([GICv3](gicv3-its.md)) | IMSIC, with AIA only |
| IPIs | Local APIC's interrupt command register | SGIs | `sbi_send_ipi`, through firmware |
| The core's timer | A local APIC source | A PPI | `STIP`, through firmware |
| Number the handler gets | Vector, from the CPU | INTID, read from the GIC | Source number, claimed from the PLIC |
| Finishing | EOI to the local APIC | Write the end-of-interrupt register | Complete the claim |

## In seL4

The generic kernel
([`src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c),
see [Interrupt delivery](../sel4/irq-handling.md)) sees every controller
through the same few functions, which each architecture supplies:
`getActiveIRQ()` (which interrupt is this?), `isIRQPending()`,
`maskInterrupt()` and `ackInterrupt()`. `handleInterrupt()` then acts on
the IRQ's state: `IRQSignal` for a device handed to user level,
`IRQTimer` for the kernel's timer, `IRQIPI` for an IPI.

| | x86 | Arm | RISC-V |
|---|---|---|---|
| Driver chosen by | `KernelIRQController`: `IOAPIC` (the default) or `PIC` | The platform's `config.cmake`: `gic_v2.h` or `gic_v3.h` | The platform's `config.cmake`: `riscv_plic0.h` or `riscv_plic_dummy.h` |
| seL4 IRQ number | Vector minus `0x20` | INTID | PLIC source number |
| Handler capability from | `seL4_IRQControl_GetIOAPIC`, `GetMSI` | `seL4_IRQControl_Get`, `GetTrigger`, `GetTriggerCore` | `seL4_IRQControl_Get`, `GetTrigger` |
| MSIs | Yes | No: no LPIs or ITS | No: no AIA |
| Kernel's timer | `irq_timer`, vector `0x9d` | `KERNEL_TIMER_IRQ`, a generic timer PPI taken from the device tree at build time | `KERNEL_TIMER_IRQ`, the top of the number space |
| IPIs | Vectors `0x9e` and `0x9f` | SGIs | `sbi_send_ipi` |
| Between signal and `Ack` | I/O APIC pin masked | GICv2: masked. GICv3: left active | Claim left open |

On each architecture some numbers belong to the kernel and cannot be
handed out: on x86 only IRQs 16 to 123 are for user level, and on
RISC-V only the PLIC numbers.

A few Arm boards have neither GIC: their platforms name another driver
in `include/drivers/irq/` (`am335x.h`, `omap3.h`,
`bcm2836-armctrl-ic.h`).

The last row is the property user-level drivers depend on: once the
kernel has signalled a driver's notification, it will not take that
interrupt again until the driver calls `seL4_IRQHandler_Ack`. Three
mechanisms give it:

- **Masking** (x86, GICv2): the kernel masks the source and ends the
  interrupt at the controller; `Ack` unmasks.
- **Leaving it active** (GICv3): `ackInterrupt()` writes
  `ICC_EOIR1_EL1`, which only drops the priority; the interrupt stays
  active, which already stops redelivery, until `Ack` calls
  `deactivateInterrupt()` (a write to `ICC_DIR_EL1`).
- **Holding the claim** (RISC-V): the PLIC forwards a claimed source to
  nobody; `Ack` calls `plic_complete_claim()`.

## Gotchas

Each controller's page has its own; these come from comparing them.

- **The same number means different things.** A device tree's SPI 5 is
  seL4 IRQ 37 on Arm (the INTID); a RISC-V device tree's number is used
  unchanged; an x86 seL4 IRQ is a vector minus `0x20` and says nothing
  about the pin.
- **Only on x86 does the caller choose the number.** `GetIOAPIC` and
  `GetMSI` take a vector, counted from the first user vector, and the
  capability names that vector. On Arm and RISC-V the hardware fixes the
  number.
- **MSIs work on x86 only.** Upstream seL4 has no LPIs or ITS on Arm and
  no AIA on RISC-V, so a device there can interrupt only through a wire.
- **"Masked until `Ack`" has two holes.** x86 MSIs cannot be masked by
  the kernel, and on `qemu-riscv-virt` the kernel completes the claim at
  once.
- **Trigger mode is set in three ways.** On x86 it is the `level` and
  `polarity` arguments of `GetIOAPIC`; on Arm, `GetTrigger`; on RISC-V
  `GetTrigger` is accepted and ignored, as the PLIC has no trigger
  register.
- **Routing to a core differs too.** On x86 every I/O APIC interrupt
  goes to the boot core; on Arm `GetTriggerCore` chooses the core for an
  SPI.

## See also

- [IRQ](irq.md): one interrupt request: edge and level, the handling cycle
- [Local APIC and I/O APIC](apic.md): x86's controllers
- [8259 PIC](pic-8259.md): x86's original controller, still remapped and masked at boot
- [GICv2](gicv2.md): Arm's older controller, with the life of an interrupt in detail
- [GICv3 and the ITS](gicv3-its.md): Arm's current controller, LPIs and the ITS
- [RISC-V interrupts and timers](riscv-interrupts.md): the three lines, the PLIC, the CLINT and AIA
- [MSI and MSI-X](msi-msix.md): interrupts as memory writes
- [Exceptions, interrupts and traps](exceptions-and-traps.md): what the CPU does once an interrupt is taken
- [Multiprocessor bring-up and IPIs](smp-bringup.md): what IPIs are for
- [Timers: a map](timers.md): the same survey for timers
- [Interrupt delivery](../sel4/irq-handling.md): seL4's IRQControl and IRQHandler capabilities

## References

- [seL4 `src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c):
  `handleInterrupt()` and `invokeIRQHandler_AckIRQ()`, with the three
  cases (mask, GICv3 deactivate, RISC-V complete). *Checked 2026-11-15.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h)
  and [`include/plat/pc99/plat/machine/interrupt.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine/interrupt.h):
  the x86 vectors and IRQ numbers, `getActiveIRQ()`, `ackInterrupt()`,
  and `maskInterrupt()` doing nothing for MSIs. *Checked 2026-11-15.*
- [seL4 `include/arch/arm/arch/machine/gic_v3.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_v3.h)
  and [`src/arch/arm/machine/gic_v3.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/machine/gic_v3.c):
  `ackInterrupt()`, `deactivateInterrupt()`, the EOI mode that only
  drops priority, and `ipi_send_target()` writing `ICC_SGI1R_EL1`.
  *Checked 2026-11-15.*
- [seL4 `src/arch/arm/machine/gic_v2.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/machine/gic_v2.c):
  `ipi_send_target()` writing the distributor's SGI register.
  *Checked 2026-11-15.*
- [seL4 `src/arch/riscv/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/machine/hardware.c):
  `getActiveIRQ()` reading `sip`, the claim, and the immediate
  completion on `qemu-riscv-virt`. *Checked 2026-11-15.*
- [seL4 `tools/hardware.yml`](https://github.com/seL4/seL4/blob/master/tools/hardware.yml):
  `KERNEL_TIMER_IRQ` taken from the Arm generic timer's device tree
  node; and the `INTERRUPT_CONTROLLER` entries of
  [`src/plat/*/config.cmake`](https://github.com/seL4/seL4/tree/master/src/plat),
  of which `qemu-arm-virt`, `bcm2837`, `omap3`, `qemu-riscv-virt` and
  `spike` were read. *Checked 2026-11-15.*
- The controller pages listed under See also carry the references for
  each controller's own facts (datasheets, architecture manuals,
  specifications), which this page restates. *Unchecked here: see each
  page's marks.*
