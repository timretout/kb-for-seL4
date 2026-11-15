# Index

Every page, with its summary, arranged as a course: read top to bottom,
or jump to what you need. Pages marked "Stub" are planned and not yet
written. The [glossary](GLOSSARY.md) lists terms and abbreviations with
the page that explains each.

1. [Orientation](#part-1-orientation)
2. [Processor fundamentals](#part-2-processor-fundamentals)
3. [Platform and devices](#part-3-platform-and-devices)
4. [The seL4 kernel](#part-4-the-sel4-kernel)
5. [Verification](#part-5-verification)
6. [User level](#part-6-user-level)
7. [Contributing](#part-7-contributing)

Looking for one architecture's version of an idea? See
[By architecture](#by-architecture) at the end.

## Part 1: Orientation

What seL4 is and how the project fits together. Read these first.

- [seL4 overview](sel4/overview.md): seL4 is a small, fast, capability-based microkernel with a machine-checked proof that its C code implements its specification; it provides threads, address spaces, IPC and access control, and leaves drivers, file systems and all policy to user level.
- [Ecosystem and repositories](sel4/ecosystem.md): seL4 is some thirty repositories in two GitHub organisations: the kernel and its proofs, an older user-level world of CMake libraries and CAmkES, and a newer one of Microkit, sDDF and LionsOS; this page maps them and how they depend on each other.
- [History and key papers](sel4/history-and-papers.md): seL4 is the third generation of the L4 microkernel family, designed from 2004 to be formally verified; this page gives the lineage, the timeline, and an annotated reading list in the order a new contributor should read it.

## Part 2: Processor fundamentals

Ideas every architecture shares, then x86-64, AArch64 and RISC-V in turn. seL4's kernel is mostly a thin layer over these mechanisms, so its code reads easily once they are familiar.

### Common ideas

- [Privilege levels](concepts/privilege-levels.md): The CPU modes that separate user code, kernel, hypervisor and firmware on x86 (rings, VMX root, SMM), Arm (EL0 to EL3) and RISC-V (U, S, M): seL4 runs in ring 0, EL1 or EL2, or S-mode, and something more privileged usually sits beneath it.
- [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md): The three ways a CPU leaves user code for the kernel (a faulting instruction, a system call instruction, an asynchronous interrupt), what hardware saves and what software must, and how the kernel returns; every seL4 architecture funnels these into the same five C functions in `src/api/syscall.c`.
- [Virtual memory](concepts/virtual-memory.md): How an MMU translates the addresses programs use into physical ones through multi-level page tables, with TLBs, address-space identifiers, large pages, permissions and a second stage for virtual machines; seL4 does no demand paging and exposes the tables themselves as objects, keeping only a fixed window of its own.
- [FPU and SIMD state](concepts/fpu-state.md): The floating-point and vector registers are extra per-thread state, hundreds to thousands of bytes, that a kernel must save and restore; how and when it does so (lazily by trap, or eagerly) is a performance and security choice, and on x86 the save format and size are build options seL4 checks at boot.
- [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md): How a multicore machine goes from one running core to all of them: INIT and STARTUP IPIs on x86, PSCI `CPU_ON` on Arm, SBI HSM on RISC-V; on x86 the seL4 kernel does it itself, on Arm and RISC-V the elfloader does it first.
- [ELF and linking](concepts/elf.md): ELF is the file format of every kernel, loader and user program in an seL4 system; reading its program headers and the linker script behind them explains where each image is loaded, at which virtual address it runs, and what boot code can assume.

### x86-64

- [x86-64 basics](concepts/x86-64-basics.md): The registers, operating modes, leftover segmentation (GDT, TSS, FS and GS bases), control registers and calling convention of 64-bit x86, as much as is needed to read seL4's `src/arch/x86/64/`.
- [CPUID and MSRs](concepts/cpuid-and-msrs.md): How x86 software discovers what the processor can do (the `cpuid` instruction) and reaches the hundreds of control registers that have no instruction of their own (`rdmsr`/`wrmsr`); seL4 checks features at boot and programs a dozen MSRs.
- [x86-64 paging](concepts/x86-paging.md): How x86-64 translates 48-bit virtual addresses through four levels of 512-entry tables rooted at `CR3`, with the entry flags, large pages, PCIDs and TLB rules a kernel must respect; seL4 exposes each level as an object type and keeps its own window in the top 512 GiB.
- [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md): How an x86-64 CPU enters the kernel (through the IDT for exceptions and interrupts, through `syscall` or `sysenter` for system calls), what it saves and where, and how seL4's `traps.S` turns each entry into a saved register context in the current TCB.
- [I/O ports and MMIO](concepts/io-ports.md): x86's separate 16-bit address space for device registers, reached with the `in` and `out` instructions; seL4 keeps user threads away from the instructions and hands out ranges of ports as IOPort capabilities.
- [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md): How a PC gets from reset to a kernel: BIOS or UEFI firmware, a boot loader (usually GRUB), and the Multiboot 1 and 2 protocols that hand seL4 its memory map, root task image and ACPI pointer in 32-bit protected mode.
- [UEFI](concepts/uefi.md): The firmware interface that replaced the PC BIOS and is standard on Arm servers and cloud instances: it loads a PE executable from a FAT partition and offers it services and tables; x86 seL4 hides it behind GRUB, and the Arm elfloader can be built as a UEFI application.
- [8259 PIC](concepts/pic-8259.md): The PC's original interrupt controller, a pair of 8259A chips giving 15 IRQ lines through I/O ports; every x86 kernel, seL4 included, still has to remap and mask it at boot even when it uses the APICs instead.
- [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md): Intel's hardware support for running guest operating systems (VMX root and non-root operation, the VMCS, EPT) and AMD's equivalent: it is what seL4's x86 hypervisor mode drives, and what every x86 virtual machine, cloud instances included, runs under.

### AArch64

- [AArch64 basics](concepts/aarch64-basics.md): The 64-bit Arm execution state: 31 general registers, a stack pointer per exception level, PSTATE, and hundreds of system registers read with `MRS` and written with `MSR`; every line of seL4's Arm code assumes them.
- [AArch64 exceptions](concepts/aarch64-exceptions.md): How an AArch64 core enters and leaves a higher exception level: a 16-entry vector table at `VBAR_ELx`, the syndrome in `ESR_ELx`, the return state in `ELR_ELx` and `SPSR_ELx`, and `ERET`; seL4's whole kernel entry and exit is built on it.
- [AArch64 paging](concepts/aarch64-paging.md): AArch64 address translation: two page table roots (`TTBR0` for the low half of the address space, `TTBR1` for the high half), up to four levels of 4 KiB tables, ASIDs to tag TLB entries, and an optional second stage for hypervisors; seL4's VSpace objects are these tables.
- [Arm boot flow](concepts/arm-boot.md): The chain from reset to a kernel on a 64-bit Arm machine: boot ROM, Trusted Firmware-A (BL1, BL2, BL31), then U-Boot or UEFI, which starts the seL4 elfloader at EL2 or EL1 with the MMU off; the entry conditions each stage leaves decide what the loader and kernel may assume.
- [PSCI and SMCCC](concepts/psci-smccc.md): Arm's standard way for a kernel to call firmware or a hypervisor (SMCCC: a function identifier in `x0`, then `SMC` or `HVC`), and the standard service built on it for starting, stopping and resetting cores (PSCI); seL4's loaders use it to start secondary cores and the kernel can pass calls through for user level.
- [GICv2](concepts/gicv2.md): Arm's older standard interrupt controller, with at most eight cores and every register memory-mapped: a shared distributor (GICD) that enables, prioritises and routes interrupts, and a per-core CPU interface (GICC) where the kernel acknowledges and completes them; seL4's driver for many Arm boards.
- [Arm virtualisation (EL2)](concepts/arm-virtualisation.md): What exception level 2 adds to an Arm core so that a hypervisor can run guests: trap controls in `HCR_EL2`, a second stage of address translation, virtual interrupts through the GIC's list registers and a virtual timer; an seL4 kernel built as a hypervisor runs entirely at EL2.

### RISC-V

- [RISC-V basics](concepts/riscv-basics.md): The RISC-V architecture as a kernel sees it: 31 integer registers, named extensions, three privilege modes, control and status registers, and firmware services reached through the SBI; seL4 runs in S-mode on top of OpenSBI, and its 64-bit RISC-V port is one of the verified configurations.
- [RISC-V paging and traps](concepts/riscv-paging-and-traps.md): How an S-mode kernel on RISC-V translates addresses (Sv39 or Sv48 tables rooted at `satp`, one entry format at every level) and takes traps (one handler at `stvec`, cause in `scause`, return with `sret`); seL4's whole entry path is one assembly function, `trap_entry`, and one page table object type.
- [RISC-V interrupts and timers](concepts/riscv-interrupts.md): How interrupts reach an S-mode kernel on RISC-V: three per-hart lines (software, timer, external) in `sip`/`sie`, fed by the CLINT through firmware and by the PLIC interrupt controller, with AIA as the newer alternative; seL4 drives the PLIC directly and gets its timer and IPIs through SBI calls.

## Part 3: Platform and devices

The hardware around the CPU: how it is described to software, how devices interrupt, and how time is kept.

### Firmware and platform description

- [ACPI tables](concepts/acpi-tables.md): The tables PC (and Arm server) firmware leaves in memory to describe the machine: the RSDP points to the XSDT, which lists tables such as the MADT (interrupt controllers), HPET, MCFG (PCI) and DSDT.
- [Device trees](concepts/device-tree.md): A device tree is a data structure describing hardware that cannot be discovered by probing; on Arm and RISC-V seL4's build compiles one into the kernel, and Microkit and sDDF generate system descriptions from it.

### Interrupts

- [Interrupts: a map](concepts/interrupts.md): A map of how an interrupt reaches the kernel on x86, Arm and RISC-V: which controller sits in each core, which one routes device interrupts, how message signalled interrupts and IPIs travel, and what number seL4 knows each interrupt by.
- [IRQ](concepts/irq.md): A device's signal that it needs the CPU, carried on a wire or as a message to an interrupt controller, which turns it into a numbered interrupt; seL4 hands each IRQ to user level as a capability that signals a notification.
- [Local APIC and I/O APIC](concepts/apic.md): x86's interrupt controllers: a local APIC in each core takes interrupts, sends IPIs and holds a timer, while I/O APICs route device interrupt pins to vectors on chosen cores; seL4 drives both and lets user level pick the vector for each pin or MSI.
- [GICv3 and the ITS](concepts/gicv3-its.md): Arm's interrupt controller (distributor, per-core redistributors, CPU interface) and its ITS, which turns devices' MSI writes into LPIs using tables in memory.

### Timers

- [Timers: a map](concepts/timers.md): A map of every clock and timer seL4 work meets, by architecture: which device counts time, which raises the interrupt, where each one's rate comes from, and whether the kernel or user level uses it.
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
- [UARTs: 16550 and PL011](concepts/uart.md): A UART is the serial port: the 16550 on x86 and many RISC-V and Arm boards and the PL011 on Arm are the two seL4 work meets most, and a serial port is the only console a debug kernel or a cloud instance has.
- [virtio](concepts/virtio.md): virtio is the standard family of paravirtual devices (network, block, console and more) that hypervisors offer in place of emulated hardware: one queue mechanism, three transports, and the easiest real I/O for an seL4 system in a virtual machine.
- [IOMMUs: VT-d and SMMU](concepts/iommu.md): An IOMMU translates and restricts the memory addresses devices use for DMA, which is what keeps a user-level driver from reading or writing all of memory through its device; seL4 has unverified support for Intel VT-d and Arm SMMUv2.

### Virtual and cloud machines

- [QEMU](concepts/qemu.md): QEMU emulates whole machines (x86 PCs, Arm and RISC-V `virt` boards) in software or with KVM, and is where most seL4 development and testing first runs; its machines resemble clouds only loosely.
- [Cloud virtual machines](concepts/cloud-vms.md): What hardware Amazon EC2, Google Compute Engine and Azure present to a guest kernel, and how that differs from a PC or a development board: custom network and disk devices, missing legacy devices, UEFI with ACPI on every architecture, and a serial log as the only debug channel.

### Cloud platforms

Amazon EC2 and Google Compute Engine in detail: their machines, boot images and devices. Start with the cloud virtual machines page above.

- [Amazon EC2 and the Nitro system](concepts/ec2.md): How EC2 runs a guest: the Nitro hypervisor and cards, AMIs and boot modes, EBS, the serial console and other ways to see a kernel boot, and the hardware (PCI devices, interrupt controllers, timers) a guest kernel finds.
- [EC2 instance types](concepts/ec2-instance-types.md): How to read an EC2 instance type name (`m7g.large`, `c5n.metal`) and what it implies for a kernel: CPU vendor and generation, hypervisor, boot modes, and whether it is bare metal.
- [Google Compute Engine](concepts/gce.md): Google Cloud's virtual machine service: a KVM-based hypervisor with Google's own device model, UEFI firmware with ACPI on both x86 and Arm, virtio or Google-specific PCI devices, and a logged serial port as the only console.
- [Compute Engine machine types](concepts/gce-machine-types.md): How to read a Compute Engine machine type name such as `c4a-standard-2`, and what the series behind it decides for a kernel: architecture, CPU, network card, disk interface and bare-metal availability.
- [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md): What it takes to get a kernel that is not Linux running on EC2 or Compute Engine: a GPT disk image with an EFI system partition and a boot loader at the fallback path, the import and registration steps of each cloud, and reading the serial log.
- [ENA](concepts/ena.md): Amazon's network card, the only NIC on EC2 Nitro instances: a PCI device with a small register block, an admin queue for management and pairs of submission and completion rings for packets, with MSI-X interrupts.
- [gVNIC](concepts/gvnic.md): Compute Engine's own paravirtual network card, the only NIC on third-generation and later machine series and on Arm: a PCI device with a big-endian register block, an admin queue, and two unrelated descriptor formats (GQI and DQO).
- [NVMe](concepts/nvme.md): The standard PCI storage controller interface, and the one EC2 uses for every disk and Compute Engine for its newer machine types: registers in BAR 0, an admin queue, and pairs of submission and completion queues in host memory.

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
- [Address spaces (VSpace)](sel4/vspace.md): A seL4 address space is a tree of page-table objects that user level retypes from untyped memory and links together with `Map` invocations, with frames at the leaves and an ASID naming the root; the kernel only checks and installs what it is asked to.
- [Interrupt delivery](sel4/irq-handling.md): seL4 turns each device interrupt into a signal on a notification: the root task's `IRQControl` cap mints one `IRQHandler` cap per interrupt, a driver binds a notification to it, and the kernel holds the line quiet until the driver acknowledges.
- [BootInfo and the root task](sel4/bootinfo-and-root-task.md): At the end of boot the kernel creates one user thread, the root task, hands it a capability to everything in the machine, and describes what it handed over in a `seL4_BootInfo` page; every seL4 system starts by reading that page.
- [SMP](sel4/smp.md): seL4 built for more than one core runs a single kernel image under one big lock, with per-core scheduler state, threads pinned to cores and IPIs for anything one core must do to another; this configuration is not verified, which is why a one-kernel-per-core "multikernel" design is being pursued instead.
- [Virtualisation support](sel4/hypervisor.md): seL4 can host virtual machines: the kernel supplies only VCPU objects and second-stage address spaces, and a user-level virtual machine monitor per guest does everything else, so a guest and its monitor are no more trusted than any other component.

### Inside the kernel

- [Kernel design and execution model](sel4/kernel-design.md): The rules every line of seL4 follows: one kernel stack per core and no blocking inside the kernel, interrupts off except at explicit preemption points that abort and restart the system call, no kernel heap, errors as return values, and a small set of global state; knowing them explains why kernel code looks the way it does.
- [Source layout](sel4/source-layout.md): A tour of the `seL4/seL4` repository: generic code in `src/{api,kernel,object,model,machine}`, one directory per architecture and per platform beside it, a mirrored `include/` tree chosen by include paths, and `libsel4` for user level; with a table of where to look for what.
- [Build system and configuration](sel4/build-system.md): seL4 builds with CMake and Ninja: options declared in `config.cmake` files become `CONFIG_*` macros in a generated `gen_config.h`, a platform name selects architecture and sources, and the kernel builds either alone from a `configs/*.cmake` file or inside a project through `init-build.sh`.
- [Generated code](sel4/generated-code.md): Much of what the kernel compiles is not in the repository: capability and object accessors come from bitfield specifications (`.bf`), system call numbers, invocation labels and libsel4 stubs from XML, device addresses and memory regions from device trees, and `CONFIG_*` macros from CMake, all written into the build directory.
- [Kernel boot sequence](sel4/kernel-boot.md): The path from the kernel's entry point to the first user thread: architecture assembly sets up a stack and the kernel's address space, C code discovers or is told the machine's memory, then generic helpers build the root task's CNode, address space, thread and untypeds before the first `schedule()`.
- [Boot code and the proof boundary](sel4/boot-code.md): Kernel code marked `BOOT_CODE` runs once before the first user thread and is then discarded; seL4's functional correctness proof does not cover it, which changes what a patch to it costs.
- [Elfloader](sel4/elfloader.md): The small boot program from `seL4_tools` that Arm and RISC-V images start with: it carries the kernel and root task ELF files in a CPIO archive, loads them, builds first page tables, enables the MMU, starts the other cores and jumps to the kernel's `init_kernel` with the user image's location.
- [Platform ports](sel4/platform-port.md): A platform is the kernel's build-time description of one board or machine family; porting on Arm and RISC-V means writing that description (device tree, overlay, `config.cmake`, drivers) across several repositories, while on x86 there is one platform, `pc99`, and a "port" means fixing its assumptions about the machine.
- [Debugging](sel4/debugging.md): The tools for finding out why an seL4 system misbehaves: debug-build kernel output and error reasons, the debug system calls, the fault dump, GDB under QEMU, the hardware debug API, tracing, and how to read a first boot that fails.

## Part 5: Verification

What is proved, about what, and what that means for anyone changing kernel code.

- [The seL4 proofs](sel4/verification.md): seL4's proofs show, for a few exact kernel configurations, that the C code behaves as an abstract specification says and that the specification enforces integrity and confidentiality; boot code, assembly, hardware and every other configuration are assumed, not proved.
- [l4v and Isabelle](sel4/l4v.md): `seL4/l4v` holds the Isabelle/HOL specifications and proofs of seL4; it reads the kernel's C as one preprocessed file per verified configuration, and a manifest repository records which kernel commit the proofs currently match.
- [The verified C subset](sel4/verified-c-subset.md): Verified seL4 code must be written in the subset of C99 that the Isabelle C parser accepts (no unions, no `goto`, no fall-through, no address of a local, no side effects inside expressions), which explains much of the kernel's unusual C style.
- [Proof impact of a change](sel4/proof-impact.md): A procedure for deciding, before sending a kernel patch, whether it changes code the proofs cover: whether a verified configuration compiles it, whether it is boot or machine-interface code, and what to write in the pull request either way.

## Part 6: User level

Everything above the kernel: libraries, tests and the frameworks systems are built with.

- [libsel4 and the runtime](sel4/libsel4.md): libsel4 is the kernel's ABI written down as C (types, constants, system call wrappers and generated invocation stubs), shipped in the kernel repository under a BSD licence; `sel4runtime` and a C library sit on top of it, and Microkit and rust-sel4 consume the same definitions by other routes.
- [seL4_libs and util_libs](sel4/sel4-libs.md): The classic C libraries for building dynamic systems on seL4: seL4_libs (allocators, virtual memory, process creation, the BootInfo abstraction) and util_libs (platform drivers behind `ps_io_ops`, the `ltimer` timer interface, ELF, CPIO and FDT parsers); sel4test, sel4bench and CAmkES are built on them, Microkit and sDDF are not.
- [sel4test and sel4bench](sel4/sel4test.md): sel4test is the kernel's functional test suite, a root task that runs each test in a fresh process and prints "All is well in the universe" when all pass; it is what upstream CI runs on every kernel pull request and the first thing to get running on a new machine, and sel4bench is its sibling for performance numbers.
- [Microkit](sel4/microkit.md): The seL4 Foundation's small SDK for static systems: you write single-threaded protection domains against `libmicrokit`, describe them, their channels, memory regions and interrupts in an XML system description file, and the `microkit` tool turns that into a bootable image.
- [Microkit internals](sel4/microkit-internals.md): How the `microkit` tool turns a system description into a boot image (a capDL specification realised by the Rust capDL initialiser as root task), and how the loader, monitor and libmicrokit's event loop map Microkit's abstractions onto seL4 objects.
- [sDDF](sel4/sddf.md): Trustworthy Systems' framework for user-level device drivers on Microkit: small single-purpose protection domains (driver, virtualiser, client) joined by shared-memory queues and notifications, with a common pattern per device class.
- [sDDF networking](sel4/sddf-net.md): The network class of sDDF in detail: free and active queues of buffer descriptors between driver, RX and TX virtualisers, per-client copiers and clients, who owns a buffer at each step, and what a NIC driver has to implement.
- [LionsOS and libvmm](sel4/lionsos.md): LionsOS is Trustworthy Systems' operating system assembled from Microkit protection domains and sDDF drivers (file systems, network stack, language runtimes); libvmm is the companion library for writing virtual machine monitors that run Linux and other guests beside them.
- [CAmkES and capDL](sel4/camkes-capdl.md): capDL is a language that describes a complete system as kernel objects and the capabilities between them, with a root task (the capDL loader or initialiser) that builds that system at boot; CAmkES is the older component framework that generates glue code and a capDL specification from an architecture description, now alongside Microkit, which uses capDL too.
- [rust-sel4](sel4/rust-sel4.md): `seL4/rust-sel4` is the Rust support for seL4 user level: the `sel4` crate of typed bindings generated from the kernel's own interface files, runtimes for root tasks and Microkit protection domains, the capDL initialiser Microkit boots with, a kernel loader, and target specifications; the kernel itself stays in C.

## Part 7: Contributing

How changes get into seL4.

- [Contributing a patch](sel4/contributing-a-patch.md): The path of a change into upstream seL4: a pull request from a fork on GitHub, signed-off commits in a fixed message format, astyle-formatted C with SPDX headers, review by committers, and, for the kernel, a proof that still holds.
- [Upstream CI](sel4/ci.md): The GitHub Actions checks a seL4 pull request meets (lint, style, licences, compile matrix, sel4test in simulation, the preprocess check) and the ones only a maintainer's label or a merge starts (hardware runs, proofs, manifest deployment).
- [Governance and RFCs](sel4/governance.md): Who decides what goes into seL4: the seL4 Foundation's Technical Steering Committee sets process and grants the reviewer and committer roles, and substantial changes pass through a public RFC before any pull request is accepted.

## By architecture

The same ideas, side by side. Each cell links the page that covers that
idea for that architecture; a page in the first column covers all three.

| Idea | All | x86-64 | AArch64 | RISC-V |
|---|---|---|---|---|
| Registers and modes | [Privilege levels](concepts/privilege-levels.md) | [x86-64 basics](concepts/x86-64-basics.md), [CPUID and MSRs](concepts/cpuid-and-msrs.md) | [AArch64 basics](concepts/aarch64-basics.md) | [RISC-V basics](concepts/riscv-basics.md) |
| Entering the kernel | [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md) | [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md) | [AArch64 exceptions](concepts/aarch64-exceptions.md) | [RISC-V paging and traps](concepts/riscv-paging-and-traps.md) |
| Page tables | [Virtual memory](concepts/virtual-memory.md) | [x86-64 paging](concepts/x86-paging.md) | [AArch64 paging](concepts/aarch64-paging.md) | [RISC-V paging and traps](concepts/riscv-paging-and-traps.md) |
| Interrupt controller | [Interrupts: a map](concepts/interrupts.md), [IRQ](concepts/irq.md) | [Local APIC and I/O APIC](concepts/apic.md), [8259 PIC](concepts/pic-8259.md) | [GICv2](concepts/gicv2.md), [GICv3 and the ITS](concepts/gicv3-its.md) | [RISC-V interrupts and timers](concepts/riscv-interrupts.md) |
| Timers | [Timers: a map](concepts/timers.md), [Timer calibration](concepts/timer-calibration.md) | [PIT](concepts/pit.md), [TSC](concepts/tsc.md), [Local APIC timer](concepts/lapic-timer.md), [HPET](concepts/hpet.md) | [Arm generic timer](concepts/arm-generic-timer.md) | [RISC-V interrupts and timers](concepts/riscv-interrupts.md) |
| Boot chain | [ELF and linking](concepts/elf.md), [UEFI](concepts/uefi.md) | [x86 boot](concepts/x86-boot.md) | [Arm boot flow](concepts/arm-boot.md), [Elfloader](sel4/elfloader.md) | [RISC-V basics](concepts/riscv-basics.md), [Elfloader](sel4/elfloader.md) |
| Calling firmware | | | [PSCI and SMCCC](concepts/psci-smccc.md) | [RISC-V basics](concepts/riscv-basics.md) (SBI) |
| Starting other cores | [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md) | | [PSCI and SMCCC](concepts/psci-smccc.md) | |
| Describing the machine | | [ACPI tables](concepts/acpi-tables.md) | [Device trees](concepts/device-tree.md), [ACPI tables](concepts/acpi-tables.md) | [Device trees](concepts/device-tree.md) |
| Hosting guests | [Virtualisation support](sel4/hypervisor.md) | [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md) | [Arm virtualisation (EL2)](concepts/arm-virtualisation.md) | |
| Device memory protection | [IOMMUs: VT-d and SMMU](concepts/iommu.md) | | | |
| Serial console | [UARTs: 16550 and PL011](concepts/uart.md) | | | |
| Floating point state | [FPU and SIMD state](concepts/fpu-state.md) | | | |
