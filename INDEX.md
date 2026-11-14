# Index

Every page, with its summary, arranged as a course: read top to bottom,
or jump to what you need. Pages marked "Stub" are planned and not yet
written. [GLOSSARY.md](GLOSSARY.md) lists terms and abbreviations with
the page that explains each.

## Part 1: Orientation

What seL4 is and how the project fits together. Read these first.

- [seL4 overview](sel4/overview.md): seL4 is a small, fast, capability-based microkernel with a machine-checked proof that its C code implements its specification; it provides threads, address spaces, IPC and access control, and leaves drivers, file systems and all policy to user level.
- [Ecosystem and repositories](sel4/ecosystem.md): Stub: the repositories and components around the kernel (seL4_tools, seL4_libs, util_libs, sel4test, Microkit, sDDF, LionsOS, CAmkES, capDL, rust-sel4, l4v) and how they depend on each other.
- [History and key papers](sel4/history-and-papers.md): Stub: the L4 lineage, seL4's timeline, and a reading list of the papers and documents worth knowing.

## Part 2: Processor fundamentals

Ideas every architecture shares, then x86-64, AArch64 and RISC-V in turn. seL4's kernel is mostly a thin layer over these mechanisms, so its code reads easily once they are familiar.

### Common ideas

- [Privilege levels](concepts/privilege-levels.md): The CPU modes that separate user code, kernel, hypervisor and firmware on x86 (rings, VMX root, SMM), Arm (EL0 to EL3) and RISC-V (U, S, M): seL4 runs in ring 0, EL1 or EL2, or S-mode, and something more privileged usually sits beneath it.
- [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md): Stub: how a CPU enters the kernel: synchronous exceptions, system calls and asynchronous interrupts, vectors, saved state, and return; the architecture-neutral picture.
- [Virtual memory](concepts/virtual-memory.md): Stub: page tables, multi-level translation, TLBs, ASIDs, large pages and the kernel/user split, independent of architecture.
- [FPU and SIMD state](concepts/fpu-state.md): Stub: floating-point and vector register state, lazy against eager switching, XSAVE on x86, and how seL4 handles it.
- [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md): Stub: how secondary cores are started and how cores interrupt each other on x86 (INIT/SIPI), Arm (PSCI) and RISC-V (SBI HSM).
- [ELF and linking](concepts/elf.md): Stub: the ELF format, segments against sections, linker scripts, physical against virtual load addresses; what the kernel image, elfloader and Microkit do with ELF files.

### x86-64

- [x86-64 basics](concepts/x86-64-basics.md): The registers, operating modes, leftover segmentation (GDT, TSS, FS and GS bases), control registers and calling convention of 64-bit x86, as much as is needed to read seL4's `src/arch/x86/64/`.
- [CPUID and MSRs](concepts/cpuid-and-msrs.md): How x86 software discovers what the processor can do (the `cpuid` instruction) and reaches the hundreds of control registers that have no instruction of their own (`rdmsr`/`wrmsr`); seL4 checks features at boot and programs a dozen MSRs.
- [x86-64 paging](concepts/x86-paging.md): How x86-64 translates 48-bit virtual addresses through four levels of 512-entry tables rooted at `CR3`, with the entry flags, large pages, PCIDs and TLB rules a kernel must respect; seL4 exposes each level as an object type and keeps its own window in the top 512 GiB.
- [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md): How an x86-64 CPU enters the kernel (through the IDT for exceptions and interrupts, through `syscall` or `sysenter` for system calls), what it saves and where, and how seL4's `traps.S` turns each entry into a saved register context in the current TCB.
- [I/O ports and MMIO](concepts/io-ports.md): x86's separate 16-bit address space for device registers, reached with the `in` and `out` instructions; seL4 keeps user threads away from the instructions and hands out ranges of ports as IOPort capabilities.
- [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md): Stub: how a PC gets from reset to a kernel: BIOS or UEFI, the boot loader, Multiboot 1 and 2, and the state seL4 expects on entry.
- [UEFI](concepts/uefi.md): Stub: the firmware interface that replaced the BIOS on PCs and is standard on Arm servers: boot services, the memory map, configuration tables, and what a kernel inherits from it.
- [8259 PIC](concepts/pic-8259.md): Stub: the original PC interrupt controller pair, why it must still be masked or remapped, and seL4's use of it.
- [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md): Stub: VMX root and non-root operation, the VMCS, VM exits, EPT, and what a guest kernel can and cannot see.

