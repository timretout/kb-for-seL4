# Local APIC and I/O APIC (Advanced Programmable Interrupt Controller)

> x86's interrupt controllers: a local APIC in each core takes interrupts, sends IPIs and holds a timer, while I/O APICs route device interrupt pins to vectors on chosen cores; seL4 drives both and lets user level pick the vector for each pin or MSI.

## What it is

The original PC had one 8259 PIC (programmable interrupt controller),
later two chained: 15 usable [IRQs](irq.md), one CPU, priorities fixed
by pin. Multiprocessors needed interrupts that could go to any core and
cores that could interrupt each other, so Intel split the job in two:

```
 device pins ──▶ I/O APIC ──┐
                            ├─ message ──▶ local APIC (core 0) ──▶ core 0
 PCI MSI/MSI-X writes ──────┘              local APIC (core 1) ──▶ core 1
                                           ...         ▲  │
                                                       └──┘ IPIs between cores
```

### Local APIC

Every core has one. It:

- receives interrupts addressed to its core, from I/O APICs and from
  [MSIs](msi-msix.md), and presents them to the core by **vector**, an
  8-bit number indexing the core's interrupt descriptor table; vectors 0
  to 31 are the CPU's own exceptions, so devices use 32 to 255;
- has its own local sources, configured in the **local vector table**
  (LVT): the [timer](lapic-timer.md), two pins `LINT0` and `LINT1`
  (traditionally the old PIC's output and NMI), and error, thermal and
  performance-counter interrupts;
- sends **inter-processor interrupts** (IPIs) through its interrupt
  command register;
- takes the **end of interrupt** (EOI): software writes the EOI register
  when done, and the local APIC will then deliver the next interrupt of
  equal or lower priority. Priority is the vector's upper four bits, so a
  higher vector is higher priority (unchecked beyond Microkit's manual
  saying so);
- is enabled through the spurious interrupt vector register (SVR), which
  also names the vector used when an interrupt vanishes between being
  signalled and being taken.

Its registers are reached in one of two modes:

| Mode | Access | Notes |
|---|---|---|
| xAPIC | Memory-mapped, base in the `IA32_APIC_BASE` MSR, normally `0xfee00000` | 8-bit APIC IDs |
| x2APIC | MSRs from `0x800` (unchecked) | 32-bit APIC IDs; CPUID leaf 1, ECX bit 21, says the CPU has it |

Once firmware has switched a core to x2APIC it cannot simply go back to
xAPIC (unchecked: the SDM requires disabling the APIC first).

### I/O APIC

An I/O APIC has a number of input pins (usually 24) wired to devices or
interrupt routers. A machine can have several. Each is a small block of
memory-mapped registers, normally the first at `0xfec00000`, reached
indirectly: write a register number to `IOREGSEL` (offset `0x00`), then
read or write it through `IOWIN` (offset `0x10`).

Its **redirection table** has one 64-bit entry per pin, at register
`0x10 + 2 × pin`. Each entry says:

| Field | Bits | Meaning |
|---|---|---|
| Vector | 0–7 | The vector to deliver |
| Delivery mode | 8–10 | Fixed, NMI, ExtINT... (unchecked) |
| Destination mode | 11 | Physical or logical destination |
| Polarity | 13 | Active high or active low |
| Trigger mode | 15 | Edge or level ([IRQ](irq.md) explains the difference) |
| Mask | 16 | 1 = masked |
| Destination | 56–63 | Which local APIC, by APIC ID |

The version register's bits 16 to 23 give the number of pins minus one.

Firmware describes the I/O APICs in the [ACPI](acpi-tables.md) MADT: each
one's address and its **global system interrupt (GSI) base**, the number
of its pin 0 in a machine-wide numbering. ISA IRQ *n* is GSI *n* unless an
interrupt source override says otherwise.

MSIs bypass the I/O APIC entirely: the device writes straight into the
`0xfee00000` range, naming a local APIC and a vector.

## In seL4

Build options, in
[`src/arch/x86/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake):

- `KernelIRQController`: `IOAPIC` (the default) or `PIC`. With the I/O
  APIC, boot remaps the 8259s to vectors `0x20`–`0x2f` and masks them.
- `KernelLAPICMode`: `XAPIC` (the default) or `X2APIC`.
- `KernelMaxNumIOAPIC`: how many I/O APICs are used, default 1.

The local APIC is set up in `apic_init()`
([`src/arch/x86/kernel/apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c)):
it enables the APIC with spurious vector `0xff`, masks `LINT1` (NMI),
masks `LINT0` when using the I/O APIC, and points the timer at its
vector. `apic_ack_active_interrupt()` writes EOI. `xapic.c` and
`x2apic.c` hold the two access modes.

The I/O APIC driver is
[`src/plat/pc99/machine/ioapic.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/ioapic.c).
At boot it masks every pin; `ioapic_map_pin_to_vector()` fills in an
entry; `ioapic_mask()` sets and clears the mask bit, which is how the
kernel masks an I/O APIC [IRQ](irq.md) until the driver acknowledges it.

seL4's vector layout
([`include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h)),
with seL4 IRQ number = vector − `0x20`:

| Vectors | Use |
|---|---|
| `0x00`–`0x1f` | CPU exceptions |
| `0x20`–`0x2f` | The 8259's ISA IRQs 0–15 (PIC mode only) |
| `0x30`–`0x9b` | Free for user level: I/O APIC pins and MSIs |
| `0x9c` | IOMMU faults (with `KernelIOMMU`) |
| `0x9d` | The kernel's timer |
| `0x9e`, `0x9f` | IPIs (SMP builds) |
| `0xff` | Spurious |

User level asks for an I/O APIC interrupt with
`seL4_IRQControl_GetIOAPIC(ioapic, pin, level, polarity, vector)` and
for an MSI with `seL4_IRQControl_GetMSI(bus, dev, func, handle, vector)`
([`src/arch/x86/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/interrupt.c)).
Microkit's `<irq>` element takes the same fields.

## Gotchas

- **`vector` is not the CPU vector.** The argument to `GetIOAPIC` and
  `GetMSI` (and Microkit's `vector`) is 0 to 107, an offset into the user
  range: the CPU vector is `0x30 + vector`. An MSI-capable driver must
  program the device's MSI data with `0x30 + vector`, not `vector`.
- **Pins, not GSIs.** seL4 takes an I/O APIC index and a pin within it,
  ordered as in the MADT. A GSI from ACPI must be turned into (index, pin)
  using each I/O APIC's GSI base.
- **Every I/O APIC interrupt goes to the boot core.** `ioapic_init()`
  sets the destination to the first CPU, in physical mode, for every pin.
- **Extra I/O APICs are ignored.** With the default
  `KernelMaxNumIOAPIC=1`, the MADT scan prints "Not recording this
  IOAPIC" for the rest, and their pins cannot be used. EC2's virtual x86
  types have one I/O APIC; `c5n.metal` has nine.
- **An xAPIC kernel will not boot where firmware chose x2APIC.**
  `apic_enable()` stops with "x2APIC enabled in BIOS but kernel does not
  support that". EC2's virtual x86 types leave the APICs in xAPIC mode;
  `c5n.metal`'s firmware switches them to x2APIC, so it needs
  `KernelLAPICMode=X2APIC`.
- **Without an IOMMU, MSI details are recorded but unused.** seL4 keeps
  the PCI address and `handle` of an MSI, but uses neither, and cannot
  mask an MSI.
- **ISA IRQ 0 is not always pin 2.** See [PIT](pit.md): read the MADT's
  overrides.

## See also

- [IRQ](irq.md): edge and level, and how seL4 hands interrupts to user level
- [Local APIC timer and TSC deadline mode](lapic-timer.md): the timer inside the local APIC
- [MSI and MSI-X](msi-msix.md): interrupts written straight to a local APIC
- [ACPI tables](acpi-tables.md): the MADT lists local APICs, I/O APICs and overrides
- [PIT](pit.md): an ISA interrupt whose I/O APIC pin varies by machine
- [GICv3 and the ITS](gicv3-its.md): Arm's equivalent

## References

- [seL4 `src/arch/x86/kernel/apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/apic.c):
  `apic_init()` (SVR, `LINT0`, `LINT1`, timer LVT) and
  `apic_ack_active_interrupt()`. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/xapic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/xapic.c)
  and [`x2apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/x2apic.c):
  the refusal to boot an xAPIC kernel in x2APIC mode, and CPUID leaf 1
  ECX bit 21. *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/ioapic.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/ioapic.c):
  `IOREGSEL`/`IOWIN`, the redirection table layout, pin count from the
  version register, the boot core as destination. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h):
  the vector layout. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/interrupt.c):
  `GetIOAPIC` and `GetMSI`, and the vector offset (`irq += irq_user_min`).
  *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/acpi.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/acpi.c):
  `acpi_madt_scan()` and the `CONFIG_MAX_NUM_IOAPIC` limit.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake):
  `KernelIRQController`, `KernelLAPICMode`, `KernelMaxNumIOAPIC`.
  *Checked 2026-11-14.*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md),
  the `irq` element for x86 I/O APIC and MSI interrupts: `vector` below
  108, higher vector higher priority. *Checked 2026-11-14.*
- [Linux kernel documentation, "IO-APIC"](https://docs.kernel.org/arch/x86/i386/IO-APIC.html):
  why the I/O APIC exists (routing to any CPU) and multiple I/O APICs.
  *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html),
  volume 3, the APIC chapter: local APIC registers, LVT, EOI, priority,
  x2APIC. *Unchecked (intel.com refuses scripted fetches).*
- Intel 82093AA I/O APIC datasheet: the redirection table entry format.
  *Unchecked (intel.com refuses scripted fetches; field layout taken from
  seL4's `ioapic.c`).*
- [OSDev wiki, "APIC"](https://wiki.osdev.org/APIC) and
  ["IOAPIC"](https://wiki.osdev.org/IOAPIC): practical guides.
  *Unchecked (the site refuses scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
