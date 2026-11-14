# GICv2 (Generic Interrupt Controller, version 2)

> Arm's older standard interrupt controller, with at most eight cores and every register memory-mapped: a shared distributor (GICD) that enables, prioritises and routes interrupts, and a per-core CPU interface (GICC) where the kernel acknowledges and completes them; seL4's driver for many Arm boards.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [AArch64](../INDEX.md#aarch64) · ← [PSCI and SMCCC](psci-smccc.md) · [Arm virtualisation (EL2)](arm-virtualisation.md) →

Read first: [IRQ](irq.md), [AArch64 exceptions](aarch64-exceptions.md).

| At a glance | |
|---|---|
| Kind | Interrupt controller |
| Architecture | Arm |
| Reached through | MMIO: a shared distributor (GICD) and a banked CPU interface per core (GICC) |
| Found through | [Device tree](device-tree.md) node with `compatible = "arm,gic-400"` or `"arm,cortex-a15-gic"` |
| Key numbers | At most 8 cores; INTIDs 0 to 15 SGI, 16 to 31 PPI, 32 to 1019 SPI; 1023 is spurious |
| seL4 code | [`src/arch/arm/machine/gic_v2.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/machine/gic_v2.c), [`gic_v2.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_v2.h) |
| seL4 use | Masks the INTID, writes `EOIR` at once, unmasks on `seL4_IRQHandler_Ack`; IPIs are SGIs |
| On the clouds | Servers and cloud instances use [GICv3](gicv3-its.md) instead |

## What it is

An Arm core has two interrupt inputs, IRQ and FIQ
([AArch64 exceptions](aarch64-exceptions.md)). The **Generic Interrupt
Controller** (GIC) sits between the devices and those inputs, as the
I/O APIC and local APIC do on a PC ([APIC](apic.md)). Version 2 is found
on Cortex-A7, A9, A15 and A53-class boards (the common implementation is
called GIC-400) and in QEMU's `virt` machine by default. Servers and
cloud instances use [GICv3](gicv3-its.md), which differs mainly in
moving the CPU interface into system registers and lifting the
eight-core limit.

### Two blocks

```
 devices ──SPI──▶ ┌─────────────┐      ┌───────────────┐ ──IRQ/FIQ──▶ core 0
 timers ──PPI──▶  │ Distributor │ ───▶ │ CPU interface │
 software ─SGI─▶  │   (GICD)    │      │  (GICC) × N   │ ──IRQ/FIQ──▶ core N-1
                  └─────────────┘      └───────────────┘
```

- The **distributor** is one per system. It holds, for each interrupt,
  whether it is enabled, its priority, which cores it may go to and
  whether it is edge or level triggered, and it picks the highest
  priority pending interrupt for each core.
- The **CPU interface** is one per core, all at the same address: the
  registers are **banked**, meaning each core sees its own copy. It
  masks by priority, signals the core, and is where the handler
  acknowledges an interrupt and later says it has finished.

Both are 4 KiB-ish regions of memory-mapped 32-bit registers whose
addresses come from the [device tree](device-tree.md) (`reg` entries of a
node with `compatible = "arm,gic-400"` or `"arm,cortex-a15-gic"`).

### Interrupt IDs

Every interrupt has an ID, called INTID:

| INTID | Kind | Meaning |
|---|---|---|
| 0 to 15 | **SGI**, software generated interrupt | One core interrupts others by writing a register: Arm's inter-processor interrupt |
| 16 to 31 | **PPI**, private peripheral interrupt | A device that exists once per core, such as the [generic timer](arm-generic-timer.md); each core has its own INTID 27 |
| 32 to 1019 | **SPI**, shared peripheral interrupt | Ordinary device interrupts, routable to any core |
| 1020 to 1023 | Special | Never a real interrupt; 1023 means "nothing pending" (**spurious**) |

SGIs and PPIs are per core, so their distributor state (the first word
of each register array) is banked too. A device tree names an interrupt
as three cells `<type number flags>`, with type 0 for SPI and 1 for PPI
and the number relative to that kind: `<0 5 4>` is SPI 5, which is INTID
37; `<1 11 8>` is PPI 11, INTID 27 (unchecked: Linux binding
`arm,gic.yaml`). Kernel code and seL4's API use INTIDs.

### Distributor registers

Most are arrays with a fixed number of bits per interrupt, so interrupt
*n* is found by division: 1 bit each gives word *n*/32, bit *n*%32.

| Offset | Name | Per interrupt | Purpose |
|---|---|---|---|
| `0x000` | `GICD_CTLR` | | Global enable |
| `0x004` | `GICD_TYPER` | | Bits 4:0 = N, where 32(N+1) INTIDs are implemented |
| `0x080` | `GICD_IGROUPRn` | 1 bit | Group 0 or group 1 (below) |
| `0x100` / `0x180` | `GICD_ISENABLERn` / `ICENABLERn` | 1 bit | Write 1 to enable / disable. Writes of 0 are ignored, so no read-modify-write is needed |
| `0x200` / `0x280` | `GICD_ISPENDRn` / `ICPENDRn` | 1 bit | Set / clear pending |
| `0x300` | `GICD_ISACTIVERn` | 1 bit | Active state |
| `0x400` | `GICD_IPRIORITYRn` | 8 bits | Priority; **lower value is more urgent** |
| `0x800` | `GICD_ITARGETSRn` | 8 bits | Bit mask of cores (hence eight at most) an SPI may be sent to; read-only for INTIDs 0 to 31, where it reads as the current core's own bit |
| `0xC00` | `GICD_ICFGRn` | 2 bits | Upper bit: 0 level-sensitive, 1 edge-triggered |
| `0xF00` | `GICD_SGIR` | | Write to send an SGI: target list in bits 23:16, INTID in 3:0 |

### CPU interface registers

| Offset | Name | Purpose |
|---|---|---|
| `0x000` | `GICC_CTLR` | Enable signalling to this core |
| `0x004` | `GICC_PMR` | Priority mask: only interrupts with priority value below this are signalled |
| `0x008` | `GICC_BPR` | Binary point: how many priority bits count for pre-emption |
| `0x00C` | `GICC_IAR` | Interrupt acknowledge: read to get the INTID |
| `0x010` | `GICC_EOIR` | End of interrupt: write the value read from IAR |
| `0x018` | `GICC_HPPIR` | Highest priority pending INTID, without acknowledging |
| `0x1000` | `GICC_DIR` | Deactivate, when priority drop and deactivation are split (unchecked: GICv2 specification) |

### Life of an interrupt

Each interrupt is in one of four states: inactive, **pending**
(asserted, not yet taken), **active** (taken, handler not finished), or
active and pending.

1. A device asserts its line. The distributor marks the INTID pending
   and, if it is enabled and outranks what the target core is doing,
   the CPU interface raises IRQ.
2. The core takes the IRQ exception. The handler reads `GICC_IAR`. This
   returns the INTID in bits 9:0 (for an SGI, the sending core in bits
   12:10), moves the interrupt from pending to active, and raises the
   core's running priority so that nothing of equal or lower priority
   interrupts it. If nothing is pending any more, it returns 1023.
3. The handler deals with the device.
4. The handler writes the same value to `GICC_EOIR`. This drops the
   running priority and makes the interrupt inactive, so it can be
   delivered again.

![The states of one interrupt: inactive becomes pending when the device asserts its line, pending becomes active when the handler reads `GICC_IAR`, active returns to inactive when the handler writes `GICC_EOIR`, and a second edge while active gives active and pending.](../images/gicv2-states.svg)

*Reading `GICC_IAR` and writing `GICC_EOIR` are the two transitions
software makes; the others are the device's.*

**Level-sensitive** interrupts stay pending for as long as the device
holds the line; if the device has not been quietened by step 4 the
interrupt fires again at once. **Edge-triggered** interrupts are latched
on the rising edge and a second edge while active makes the state
active-and-pending. This is the same distinction as on x86
([IRQ](irq.md)), and the same rule follows: mask or quieten a level
interrupt before completing it.

### Groups

Each interrupt is in **group 0** or **group 1**. With the security
extensions, group 0 is secure and may be signalled as FIQ, and group 1
is non-secure and signalled as IRQ; a non-secure kernel sees and
controls only group 1 interrupts, and secure firmware decides which are
which before the kernel starts ([Arm boot flow](arm-boot.md)). Priority
values are also split: the non-secure view has half the range
(unchecked: GICv2 specification, section 4.3 register descriptions).

### The virtual interface

For hypervisors, GICv2 adds two more blocks
([Arm virtualisation](arm-virtualisation.md)):

- **GICV**, the virtual CPU interface, has the same layout as GICC. The
  hypervisor maps it into the guest where the guest expects GICC, so the
  guest's reads of IAR and writes of EOIR need no trap.
- **GICH**, the hypervisor control interface, is what feeds GICV. Its
  **list registers** (`GICH_LRn`, at most 64, typically 4) each hold one
  virtual interrupt for the current guest: a virtual INTID, priority,
  state, and optionally the physical INTID to deactivate when the guest
  completes it. `GICH_HCR` enables the mechanism and `GICH_MISR` says why
  a **maintenance interrupt** (a PPI telling the hypervisor that list
  registers need attention) was raised.

The guest's distributor is not provided by hardware; the hypervisor (in
seL4, the user-level virtual machine monitor) emulates it by trapping
accesses.