### AArch64

- [AArch64 basics](concepts/aarch64-basics.md): The 64-bit Arm execution state: 31 general registers, a stack pointer per exception level, PSTATE, and hundreds of system registers read with `MRS` and written with `MSR`; every line of seL4's Arm code assumes them.
- [AArch64 exceptions](concepts/aarch64-exceptions.md): How an AArch64 core enters and leaves a higher exception level: a 16-entry vector table at `VBAR_ELx`, the syndrome in `ESR_ELx`, the return state in `ELR_ELx` and `SPSR_ELx`, and `ERET`; seL4's whole kernel entry and exit is built on it.
- [AArch64 paging](concepts/aarch64-paging.md): AArch64 address translation: two page table roots (`TTBR0` for the low half of the address space, `TTBR1` for the high half), up to four levels of 4 KiB tables, ASIDs to tag TLB entries, and an optional second stage for hypervisors; seL4's VSpace objects are these tables.
- [Arm boot flow](concepts/arm-boot.md): Stub: from reset through TF-A and U-Boot or UEFI to a kernel: exception level on entry, the image header, and where the elfloader fits.
- [PSCI and SMCCC](concepts/psci-smccc.md): Stub: the Arm firmware calling convention and the power-state interface used to start and stop cores.
- [GICv2](concepts/gicv2.md): Stub: the older Arm interrupt controller (distributor and memory-mapped CPU interface), interrupt types (SGI, PPI, SPI), and seL4's driver.
- [Arm virtualisation (EL2)](concepts/arm-virtualisation.md): Stub: EL2, stage 2 translation, trapping, the virtual GIC and virtual timer, and why seL4 runs at EL2 in hypervisor builds.

### RISC-V

- [RISC-V basics](concepts/riscv-basics.md): Stub: registers, privilege modes, CSRs, extensions and the SBI firmware interface.
- [RISC-V paging and traps](concepts/riscv-paging-and-traps.md): Stub: Sv39/Sv48 translation, satp, and trap handling through stvec, scause and sepc.
- [RISC-V interrupts and timers](concepts/riscv-interrupts.md): Stub: the PLIC, CLINT, the SBI timer, and the newer AIA and Sstc extensions.

## Part 3: Platform and devices

The hardware around the CPU: how it is described to software, how devices interrupt, and how time is kept.

### Firmware and platform description

- [ACPI tables](concepts/acpi-tables.md): The tables PC (and Arm server) firmware leaves in memory to describe the machine: the RSDP points to the XSDT, which lists tables such as the MADT (interrupt controllers), HPET, MCFG (PCI) and DSDT.
- [Device trees](concepts/device-tree.md): Stub: the data structure that describes non-discoverable hardware on Arm and RISC-V: source, blob, bindings, and how seL4's build and Microkit consume it.

### Interrupts

- [IRQ](concepts/irq.md): A device's signal that it needs the CPU, carried on a wire or as a message to an interrupt controller, which turns it into a numbered interrupt; seL4 hands each IRQ to user level as a capability that signals a notification.
- [Local APIC and I/O APIC](concepts/apic.md): x86's interrupt controllers: a local APIC in each core takes interrupts, sends IPIs and holds a timer, while I/O APICs route device interrupt pins to vectors on chosen cores; seL4 drives both and lets user level pick the vector for each pin or MSI.
- [GICv3 and the ITS](concepts/gicv3-its.md): Arm's interrupt controller (distributor, per-core redistributors, CPU interface) and its ITS, which turns devices' MSI writes into LPIs using tables in memory.

### Timers

- [PIT](concepts/pit.md): The original PC's timer chip, a 16-bit down-counter at 1 193 182 Hz behind I/O ports 0x40 to 0x43; every x86 hypervisor still emulates it, and seL4 times its other clocks against it at boot.
- [TSC](concepts/tsc.md): A 64-bit per-core x86 counter read with `RDTSC`; cheap to read and, on modern CPUs, constant-rate, but nothing architectural tells the kernel its frequency.
- [Local APIC timer and TSC deadline mode](concepts/lapic-timer.md): The per-core x86 timer built into each local APIC, programmed either as a countdown at an unknown bus-derived rate or, in TSC deadline mode, as an absolute TSC value.
- [Timer calibration](concepts/timer-calibration.md): Finding how fast a clock runs by timing it against another whose rate is known; on x86 seL4 does this at boot for the TSC and the local APIC timer, using the PIT.
- [Hypervisor CPUID leaves](concepts/hypervisor-cpuid-leaves.md): CPUID leaves from `0x40000000` that a hypervisor fills in to identify itself; leaf `0x40000010`, where offered, gives the TSC and local APIC timer rates so a guest need not measure them.
- [HPET](concepts/hpet.md): A memory-mapped x86 timer, found through an ACPI table, with one main counter and several comparators; meant to replace the PIT and RTC, absent or only 32 bits wide on the clouds.
- [Arm generic timer](concepts/arm-generic-timer.md): The architectural timer of every Armv8 core: a system counter whose rate is in `CNTFRQ_EL0`, and per-core comparators that raise PPIs; its rate varies by machine, which seL4 platforms have fixed at build time.

