# Interrupt delivery

> seL4 turns each device interrupt into a signal on a notification: the root task's `IRQControl` cap mints one `IRQHandler` cap per interrupt, a driver binds a notification to it, and the kernel holds the line quiet until the driver acknowledges.

Read first: [IRQ](../concepts/irq.md), [Notifications](notifications.md), [Capabilities](capabilities.md).

## What it is

The kernel has no device drivers beyond the interrupt controller, its
own timer and (in debug builds) a serial port. A device
[interrupt](../concepts/irq.md) is therefore not handled in the kernel:
it is forwarded to a user-level driver as a signal on a
[notification object](notifications.md), and the driver does the work.
Three capability types control this.

### IRQControl: the authority over all interrupts

The [root task](bootinfo-and-root-task.md) starts with exactly one
`IRQControl` cap, in slot `seL4_CapIRQControl`. It cannot do anything
with an interrupt itself; its one job is to create **`IRQHandler`**
caps, each naming one interrupt:

```c
seL4_IRQControl_Get(irqControl, irq, root, index, depth);
```

`root`, `index` and `depth` [address](cspace.md) the empty slot that
receives the new cap. The kernel refuses to issue a second handler for
an interrupt that already has one (`seL4_RevokeFirst`), so at any time
at most one handler cap (and its copies) exists per interrupt. Most
platforms need more information than a number, so each architecture
adds its own forms:

| Invocation | Extra arguments | Use |
|---|---|---|
| `seL4_IRQControl_GetIOAPIC` (x86) | `ioapic`, `pin`, `level`, `polarity`, `vector` | a pin on an [I/O APIC](../concepts/apic.md) |
| `seL4_IRQControl_GetMSI` (x86) | `pci_bus`, `pci_dev`, `pci_func`, `handle`, `vector` | an [MSI or MSI-X](../concepts/msi-msix.md) message |
| `seL4_IRQControl_GetTrigger` (Arm, RISC-V) | `irq`, `trigger` (0 level, 1 edge) | an interrupt whose trigger mode must be set |
| `seL4_IRQControl_GetTriggerCore` (Arm) | `irq`, `trigger`, `target` | as above, on a chosen core (SMP) |
| `seL4_IRQControl_IssueSGISignal` (Arm) | `irq`, `target` | not a handler: a cap that *raises* a software-generated interrupt |

On x86 the caller chooses the **vector**, counted from 0 at the first
user vector, and the cap that comes back names that vector, not the pin
or device. With an I/O APIC configured, plain `seL4_IRQControl_Get`
fails with `seL4_IllegalOperation`; it is only for the 16 ISA lines
when the kernel is built to use the legacy [PIC](../concepts/pic-8259.md).
For MSI the kernel does not touch the device: user level must itself
write the vector into the device's MSI capability
([MSI and MSI-X](../concepts/msi-msix.md) has the details).

`GetTrigger` works only on platforms whose interrupt controller driver
defines `HAVE_SET_TRIGGER` (the GICs do); elsewhere it is
`seL4_IllegalOperation`. `IssueSGISignal` yields an
`seL4_ARM_SGI_Signal` cap whose only invocation sends SGI `irq` to
`target`; it exists so that one virtual machine or unicore kernel
instance can interrupt another, and the receiver takes the SGI through
an ordinary handler cap.

### IRQHandler: one interrupt

```c
seL4_IRQHandler_SetNotification(handler, notification);
seL4_IRQHandler_Ack(handler);
seL4_IRQHandler_Clear(handler);
```

- `SetNotification` binds a notification cap to the interrupt. The cap
  must have send rights, and its **badge** matters: when the interrupt
  fires, the kernel signals the notification with that badge, so one
  notification can serve several interrupts with one badge bit each. A
  second call replaces the earlier binding.
- `Ack` tells the kernel the driver has dealt with the device, so the
  interrupt may be delivered again.
- `Clear` removes the binding.

A driver's loop is: `seL4_Wait` on the notification, service the device
until it stops asserting, `seL4_IRQHandler_Ack`, repeat. Deleting the
last handler cap clears the binding and makes the interrupt inactive
again, after which `IRQControl` may issue a fresh handler.

### What happens when the interrupt fires

```
device asserts ─▶ interrupt controller ─▶ CPU traps to kernel
   kernel: getActiveIRQ()            which interrupt?
           handleInterrupt(irq)      look up state and notification
             sendSignal(ntfn, badge) wake or mark the driver
             mask the line           (not on GICv3 or RISC-V, see below)
           ackInterrupt(irq)         end-of-interrupt to the controller
           schedule()                the driver may now be the best thread
   driver: runs, services device, seL4_IRQHandler_Ack ─▶ kernel unmasks
```