### Differences from GICv3

| | GICv2 | GICv3 |
|---|---|---|
| CPU interface | Memory-mapped GICC | System registers (`ICC_IAR1_EL1`, ...) |
| Cores | 8, as a bit mask in `ITARGETSR` | Unlimited; `GICD_IROUTERn` holds an affinity value |
| Per-core distributor state | Banked in GICD | A **redistributor** (GICR) per core |
| SGI | Write `GICD_SGIR` | Write `ICC_SGI1R_EL1` |
| Message-signalled interrupts | The optional GICv2m frame | LPIs and the ITS ([GICv3 and the ITS](gicv3-its.md)) |
| Hypervisor interface | Memory-mapped GICH/GICV | System registers `ICH_*_EL2` |

## In seL4

The driver is
[`src/arch/arm/machine/gic_v2.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/machine/gic_v2.c)
with
[`include/arch/arm/arch/machine/gic_v2.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_v2.h);
constants shared with the GICv3 driver are in
[`gic_common.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_common.h).

**Selection.** A platform's `config.cmake` names its controller's header
in `declare_default_headers(... INTERRUPT_CONTROLLER
arch/machine/gic_v2.h ...)` and adds `gic_v2.c` to its sources; some
(QEMU `virt`) choose v2 or v3 by an option. The register addresses come
from the device tree at build time:
[`tools/hardware.yml`](https://github.com/seL4/seL4/blob/master/tools/hardware.yml)
matches `arm,cortex-a15-gic`, `arm,cortex-a7-gic`, `arm,cortex-a9-gic`
and `arm,gic-400`, and maps `reg` index 0 as `GIC_V2_DISTRIBUTOR_PPTR`,
index 1 as `GIC_V2_CONTROLLER_PPTR` and, on hypervisor builds, index 2
as `GIC_V2_VCPUCTRL_PPTR`.

**Register layout.** `struct gic_dist_map` and `struct
gic_cpu_iface_map` overlay the two blocks; the field names are seL4's
own (`enable_set` is `ISENABLER`, `int_ack` is `IAR`, `pri_msk_c` is
`PMR`, `hi_pend` is `HPPIR`, `security` is `IGROUPR`).

**Initialisation.** `initIRQController` calls `dist_init` once: disable
and clear every interrupt, set priorities, point every SPI at the boot
core, make SPIs level-triggered, set groups, enable. The boot core's
bit in the target mask is not assumed to be bit 0: `infer_cpu_gic_id`
reads it back from the read-only target fields of the private
interrupts. `cpu_initLocalIRQController` calls `cpu_iface_init` on each
core: clear the banked state, set `PMR` to `0xf0` (admit everything),
drain any stale acknowledged interrupts, enable.

**The kernel interface.** The generic interrupt code
([Interrupt delivery](../sel4/irq-handling.md)) calls four functions,
all inline in `gic_v2.h`:

| Function | Does |
|---|---|
| `getActiveIRQ()` | Reads `IAR` once and caches it in `active_irq[core]`; returns `irqInvalid` for 1020 and above |
| `maskInterrupt(disable, irq)` | Writes `ICENABLER` or `ISENABLER` |
| `ackInterrupt(irq)` | Writes the cached value to `EOIR` and clears the cache |
| `isIRQPending()` | Reads `HPPIR`, used at pre-emption points |

seL4 does not use priorities to nest interrupts: the kernel runs with
interrupts masked, and for a device interrupt it masks the INTID in the
distributor, signals the bound notification and writes `EOIR` straight
away. The interrupt stays masked until the driver calls
`seL4_IRQHandler_Ack`, which unmasks it. That is what makes level
interrupts safe to hand to user level.

**IRQ numbers at user level** are INTIDs: a device tree's SPI 5 is
requested as IRQ 37. `seL4_IRQControl_Get` works, but Arm adds
invocations that also program the controller
([`src/arch/arm/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/interrupt.c)):