### Buses and devices

- [ISA](concepts/isa.md): The IBM PC's original expansion bus; long gone as a slot, it lives on as the fixed set of legacy PC devices (PIT, 8259 PICs, COM ports, RTC, keyboard) at their old I/O ports and IRQ numbers 0 to 15, which every x86 machine and hypervisor still provides.
- [PCI and PCI Express](concepts/pci.md): The bus by which almost every device in a PC, server or cloud virtual machine is found and reached: each function at a bus:device.function address has a configuration space that names it and holds its BARs, the windows through which its registers appear; PCI Express keeps that software model on point-to-point serial links and reaches the larger configuration space through ECAM.
- [MSI and MSI-X](concepts/msi-msix.md): A PCI device interrupts by writing a value to an address instead of asserting a wire; MSI allows up to 32 vectors set in configuration space, MSI-X up to 2048 from a table in a BAR.
- [UARTs: 16550 and PL011](concepts/uart.md): Stub: the two serial ports seL4 work meets most, their registers, and how the kernel and user level use them for a console.
- [virtio](concepts/virtio.md): Stub: the standard paravirtual device family: virtqueues, the legacy and modern PCI transports and MMIO transport, feature negotiation, and the net, block and console devices.
- [IOMMUs: VT-d and SMMU](concepts/iommu.md): Stub: hardware that translates and restricts device DMA, why a microkernel needs it, and seL4's IOSpace and SMMU support.

### Virtual and cloud machines

- [QEMU](concepts/qemu.md): Stub: the emulator most seL4 development runs on: machine types, the options that matter, KVM, and how seL4's simulate scripts drive it.
- [Cloud virtual machines](concepts/cloud-vms.md): Stub: what hardware EC2, Compute Engine and Azure present to a guest kernel (firmware, interrupt controllers, timers, consoles, NICs) and how that differs from a PC or development board.

### Cloud platforms

The two clouds the porting work targets. Start with the cloud virtual machines page above.

- [Amazon EC2 and the Nitro system](concepts/ec2.md): Stub: how EC2 runs a guest: the Nitro hypervisor and cards, AMIs and boot modes, EBS, the serial console and other ways to see a kernel boot, and the hardware a guest kernel finds.
- [EC2 instance types](concepts/ec2-instance-types.md): Stub: how to read an EC2 instance type name, the families and generations (Intel, AMD, Graviton), virtualised against metal, and what differs between them for a kernel port.
- [Google Compute Engine](concepts/gce.md): Stub: how Compute Engine runs a guest: its KVM-based hypervisor, images and UEFI boot, Shielded VM, disks, the serial console, and the hardware a guest kernel finds.
- [Compute Engine machine types](concepts/gce-machine-types.md): Stub: how to read a Compute Engine machine type name, the families and generations (N1 to C4, AMD, Arm), and what differs between them for a kernel port.
- [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md): Stub: what it takes to get a kernel that is not Linux started on EC2 and Compute Engine: disk image layout, the EFI system partition and boot loader, registering or importing the image, and getting console output back.
- [ENA](concepts/ena.md): Stub: the Elastic Network Adapter, EC2's network device: its PCI identity, admin and I/O queues, and what a driver must do.
- [gVNIC](concepts/gvnic.md): Stub: Google's virtual NIC, required on newer Compute Engine machine types: its PCI identity, queue formats (GQI and DQO), and what a driver must do.
- [NVMe](concepts/nvme.md): Stub: the storage interface both clouds present disks through: controller registers, admin and I/O queue pairs, namespaces, and how EBS and local disks appear.

## Part 4: The seL4 kernel

The kernel's model and API, in the order the concepts build on each other.

### Model and API

