# LionsOS and libvmm

> LionsOS is Trustworthy Systems' operating system assembled from Microkit protection domains and sDDF drivers (file systems, network stack, language runtimes); libvmm is the companion library for writing virtual machine monitors that run Linux and other guests beside them.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [sDDF networking](sddf-net.md) · [CAmkES and capDL](camkes-capdl.md) →

Read first: [Microkit](microkit.md), [sDDF](sddf.md).

| At a glance | |
|---|---|
| Kind | Operating system kit (LionsOS) and VMM library (libvmm) |
| Repository | `au-ts/lionsos`, `au-ts/libvmm` |
| Key source | LionsOS `components/`, `examples`; libvmm `src/virtio/` |
| API | libvmm: a PD with a `virtual_machine` element; guest exits arrive at `fault` |
| Built on | [Microkit](microkit.md), [sDDF](sddf.md) |
| Verified | No; designed with verification in mind |

## What it is

### LionsOS

seL4 is a kernel, [Microkit](microkit.md) a way to describe static
systems on it, and [sDDF](sddf.md) a set of drivers. **LionsOS** adds
the remaining pieces of an operating system, each as a separate
protection domain (PD), and example systems that put them together. Its
README states the aim: embedded, IoT and cyber-physical systems, a
design that can be formally verified, adaptable to many uses, and
performance that sets "the benchmark" for microkernel-based systems, by
strict modularity and simplicity. It is not a POSIX system with
processes and a shell: a LionsOS system is a fixed graph of components
chosen at build time, and policy (who may talk to whom, which client
gets which device) is the system description.

The repository (`au-ts/lionsos`, default branch `main`) holds:

| Path | Contents |
|---|---|
| `components/fs` | file system servers behind one shared-memory file system protocol (`fat`: FAT on an sDDF block device; `nfs`: an NFS client over the network) |
| `components/micropython` | MicroPython as a PD with file and network access, used to script applications |
| `components/wamr` | the WebAssembly Micro Runtime as a PD |
| `lib` | support libraries, including a libc layer and POSIX-like shims for ported code |
| `examples` | `webserver` (MicroPython web server on lwIP with NFS), `kitty` (a point-of-sale style demonstrator with a display), `fileio`, `firewall`, `vmm`, `posix_test`, `wasm_test` |
| `dep` | git submodules: sDDF, libvmm and others |

Networking is sDDF's: the lwIP stack as a client of the
[network subsystem](sddf-net.md), and the `firewall` example routes
between two NICs with separate filter components. Systems are generated
with the same metaprogram tooling as sDDF's.

