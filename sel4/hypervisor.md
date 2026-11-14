# Virtualisation support

> seL4 can host virtual machines: the kernel supplies only VCPU objects and second-stage address spaces, and a user-level virtual machine monitor per guest does everything else, so a guest and its monitor are no more trusted than any other component.

Read first: [Threads and TCBs](threads.md), [Faults and fault handlers](faults.md), [Address spaces (VSpace)](vspace.md).

## What it is

A **hypervisor** runs whole operating systems as guests, each in a
**virtual machine** (VM) that looks to the guest like a computer. Linux
with KVM, Xen and the clouds' hypervisors put much of that in privileged
code. seL4 splits it in two:

```
  +-----------+   +-----------+   +---------------------+
  | guest OS  |   | guest OS  |   | native components   |
  | (Linux)   |   |           |   | (drivers, services) |
  +-----------+   +-----------+   +---------------------+
  |   VMM 1   |   |   VMM 2   |      user level, unprivileged
  +===========+===+===========+===========================+
  |  seL4 in hypervisor mode: VCPUs, stage 2 tables, IPC  |
  +-------------------------------------------------------+
```

- **The kernel** runs in the CPU's hypervisor mode and provides
  mechanism: a **VCPU** object holding a guest's privileged register
  state, address spaces in the hardware's second-stage format (the
  translation from "guest-physical" to real physical addresses), world
  switching between guests and native threads, and delivery of guest
  exits to user level.
- **The virtual machine monitor (VMM)** is an ordinary user-level
  thread, one (or one address space) per VM. It loads the guest
  image, receives every exit the kernel cannot handle itself, emulates
  devices, injects virtual interrupts and resumes the guest.

A guest virtual CPU is a thread: a TCB with a VCPU bound to it, whose
VSpace is the guest's physical memory map. Its priority, scheduling
context ([MCS](mcs.md)) and affinity are the TCB's, so the ordinary
scheduler schedules guests. The VMM holds capabilities only to its own
guest's memory, VCPUs and devices.

The point of the split is the **trusted computing base** (TCB, the code
that must be correct for a property to hold; not the thread control
block). A VMM contains instruction decoders and device models, the
bug-prone part of any hypervisor. Here a compromised guest that takes
over its VMM gains what the VMM's capabilities allow: its own VM. Other
VMs and native components depend on the kernel alone. That is what
makes "a Linux VM for the legacy stack beside small trusted native
components" a reasonable architecture, and it is the design the
DARPA HACMS vehicles used (unchecked) ([History and key papers](history-and-papers.md)).

The hardware mechanisms are described in
[Arm virtualisation (EL2)](../concepts/arm-virtualisation.md) and
[x86 virtualisation (VT-x)](../concepts/x86-virtualisation.md); those
pages also walk through the kernel code. This page is the model and the
API as a VMM author sees it.

### The three architectures

| | Arm | x86 | RISC-V |
|---|---|---|---|
| Option | `KernelArmHypervisorSupport` | `KernelVTX` | none |
| Kernel runs at | EL2 instead of EL1 | VMX root mode, ring 0 as usual | S-mode only |
| VCPU object | `seL4_ARM_VCPUObject` (4 KiB on AArch64) | `seL4_X86_VCPUObject` | none |
| Guest memory | The thread's ordinary VSpace (every VSpace is stage 2) | Separate EPT objects | none |
| How the VMM gets exits | Fault IPC on the guest thread's fault endpoint | Return value of `seL4_VMEnter` | n/a |
| Vendor limits | GICv2 or GICv3 with virtualisation; AArch32 needs the ARMv7 virtualisation extensions | Intel VT-x only; no AMD SVM | n/a |
| Verified configuration | Yes | No | n/a |