- [Capabilities](sel4/capabilities.md): A capability is an unforgeable, kernel-held token naming one kernel object plus the rights its holder has; every seL4 operation is authorised by one, and the kernel tracks how capabilities were derived so that access can be revoked.
- [CSpaces and capability addressing](sel4/cspace.md): A thread's CSpace is the tree of CNodes (tables of capability slots) reachable from its root CNode; a CPtr is resolved through it a few bits at a time using each CNode's guard and radix, and CNode invocations name slots by an explicit root, index and depth.
- [Kernel objects](sel4/kernel-objects.md): The fixed set of object types the seL4 kernel implements (TCBs, endpoints, CNodes, page tables, frames and so on), which are created by retyping untyped memory, and the capability types that exist with no object behind them.
- [Untyped memory and retyping](sel4/untyped-memory.md): Untyped capabilities stand for blocks of physical memory that are not yet any kernel object; `seL4_Untyped_Retype` carves objects out of one, and revoking it is the only way to get the memory back, which is how seL4 leaves all memory allocation to user level.
- [System calls and invocations](sel4/syscalls-and-invocations.md): seL4 has only about a dozen real system calls, all forms of sending to or receiving from a capability; every operation on a kernel object is an invocation, a message sent to the object's capability whose label selects the method, which the kernel decodes and answers itself.
- [Threads and TCBs](sel4/threads.md): A seL4 thread is a thread control block (TCB) object: saved registers plus the capabilities and scheduling parameters that say where it runs, what it can name and who hears about its faults; every user-level system starts by configuring some.
- [Scheduling](sel4/scheduling.md): seL4's scheduler: 256 fixed priorities with round-robin inside each, found through a two-level bitmap, under an optional fixed-schedule domain scheduler; it decides what runs after every kernel entry, so nearly every kernel patch touches its invariants.
- [MCS kernel](sel4/mcs.md): A seL4 build option that replaces the periodic tick with scheduling contexts (a budget of CPU time per period) and one-shot timer deadlines; Microkit uses it, so its timer must be accurate.
- [IPC and endpoints](sel4/ipc.md): seL4's synchronous message passing: threads rendezvous at endpoint objects to copy a few words and capabilities, with Call/ReplyRecv forming the remote procedure call that every seL4 system is built from and that the kernel's fastpath exists to make quick.
- [Notifications](sel4/notifications.md): A notification object is one word of pending signal bits that senders OR into without ever blocking and a receiver collects by waiting; it is how seL4 delivers interrupts and how Microkit channels and sDDF queues say "there is work".
- [Faults and fault handlers](sel4/faults.md): When a thread does something the kernel cannot complete (a bad capability, a page fault, an illegal instruction, on MCS an exhausted budget), the kernel turns it into an IPC message to the thread's fault endpoint, so paging, debugging and crash handling are all user-level servers.
- [Address spaces (VSpace)](sel4/vspace.md): Stub: frames, page tables and ASIDs as kernel objects; mapping, unmapping and the per-architecture object hierarchy.
- [Interrupt delivery](sel4/irq-handling.md): Stub: IRQControl and IRQHandler capabilities, binding an interrupt to a notification, acknowledging, and per-architecture variants (I/O APIC, MSI, trigger modes, SGIs).
- [BootInfo and the root task](sel4/bootinfo-and-root-task.md): Stub: the initial thread, the capabilities it starts with, and the BootInfo structure that describes them.
- [SMP](sel4/smp.md): Stub: seL4 on multiple cores: the big kernel lock, IPIs, thread affinity, and the alternative multikernel approach.
- [Virtualisation support](sel4/hypervisor.md): Stub: seL4 as a hypervisor: VCPU objects, hypervisor mode on Arm and VT-x on x86, and the user-level virtual machine monitors built on them.

### Inside the kernel

