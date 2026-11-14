# RISC-V interrupts and timers

> How interrupts reach an S-mode kernel on RISC-V: three per-hart lines (software, timer, external) in `sip`/`sie`, fed by the CLINT through firmware and by the PLIC interrupt controller, with AIA as the newer alternative; seL4 drives the PLIC directly and gets its timer and IPIs through SBI calls.

Read first: [RISC-V basics](riscv-basics.md), [RISC-V paging and traps](riscv-paging-and-traps.md), [IRQ](irq.md).

## What it is

The RISC-V privileged architecture itself defines very little
interrupt machinery: each hart has three interrupt inputs per
privilege mode and two registers to see and enable them. Everything
that produces those inputs is a separate, platform-level
specification.

### Three sources

| Source | `scause` code | `sip`/`sie` bit | Names | Raised by |
|---|---|---|---|---|
| Supervisor software | 1 | 1 | `SSIP`, `SSIE` | another hart (an [IPI](smp-bringup.md)), via firmware |
| Supervisor timer | 5 | 5 | `STIP`, `STIE` | the timer, via firmware or `stimecmp` |
| Supervisor external | 9 | 9 | `SEIP`, `SEIE` | the platform interrupt controller: every device |

`sip` (supervisor interrupt pending) shows which are asserted, `sie`
(supervisor interrupt enable) selects which may interrupt, and
`sstatus.SIE` is the global enable. A source interrupts S-mode when
its `sip` and `sie` bits are both set and either `sstatus.SIE` is 1 or
the hart is running in U-mode: S-mode interrupts are always enabled
while user code runs. Machine mode has the same three (bits 3, 7, 11:
`MSIP`, `MTIP`, `MEIP`), which S-mode cannot see. When several are
pending, external is taken before software before timer.

"External" is a single line. Which device caused it is a question
for the interrupt controller, not for the CPU, and there is no
equivalent of x86's vector number.

### CLINT: timer and software interrupts for M-mode

The classic platform has a *CLINT* (core-local interruptor), a small
memory-mapped block giving each hart (unchecked: SiFive's CLINT
documentation and the ACLINT specification were not opened):

- `msip`, a one-bit register per hart: writing 1 raises that hart's
  *machine* software interrupt;
- `mtime`, one free-running 64-bit counter for the platform, and
  `mtimecmp`, a 64-bit compare register per hart: the *machine* timer
  interrupt is asserted while `mtime >= mtimecmp`.

Both interrupts go to M-mode. The CLINT cannot interrupt S-mode
directly, so firmware stands in between. *ACLINT* is a later
specification that splits the same functions into separate devices
and adds a supervisor software-interrupt device.

### The timer as S-mode sees it

A kernel reads the time with the `rdtime` instruction (the `time` CSR,
a read-only view of `mtime`). To get an interrupt it has two options:

- **The SBI timer call.** `sbi_set_timer(t)` asks firmware to deliver
  a supervisor timer interrupt when `time` reaches the absolute value
  `t`. Firmware programs `mtimecmp`, takes the machine timer interrupt
  when it fires, and sets `STIP` for the kernel. Calling it again
  clears the pending `STIP`; to stop the timer, set a time infinitely
  far ahead. Each arming and each tick costs a trip through M-mode.
- **Sstc.** The Sstc extension adds a supervisor compare register,
  the `stimecmp` CSR: `STIP` is pending whenever `time >= stimecmp`,
  with no firmware involved. The kernel must check the hardware has it
  and that firmware enabled it (`menvcfg.STCE`).

The timer's frequency is not discoverable from the hardware: it is
the `timebase-frequency` property in the
[device tree](device-tree.md).

### The PLIC

Device interrupts go through the *PLIC* (platform-level interrupt
controller), a memory-mapped device shared by all harts. It plays the
part of the I/O APIC on x86 or the GIC distributor on Arm.

- **Sources** are numbered 1 to 1023; 0 means "none". Each has a
  32-bit **priority** register; priority 0 means "never interrupt".
- A **context** is one hart in one privilege mode that can take
  external interrupts: typically hart 0 M-mode is context 0, hart 0
  S-mode context 1, hart 1 M-mode context 2, and so on, but the
  numbering is fixed by the platform and described in the device tree.