The important property is that between the signal and the `Ack` the
kernel will not take that interrupt again, so a level-triggered device
that keeps its line asserted cannot livelock the system while its
driver waits to be scheduled. How that is done depends on the
controller:

| Controller | On delivery | On `Ack` |
|---|---|---|
| x86 PIC or I/O APIC, GICv2 | mask the line, then end-of-interrupt | unmask |
| [GICv3](../concepts/gicv3-its.md) | end-of-interrupt only drops priority; the interrupt stays *active*, which already stops redelivery | deactivate |
| RISC-V PLIC | claimed, which stops redelivery | complete the claim |

If no notification is bound, the interrupt is acknowledged and (where
masking is used) left masked until someone binds and acks.

### The IRQ number space

`irq` in these calls is the kernel's own numbering, 0 to `maxIRQ`:

- **x86**: IRQ `n` is vector `n + 0x20` (`IRQ_INT_OFFSET`). IRQs 0 to 15
  are the ISA lines (`irq_isa_min`..`irq_isa_max`), 16 to 123 are for
  user level (`irq_user_min`..`irq_user_max`, vectors 48 to 155, 108 of
  them), then the kernel's own: IOMMU fault 124, timer 125 and, on SMP,
  two IPI vectors 126 and 127. The `vector` argument of `GetIOAPIC` and
  `GetMSI` is an offset from `irq_user_min`.
- **Arm**: the GIC's interrupt ID. 0 to 15 are SGIs (software-generated,
  used as IPIs), 16 to 31 PPIs (private to one core, such as the
  [generic timer](../concepts/arm-generic-timer.md)), 32 upwards SPIs
  (shared, the device interrupts). LPIs, the message-based interrupts
  of the GICv3 ITS, are not supported upstream.
- **RISC-V**: the PLIC source number, plus kernel-defined numbers for
  the timer and IPI.