- `seL4_IRQControl_GetTrigger(irq, trigger, ...)`: `trigger` 0 is level,
  1 is edge. `setIRQTrigger` sets or clears the upper bit of the
  interrupt's `ICFGR` field. On an SMP kernel it refuses PPIs.
- `seL4_IRQControl_GetTriggerCore(irq, trigger, ..., target)`, SMP
  only: for a PPI, `target` selects which core's private interrupt the
  handler is for; for an SPI it routes the interrupt to that core
  (`setIRQTarget`).
- `seL4_IRQControl_IssueSGISignal`: makes a capability that lets user
  level send a given SGI to a given core (`plat_sendSGI` writes
  `GICD_SGIR`).

On SMP the kernel's own IPIs are SGIs (`ipi_send_target`), and the
kernel's `irq_t` becomes a (core, INTID) pair so each core's PPIs have
their own state (`CORE_IRQ_TO_IRQT`).

**Hypervisor builds** add `struct gich_vcpu_ctrl_map` (GICH) and the
accessors `get_gic_vcpu_ctrl_*` used by the VCPU code; see
[Arm virtualisation](arm-virtualisation.md).

## Gotchas

- **Write-1 registers must not be read-modify-written.** The driver's
  own comment on `dist_enable_clr`: "Using |= here is detrimental to
  your health". `enable_clr[w] |= BIT(b)` reads back every enabled
  interrupt in the word and disables them all.
