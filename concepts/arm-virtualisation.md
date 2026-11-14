# Arm virtualisation (EL2)

> What exception level 2 adds to an Arm core so that a hypervisor can run guests: trap controls in `HCR_EL2`, a second stage of address translation, virtual interrupts through the GIC's list registers and a virtual timer; an seL4 kernel built as a hypervisor runs entirely at EL2.

Read first: [AArch64 basics](aarch64-basics.md), [AArch64 exceptions](aarch64-exceptions.md), [AArch64 paging](aarch64-paging.md).

## What it is

A guest operating system expects to own EL1: its own page tables, its
own interrupt controller, its own timer. Arm's virtualisation extensions
give a **hypervisor** a level above it, **EL2**, with four tools to keep
that illusion while staying in control. This is the Arm counterpart of
Intel VT-x ([x86 virtualisation](x86-virtualisation.md)), but there is no
"VMCS" structure and no special entry instruction: a guest is entered
with an ordinary `ERET` from EL2 to EL1, and everything that makes it a
guest is in EL2 system registers that the hypervisor loads beforehand.

```
        native seL4 thread          guest
 EL0    application                 guest applications
 EL1    (unused)                    guest kernel (Linux)
 EL2    ─────────── hypervisor (seL4 kernel) ───────────
 EL3    secure firmware (TF-A BL31)
```

### 1. Traps: `HCR_EL2`

The hypervisor configuration register is a set of switches, each making
some EL1 or EL0 behaviour trap to EL2 or changing how it works. The ones
that matter when reading seL4:

| Bit | Name | Effect when set |
|---|---|---|
| 0 | `VM` | Enable stage 2 translation for EL1 and EL0 |
| 3, 4, 5 | `FMO`, `IMO`, `AMO` | Physical FIQ, IRQ and SError are taken to EL2, and the guest sees only virtual ones |
| 13, 14 | `TWI`, `TWE` | Guest `WFI` / `WFE` (wait for interrupt or event: the idle instructions) trap |
| 19 | `TSC` | Guest `SMC` traps ([PSCI and SMCCC](psci-smccc.md)) |
| 26 | `TVM` | Guest writes to its own translation registers (`SCTLR_EL1`, `TTBR0_EL1`, ...) trap |
| 27 | `TGE` | "Trap general exceptions": everything from EL0 that would go to EL1 goes to EL2. EL1 is in effect switched off |
| 31 | `RW` | EL1 is AArch64 (clear: AArch32) |

