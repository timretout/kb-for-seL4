# Cloud virtual machines

> What hardware Amazon EC2, Google Compute Engine and Azure present to a guest kernel, and how that differs from a PC or a development board: custom network and disk devices, missing legacy devices, UEFI with ACPI on every architecture, and a serial log as the only debug channel.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Virtual and cloud machines](../INDEX.md#virtual-and-cloud-machines) · ← [QEMU](qemu.md) · [Amazon EC2 and the Nitro system](ec2.md) →

Read first: [PCI](pci.md), [ACPI tables](acpi-tables.md), [IRQs](irq.md).

| At a glance | |
|---|---|
| Kind | Survey: the hardware EC2, Compute Engine and Azure present to a guest kernel |
| Firmware | [UEFI](uefi.md) (EDK II) with [ACPI tables](acpi-tables.md); ACPI only on Arm |
| Devices | The provider's own NIC and disk: [ENA](ena.md) and [NVMe](nvme.md) on EC2; virtio, [gVNIC](gvnic.md) and NVMe on Compute Engine |
| Console | The first serial port, logged by the provider; the only debug channel |
| Clock | The [TSC](tsc.md), frequency measured or read from a [hypervisor CPUID leaf](hypervisor-cpuid-leaves.md) |
| seL4 use | No cloud platform upstream; `pc99` covers EC2 and Compute Engine VMs, Arm needs a platform per machine layout |

## What it is

A cloud virtual machine (an EC2 *instance*, a Compute Engine *VM*) is a
guest on a hypervisor in somebody else's data centre. To a kernel it is
a small, odd computer: the CPU is real and recent, and nearly everything
else is emulated or paravirtual, chosen by the provider for its own
fleet and not for compatibility with hobby operating systems. Linux and
Windows are the only guests the providers test.

seL4 development normally targets [QEMU](qemu.md) or a board on the
desk. A cloud VM differs from both in the same handful of ways.

![A guest kernel on a cloud runs on a real, recent CPU above the provider's hypervisor, boots through UEFI firmware with ACPI tables, and sees emulated or paravirtual devices: the provider's own NIC and disk, some legacy PC devices, and a first serial port whose output goes to the provider's log.](../images/cloud-vms-guest-view.svg)

*Only the CPU is real. Everything in a dashed box is the provider's
choice, and the serial port is the one way out.*

### Devices are the provider's own

A PC has an Intel NIC and an AHCI disk; QEMU offers `e1000` or
[virtio](virtio.md). A cloud offers one or two devices of its own
design, found as [PCI](pci.md) functions, and nothing else:

- EC2: the [ENA](ena.md) network adapter and [NVMe](nvme.md)
  controllers for both network (EBS) and local disks.
- Compute Engine: legacy virtio-net and virtio-scsi on older machine
  series, [gVNIC](gvnic.md) and NVMe on newer ones.
- Azure: *synthetic* devices that are not on PCI at all. They sit on
  VMBus, Hyper-V's message channel between guest and host; Linux's
  drivers for them are `netvsc` for network and `storvsc` for disks.

So an operating system with no driver for the provider's NIC has no
network there, whatever else works.

### Legacy devices come and go

x86 kernels lean on PC devices from the 1980s for early boot. Whether
each exists is the provider's choice (observed 2026 on the types named
in the per-cloud pages; Azure on one `Standard_D2s_v5`):

| Device | EC2 Nitro | Compute Engine | Azure Gen2 |
|---|---|---|---|
| [PIT](pit.md) | yes | yes | no |
| [HPET](hpet.md) | yes, 32-bit counter | no | no |
| 8259 PIC | not recorded | not recorded | no ("NULL legacy PIC") |
| I/O APIC, 24 pins | yes | yes | yes |
| COM1 16550 at `0x3f8` | yes | yes, and three more | yes |
| PS/2 controller | not recorded | yes | no |
| VGA | yes (an Amazon PCI device) | no | no (a synthetic framebuffer) |
| CMOS RTC | not recorded | not recorded | yes (Hyper-V virtualises one) |

A kernel that calibrates its timers against the PIT, as seL4's x86
kernel does, therefore has a problem on Azure that it does not have on
the other two.

### Firmware: UEFI and ACPI everywhere

Current instance types boot through [UEFI](uefi.md) firmware (EDK II on
all three clouds) and describe their hardware with
[ACPI tables](acpi-tables.md). EC2's x86 types and Compute Engine's
older ones also offer a legacy BIOS; Azure's Generation 1 VMs are
BIOS-only and Generation 2 UEFI-only.

The important consequence is on Arm. Boards hand the kernel a device
tree; every cloud Arm VM offers **ACPI only**. seL4 and its loader take
their hardware description from a device tree at build time, so a port
has to write that device tree by hand from the ACPI tables, or teach
the loader to read ACPI. Arm guests are entered at EL1 (EL2 is the
hypervisor's), and start other cores with PSCI.

### Time under a hypervisor

- The [TSC](tsc.md) is the good clock: constant-rate and synchronised
  across vCPUs on all current types. Its frequency is not printed
  anywhere a simple kernel looks; it must be measured against another
  timer ([timer calibration](timer-calibration.md)) or read from a
  [hypervisor CPUID leaf](hypervisor-cpuid-leaves.md).
- Emulated timers (PIT, HPET) cost a trap to the hypervisor on each
  access and can behave unlike the chips they imitate.
- The [local APIC timer](lapic-timer.md) is emulated too; TSC-deadline
  mode is offered on some types and not others.
- A vCPU can be descheduled for milliseconds at any point, so a
  calibration loop can be wrong by a large factor once in a while.
- On Arm, the [generic timer](arm-generic-timer.md) is used directly
  and `CNTFRQ_EL0` is whatever the provider set: 25 MHz on Altra-based
  types, 1 GHz on Google's Axion (observed).

### Debugging and the working loop

There is no JTAG, no screen and no reset button. The debug channel is
the first serial port, whose output the provider logs and lets the
owner fetch afterwards, with an interactive connection as an option. A
kernel that hangs before its first character prints nothing, and
nothing can be asked of it. See [UARTs](uart.md).

Each try means building a disk image, uploading it, registering it,
starting an instance and waiting for the log: minutes, against seconds
under QEMU. See [Booting a custom kernel on a cloud](cloud-boot-images.md).
Instances cost money by the second while they run, and a forgotten one
keeps costing; small types are cents per hour, bare-metal types
dollars.

### The three clouds side by side

EC2 and Compute Engine rows are observed (2026) or from their pages
here; the Azure column is from Microsoft's pages and Linux's Hyper-V
documentation (References) except where "observed" appears.

| | EC2 (Nitro) | Compute Engine | Azure |
|---|---|---|---|
| Hypervisor | KVM-based, Amazon's device model, devices on Nitro cards | KVM, Google's device model | Hyper-V |
| x86 firmware | UEFI or legacy BIOS, chosen per image | UEFI; BIOS on older series | Gen1 BIOS, Gen2 UEFI |
| Arm firmware | UEFI, ACPI only | UEFI, ACPI only | UEFI, ACPI only (observed) |
| NIC | ENA | virtio-net (gen 1, 2), gVNIC | VMBus `netvsc`; MANA or Mellanox virtual functions for speed |
| Disk | NVMe | virtio-scsi (gen 1, 2), NVMe | VMBus `storvsc`; NVMe on newest sizes |
| Console | COM1, 16550; Arm a 16550 at `0x090a0000` | COM1 of four; Arm PL011 at `0x09000000` | COM1 (observed) |
| x86 interrupts | local APIC, one I/O APIC | the same | the same (observed) |
| Arm interrupts | GICv3 with ITS | GICv3 with ITS | GICv3, no ITS, a GICv2m MSI frame (observed) |
| x86 timers | PIT, 32-bit HPET, TSC | PIT, TSC, `kvm-clock` | Hyper-V synthetic timers, TSC; no PIT (observed) |
| Arm CPUs | Graviton 2 to 4 | Ampere Altra (T2A), Axion (C4A, N4A) | Ampere Altra, Cobalt |
| PSCI conduit on Arm | `hvc` | `hvc` | `smc` (observed) |
| Nested virtualisation | on request, some types | on request, mostly Intel series | offered by default on the type observed |
| Bare metal | `.metal` types | `-metal` types (C3, C4, C4A...) | not looked into |

Older EC2 types (`t2`, and others before 2017) run on Xen, not Nitro,
and are a different machine again; ignore them for new work.

For detail: [Amazon EC2 and the Nitro system](ec2.md) with
[EC2 instance types](ec2-instance-types.md), and
[Google Compute Engine](gce.md) with
[Compute Engine machine types](gce-machine-types.md).

## In seL4

Upstream seL4 has no cloud platform. The x86 kernel's one platform,
`pc99`, covers EC2 and Compute Engine VMs as PCs; Arm needs a platform
per machine layout (see [platform port](../sel4/platform-port.md)).
A port is this checklist:

| Need | x86 | Arm | Pages |
|---|---|---|---|
| Boot path | GRUB as an EFI program, Multiboot2 | UEFI application: the elfloader's EFI image | [cloud boot images](cloud-boot-images.md), [x86 boot](x86-boot.md), [elfloader](../sel4/elfloader.md) |
| Console | COM1, `0x3f8` | the cloud's UART and its address | [UARTs](uart.md) |
| Interrupt controller | I/O APIC, found from the MADT | GICv3 at the cloud's addresses | [APIC](apic.md), [GICv3 and ITS](gicv3-its.md), [IRQ handling](../sel4/irq-handling.md) |
| Timer | APIC timer or TSC deadline, calibrated against the PIT | generic timer, frequency fixed at build time | [timer calibration](timer-calibration.md), [arm generic timer](arm-generic-timer.md) |
| Device discovery | ACPI root pointer from Multiboot2, PCI by user level | hand-written device tree | [ACPI tables](acpi-tables.md), [PCI](pci.md) |
| Device interrupts | MSI or MSI-X vectors | LPIs through the ITS, not in upstream seL4 | [MSI and MSI-X](msi-msix.md) |
| NIC and disk drivers | user level, in sDDF | the same | [sDDF networking](../sel4/sddf-net.md), [ENA](ena.md), [gVNIC](gvnic.md), [NVMe](nvme.md) |

[sel4test](../sel4/sel4test.md) needs only the first four rows, which
is why it is the first thing to boot.

## Gotchas

- **"It works in QEMU" proves little.** QEMU has a 64-bit HPET, the
  PIT on I/O APIC pin 2, modern virtio and a device tree on Arm; the
  clouds differ on each point. Configure QEMU to resemble the target
  (`hpet=off`, legacy virtio) before trusting a local pass.
- **The PIT's pin**: EC2 and Compute Engine route IRQ 0 to I/O APIC pin
  0, with no interrupt source override, where most PCs use pin 2.
- **Same cloud, different machine**: device sets change between
  generations of instance type, and bare-metal types share nothing with
  the VMs of the same name.
- **Secure Boot** may be on by default (Azure's Trusted Launch) or off
  (Compute Engine); an unsigned boot loader needs it off.
- **Console logs are delayed and truncated**: EC2's
  `get-console-output` lags and returns a limited tail; Compute Engine
  keeps 1 MiB per port and discards it with the instance.

## See also

- [Amazon EC2 and the Nitro system](ec2.md), [Google Compute Engine](gce.md): the per-cloud pages
- [Booting a custom kernel on a cloud](cloud-boot-images.md): images, import and console capture
- [QEMU](qemu.md): the local stand-in
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): how a guest tells where it is
- [Arm boot flow](arm-boot.md): the chain from reset to a kernel on a 64-bit Arm machine
- [Arm virtualisation (EL2)](arm-virtualisation.md): what exception level 2 adds to an Arm core so that a hypervisor can run guests
- [CPUID and MSRs](cpuid-and-msrs.md): how x86 software discovers what the processor can do
- [IOMMUs: VT-d and SMMU](iommu.md): an IOMMU translates and restricts the memory addresses devices use for DMA, which is what keeps a...
- [Privilege levels](privilege-levels.md): the CPU modes that separate user code, kernel, hypervisor and firmware on x86
- [x86 virtualisation (VT-x)](x86-virtualisation.md): intel's hardware support for running guest operating systems
- [Virtualisation support](../sel4/hypervisor.md): seL4 can host virtual machines

## References

- [Compute Engine: machine families resource and comparison guide](https://docs.cloud.google.com/compute/docs/machine-resource):
  NIC, disk interface, nested virtualisation and bare metal per series. *Checked 2026-11-14.*
- [Compute Engine: troubleshooting using the serial console](https://docs.cloud.google.com/compute/docs/troubleshooting/troubleshooting-using-serial-console):
  four ports, 1 MiB kept. *Checked 2026-11-14.*
- [Linux KVM documentation, "Timekeeping Virtualization for X86-Based Architectures"](https://docs.kernel.org/virt/kvm/x86/timekeeping.html):
  why emulated timers and the TSC behave as they do in a guest. *Checked 2026-11-14.*
- [AWS: The Security Design of the AWS Nitro System, "The components of the Nitro System"](https://docs.aws.amazon.com/whitepapers/latest/security-design-of-aws-nitro-system/the-components-of-the-nitro-system.html):
  the hypervisor and Nitro cards. *Checked 2026-11-14.*
- [Azure support for Generation 2 VMs](https://learn.microsoft.com/en-us/azure/virtual-machines/generation-2):
  BIOS (Generation 1) against UEFI (Generation 2). *Checked 2026-11-14.*
- [Linux documentation, "VMBus"](https://docs.kernel.org/virt/hyperv/vmbus.html):
  Hyper-V's synthetic devices, `netvsc` and `storvsc`, the synthetic
  frame buffer. *Checked 2026-11-14.*
- [Linux documentation, Hyper-V "Clocks and Timers"](https://docs.kernel.org/virt/hyperv/clocks.html):
  synthetic timers and the TSC; a PIT on Generation 1 only; a
  virtualised RTC; no HPET. *Checked 2026-11-14.*
- [Azure: Microsoft Azure Network Adapter (MANA) overview](https://learn.microsoft.com/en-us/azure/virtual-network/accelerated-networking-mana-overview)
  and [NVMe overview](https://learn.microsoft.com/en-us/azure/virtual-machines/nvme-overview):
  MANA and Mellanox NICs beside the virtual switch; NVMe disks on the
  v6 and later sizes. *Checked 2026-11-14.*
- Azure: [Dpsv5 size series](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dpsv5-series)
  and [Cobalt processor-based virtual machines](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/cobalt-overview):
  the Ampere Altra and Cobalt 100 Arm sizes. *Checked 2026-11-14.*