- **Write back exactly what `IAR` returned.** For SGIs the value
  includes the source core in bits 12:10, and `EOIR` needs it. The
  driver caches the raw value in `active_irq` for this reason and
  compares only the low 10 bits (`IRQ_MASK`) with the INTID.
- **1023 is normal.** A level interrupt withdrawn between the IRQ
  exception and the `IAR` read gives a spurious 1023; it must not be
  written to `EOIR`. 1022 can appear when group 1 interrupts are read
  through the group 0 view (unchecked: GICv2 specification, section 3.2
  on special interrupt numbers).
- **Reading `IAR` is destructive.** It activates the interrupt, so
  peeking must use `HPPIR` (`isIRQPending`), and a debugger dumping the
  GICC block can swallow an interrupt.
- **Non-secure limits are invisible.** Writes to `PMR`, the group
  registers and the priorities of secure interrupts are silently
  ignored or adjusted from the non-secure side. `cpu_iface_init`
  comments that its `PMR` write is ignored if secure firmware already
  set one, and `dist_init` writes group and priority values that differ
  between hypervisor and non-hypervisor builds and for QEMU.
- **Device tree numbers are not INTIDs.** Forgetting the +32 (SPI) or
  +16 (PPI) is the usual reason a driver never sees its interrupt.
- **`GetTrigger` reprograms hardware.** Asking for the wrong trigger on a
  level device gives one interrupt and then silence, or a storm; SPIs
  default to level in `dist_init`.
- **Under emulation the eight-core limit is real.** QEMU's `virt` machine
  with `gic-version=2` refuses more than eight cores (unchecked).

## See also

- [IRQ](irq.md): interrupts in general, edge and level
- [Interrupt delivery](../sel4/irq-handling.md): IRQControl, IRQHandler and the mask-until-ack protocol
- [GICv3 and the ITS](gicv3-its.md): the successor, used on servers and clouds
- [APIC](apic.md): the x86 counterpart
- [Arm generic timer](arm-generic-timer.md): the main source of PPIs
- [Arm virtualisation](arm-virtualisation.md): GICH, GICV and list registers in use
- [Multiprocessor bring-up and IPIs](smp-bringup.md): SGIs as IPIs
- [Device trees](device-tree.md): where the addresses and interrupt cells come from

## References

- [ARM Generic Interrupt Controller Architecture Specification, version 2.0, IHI 0048B](https://developer.arm.com/documentation/ihi0048/latest):
  chapter 3 for interrupt handling and states, chapter 4 for the
  distributor and CPU interface registers, chapter 5 for the virtual
  interface. *Unchecked: developer.arm.com refuses scripted fetches;
  chapter numbers from memory.*
- [seL4 `include/arch/arm/arch/machine/gic_v2.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_v2.h):
  register offsets (in the struct comments), `getActiveIRQ`,
  `maskInterrupt`, `ackInterrupt`, the GICH layout.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/machine/gic_v2.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/machine/gic_v2.c):
  `dist_init`, `cpu_iface_init`, `setIRQTrigger`, `plat_sendSGI`,
  `ipi_send_target` and its comment on the `GICD_SGIR` fields.
  *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/machine/gic_common.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_common.h):
  `SPECIAL_IRQ_START` 1020, `IRQ_NONE` 1023, 16 SGIs, the SMP `irq_t`
  mapping. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/interrupt.c):
  decoding of `GetTrigger`, `GetTriggerCore` and `IssueSGISignal`.
  *Checked 2026-11-14.*
- [seL4 `tools/hardware.yml`](https://github.com/seL4/seL4/blob/master/tools/hardware.yml):
  the `compatible` strings and region indices for GICv2.
  *Checked 2026-11-14.*
- [Linux device tree binding `interrupt-controller/arm,gic.yaml`](https://github.com/torvalds/linux/blob/master/Documentation/devicetree/bindings/interrupt-controller/arm,gic.yaml):
  the three interrupt cells. *Unchecked: not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