**Arm.** The option moves the whole kernel to EL2, the exception level
above the guest OS's. Invocations on a VCPU capability:
`seL4_ARM_VCPU_SetTCB` (bind to a thread), `seL4_ARM_VCPU_ReadRegs` and
`WriteRegs` (the guest's EL1 system registers), `seL4_ARM_VCPU_InjectIRQ`
(place a virtual interrupt in a GIC list register) and
`seL4_ARM_VCPU_AckVPPI` (re-enable a per-CPU virtual interrupt, in
practice the virtual timer). The VMM is the guest thread's fault
handler and sees four kinds of message:

| Fault | Meaning |
|---|---|
| `seL4_Fault_VMFault` | The guest touched guest-physical memory with no mapping: an emulated device's registers. The VMM decodes the access and emulates it |
| `seL4_Fault_VCPUFault` | Another trapped guest exception, with the syndrome register `HSR`/`ESR_EL2`: `WFI`, a trapped system register, a hypercall |
| `seL4_Fault_VGICMaintenance` | A list register emptied; the VMM can inject the next pending virtual interrupt |
| `seL4_Fault_VPPIEvent` | A physical per-CPU interrupt owned by the guest fired (the virtual timer); inject it and later `AckVPPI` |

`seL4_Fault_UnknownSyscall` covers the guest's `SVC`-class traps that
reach EL2 (unchecked). Replying to the fault message resumes the guest,
optionally with modified registers, as for any fault. With
`KernelAllowSMCCalls` the VMM can also be given a capability to forward
a guest's `SMC` firmware calls ([PSCI and SMCCC](../concepts/psci-smccc.md));
without it the VMM emulates PSCI itself.

**x86.** `KernelVTX` adds VCPU objects holding a VMCS (the
hardware-defined control structure for one virtual CPU) and four EPT
object types (`seL4_X86_EPTPML4Object` down to `seL4_X86_EPTPTObject`)
that form the guest-physical address space, built with their own `Map`
invocations and `seL4_X86_Page_MapEPT`. VCPU invocations:
`seL4_X86_VCPU_SetTCB`, `ReadVMCS`/`WriteVMCS` (a whitelist of fields),
`ReadMSR`/`WriteMSR`, `WriteRegisters`, and
`EnableIOPort`/`DisableIOPort` (let the guest reach real I/O ports the
VMM holds a capability for). The control flow differs from Arm: there
is no separate guest thread. The VMM thread itself calls
**`seL4_VMEnter`**, a system call, and *becomes* the guest until an
exit the kernel cannot absorb; the call then returns
`SEL4_VMENTER_RESULT_FAULT` with the exit in message registers:

| Message register | Content |
|---|---|
| `SEL4_VMENTER_CALL_EIP_MR`, `..._CONTROL_PPC_MR`, `..._INTERRUPT_INFO_MR` | In and out: guest instruction pointer, primary processor-based controls, event to inject on entry |
| `SEL4_VMENTER_FAULT_REASON_MR`, `..._QUALIFICATION_MR` | The VT-x exit reason and qualification |
| `SEL4_VMENTER_FAULT_INSTRUCTION_LEN_MR`, `..._GUEST_PHYSICAL_MR`, `..._RFLAGS_MR`, `..._GUEST_INT_MR`, `..._CR3_MR` | What is needed to decode and skip the instruction |
| `SEL4_VMENTER_FAULT_EAX` ... | The guest's general registers |

It returns `SEL4_VMENTER_RESULT_NOTIF` instead when the thread's bound
[notification](notifications.md) has a signal, which is how device
interrupts and other events reach a VMM that is "inside" its guest.
`KernelX86_64VTX64BitGuests` (default off) is needed for 64-bit guests.

**RISC-V.** Upstream `master` has no support for the RISC-V hypervisor
(H) extension: there is no VCPU object, no option, and nothing under
`src/arch/riscv` for it. A pull request with hypervisor changes
(seL4/seL4#971) was closed unmerged. Out-of-tree work exists
(unchecked).

### Verification

Arm hypervisor mode is verified: `configs/ARM_HYP_verified.cmake`
(AArch32, the Jetson TK1 platform) and `configs/AARCH64_verified.cmake`
and its per-board variants, all of which set
`KernelArmHypervisorSupport ON`. On AArch64 the *only* verified
configurations are hypervisor ones. The proofs cover the kernel,
VCPU handling included, to the depth stated for each configuration
([The seL4 proofs](verification.md)); they say nothing about any VMM.
`KernelVTX` is in no verified configuration.

### The VMMs

| VMM | Framework | Architectures | State |
|---|---|---|---|
| [libvmm](https://github.com/au-ts/libvmm) | [Microkit](microkit.md), with [sDDF](sddf.md) | AArch64; x86-64 (one vCPU per guest) | Active; the choice for new work. See [LionsOS and libvmm](lionsos.md) |
| libsel4vm, libsel4vmmplatsupport in [seL4_projects_libs](https://github.com/seL4/seL4_projects_libs) | seL4_libs | Arm, x86 | The older library pair |
| [CAmkES VM](https://github.com/seL4/camkes-vm) | [CAmkES](camkes-capdl.md), on libsel4vm | Arm, x86 | Maintained; legacy for new designs |

All do the same jobs: place a kernel, device tree or ACPI tables and
initial RAM disk in guest memory, emulate the interrupt controller's
software-visible part (the GIC distributor on Arm; the local APIC and
I/O APIC on x86), emulate or forward firmware calls, and provide
devices. For devices there are two approaches, usually mixed:

- **Pass-through.** Map a real device's MMIO frames into the guest and
  route its interrupt to the VMM, which injects it. The guest's own
  driver runs unmodified at full speed. But a device that does DMA can
  read and write any physical memory unless an
  [IOMMU](../concepts/iommu.md) confines it, and a passed-through
  device belongs to one guest.
- **[virtio](../concepts/virtio.md) emulation.** The VMM presents a
  virtio network, block or console device and backs it with a native
  driver elsewhere in the system (in LionsOS, an sDDF driver shared
  with native clients). The guest needs only virtio drivers, the real
  driver stays out of the guest, and one device serves many clients.

A common third pattern is the **driver VM**: a Linux guest given a
device by pass-through purely to reuse its driver, serving native
components over virtio or shared memory.

### On clouds

To host VMs, seL4 must itself run in hypervisor mode, which a cloud
guest can do only if the cloud exposes **nested virtualisation**. Most
instance types do not: EC2's virtualised instances historically offer
no VT-x or EL2 to the guest and only bare-metal types do, and Compute
Engine enables nested VT-x per VM on some Intel families only
(unchecked: both change; see [EC2 instance types](../concepts/ec2-instance-types.md)
and [Compute Engine machine types](../concepts/gce-machine-types.md)).
Where it is absent seL4 runs perfectly well as a guest, but with
`KernelVTX` or `KernelArmHypervisorSupport` off; on Arm that means a
kernel entered at EL1 and, today, an unverified configuration.
[Cloud virtual machines](../concepts/cloud-vms.md) covers what the
guest side looks like.

## In seL4

- Arm: [`src/arch/arm/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/vcpu.c)
  (`decodeARMVCPUInvocation`, `vcpu_switch`, `handleVCPUFault`,
  `VGICMaintenance`, `VPPIEvent`), per-mode register save and restore
  in `include/arch/arm/arch/{32,64}/mode/object/vcpu.h` and the
  `armv/vcpu.h` headers. Options in
  [`src/arch/arm/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/arm/config.cmake):
  `KernelArmHypervisorSupport`, `KernelArmDisableWFIWFETraps` (let
  guests idle without exiting), `KernelAllowSMCCalls`,
  `KernelArmPASizeBits40`/`44`. The mode is also selectable as the
  `arm_hyp` sel4arch for AArch32.
- x86: [`src/arch/x86/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/vcpu.c)
  (`vtx_init`, `decodeX86VCPUInvocation`, `handleVmexit`), EPT in
  `src/arch/x86/kernel/ept.c`, the message layout in
  [`libsel4/arch_include/x86/sel4/arch/vmenter.h`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/sel4/arch/vmenter.h).
- `seL4_VMEnter` sits in the debug section of `syscall.xml` under
  `CONFIG_VTX`; it is a real system call despite the placement.
- VCPU objects are created by `seL4_Untyped_Retype` like any other
  ([Kernel objects](kernel-objects.md)) and destroyed by deleting the
  last capability, which also unbinds the TCB.
- Microkit declares a VM as a `<virtual_machine>` child of a protection
  domain, which becomes the VMM and receives the guest's faults
  ([Microkit](microkit.md)).

## Gotchas

- **Hypervisor support changes the kernel for everyone on Arm.** With
  the option on, native threads also live under stage 2 tables with a
  smaller virtual address space, and the kernel must be entered at EL2;
  a board or cloud whose firmware starts the kernel at EL1 cannot run
  that build at all. The elfloader checks and drops or refuses
  accordingly ([Elfloader](elfloader.md)).
- **One VCPU per TCB, one TCB per VCPU.** A multi-core guest is several
  threads; starting secondary virtual CPUs is the VMM's job, by
  emulating PSCI `CPU_ON` on Arm.
- **The VMM is outside the kernel's TCB but inside the guest's.** It
  can read and corrupt its guest freely. Isolation *between* VMs comes
  from separate VMMs with disjoint capabilities; one VMM serving two
  guests gives that up.
- **Pass-through without an IOMMU breaks isolation** for any
  DMA-capable device: the guest can program the device to overwrite
  kernel memory. libvmm's README lists this as a current limitation on
  Arm.
- **Interrupt injection can fail.** `seL4_ARM_VCPU_InjectIRQ` targets a
  specific list register and fails if it is occupied; the VMM keeps its
  own queue and refills on `VGICMaintenance`.
- **x86 guest time and APIC are emulated in user level**, so a guest's
  timer interrupts cost a round trip through the VMM; libvmm's README
  describes a software xAPIC and a single-vCPU limit.
- **"Verified hypervisor" means the kernel.** The Arm proofs do not
  cover a VMM, the guest, or (as on every platform) boot code and
  drivers.

## See also

- [Arm virtualisation (EL2)](../concepts/arm-virtualisation.md): the hardware and the kernel code path on Arm
- [x86 virtualisation (VT-x)](../concepts/x86-virtualisation.md): VMCS, EPT, exits, and the kernel code path on x86
- [LionsOS and libvmm](lionsos.md): the current VMM and the system built around it
- [CAmkES and capDL](camkes-capdl.md): the framework of the older CAmkES VM
- [virtio](../concepts/virtio.md): the device model VMMs emulate
- [IOMMUs](../concepts/iommu.md): what makes pass-through safe
- [Faults and fault handlers](faults.md): the delivery mechanism the Arm VMM uses
- [Cloud virtual machines](../concepts/cloud-vms.md): seL4 as a guest
- [Privilege levels](../concepts/privilege-levels.md): the CPU modes that separate user code, kernel, hypervisor and firmware on x86

## References

- [seL4 `src/arch/arm/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/vcpu.c)
  and [`libsel4/arch_include/arm/interfaces/object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/arm/interfaces/object-api-arch.xml):
  the Arm VCPU invocations. *Checked 2026-11-14.*
- [seL4 `libsel4/arch_include/x86/interfaces/object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml)
  and [`vmenter.h`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/sel4/arch/vmenter.h):
  x86 VCPU and EPT invocations, the `seL4_VMEnter` message layout.
  *Checked 2026-11-14.*
- [seL4 `configs/include/AARCH64_verified_include.cmake`](https://github.com/seL4/seL4/blob/master/configs/include/AARCH64_verified_include.cmake)
  and [`configs/ARM_HYP_verified.cmake`](https://github.com/seL4/seL4/blob/master/configs/ARM_HYP_verified.cmake):
  hypervisor support in verified configurations. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv`](https://github.com/seL4/seL4/tree/master/src/arch/riscv):
  searched for VCPU or hypervisor code, none found; pull request
  [#971](https://github.com/seL4/seL4/pull/971) is closed.
  *Checked 2026-11-14.*
- [libvmm README](https://github.com/au-ts/libvmm): features per
  architecture, virtio devices, limitations. *Checked 2026-11-14.*
- [camkes-vm README](https://github.com/seL4/camkes-vm) and
  [seL4_projects_libs README](https://github.com/seL4/seL4_projects_libs):
  the older VMM stack; the READMEs were opened but libsel4vm's
  internals were not read. *Checked 2026-11-14.*
- [seL4 reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  the virtualisation sections of the architecture chapters.
  *Unchecked: PDF not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