Status: research software under active development, as the README
says, with a roadmap and documentation at lionsos.org. The project
publishes performance comparisons against Linux, and verification work
targets individual components (drivers in the Pancake language, the
signalling protocol's models) and not the whole system.

### libvmm

A **virtual machine monitor** (VMM) is the user-level program that runs
beside a guest and emulates what the hardware virtualisation extensions
do not. On seL4 the kernel provides vCPU objects and delivers guest
exits as faults ([Virtualisation support](hypervisor.md)); everything
else is the VMM's job. **libvmm** (`au-ts/libvmm`) is a C library for
writing that VMM as a Microkit PD whose SDF entry contains a
`virtual_machine` element: the PD's `fault` entry point receives guest
exits and passes them to the library. It replaces, for Microkit, the
older `libsel4vm` used by CAmkES VMs.

![A Linux guest runs beside a VMM protection domain built with libvmm; the kernel delivers guest exits to the VMM's fault entry point, and the VMM implements the guest's virtio devices as clients of sDDF classes.](../images/lionsos-libvmm.svg)

*A libvmm VMM between a guest and the rest of the system: exits come up from the kernel as faults, and each virtio device (described below) is an sDDF client.*

What it supports, from its README:

| | Arm (AArch64) | x86-64 |
|---|---|---|
| Guests | Linux with an initrd, default kernel configuration | Linux with an initrd; EFI guests through TianoCore OVMF |
| CPUs | several vCPUs, started through emulated [PSCI](../concepts/psci-smccc.md) | one vCPU per VM (a Microkit limit) |
| Interrupt controller | virtual GIC using the hardware's virtualisation support ([GICv2](../concepts/gicv2.md), [Arm virtualisation](../concepts/arm-virtualisation.md)) | software-emulated [local APIC](../concepts/apic.md) in xAPIC mode and one I/O APIC |
| Firmware tables | device tree passed to the guest | emulated [ACPI](../concepts/acpi-tables.md) tables |
| [virtio](../concepts/virtio.md) transports | MMIO and PCI | PCI |

Guest devices are virtio: network (backed by an sDDF NIC through the
virtualisers, or by a virtual switch), block, console and sound, each
implemented in `src/virtio/` as a client of the corresponding sDDF
class. So a guest's disk is an sDDF block client like any native one.
Arm came first; x86-64 needs Microkit's `x86_64_generic_vtx` board and
an Intel CPU, since seL4 has no AMD-V support
([x86 virtualisation](../concepts/x86-virtualisation.md)).

**Driver VMs.** Where no native driver exists, a Linux guest can be
given the real device (its registers mapped into the guest and its
interrupt forwarded, "pass-through") and made to serve it to the rest
of the system over sDDF queues, using small user-space programs in the
guest (the UIO drivers in libvmm's `tools/linux/uio_drivers/`). This trades a large trusted guest for immediate hardware
support, and can be replaced by a native driver later without changing
clients.

### Who owns what

| Project | Home | Governance |
|---|---|---|
| seL4 kernel, proofs, Microkit, rust-sel4, CAmkES | GitHub `seL4` | seL4 Foundation: technical steering committee, RFCs, [contribution rules](contributing.md) |
| sDDF, libvmm, LionsOS, Acacia tooling | GitHub `au-ts` | Trustworthy Systems, UNSW Sydney; maintainers listed in each repository's `MAINTAINERS.md` |

The `au-ts` projects track Microkit releases closely (sDDF `main`
needs Microkit 2.4.0), and their needs drive many Microkit and some
kernel changes.

## In seL4

Not kernel code. Where a kernel or platform contributor meets these:

- **A new platform is judged by what runs on it.** After the kernel
  port ([Platform ports](platform-port.md)) and a Microkit board, the
  useful milestones are the sDDF serial, timer and `echo_server`
  examples, then a LionsOS example such as `webserver`.
- **Kernel features they depend on**: the [MCS](mcs.md) kernel, vCPU
  and virtual interrupt invocations, SMC forwarding on Arm, VT-x and
  I/O ports on x86, the IOMMU. A change to those is tested downstream
  by these projects' CI, not only by [sel4test](sel4test.md).
- **x86 cloud work** meets libvmm's ACPI and APIC emulation only when
  running guests; native components need PCI, MSI-X and NIC drivers in
  sDDF first.

## Gotchas

- **"LionsOS" is a kit, not a distribution.** There is no image to
  download and boot; you build an example for a board.
- **Dependencies are pinned as submodules** (`dep/`), each tracking a
  Microkit version: mixing a newer sDDF with an older LionsOS or SDK
  usually fails at build time.
- **x86 guests need bare-metal VT-x or nested virtualisation.** Most
  cloud instance types do not expose VT-x to guests, so libvmm on x86
  needs a metal instance or a type with nested virtualisation enabled
  ([cloud VMs](../concepts/cloud-vms.md)).
- **A driver VM is in the trusted computing base** of everything that
  uses its device.
- **Neither project is verified**, though both are designed with
  verification in mind.

## See also

- [Microkit](microkit.md): `virtual_machine` and `vcpu` in the SDF
- [sDDF](sddf.md) and [sDDF networking](sddf-net.md): the device layer underneath
- [Virtualisation support](hypervisor.md): the kernel's side of a VMM
- [CAmkES and capDL](camkes-capdl.md): the previous generation's component and VM framework
- [Ecosystem and repositories](ecosystem.md): the wider map of projects
- [Index](../INDEX.md): the reading order

## References

- [LionsOS `README.md`](https://github.com/au-ts/lionsos/blob/main/README.md) and repository listing (`components/`, `examples/`): aims, status, layout. *Checked 2026-11-14.*
- [libvmm `README.md`](https://github.com/au-ts/libvmm/blob/main/README.md), "Features": Arm and x86 support, guest facilities, dependencies. *Checked 2026-11-14.*
- [libvmm manual](https://github.com/au-ts/libvmm/blob/main/docs/MANUAL.md): how to write a VMM with it, passthrough, virtIO devices. *Checked 2026-11-14.*
- [libvmm `tools/linux/`](https://github.com/au-ts/libvmm/tree/main/tools/linux): the guest-side UIO library and drivers (repository listing). *Checked 2026-11-14.*
- [LionsOS documentation](https://lionsos.org/docs/): examples, components, status and roadmap. *Checked 2026-11-14.*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md), "Virtual Machines" and "x86-64 generic (with VT-x)": one VM per PD, one vCPU per x86 VM, Intel only. *Checked 2026-11-14.*
- Heiser and others, ["Fast, Secure, Adaptable: LionsOS Design, Implementation and Performance"](https://arxiv.org/abs/2501.06234): the design paper (arXiv abstract page). *Checked 2026-11-14.*