On SMP Arm an interrupt is a pair, `irq_t { irq, target_core }`, because
the same PPI number is a different interrupt on each core. Plain
`Get` and `GetTrigger` then refuse private interrupts ("use
GetTriggerCore"); `GetTriggerCore` on an SPI also routes it to the
`target` core.

### Interrupts the kernel keeps

The kernel's timer interrupt, the IPIs used by [SMP](smp.md), the x86
IOMMU fault interrupt and, on an Arm [hypervisor](hypervisor.md) build,
the virtual GIC maintenance and virtual timer interrupts are marked at
boot and never offered: `Get` on one fails with `seL4_RevokeFirst`, as
for any interrupt that is already active.

## In seL4

Generic code is in
[`src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c);
it is verified, so it is small and its interface to the controller is
four functions (`getActiveIRQ`, `maskInterrupt`, `ackInterrupt`,
`setIRQState`'s use of them).

Two global arrays hold the state, both indexed by `IRQT_TO_IDX(irq)`:

- `intStateIRQTable[]`: one `irq_state_t` per interrupt.

  | State | Meaning | `handleInterrupt` does |
  |---|---|---|
  | `IRQInactive` | no handler cap exists; masked | mask again (should not happen) |
  | `IRQSignal` | a handler cap exists | signal the bound notification |
  | `IRQTimer` | the kernel timer | `timerTick()`, or under [MCS](mcs.md) note that the timer needs reprogramming |
  | `IRQIPI` | an inter-processor interrupt (SMP only) | `handleIPI()` |
  | `IRQReserved` | another kernel-owned interrupt | `handleReservedIRQ()` in architecture code |

- `intStateIRQNode[]`: an array of capability slots, in effect a CNode
  owned by the kernel, one slot per interrupt. `SetNotification` copies
  the notification cap into the interrupt's slot
  (`invokeIRQHandler_SetIRQHandler`: `cteDeleteOne` then `cteInsert`),
  so the binding is an ordinary cap and disappears by the ordinary rules
  when the notification is revoked or deleted.

`decodeIRQControlInvocation` handles generic `Get` and passes other
labels to `Arch_decodeIRQControlInvocation`
(`src/arch/x86/object/interrupt.c`, `src/arch/arm/object/interrupt.c`,
`src/arch/riscv/object/interrupt.c`). All end in `invokeIRQControl`:
`setIRQState(IRQSignal, irq)`, which also unmasks, then insert the
handler cap as a child of the control cap. `deletedIRQHandler` sets the
state back to `IRQInactive`, which masks.

Entry is `handleInterruptEntry` in
[`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c),
called from each architecture's trap code. It calls `getActiveIRQ()`;
if that returns `irqInvalid` the interrupt was **spurious** (it went
away between being raised and being read, or the controller's spurious
vector fired) and `handleSpuriousIRQ()` does whatever the controller
needs; otherwise `handleInterrupt(irq)`. Then `schedule()` and
`activateThread()` pick who runs. Long-running kernel operations also
poll for pending interrupts at preemption points, so interrupt latency
is bounded.

The x86 vector layout is in `include/plat/pc99/plat/machine.h`; Arm's
numbering macros (`CORE_IRQ_TO_IRQT`, `IRQT_TO_IDX`, `IRQ_IS_PPI`,
`NUM_PPI` = 32) are in `include/arch/arm/arch/machine/gic_common.h`. On
SMP Arm the tables hold a separate block of 32 entries per core for the
private interrupts, followed by the SPIs. Boot-time marking of kernel
interrupts is `init_irqs` in each `src/arch/*/kernel/boot.c`.

Above the kernel, [Microkit](microkit.md) wraps all this: an `<irq>`
element in the system description becomes a handler cap bound to the
protection domain's notification with a badge bit for its channel, and
`microkit_irq_ack()` is `seL4_IRQHandler_Ack`.

## Gotchas

- Forgetting `Ack` is the classic bug: the driver gets exactly one
  interrupt and then silence. Acking before the device has been quieted
  gives an immediate second interrupt for a level-triggered line.
- A handler cap with no notification bound still makes the interrupt
  active. If it fires, the signal is lost (a debug kernel with
  `CONFIG_IRQ_REPORTING` prints "Undelivered IRQ") and the line stays
  masked until an `Ack`.
- The badge comes from the notification cap passed to
  `SetNotification`, not from the handler cap. An unbadged cap delivers
  badge 0, which the driver cannot tell from no signal bits at all.
- On x86 the handler cap names a vector, so two `GetIOAPIC` calls with
  the same vector collide (`seL4_RevokeFirst`) even for different pins.
  Higher vectors have higher priority at the
  [local APIC](../concepts/apic.md).
- `seL4_RevokeFirst` from `Get` means "already active", which covers
  both "someone holds a handler" and "the kernel owns it".
- On SMP Arm, a private interrupt of another core must be masked or
  deactivated on that core, so `Ack` and `setIRQState` send an IPI
  (`doRemoteMaskPrivateInterrupt`,
  `doRemoteDeactivatePrivateInterrupt`).
- `handleInterrupt` treats a number above `maxIRQ` as inactive (mask and
  acknowledge, with a message). A platform whose `maxIRQ` is too low
  therefore loses interrupts quietly in release builds.

## See also

- [IRQ](../concepts/irq.md): the hardware picture: lines, messages, level and edge
- [Local APIC and I/O APIC](../concepts/apic.md): pins, vectors and what `GetIOAPIC`'s arguments mean
- [MSI and MSI-X](../concepts/msi-msix.md): what `GetMSI` does and does not do
- [GICv3 and the ITS](../concepts/gicv3-its.md), [GICv2](../concepts/gicv2.md): Arm's controllers and interrupt ID ranges
- [RISC-V interrupts and timers](../concepts/riscv-interrupts.md): the PLIC's claim and complete
- [Notifications](notifications.md): the object the signal lands on, and badges
- [SMP](smp.md): IPIs and per-core interrupts
- [BootInfo and the root task](bootinfo-and-root-task.md): where `IRQControl` starts
- [virtio](../concepts/virtio.md): virtio is the standard family of paravirtual devices
- [Kernel objects](kernel-objects.md): the fixed set of object types the seL4 kernel implements
- [sDDF](sddf.md): trustworthy Systems' framework for user-level device drivers on Microkit

## References

- [seL4 `src/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/object/interrupt.c):
  `decodeIRQControlInvocation`, `decodeIRQHandlerInvocation`,
  `invokeIRQHandler_AckIRQ`, `handleInterrupt`, `setIRQState`.
  *Checked 2026-11-14.*
- [seL4 `src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c):
  `handleInterruptEntry` and the spurious path. *Checked 2026-11-14.*
- [seL4 `include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h):
  `irq_state_t`. *Checked 2026-11-14.*
- [seL4 `include/plat/pc99/plat/machine.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/machine.h):
  the x86 vector and IRQ number layout. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/interrupt.c):
  `Arch_checkIRQ`, `GetIOAPIC`, `GetMSI`. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/interrupt.c):
  `GetTrigger`, `GetTriggerCore`, `IssueSGISignal`.
  *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/machine/gic_common.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/machine/gic_common.h):
  SGI, PPI and SPI ranges and the core-tagged `irq_t`.
  *Checked 2026-11-14.*
- [seL4 `libsel4/arch_include/x86/interfaces/object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml)
  and the `arm` and `riscv` equivalents: argument lists of the
  `seL4_IRQControl_*` invocations. *Checked 2026-11-14.*
- [seL4 reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  chapter 6 "Interrupts". *Unchecked (not opened today).*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md):
  the `irq` element and `microkit_irq_ack`. *Unchecked (not reopened
  for this page).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
