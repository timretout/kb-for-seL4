# Index

Every page, with its summary. Grouped by topic; within a group, read top
to bottom for a sensible order.

## Interrupts

- [IRQ](concepts/irq.md): a device's signal that it needs the CPU, carried on a wire or as a message to an interrupt controller, which turns it into a numbered interrupt; seL4 hands each IRQ to user level as a capability that signals a notification.
- [Local APIC and I/O APIC](concepts/apic.md): x86's interrupt controllers: a local APIC in each core takes interrupts, sends IPIs and holds a timer, while I/O APICs route device interrupt pins to vectors on chosen cores; seL4 drives both and lets user level pick the vector for each pin or MSI.

## x86 timers

- [PIT](concepts/pit.md): the original PC's timer chip, a 16-bit down-counter at 1 193 182 Hz behind I/O ports 0x40 to 0x43; every x86 hypervisor still emulates it, and seL4 times its other clocks against it at boot.
- [TSC](concepts/tsc.md): a 64-bit per-core x86 counter read with `RDTSC`; cheap to read and, on modern CPUs, constant-rate, but nothing architectural tells the kernel its frequency.
- [Local APIC timer and TSC deadline mode](concepts/lapic-timer.md): the per-core x86 timer built into each local APIC, programmed either as a countdown at an unknown bus-derived rate or, in TSC deadline mode, as an absolute TSC value.
- [Timer calibration](concepts/timer-calibration.md): finding how fast a clock runs by timing it against another whose rate is known; on x86 seL4 does this at boot for the TSC and the local APIC timer, using the PIT.
- [Hypervisor CPUID leaves](concepts/hypervisor-cpuid-leaves.md): CPUID leaves from `0x40000000` that a hypervisor fills in to identify itself; leaf `0x40000010`, where offered, gives the TSC and local APIC timer rates so a guest need not measure them.
- [HPET](concepts/hpet.md): a memory-mapped x86 timer, found through an ACPI table, with one main counter and several comparators; meant to replace the PIT and RTC, absent or only 32 bits wide on the clouds.

## Firmware and platform description

- [ACPI tables](concepts/acpi-tables.md): the tables PC (and Arm server) firmware leaves in memory to describe the machine: the RSDP points to the XSDT, which lists tables such as the MADT (interrupt controllers), HPET, MCFG (PCI) and DSDT.

## Arm

- [Arm generic timer](concepts/arm-generic-timer.md): the architectural timer of every Armv8 core: a system counter whose rate is in `CNTFRQ_EL0`, and per-core comparators that raise PPIs; its rate varies by machine, which seL4 platforms have fixed at build time.
- [GICv3 and the ITS](concepts/gicv3-its.md): Arm's interrupt controller (distributor, per-core redistributors, CPU interface) and its ITS, which turns devices' MSI writes into LPIs using tables in memory.

## PCI and devices

- [ISA](concepts/isa.md): the IBM PC's original expansion bus; long gone as a slot, it lives on as the fixed set of legacy PC devices (PIT, 8259 PICs, COM ports, RTC, keyboard) at their old I/O ports and IRQ numbers 0 to 15, which every x86 machine and hypervisor still provides.
- [MSI and MSI-X](concepts/msi-msix.md): a PCI device interrupts by writing a value to an address instead of asserting a wire; MSI allows up to 32 vectors set in configuration space, MSI-X up to 2048 from a table in a BAR.

## seL4

- [Boot code and the proof boundary](sel4/boot-code.md): kernel code marked `BOOT_CODE` runs once before the first user thread and is then discarded; seL4's functional correctness proof does not cover it, which changes what a patch to it costs.
- [MCS kernel](sel4/mcs.md): a seL4 build option that replaces the periodic tick with scheduling contexts (a budget of CPU time per period) and one-shot timer deadlines; Microkit uses it, so its timer must be accurate.

## Wanted

Concepts that pages already lean on and that have no page yet. Take one
from here when writing a new page.

- I/O ports and port I/O against MMIO
- 8259 PIC (the original PC interrupt controller)
- 16550 UART
- PCI configuration space, BARs and ECAM
- Device trees
- PSCI and the SMC calling convention
- virtio (legacy and modern transports)
- seL4 capabilities and untyped memory
- Microkit: protection domains, channels, memory regions
- sDDF queues and drivers
- seL4 IRQ handler capabilities