- [Kernel design and execution model](sel4/kernel-design.md): Stub: an event-driven kernel with one stack per core, no blocking in the kernel, preemption points, and the invariants this buys.
- [Source layout](sel4/source-layout.md): Stub: a tour of the kernel repository: where architecture, platform, object and API code lives, and how to find your way.
- [Build system and configuration](sel4/build-system.md): Stub: CMake, the configuration options and how they reach C, platform selection, and building the kernel standalone or within a project.
- [Generated code](sel4/generated-code.md): Stub: the bitfield generator, syscall and invocation XML, and hardware headers generated from device trees.
- [Kernel boot sequence](sel4/kernel-boot.md): Stub: what the kernel does from its entry point to the first user thread on x86, Arm and RISC-V.
- [Boot code and the proof boundary](sel4/boot-code.md): Kernel code marked `BOOT_CODE` runs once before the first user thread and is then discarded; seL4's functional correctness proof does not cover it, which changes what a patch to it costs.
- [Elfloader](sel4/elfloader.md): Stub: the loader that unpacks the kernel and root task on Arm and RISC-V, sets up initial page tables and starts secondary cores.
- [Platform ports](sel4/platform-port.md): Stub: what adding or changing a platform involves on each architecture: device tree and hardware.yml, platform CMake, drivers, and x86's single pc99 platform.
- [Debugging](sel4/debugging.md): Stub: debug builds, kernel printing, debug system calls, GDB with QEMU, benchmarking support, and reading a kernel fault dump.

## Part 5: Verification

What is proved, about what, and what that means for anyone changing kernel code.

- [The seL4 proofs](sel4/verification.md): seL4's proofs show, for a few exact kernel configurations, that the C code behaves as an abstract specification says and that the specification enforces integrity and confidentiality; boot code, assembly, hardware and every other configuration are assumed, not proved.
- [l4v and Isabelle](sel4/l4v.md): `seL4/l4v` holds the Isabelle/HOL specifications and proofs of seL4; it reads the kernel's C as one preprocessed file per verified configuration, and a manifest repository records which kernel commit the proofs currently match.
- [The verified C subset](sel4/verified-c-subset.md): Verified seL4 code must be written in the subset of C99 that the Isabelle C parser accepts (no unions, no `goto`, no fall-through, no address of a local, no side effects inside expressions), which explains much of the kernel's unusual C style.
- [Proof impact of a change](sel4/proof-impact.md): A procedure for deciding, before sending a kernel patch, whether it changes code the proofs cover: whether a verified configuration compiles it, whether it is boot or machine-interface code, and what to write in the pull request either way.

## Part 6: User level

Everything above the kernel: libraries, tests and the frameworks systems are built with.

- [libsel4 and the runtime](sel4/libsel4.md): Stub: the kernel's user-level interface library, how its stubs are generated, sel4runtime and the C library.
- [seL4_libs and util_libs](sel4/sel4-libs.md): Stub: the classic user-level libraries: allocators (vka, allocman), vspace, simple, sel4utils, and platsupport's drivers.
- [sel4test and sel4bench](sel4/sel4test.md): Stub: the kernel's test suite and benchmark suite: structure, how to build and run them, and how to read failures.
- [Microkit](sel4/microkit.md): Stub: the minimal SDK for static systems: protection domains, channels, memory regions, the system description file and libmicrokit's event loop.
- [Microkit internals](sel4/microkit-internals.md): Stub: how the Microkit tool turns a system description into a bootable image: the loader, the initialiser, the monitor, and patched ELF symbols.
- [sDDF](sel4/sddf.md): Stub: the seL4 Device Driver Framework: drivers, virtualisers and clients joined by shared-memory queues and notifications.
- [sDDF networking](sel4/sddf-net.md): Stub: the network subsystem in detail: queue layout, buffer ownership, RX and TX virtualisers, copiers, and what a NIC driver must do.
- [LionsOS and libvmm](sel4/lionsos.md): Stub: the operating system built from Microkit and sDDF components, and the virtual machine monitor library beside it.
- [CAmkES and capDL](sel4/camkes-capdl.md): Stub: the older component framework and the capability distribution language and loader beneath it.
- [rust-sel4](sel4/rust-sel4.md): Stub: Rust support for seL4: the sel4 and sel4-microkit crates, the root-task runtime, the capDL initialiser, and building against a kernel.

## Part 7: Contributing

How changes get into seL4.

- [Contributing a patch](sel4/contributing.md): The path of a change into upstream seL4: a pull request from a fork on GitHub, signed-off commits in a fixed message format, astyle-formatted C with SPDX headers, review by committers, and, for the kernel, a proof that still holds.
- [Upstream CI](sel4/ci.md): The GitHub Actions checks a seL4 pull request meets (lint, style, licences, compile matrix, sel4test in simulation, the preprocess check) and the ones only a maintainer's label or a merge starts (hardware runs, proofs, manifest deployment).
- [Governance and RFCs](sel4/governance.md): Who decides what goes into seL4: the seL4 Foundation's Technical Steering Committee sets process and grants the reviewer and committer roles, and substantial changes pass through a public RFC before any pull request is accepted.