- Each context has an **enable** bitmap (one bit per source), a
  priority **threshold** (only sources with priority strictly above it
  are delivered) and a **claim/complete** register.

| Offset from the PLIC base | Register |
|---|---|
| `0x000000 + 4 × source` | source priority |
| `0x001000` | pending bits, 32 sources per word |
| `0x002000 + 0x80 × context` | enable bits for the context |
| `0x200000 + 0x1000 × context` | priority threshold for the context |
| `0x200004 + 0x1000 × context` | claim/complete for the context |

The PLIC asserts a context's external interrupt line (`SEIP` for an
S-mode context) while some enabled source above the threshold is
pending. The handler then:

1. **claims**: reads the claim register, which returns the number of
   the highest-priority pending source and atomically clears its
   pending bit, or returns 0 if another context got there first;
2. services the device;
3. **completes**: writes the same number back to the same register.

Between claim and completion the PLIC will not forward that source
again, to any context. This gate is the PLIC's only form of masking
"in service"; there are no nested priorities to manage and no
separate end-of-interrupt register. A source enabled in several
contexts interrupts all of them and the first to claim wins.

### AIA

The *Advanced Interrupt Architecture* (AIA) replaces the PLIC on
newer and larger systems (unchecked: the AIA specification was not
opened today; this is an outline from memory). It has two parts:

- **IMSIC** (incoming message-signalled interrupt controller): one per
  hart, receiving [MSIs](msi-msix.md) as memory writes and presenting them
  through new CSRs. Devices that can send MSIs (PCI devices) reach a
  hart with no shared controller in the path, and a hypervisor can
  give a guest its own interrupt files.
- **APLIC** (advanced PLIC): takes wired interrupts and either
  delivers them directly, PLIC-style, or converts them to MSIs for the
  IMSICs.

## In seL4

seL4's RISC-V interrupt code is in
[`src/arch/riscv/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/machine/hardware.c),
with the controller behind the small interface declared in
[`include/arch/riscv/arch/machine/plic.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/plic.h)
(`plic_get_claim`, `plic_complete_claim`, `plic_mask_irq`,
`plic_irq_set_trigger`, `plic_init_hart`, `plic_init_controller`).
Two header-only drivers implement it, chosen by each platform's
`config.cmake`:

| Driver | Used by |
|---|---|
| [`include/drivers/irq/riscv_plic0.h`](https://github.com/seL4/seL4/blob/master/include/drivers/irq/riscv_plic0.h) | every hardware platform and `qemu-riscv-virt`; matches device tree compatibles `riscv,plic0` and `sifive,plic-1.0.0` |
| [`include/drivers/irq/riscv_plic_dummy.h`](https://github.com/seL4/seL4/blob/master/include/drivers/irq/riscv_plic_dummy.h) | `spike` (and one `rocketchip` variant), which have no PLIC: only the timer works |

There is no AIA, ACLINT or Sstc support upstream.

**Start-up.** `initIRQController` calls `plic_init_controller`, which
claims and completes anything already pending and sets every source's
priority to 2. Per hart, `initLocalIRQController` calls
`plic_init_hart` (disable every source for this hart's S-mode context,
threshold 0) and then sets `SIE_SEIE` and `SIE_STIE` in `sie`, plus
`SIE_SSIE` on SMP. `sstatus.SIE` stays clear in the kernel: interrupts
are taken only from user mode or the idle thread, and polled for at
preemption points
([Exceptions, interrupts and traps](exceptions-and-traps.md)).

**IRQ numbers.** The enum in
[`src/arch/riscv/platform_gen.h.in`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/platform_gen.h.in)
defines one number space:

| seL4 IRQ | Meaning |
|---|---|
| 0 | `irqInvalid` (the PLIC's "no interrupt") |
| 1 to `PLIC_MAX_IRQ` | PLIC source numbers, unchanged; the maximum is `MAX_IRQ` in the platform's `config.cmake` |
| next two, SMP only | `INTERRUPT_IPI_0`, `INTERRUPT_IPI_1` (reschedule and remote call) |
| `KERNEL_TIMER_IRQ` = `maxIRQ` | the supervisor timer interrupt |

Only the PLIC numbers can be handed to user level, so the number in a
device tree `interrupts` property is the number to pass to
`seL4_IRQControl_Get`.

**Taking an interrupt.** `getActiveIRQ` reads `sip` and checks, in
order: `SEIP`, in which case it claims from the PLIC; `SSIP` (SMP),
in which case it calls `sbi_clear_ipi` and returns the IPI recorded
for this core; `STIP`, giving `KERNEL_TIMER_IRQ`. The result is cached
per core in `active_irq[]` until `ackInterrupt`, because claiming has
a side effect and the function is called more than once per entry.
`isIRQPending`, used by preemption points, tests `STIP` and `SEIP`
only.

**Masking and acknowledging.** On other architectures seL4 masks a
device interrupt when it signals the handler's notification and
unmasks it on `seL4_IRQHandler_Ack` (see
[Interrupt delivery](../sel4/irq-handling.md)). On RISC-V a comment
in `hardware.c` explains that this does not work reliably with the
PLIC's claim gate, so instead the kernel leaves the claim open while
user level handles the device and calls `plic_complete_claim` when the
handler acknowledges. `maskInterrupt` for a PLIC source changes the
enable bit in the current hart's S-mode context; for the timer it
changes `SIE_STIE`.

**Trigger mode.** RISC-V has its own IRQControl invocation,
`seL4_IRQControl_GetTrigger(irq, trigger, ...)` (label
`RISCVIRQIssueIRQHandlerTrigger`), which creates a handler capability
and sets level (0) or edge (1) triggering through `setIRQTrigger`. It
fails with `seL4_IllegalOperation` unless the driver defines
`HAVE_SET_TRIGGER`. `riscv_plic0.h` defines it, but its
`plic_irq_set_trigger` is an empty function: the standard PLIC has no
trigger register, so the argument is accepted and ignored.

**Timer.** The kernel uses the SBI timer call only. Without
[MCS](../sel4/mcs.md), `initTimer` and `resetTimer` in `hardware.c`
call `sbi_set_timer(riscv_read_time() + RESET_CYCLES)` for a periodic
tick, looping in case the target has already passed. With MCS,
`setDeadline` in
[`include/arch/riscv/arch/machine/timer.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/timer.h)
passes an absolute deadline to `sbi_set_timer`. Re-arming is the
acknowledgement: `ackInterrupt` does nothing for the timer.
`riscv_read_time` is `rdtime`. The timer frequency is a build-time
constant, `TIMER_CLOCK_HZ`, from `TIMER_FREQUENCY` in the platform's
`config.cmake` (copied by hand from the device tree's
`timebase-frequency`): the kernel does not read it at boot. User level gets no kernel timer: a timer
driver needs its own device.

**IPIs.** On SMP, `ipi_send_target` in
[`src/arch/riscv/smp/ipi.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/smp/ipi.c)
records the reason for the target core and calls `sbi_send_ipi` with
a one-hart mask; the target sees `SSIP`. TLB shootdown uses
`sbi_remote_sfence_vma` in the same way. See [SMP](../sel4/smp.md).

## Gotchas

- seL4 computes PLIC context offsets as "hart × 2 contexts, S-mode is
  the second" (`PLIC_SVC_CONTEXT` 1, `PLIC_EN_PER_HART` `0x100`). SoCs
  whose first hart has no S-mode (the SiFive U54-MC and U74-MC, so the
  `hifive`, `polarfire` and `star64` platforms) shift every later
  context down by one, and the driver corrects for it with
  `PLAT_PLIC_EN_ADJUST` and `PLAT_PLIC_THRES_ADJUST` under platform
  `#ifdef`s. A new platform with an unusual context layout needs the
  same care; the layout is not read from the device tree.
- On `qemu-riscv-virt` the kernel completes the claim immediately in
  `getActiveIRQ` (the source says a QEMU bug requires it), so the
  behaviour of a level-triggered device differs between QEMU and
  hardware: on QEMU a still-asserted source can interrupt again before
  user level has acknowledged.
- A claim can return 0 even though `SEIP` was set, when another hart
  claimed first or a level source dropped. `getActiveIRQ` returns
  `irqInvalid` for this and callers must cope.
- `seL4_IRQControl_GetTrigger` succeeding does not mean the trigger
  was configured (see above).
- Every timer re-arm is an `ecall` into firmware, and under a
  hypervisor that becomes a trap to the hypervisor. The kernel's
  timer cost on RISC-V is therefore set by firmware quality in a way
  it is not on x86 or Arm.
- The legacy SBI calls the kernel uses (`set_timer`, `send_ipi`,
  `clear_ipi`) are deprecated in the SBI specification; see
  [RISC-V basics](riscv-basics.md).
- All PLIC sources are given the same priority (the code writes 2,
  under a comment that says 1) with threshold 0, so the PLIC's
  priority scheme is unused: the order in which simultaneous
  interrupts are claimed is by source number (the specification says
  identifiers break ties; lowest first is from memory, unchecked).
- `isIRQPending` ignores `SSIP`, so a pending IPI alone does not
  trigger a preemption point.

## See also

- [IRQ](irq.md): interrupts in general, level and edge
- [Interrupt delivery](../sel4/irq-handling.md): IRQControl, IRQHandler and notifications
- [RISC-V paging and traps](riscv-paging-and-traps.md): how the interrupt enters the kernel once pending
- [RISC-V basics](riscv-basics.md): CSRs and the SBI
- [Multiprocessor bring-up and IPIs](smp-bringup.md): what software interrupts are for
- [SMP](../sel4/smp.md): seL4's use of IPIs
- [MSI and MSI-X](msi-msix.md): the mechanism AIA's IMSIC is built around
- [Device trees](device-tree.md): where the PLIC address, source numbers and timer frequency are described

## References

- [RISC-V Platform-Level Interrupt Controller Specification](https://github.com/riscv/riscv-plic-spec/blob/master/riscv-plic.adoc),
  "Memory Map", "Interrupt Priorities", "Interrupt Enables",
  "Interrupt Targets and Hart Contexts": the register offsets, source
  0 and priority 0. The claim and completion sections were not
  re-read. *Checked 2026-11-14.*
- [The RISC-V Instruction Set Manual, Volume II: supervisor-level ISA](https://github.com/riscv/riscv-isa-manual/blob/main/src/priv/supervisor.adoc),
  "Supervisor Interrupt (`sip` and `sie`) Registers" and "Supervisor
  Timer (`stimecmp`) Register", and the
  [Sstc chapter](https://github.com/riscv/riscv-isa-manual/blob/main/src/priv/sstc.adoc):
  why Sstc exists and what it adds. The bit numbers are from seL4's
  `machine.h`. *Checked 2026-11-14.*
- [RISC-V SBI specification, legacy](https://github.com/riscv-non-isa/riscv-sbi-doc/blob/master/src/ext-legacy.adoc)
  and [timer](https://github.com/riscv-non-isa/riscv-sbi-doc/blob/master/src/ext-time.adoc)
  extensions: set timer, send and clear IPI. Section headings only
  were read. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/machine/hardware.c):
  `getActiveIRQ`, `isIRQPending`, `maskInterrupt`, `ackInterrupt`,
  `resetTimer`, `initLocalIRQController`, and the comment on PLIC
  masking. *Checked 2026-11-14.*
- [seL4 `include/drivers/irq/riscv_plic0.h`](https://github.com/seL4/seL4/blob/master/include/drivers/irq/riscv_plic0.h):
  offsets, context arithmetic, the platform adjustment, the empty
  `plic_irq_set_trigger`. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/platform_gen.h.in`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/platform_gen.h.in),
  [`src/arch/riscv/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/object/interrupt.c)
  and [`include/arch/riscv/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine.h):
  IRQ numbering, the GetTrigger decode, `SIP_*` and `SIE_*` bits.
  *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/smp/ipi.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/smp/ipi.c):
  `ipi_send_target`. *Checked 2026-11-14.*
- [RISC-V Advanced Interrupt Architecture](https://github.com/riscv/riscv-aia):
  IMSIC and APLIC. *Unchecked: not opened today.*
- [RISC-V ACLINT specification](https://github.com/riscv/riscv-aclint):
  the CLINT's successor, with the `mtime`, `mtimecmp` and `msip`
  register definitions. *Unchecked: not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
