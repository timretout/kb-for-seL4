# Index

Every page, with its summary, arranged as a course: read top to bottom,
or jump to what you need. Pages marked "Stub" are planned and not yet
written. [GLOSSARY.md](GLOSSARY.md) lists terms and abbreviations with
the page that explains each.

## Part 1: Orientation

What seL4 is and how the project fits together. Read these first.

- [seL4 overview](sel4/overview.md): Stub: what seL4 is (a capability-based, formally verified microkernel), what it does and deliberately does not do, and a map of the rest of this knowledge base.
- [Ecosystem and repositories](sel4/ecosystem.md): Stub: the repositories and components around the kernel (seL4_tools, seL4_libs, util_libs, sel4test, Microkit, sDDF, LionsOS, CAmkES, capDL, rust-sel4, l4v) and how they depend on each other.
- [History and key papers](sel4/history-and-papers.md): Stub: the L4 lineage, seL4's timeline, and a reading list of the papers and documents worth knowing.

## Part 2: Processor fundamentals

Ideas every architecture shares, then x86-64, AArch64 and RISC-V in turn. seL4's kernel is mostly a thin layer over these mechanisms, so its code reads easily once they are familiar.

### Common ideas

- [Privilege levels](concepts/privilege-levels.md): Stub: user, kernel, hypervisor and firmware modes across x86 (rings, VMX root), Arm (EL0 to EL3) and RISC-V (U, S, M), and which one seL4 runs in.
- [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md): Stub: how a CPU enters the kernel: synchronous exceptions, system calls and asynchronous interrupts, vectors, saved state, and return; the architecture-neutral picture.
- [Virtual memory](concepts/virtual-memory.md): Stub: page tables, multi-level translation, TLBs, ASIDs, large pages and the kernel/user split, independent of architecture.
- [FPU and SIMD state](concepts/fpu-state.md): Stub: floating-point and vector register state, lazy against eager switching, XSAVE on x86, and how seL4 handles it.
- [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md): Stub: how secondary cores are started and how cores interrupt each other on x86 (INIT/SIPI), Arm (PSCI) and RISC-V (SBI HSM).
- [ELF and linking](concepts/elf.md): Stub: the ELF format, segments against sections, linker scripts, physical against virtual load addresses; what the kernel image, elfloader and Microkit do with ELF files.

### x86-64

- [x86-64 basics](concepts/x86-64-basics.md): Stub: registers, operating modes (real, protected, long), segmentation's remains (GDT, TSS, FS/GS), control registers, and the calling convention.
- [CPUID and MSRs](concepts/cpuid-and-msrs.md): Stub: how x86 software discovers CPU features (CPUID) and controls them (model-specific registers), with the leaves and MSRs seL4 uses.
- [x86-64 paging](concepts/x86-paging.md): Stub: four-level page tables, CR3, PCID, large pages, NX, and the kernel window seL4 sets up.
- [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md): Stub: the IDT, interrupt stacks, SYSCALL/SYSRET and SYSENTER, SWAPGS, and seL4's entry and exit paths.
- [I/O ports and MMIO](concepts/io-ports.md): Stub: x86's separate I/O port address space against memory-mapped registers, and seL4's IOPort capabilities.
- [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md): Stub: how a PC gets from reset to a kernel: BIOS or UEFI, the boot loader, Multiboot 1 and 2, and the state seL4 expects on entry.
- [UEFI](concepts/uefi.md): Stub: the firmware interface that replaced the BIOS on PCs and is standard on Arm servers: boot services, the memory map, configuration tables, and what a kernel inherits from it.
- [8259 PIC](concepts/pic-8259.md): Stub: the original PC interrupt controller pair, why it must still be masked or remapped, and seL4's use of it.
- [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md): Stub: VMX root and non-root operation, the VMCS, VM exits, EPT, and what a guest kernel can and cannot see.

### AArch64

- [AArch64 basics](concepts/aarch64-basics.md): Stub: registers, exception levels, system registers, AArch32 in passing, and the calling convention.
- [AArch64 exceptions](concepts/aarch64-exceptions.md): Stub: the vector table, ESR/ELR/SPSR/FAR, SVC/HVC/SMC, and seL4's entry and exit paths.
- [AArch64 paging](concepts/aarch64-paging.md): Stub: TTBR0/TTBR1, translation granules and levels, ASIDs, memory attributes, and stage 2 translation.
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

## Part 4: The seL4 kernel

The kernel's model and API, in the order the concepts build on each other.

### Model and API

- [Capabilities](sel4/capabilities.md): Stub: unforgeable tokens that name a kernel object and carry rights; copying, minting, badging, moving, deleting and revoking them, and the capability derivation tree.
- [CSpaces and capability addressing](sel4/cspace.md): Stub: CNodes, slots, guards and depth: how a thread's capability space is built and how a capability pointer is resolved.
- [Kernel objects](sel4/kernel-objects.md): Stub: every object type the kernel implements, its size and purpose, per architecture.
- [Untyped memory and retyping](sel4/untyped-memory.md): Stub: how all memory is handed to user level as untyped capabilities and turned into objects by retyping; watermarks, device untypeds, revocation and reuse.
- [System calls and invocations](sel4/syscalls-and-invocations.md): Stub: the handful of real system calls, how object methods are invocations sent through them, message registers and the IPC buffer, error reporting.
- [Threads and TCBs](sel4/threads.md): Stub: the thread control block, what configuring a thread involves, priorities and maximum controlled priority, suspend and resume, register access.
- [Scheduling](sel4/scheduling.md): Stub: the priority round-robin scheduler, ready queues and bitmaps, the domain scheduler, and what changes under MCS.
- [MCS kernel](sel4/mcs.md): A seL4 build option that replaces the periodic tick with scheduling contexts (a budget of CPU time per period) and one-shot timer deadlines; Microkit uses it, so its timer must be accurate.
- [IPC and endpoints](sel4/ipc.md): Stub: synchronous message passing through endpoints: send, receive, call, reply, capability transfer, badges, and the fastpath.
- [Notifications](sel4/notifications.md): Stub: asynchronous signals as a word of bits; binding to a thread, and their use for interrupts and shared-memory protocols.
- [Faults and fault handlers](sel4/faults.md): Stub: what happens when a thread faults: fault endpoints, fault message formats, replying to restart, and timeout faults under MCS.
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

- [The seL4 proofs](sel4/verification.md): Stub: the proof stack (abstract specification, executable specification, C, binary), the security properties, the assumptions, and which configurations are verified.
- [l4v and Isabelle](sel4/l4v.md): Stub: the proof repository and its structure, the tools involved (Isabelle/HOL, the C parser, AutoCorres), and how to run a proof check.
- [The verified C subset](sel4/verified-c-subset.md): Stub: the restrictions the C parser places on kernel code and the coding conventions that follow from them.
- [Proof impact of a change](sel4/proof-impact.md): Stub: how to tell whether a kernel patch touches verified code, what kinds of change are cheap or expensive to re-prove, and how upstream handles it.

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

- [Contributing a patch](sel4/contributing.md): Stub: the path of a change upstream: issues and pull requests, sign-off, commit and code style, licensing headers, review, and what differs for verified code.
- [Upstream CI](sel4/ci.md): Stub: the checks a pull request meets: style and lint, compile and simulation tests, hardware tests on the machine queue, the preprocess check and proof runs.
- [Governance and RFCs](sel4/governance.md): Stub: the seL4 Foundation, the technical steering committee, committers and reviewers, the RFC process, and releases.