(Names and bit positions as defined in seL4's
[`vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/object/vcpu.h).) Other registers trap further groups: `CPTR_EL2`
(floating point), `MDCR_EL2` (debug and performance counters),
`HSTR_EL2`, and `VMPIDR_EL2`/`VPIDR_EL2` supply the core identity the
guest reads.

### 2. Stage 2 translation

With `HCR_EL2.VM` set, an address a guest uses is translated twice:

```
guest virtual ──stage 1 (guest's TTBR0/1_EL1)──▶ guest physical (IPA)
              ──stage 2 (VTTBR_EL2)──▶ physical
```

The guest controls stage 1 and believes its output is physical; Arm
calls it an **intermediate physical address** (IPA). The hypervisor
controls stage 2, a page table of the same shape as an ordinary one
([AArch64 paging](aarch64-paging.md)) rooted at `VTTBR_EL2` and sized by
`VTCR_EL2`. Stage 2 entries have their own permission bits (`S2AP`)
and no notion of user versus kernel. `VTTBR_EL2` also carries a
**VMID** (virtual machine identifier, 8 or 16 bits) that tags TLB
entries, so switching guests does not need a TLB flush; it is the stage
2 analogue of an ASID.

A device the guest should not touch directly is simply left unmapped at
stage 2. The guest's access then faults to EL2, and the hypervisor
emulates the device.

### 3. Virtual interrupts

With `IMO` set, every physical interrupt arrives at EL2 whatever the
guest is doing. To deliver one to the guest, the hypervisor writes a
**list register** of the GIC's hypervisor interface (`GICH_LRn` on
[GICv2](gicv2.md), `ICH_LRn_EL2` on [GICv3](gicv3-its.md)) with a
virtual interrupt number, priority and state. The guest then takes a
virtual IRQ at its own EL1 vector, and acknowledges and completes it
through the virtual CPU interface without trapping. There are only a few
list registers (4 is typical, read from `GICH_VTR` or `ICH_VTR_EL2`), so
when more interrupts are pending than fit, the hypervisor asks for a
**maintenance interrupt** when a list register frees up. The guest's
view of the GIC distributor is emulated in software.

### 4. The virtual timer

The [generic timer](arm-generic-timer.md) gives each core a physical
timer and a **virtual timer**. The virtual counter is the physical
counter minus `CNTVOFF_EL2`, which the hypervisor sets per guest so that
guest time need not include time the guest was not running. The guest
programs `CNTV_CVAL_EL0` and `CNTV_CTL_EL0` directly; when the timer
fires it raises a physical PPI (INTID 27), which the hypervisor receives
and turns into a virtual interrupt. `CNTHCTL_EL2` decides whether the
guest may also touch the physical timer.

### How a guest exit arrives

There is no separate exit mechanism. A trap, a stage 2 fault or a
physical interrupt is an ordinary exception to EL2
([AArch64 exceptions](aarch64-exceptions.md)), entering the "lower
exception level" entries of the table at `VBAR_EL2`:

| Register | Holds |
|---|---|
| `ESR_EL2` | Why: exception class (EC) in bits 31:26, such as `0x24` data abort from a lower level, `0x16` `HVC`, `0x17` `SMC`, `0x18` trapped system register access, `0x01` trapped `WFI`; details in the low 25 bits (ISS). For a data abort on a simple load or store the ISS says which register, access size and direction, which is what makes device emulation possible without decoding the instruction |
| `ELR_EL2`, `SPSR_EL2` | Where and in what state the guest was |
| `FAR_EL2` | The guest *virtual* address that faulted |
| `HPFAR_EL2` | For stage 2 faults, the faulting IPA (page-aligned part) |

Arm's older name for `ESR_EL2`, from AArch32, is **HSR** (hyp syndrome
register), and seL4's API uses it.

### What must be saved per guest

General registers, as for any thread, plus everything EL1 owns that a
native thread never touches: `SCTLR_EL1`, `TTBR0_EL1`, `TTBR1_EL1`,
`TCR_EL1`, `MAIR_EL1`, `VBAR_EL1`, `ESR_EL1`, `FAR_EL1`, `SP_EL1`,
`ELR_EL1`, `SPSR_EL1`, `TPIDR_EL1`, `CPACR_EL1`, `CNTKCTL_EL1`; the
virtual timer (`CNTV_CTL`, `CNTV_CVAL`, `CNTVOFF`); and the virtual GIC
state (the list registers, `VMCR`, active priorities).

### VHE

The **Virtualization Host Extensions** (Armv8.1, `HCR_EL2.E2H`) let an
unmodified EL1 kernel run at EL2 by redirecting its EL1 register
accesses to the EL2 registers and giving EL2 a second translation table
base register. Linux/KVM uses it to run the host kernel at EL2
(unchecked: Arm ARM, section D8 on VHE). seL4 does not use VHE; it is
mentioned because `E2H` changes the layout of several EL2 registers,
which matters when reading other hypervisors' code.

## In seL4

`KernelArmHypervisorSupport` (`CONFIG_ARM_HYPERVISOR_SUPPORT`) does not
add a hypervisor to the kernel: it moves the **whole kernel to EL2**.
The loader must then enter it at EL2 ([Arm boot flow](arm-boot.md)).
Consequences throughout the Arm code:

- The kernel's own registers are the EL2 ones (`VBAR_EL2`, `ESR_EL2`,
  `TTBR0_EL2`); `head.S` and `traps.S` use macros that pick EL1 or EL2
  names by configuration.
- **Native threads run at EL0 with `HCR_EL2.TGE` set**, so their system
  calls and faults come straight to EL2 and EL1 is never entered.
  `HCR_NATIVE` and `HCR_VCPU` in
  [`armv8-a/64/armv/vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/vcpu.h)
  are the two values of `HCR_EL2`: both include `VM`, `IMO`, `FMO`,
  `AMO`, `TSC` and `RW`; native adds `TGE`, `TVM` and TLB traps, a guest
  adds `TWI`/`TWE` if configured.
- **Every user address space is a stage 2 table.** A VSpace's root is
  loaded into `VTTBR_EL2`, for native threads and guests alike, and
  seL4's ASIDs are implemented with hardware VMIDs
  ([`src/arch/arm/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c)).
  Page table entries use the stage 2 format, and the virtual address
  space is 44 or 40 bits of IPA (`KernelArmPASizeBits44`,
  `KernelArmPASizeBits40`) instead of 48.

### VCPU objects

A guest's extra state lives in a **VCPU** object
([`include/arch/arm/arch/object/vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/object/vcpu.h)):
`struct vcpu` holds the bound TCB, `vgic` (the saved list registers,
`hcr`, `vmcr`, `apr`), `regs[seL4_VCPUReg_Num]` (the EL1 and timer
registers listed above) and `vppi_masked[]`. A thread becomes a guest
virtual CPU by binding a VCPU to its TCB; its VSpace is the guest's
physical memory map. The user-level virtual machine monitor (VMM) is
that thread's fault handler. [Virtualisation support](../sel4/hypervisor.md)
covers the API from the VMM's side.

Invocations, decoded by `decodeARMVCPUInvocation` in
[`src/arch/arm/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/vcpu.c):

| Invocation | Purpose |
|---|---|
| `seL4_ARM_VCPU_SetTCB` | Bind the VCPU to a thread (`associateVCPUTCB`) |
| `seL4_ARM_VCPU_ReadRegs` / `seL4_ARM_VCPU_WriteRegs` | Read or write one saved register, named by `seL4_VCPUReg_*` |
| `seL4_ARM_VCPU_InjectIRQ` | Put a virtual interrupt (INTID, priority, group) in a chosen list register; fails if that register is still in use |
| `seL4_ARM_VCPU_AckVPPI` | Unmask a virtual PPI after handling a VPPI event |

**Switching.** `vcpu_switch(new)` is called on every thread switch. It
is lazy: switching from a guest to a native thread only *disables* the
VCPU (`vcpu_disable` turns off the virtual GIC interface and restores
`HCR_NATIVE`) and leaves the EL1 registers loaded; the full
`vcpu_save`/`vcpu_restore` happens only when a different VCPU is
scheduled. The per-core state is `armHSCurVCPU` and `armHSVCPUActive`.

### What the VMM receives

Three fault types, delivered as fault IPC to the guest thread's fault
handler:

| Fault | Raised by | Message |
|---|---|---|
| `seL4_Fault_VCPUFault` | `handleVCPUFault(hsr)`: any exception from the guest that is not an abort or a system call, such as a trapped `SMC`, `WFI` or system register access | The raw syndrome (`seL4_VCPUFault_HSR`) |
| `seL4_Fault_VGICMaintenance` | `VGICMaintenance()`: the maintenance interrupt, normally because the guest completed a virtual interrupt | Index of the list register that became free, if one did |
| `seL4_Fault_VPPIEvent` | `VPPIEvent(irq)`: a physical PPI belonging to the guest fired; today only the virtual timer (`VPPIEventIRQ_VTimer`) | The INTID. The kernel masks the PPI and records it in `vppi_masked`; the VMM injects it and later calls `AckVPPI` |

Stage 2 faults (the guest touching unmapped guest-physical memory) are
ordinary `seL4_Fault_VMFault`s. The kernel reports the address by
translating `FAR_EL2` through the guest's stage 1 tables
(`addressTranslateS1` in `vspace.c`), so the VMM sees a guest-physical
address.

The kernel also context-switches the virtual timer: with
`CONFIG_VTIMER_UPDATE_VOFFSET` it adjusts `CNTVOFF` across the time a
VCPU is not running (`struct vTimer`, `last_pcount`).

## Gotchas

- **A hypervisor kernel needs EL2 at entry, and clouds mostly do not
  give it.** A guest of a cloud hypervisor starts at EL1. EL2 is
  available on bare-metal instance types and where the provider offers
  nested virtualisation on Arm; which Arm instance types on EC2, Compute
  Engine and Azure do so is unverified (unchecked). A non-hypervisor
  seL4 build is the safe choice there; see
  [Cloud virtual machines](cloud-vms.md).
- **Hypervisor builds change native behaviour too.** Address spaces
  become stage 2 tables with a smaller virtual range and different
  permission encodings, so a "hyp" kernel is a different configuration
  for every user-level component, not only for VMMs, and the proofs
  cover particular configurations
  ([Verification](../sel4/verification.md)).
- **A guest's `HVC` is not a VCPU fault.** `traps.S` sends exception
  class `0x16` to the system-call path, the same as `SVC` from a native
  thread. Guest `SMC` (trapped by `TSC`) is a VCPU fault.
- **Lazy switching leaves guest EL1 state loaded.** While a native
  thread runs after a guest, `armHSCurVCPU` still points at the guest's
  VCPU and the EL1 registers are the guest's. Code that reads VCPU
  registers must go through `readVCPUReg`, which checks whether the VCPU
  is the loaded one.
- **Few list registers.** `InjectIRQ` names the list register index
  explicitly and fails if it is occupied; the VMM keeps its own queue and
  refills on `VGICMaintenance`.
- **MCS: virtual interrupts can be dropped for now and re-raised.**
  `VPPIEvent` and `VGICMaintenance` return without delivering a fault if
  the current thread has no budget; they rely on the interrupt being
  level-triggered and firing again (comment in `vcpu.c`).
- **`CNTVOFF_EL2` matters without guests.** A non-hypervisor kernel
  entered via EL2 inherits whatever offset the loader left
  ([Arm boot flow](arm-boot.md)).

## See also

- [Virtualisation support](../sel4/hypervisor.md): the seL4 API and VMMs built on this
- [x86 virtualisation](x86-virtualisation.md): VT-x, for comparison
- [AArch64 paging](aarch64-paging.md): the table format stage 2 reuses
- [AArch64 exceptions](aarch64-exceptions.md): the exception mechanism a guest exit uses
- [GICv2](gicv2.md) and [GICv3 and the ITS](gicv3-its.md): list registers and the virtual CPU interface
- [Arm generic timer](arm-generic-timer.md): physical and virtual timers
- [PSCI and SMCCC](psci-smccc.md): what guests call and VMMs emulate
- [Arm boot flow](arm-boot.md): arriving at EL2, or leaving it
- [Cloud virtual machines](cloud-vms.md): being the guest

## References

- [Arm Architecture Reference Manual for A-profile, DDI 0487](https://developer.arm.com/documentation/ddi0487/latest):
  `HCR_EL2`, `VTTBR_EL2`, `VTCR_EL2`, `ESR_EL2`, `HPFAR_EL2` register
  descriptions (chapter D on AArch64 system registers); stage 2
  translation in the VMSA chapter. *Unchecked: developer.arm.com refuses
  scripted fetches.*
- [Learn the architecture: AArch64 virtualization](https://developer.arm.com/documentation/102142/latest):
  Arm's tutorial on stage 2, trapping, virtual interrupts and VHE.
  *Unchecked: same site.*
- [seL4 `include/arch/arm/armv/armv8-a/64/armv/vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/vcpu.h):
  `HCR_COMMON`, `HCR_NATIVE`, `HCR_VCPU` and the register accessors.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/vcpu.c):
  `vcpu_switch`, `vcpu_save`, `vcpu_restore`, `VPPIEvent`,
  `VGICMaintenance`, `handleVCPUFault` and the invocation decoders.
  *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/object/vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/object/vcpu.h):
  `struct vcpu`, `VPPIEventIRQ_t` and the `HCR_*` bit definitions. *Checked 2026-11-14.*
- [seL4 `libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h):
  the `seL4_VCPUReg_*` list, which is the saved register set.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S)
  and [`registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine/registerset.h):
  dispatch on exception class; values `0x24`, `0x20`, `0x15`, `0x16`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c):
  VMIDs stored per ASID, and `addressTranslateS1` in the fault path.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
