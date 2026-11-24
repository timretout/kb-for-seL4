# Glossary

Terms and abbreviations used in the knowledge base, each with a short definition and a link to the page that explains it.

[0-9](#0-9) · [A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [K](#k) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [Q](#q) · [R](#r) · [S](#s) · [T](#t) · [U](#u) · [V](#v) · [W](#w) · [X](#x) · [Y](#y) · [Z](#z)

## 0-9

- **16550**: The UART of PCs and many RISC-V and Arm boards, including EC2 Graviton instances. See [UARTs: 16550 and PL011](concepts/uart.md).
- **8259 PIC**: The PC's original interrupt controller, a pair of chips giving 15 IRQ lines; still remapped and masked at boot. See [8259 PIC](concepts/pic-8259.md).
- **8N1**: The usual serial frame: 8 data bits, no parity, 1 stop bit, so 10 bit times per byte. See [UARTs: 16550 and PL011](concepts/uart.md).

## A

- **AAPCS64** (Procedure Call Standard for the Arm 64-bit Architecture): The AArch64 calling convention; among other things it requires a 16-byte aligned stack pointer. See [AArch64 basics](concepts/aarch64-basics.md).
- **AArch32**: The 32-bit Arm execution state. See [AArch64 basics](concepts/aarch64-basics.md).
- **AArch64**: The 64-bit Arm execution state: 31 general registers, a stack pointer per exception level, PSTATE and system registers. See [AArch64 basics](concepts/aarch64-basics.md).
- **abort**: Arm's word for a page fault; its syndrome carries a fault status code. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **abstract specification** (ASpec): The top-level Isabelle description of what each system call does; the C code is proved to refine it. See [l4v and Isabelle](sel4/l4v.md), also [The seL4 proofs](sel4/verification.md).
- **Acacia**: The Python package sDDF's metaprogram uses to generate a system description. See [sDDF](sel4/sddf.md).
- **ACPI** (Advanced Configuration and Power Interface): Tables firmware leaves in memory to describe the machine; found through the RSDP. See [ACPI tables](concepts/acpi-tables.md).
- **ACQ** (admin completion queue): ENA ring holding one response per admin command, matched by command ID. See [ENA](concepts/ena.md).
- **active queue**: sDDF queue of buffer descriptors that hold data to process, as opposed to the free queue. See [sDDF networking](sel4/sddf-net.md).
- **admin queue**: The queue through which a driver manages an ENA, gVNIC or NVMe device, separate from its I/O queues. See [NVMe](concepts/nvme.md), also [ENA](concepts/ena.md).
- **Aeneas**: Tool that translates safe Rust into pure functions in Lean or HOL4, to be proved there. See [Verifying user-level software](sel4/user-level-verification.md).
- **AENQ** (asynchronous event notification queue): ENA queue of events the device raises on its own, such as keep-alives. See [ENA](concepts/ena.md).
- **AIA** (Advanced Interrupt Architecture): RISC-V's newer alternative to the PLIC, made of APLIC and IMSIC. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **AMD-Vi**: AMD's IOMMU, described by the ACPI IVRS table; seL4 has no driver for it. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **AMI** (Amazon Machine Image): A registration record pointing at EBS snapshots, from which an EC2 instance boots. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **AP** (application processor): Any core other than the boot processor, started later by the kernel or loader. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **APIC** (Advanced Programmable Interrupt Controller): x86's interrupt controllers: a local APIC per core and one or more I/O APICs. See [Local APIC and I/O APIC](concepts/apic.md).
- **APIC virtualisation** (APICv): VT-x feature keeping a virtual APIC page the CPU updates without VM exits. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **APLIC** (advanced PLIC): AIA component that takes wired interrupts and delivers them directly or converts them to MSIs. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **Arm generic timer**: The architectural timer of every Armv8 core: a system counter and per-core comparators that raise PPIs. See [Arm generic timer](concepts/arm-generic-timer.md).
- **ASID** (address space identifier): A tag on TLB entries naming an address space; in seL4 it also names a VSpace root. See [Virtual memory](concepts/virtual-memory.md), also [Address spaces (VSpace)](sel4/vspace.md).
- **ASID pool**: Kernel object, made through ASIDControl, from which VSpace roots are assigned ASIDs. See [Address spaces (VSpace)](sel4/vspace.md).
- **astyle**: The formatter upstream requires for kernel C code. See [Contributing a patch](sel4/contributing-a-patch.md).
- **authority**: The second TCB capability passed when setting a priority; the new value must not exceed that thread's MCP. See [Threads and TCBs](sel4/threads.md).
- **AutoCorres**: Isabelle tool that abstracts C read by the C parser into monadic functions easier to reason about; AutoCorres2 is its successor. See [Verifying user-level software](sel4/user-level-verification.md).
- **availability zone**: One of the separate locations within an EC2 region. See [Amazon EC2 and the Nitro system](concepts/ec2.md).

## B

- **badge**: A word set on an endpoint or notification capability by minting, delivered to the receiver to identify the sender. See [Capabilities](sel4/capabilities.md), also [IPC and endpoints](sel4/ipc.md).
- **banked register**: A GIC register of which each core sees its own copy. See [GICv2](concepts/gicv2.md).
- **BAR** (Base Address Register): A PCI configuration-space register giving a window through which a function's registers appear; assigned by firmware. See [PCI and PCI Express](concepts/pci.md).
- **baud rate**: A UART's bit rate, set by dividing an input clock by a programmable divisor. See [UARTs: 16550 and PL011](concepts/uart.md).
- **binary correctness**: A separate proof that one compiled kernel binary refines the C semantics. See [The seL4 proofs](sel4/verification.md).
- **binding (device tree)**: The schema for a kind of node, kept in the Linux tree. See [Device trees](concepts/device-tree.md).
- **BIOS**: The original PC firmware, replaced by UEFI; one of the two firmware paths to GRUB. See [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md).
- **bitfield specification** (`.bf`): File from which the kernel's capability and object accessors are generated. See [Generated code](sel4/generated-code.md).
- **BL31**: The Trusted Firmware-A stage that stays resident at EL3 after boot and serves SMC calls. See [Arm boot flow](concepts/arm-boot.md).
- **bleeding edge**: The head of each repository, recorded in a manifest when tests pass; the alternative to versioned releases. See [Governance and RFCs](sel4/governance.md).
- **block**: An AArch64 large mapping (1 GiB or 2 MiB) made by a descriptor above the last table level. See [AArch64 paging](concepts/aarch64-paging.md).
- **boot mode**: Whether an EC2 image boots by legacy BIOS or UEFI; fixed in the image. See [Amazon EC2 and the Nitro system](concepts/ec2.md), also [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md).
- **boot processor** (BSP): The one core firmware starts a machine on; it starts the others. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **boot services**: UEFI calls (memory allocation, memory map, protocol lookup) available until the OS takes over. See [UEFI](concepts/uefi.md).
- **`BOOT_CODE`**: Marks kernel code that runs once before the first user thread, is then discarded, and is outside the proof. See [Boot code and the proof boundary](sel4/boot-code.md).
- **BootInfo**: The `seL4_BootInfo` page in which the kernel describes to the root task what it handed over. See [BootInfo and the root task](sel4/bootinfo-and-root-task.md).
- **bound notification**: A notification tied to one TCB so that its signals reach the thread while it waits on an endpoint. See [Notifications](sel4/notifications.md).
- **break-before-make**: Arm rule forbidding direct replacement of one valid descriptor by another; invalidate and flush first. See [AArch64 paging](concepts/aarch64-paging.md).
- **budget**: The CPU time a scheduling context may use in each period. See [MCS kernel](sel4/mcs.md).

## C

- **C Parser**: The Isabelle tool (StrictC) that translates the preprocessed kernel into a formal language; also a CI check. See [The verified C subset](sel4/verified-c-subset.md).
- **CakeML**: A verified compiler for a dialect of ML, in HOL4; Pancake reuses its lower stages. See [Verifying user-level software](sel4/user-level-verification.md).
- **CAmkES**: The older component framework, generating glue code and a capDL specification; new work mostly uses Microkit instead. See [CAmkES and capDL](sel4/camkes-capdl.md).
- **canonical address**: An x86-64 address whose unused upper bits copy the top implemented bit; splits the space into low and high halves. See [x86-64 basics](concepts/x86-64-basics.md).
- **cap fault**: Fault raised when a thread uses a capability address that cannot be looked up. See [Faults and fault handlers](sel4/faults.md).
- **capability**: An unforgeable, kernel-held token naming one kernel object plus the rights its holder has. See [Capabilities](sel4/capabilities.md).
- **capability-only type**: A capability type with no object memory behind it, such as IRQControl or IOPort. See [Kernel objects](sel4/kernel-objects.md).
- **capDL**: A language describing a whole system as kernel objects and capabilities, realised at boot by a loader or initialiser. See [CAmkES and capDL](sel4/camkes-capdl.md).
- **capDL initialiser**: The root task (`sel4-capdl-initializer`, in Rust) that builds the system a capDL specification describes; Microkit boots with it. See [Microkit internals](sel4/microkit-internals.md), also [rust-sel4](sel4/rust-sel4.md).
- **cascade**: The slave 8259's output feeding the master's input 2, so IRQ 2 is never a device. See [8259 PIC](concepts/pic-8259.md).
- **CDT** (capability derivation tree): The kernel's record of how capabilities were derived from one another, which makes revocation possible. See [Capabilities](sel4/capabilities.md).
- **cells**: The 32-bit units device tree properties are counted in, sized by `#address-cells` and `#size-cells`. See [Device trees](concepts/device-tree.md).
- **channel**: A Microkit link joining exactly two protection domains, used for notifications and protected procedure calls. See [Microkit](sel4/microkit.md).
- **child (protection domain)**: A PD nested in another in the system description; the parent holds its TCB capability and receives its faults. See [Microkit](sel4/microkit.md).
- **claim/complete**: The PLIC register a handler reads to take an interrupt and writes to finish it. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **CLH lock** (Craig, Landin and Hagersten): The queue lock implementing the SMP kernel's big lock. See [SMP](sel4/smp.md).
- **CLINT**: The RISC-V block that supplies timer and software interrupts, reaching an S-mode kernel through firmware. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **CMake**: The build system that turns `config.cmake` options into `CONFIG_*` macros and builds kernel and projects with Ninja. See [Build system and configuration](sel4/build-system.md).
- **CNode**: A kernel object that is a table of capability slots; CNodes form a CSpace. See [CSpaces and capability addressing](sel4/cspace.md).
- **Cogent**: Functional language whose compiler emitted C plus an Isabelle refinement proof; used for file systems. See [Verifying user-level software](sel4/user-level-verification.md).
- **committer**: A role granted by the Technical Steering Committee; only committers can merge. See [Contributing a patch](sel4/contributing-a-patch.md), also [Governance and RFCs](sel4/governance.md).
- **`compatible`**: The device tree property that names what a node is, on which drivers and seL4's `hardware.yml` match. See [Device trees](concepts/device-tree.md).
- **compile matrix**: The CI job that compiles the kernel for a small set of configurations. See [Upstream CI](sel4/ci.md).
- **completion queue**: Ring on which an NVMe or ENA device reports finished commands, marked new by a phase bit. See [NVMe](concepts/nvme.md).
- **conduit**: Which instruction, `SMC` or `HVC`, an Arm kernel uses to call firmware or a hypervisor. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **confidentiality**: The proved property that one partition cannot learn about another except through channels the policy allows. See [The seL4 proofs](sel4/verification.md).
- **config struct**: The binary per-component configuration sDDF's tooling writes into each program's image. See [sDDF](sel4/sddf.md).
- **configuration space**: The per-function PCI register block that identifies a device and holds its BARs and capabilities list. See [PCI and PCI Express](concepts/pci.md).
- **constant bandwidth**: How MCS treats a scheduling context without the sporadic flag: the thread just gets budget/period of a CPU. See [MCS kernel](sel4/mcs.md).
- **context (PLIC)**: One hart in one privilege mode that can take external interrupts. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **context bank**: The SMMUv2 register set, selected by stream matching, that holds one translation context; few exist. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **context synchronisation event**: What an AArch64 system register write needs before it surely takes effect: in practice `ISB` or an exception return. See [AArch64 basics](concepts/aarch64-basics.md).
- **copier**: sDDF network component that copies received packets into a client's private region. See [sDDF networking](sel4/sddf-net.md).
- **CPIO**: The archive format in which the elfloader carries the kernel and root task ELF files. See [Elfloader](sel4/elfloader.md).
- **CPL** (current privilege level): The privilege level held in processor state and checked on each sensitive operation. See [Privilege levels](concepts/privilege-levels.md).
- **CPtr** (capability pointer): A word resolved through a thread's CSpace, a few bits at a time, to a capability slot. See [CSpaces and capability addressing](sel4/cspace.md).
- **CPU interface**: The per-core part of a GIC where the kernel acknowledges and completes interrupts. See [GICv2](concepts/gicv2.md).
- **CPUID**: The x86 instruction that reports processor features, by leaf and subleaf. See [CPUID and MSRs](concepts/cpuid-and-msrs.md).
- **CR3**: The x86 control register holding the root of the current page tables. See [x86-64 paging](concepts/x86-paging.md).
- **CSM** (compatibility support module): Lets UEFI firmware emulate a BIOS and boot an MBR disk. See [UEFI](concepts/uefi.md).
- **CSpace**: The tree of CNodes reachable from a thread's root CNode: the capabilities it can name. See [CSpaces and capability addressing](sel4/cspace.md).
- **CSR** (control and status register): A RISC-V privileged register such as `satp`, `stvec` or `scause`. See [RISC-V basics](concepts/riscv-basics.md).

## D

- **dataport**: A CAmkES interface kind: memory shared between components. See [CAmkES and capDL](sel4/camkes-capdl.md).
- **DBG2**: ACPI table listing debug ports, in the same manner as the SPCR. See [UARTs: 16550 and PL011](concepts/uart.md).
- **DCO** (Developer Certificate of Origin): What a `Signed-off-by` line asserts: the right to submit the change under the file's licence. See [Contributing a patch](sel4/contributing-a-patch.md).
- **decode**: The first half of handling an invocation, where all checks belong; invoke then performs it. See [System calls and invocations](sel4/syscalls-and-invocations.md).
- **depth**: How many CPtr bits a CNode invocation resolves when naming a slot. See [CSpaces and capability addressing](sel4/cspace.md).
- **descriptor (AArch64)**: An entry in an AArch64 translation table. See [AArch64 paging](concepts/aarch64-paging.md).
- **design specification**: The executable specification in l4v, generated from the Haskell prototype. See [l4v and Isabelle](sel4/l4v.md).
- **device tree**: A data structure describing hardware that cannot be discovered by probing. See [Device trees](concepts/device-tree.md).
- **device untyped**: An untyped covering memory that is not kernel RAM; it can be retyped only into frames or smaller device untypeds. See [Untyped memory and retyping](sel4/untyped-memory.md).
- **DeviceID**: How a GICv3 ITS identifies the device that wrote an MSI; for PCI, derived from the requester ID. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **distributor** (GICD): The shared part of a GIC that enables, prioritises and routes interrupts. See [GICv2](concepts/gicv2.md).
- **divisor**: The programmable value dividing a UART's input clock to give the baud rate. See [UARTs: 16550 and PL011](concepts/uart.md).
- **Djawula**: Trustworthy Systems' project for a provably secure, dynamic, general-purpose operating system on seL4. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **DLAB** (divisor latch access bit): Bit 7 of the 16550 line control register. See [UARTs: 16550 and PL011](concepts/uart.md).
- **DMA** (direct memory access): A device reading or writing memory itself; without an IOMMU a driver using it must be trusted. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **DMAR**: The ACPI table describing Intel VT-d IOMMUs, with DRHD and RMRR entries. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **domain ID**: The VT-d tag on IOTLB entries, as a PCID or ASID is for the CPU. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **domain scheduler**: The optional fixed-schedule layer above priorities: the kernel cycles through a list of (domain, duration) entries. See [Scheduling](sel4/scheduling.md).
- **doorbell**: A device register a driver writes to say a ring has new entries. See [NVMe](concepts/nvme.md), also [ENA](concepts/ena.md).
- **double fault**: A fault while delivering a fault; the kernel makes the thread inactive. See [Faults and fault handlers](sel4/faults.md).
- **DQO**: The newer gVNIC descriptor format: little-endian, with separate rings in each direction. See [gVNIC](concepts/gvnic.md).
- **DRHD** (DMA remapping hardware unit definition): DMAR entry, one per IOMMU, giving its register page and devices. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **driver VM**: A Linux guest given a device by pass-through purely to reuse its driver. See [Virtualisation support](sel4/hypervisor.md), also [LionsOS and libvmm](sel4/lionsos.md).
- **DSDT**: The ACPI table of AML bytecode describing devices, pointed to by the FADT. See [ACPI tables](concepts/acpi-tables.md).
- **DTB** (devicetree blob): The compiled binary form of a device tree. See [Device trees](concepts/device-tree.md).
- **dtc**: The device tree compiler, which converts between DTS and DTB. See [Device trees](concepts/device-tree.md).
- **DTS**: The source form of a device tree. See [Device trees](concepts/device-tree.md).

## E

- **EBS** (Elastic Block Store): EC2's network disks, which appear to the guest as NVMe controllers. See [Amazon EC2 and the Nitro system](concepts/ec2.md), also [NVMe](concepts/nvme.md).
- **EC** (exception class): The field of `ESR_ELx` (bits 31 to 26) saying what kind of exception occurred. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **EC2**: Amazon's virtual machine service, run on the Nitro system. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **ECAM**: The memory-mapped PCI Express configuration space, located by the ACPI MCFG table. See [PCI and PCI Express](concepts/pci.md).
- **edge-triggered**: An interrupt signalled by a transition rather than a held level. See [IRQ](concepts/irq.md).
- **EFI system partition** (ESP): The FAT partition from which UEFI firmware loads a boot loader. See [UEFI](concepts/uefi.md), also [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md).
- **EL** (exception level): Arm's privilege levels, EL0 to EL3; a higher number is more privileged. See [Privilege levels](concepts/privilege-levels.md), also [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **EL0**: The Arm exception level of user code; seL4's native threads run here. See [Privilege levels](concepts/privilege-levels.md).
- **EL1**: The Arm exception level of an operating system kernel; a non-hypervisor seL4 runs here. See [Privilege levels](concepts/privilege-levels.md).
- **EL2**: The Arm exception level for a hypervisor; seL4 built as a hypervisor runs entirely here. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **EL3**: The Arm exception level of secure firmware, where BL31 stays resident. See [Privilege levels](concepts/privilege-levels.md), also [Arm boot flow](concepts/arm-boot.md).
- **ELF** (Executable and Linkable Format): The file format of every kernel, loader and user program in an seL4 system. See [ELF and linking](concepts/elf.md).
- **elfloader**: The Arm and RISC-V boot program that loads kernel and root task, enables the MMU and starts the other cores. See [Elfloader](sel4/elfloader.md).
- **ENA** (Elastic Network Adapter): Amazon's network card, the only NIC on EC2 Nitro instances. See [ENA](concepts/ena.md).
- **endpoint**: The kernel object at which threads rendezvous to pass a synchronous IPC message. See [IPC and endpoints](sel4/ipc.md).
- **endpoint (PCI)**: A device at the end of a PCI Express link, as opposed to a switch or the root complex. See [PCI and PCI Express](concepts/pci.md).
- **EOI** (end of interrupt): The write by which a handler tells the local APIC it has finished an interrupt. See [Local APIC and I/O APIC](concepts/apic.md).
- **EPT** (Extended Page Tables): Intel's second stage of address translation, mapping guest-physical to host-physical addresses. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **`ESR_ELx`**: The AArch64 syndrome register describing why an exception was taken. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **EventID**: The value a device writes to the ITS to say which of its interrupts fired. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **exception**: A synchronous entry to the kernel caused by the instruction being executed. See [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md).
- **execution state**: AArch64 or AArch32: which register width and instruction set an Arm core is running. See [AArch64 basics](concepts/aarch64-basics.md).

## F

- **FADT**: The ACPI table of fixed hardware, which also points to the DSDT. See [ACPI tables](concepts/acpi-tables.md).
- **fast call**: An SMCCC call that is short, atomic and runs with interrupts masked, unlike a yielding call. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **fastpath**: The kernel's hand-optimised code for the common IPC case. See [IPC and endpoints](sel4/ipc.md).
- **fault endpoint**: The endpoint to which the kernel sends a message describing a thread's fault. See [Faults and fault handlers](sel4/faults.md).
- **fault handler**: The user-level thread that receives fault messages and may reply to resume the faulting thread. See [Faults and fault handlers](sel4/faults.md).
- **fault status code**: The low ISS bits of an abort's syndrome: translation, access flag or permission fault. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **FDT** (flattened device tree): The binary device tree format; another name for the DTB. See [Device trees](concepts/device-tree.md).
- **feature bits**: The flags by which a virtio device and driver agree what they both support. See [virtio](concepts/virtio.md).
- **foreign system call**: A system call instruction run by a program built for another operating system, which seL4 should report as a fault. See [Trapping foreign system calls](sel4/foreign-syscalls.md).
- **frame**: A kernel object that is a page of memory, mapped at the leaves of a VSpace. See [Address spaces (VSpace)](sel4/vspace.md).
- **free index**: An untyped's watermark, below which memory has been given out. See [Untyped memory and retyping](sel4/untyped-memory.md).
- **free queue**: sDDF queue of descriptors for buffers that are empty and available, as opposed to the active queue. See [sDDF networking](sel4/sddf-net.md).
- **FSGSBASE**: x86 instructions letting any ring read and write the FS and GS bases. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **function (PCI)**: The addressable unit of PCI, at a bus:device.function address with its own configuration space. See [PCI and PCI Express](concepts/pci.md).
- **function identifier**: The value in `x0` selecting which SMCCC service is called. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **functional correctness**: The proof that the kernel's C code behaves as the abstract specification says. See [The seL4 proofs](sel4/verification.md).

## G

- **gate**: An IDT entry naming a handler address, code segment and the privilege allowed to invoke it. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **GCE** (Google Compute Engine): Google Cloud's virtual machine service, a KVM-based hypervisor with Google's own device model. See [Google Compute Engine](concepts/gce.md).
- **GDT** (global descriptor table): The x86 table of segment descriptors, chosen by selectors. See [x86-64 basics](concepts/x86-64-basics.md).
- **GIC** (Generic Interrupt Controller): Arm's standard interrupt controller, in versions GICv2 and GICv3; GICv4 and GICv5 are later revisions. See [GICv2](concepts/gicv2.md), also [GICv3 and the ITS](concepts/gicv3-its.md).
- **GICC**: The memory-mapped per-core CPU interface of a GICv2. See [GICv2](concepts/gicv2.md).
- **GICD**: The GIC distributor's registers. See [GICv2](concepts/gicv2.md).
- **GICH**: The GICv2 hypervisor interface, holding the list registers. See [GICv2](concepts/gicv2.md).
- **GICR**: The registers of a GICv3 redistributor. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **GICv2**: Arm's older interrupt controller: at most eight cores, every register memory-mapped. See [GICv2](concepts/gicv2.md).
- **GICv3**: Arm's interrupt controller with a distributor, per-core redistributors, a CPU interface and optionally an ITS. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **GICv4**: GICv3 plus direct injection of virtual interrupts into guests; GICv4.1 adds virtual SGIs. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **GICv5**: Arm's redesigned interrupt controller of 2025, not backward compatible with GICv3. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **Gitlint**: The CI check on commit message format. See [Upstream CI](sel4/ci.md).
- **global page**: An x86 mapping (G bit) that stays in the TLB across `CR3` writes; used for kernel mappings. See [x86-64 paging](concepts/x86-paging.md).
- **GPT** (GUID Partition Table): The disk partitioning scheme a cloud boot image uses. See [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md).
- **GQI**: The original gVNIC descriptor format: big-endian, one ring per queue consumed strictly in order. See [gVNIC](concepts/gvnic.md).
- **Grant**: The endpoint right allowing capabilities to be passed in a message. See [IPC and endpoints](sel4/ipc.md).
- **GrantReply**: The endpoint right allowing a `Call` whose receiver gets a reply capability but no other capabilities. See [IPC and endpoints](sel4/ipc.md).
- **granule**: The smallest page and table size of an AArch64 translation regime: 4, 16 or 64 KiB. See [AArch64 paging](concepts/aarch64-paging.md).
- **Graviton**: Amazon's Arm processors, behind EC2 instance types with a `g` processor letter. See [EC2 instance types](concepts/ec2-instance-types.md), also [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **GRUB**: The usual x86 boot loader, which loads seL4 by Multiboot. See [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md).
- **GSI** (global system interrupt): A machine-wide number for an I/O APIC pin: the APIC's GSI base plus the pin. See [Local APIC and I/O APIC](concepts/apic.md).
- **guard**: A bit pattern in a CNode capability that must match the CPtr's next bits before the radix bits are read. See [CSpaces and capability addressing](sel4/cspace.md).
- **guest-physical address**: What a guest believes is a physical address; EPT translates it. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **gVisor**: A user-space kernel in Go that implements a Linux-like interface for containers. See [A Linux personality on seL4](sel4/linux-personality.md).
- **gVNIC**: Compute Engine's own paravirtual network card, with GQI and DQO descriptor formats. See [gVNIC](concepts/gvnic.md).

## H

- **`hardware.yml`**: The kernel file that matches device tree `compatible` strings to decide which devices the kernel uses. See [Platform ports](sel4/platform-port.md), also [Generated code](sel4/generated-code.md).
- **hart**: RISC-V's word for a hardware thread, its unit of execution. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md), also [RISC-V basics](concepts/riscv-basics.md).
- **Haskell prototype**: An executable model of the kernel in l4v, kept in sync with the C and source of the design specification. See [l4v and Isabelle](sel4/l4v.md).
- **`HCR_EL2`**: The Arm register of trap controls with which a hypervisor configures EL2. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **HOL4**: The interactive theorem prover in which CakeML and Pancake are verified. See [Verifying user-level software](sel4/user-level-verification.md).
- **HPET** (High Precision Event Timer): A memory-mapped x86 timer with one main counter and several comparators, found through ACPI. See [HPET](concepts/hpet.md).
- **HS-mode** (hypervisor-extended supervisor): RISC-V's S-mode with the hypervisor extension, which adds VS and VU modes for guests. See [Privilege levels](concepts/privilege-levels.md).
- **HSM** (Hart State Management): The SBI extension by which a RISC-V kernel or loader starts other harts. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **HSR** (hyp syndrome register): Arm's older, AArch32 name for `ESR_EL2`, which seL4's API uses. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **Hurd**: The GNU project's multiserver operating system, a set of servers on the Mach microkernel. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **HVC**: The Arm instruction that calls a hypervisor at EL2; one of the two SMCCC conduits. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **hypervisor CPUID leaves**: CPUID leaves from `0x40000000` in which a hypervisor identifies itself and may give timer rates. See [Hypervisor CPUID leaves](concepts/hypervisor-cpuid-leaves.md).

## I

- **I/O APIC** (IOAPIC): The x86 controller that routes device interrupt pins to vectors on chosen cores through its redirection table. See [Local APIC and I/O APIC](concepts/apic.md).
- **I/O permission bitmap**: A bitmap in the TSS, one bit per port, saying which I/O ports user code may use. See [I/O ports and MMIO](concepts/io-ports.md).
- **I/O port**: An address in x86's separate 16-bit space for device registers, reached with `in` and `out`. See [I/O ports and MMIO](concepts/io-ports.md).
- **ICW** (initialisation command word): One of the bytes written in sequence to set up an 8259. See [8259 PIC](concepts/pic-8259.md).
- **idle thread**: The per-core thread the kernel creates at boot, with no capability to it, run when nothing else can. See [Threads and TCBs](sel4/threads.md).
- **IDT** (interrupt descriptor table): The x86 table of gates, indexed by vector, through which exceptions and interrupts enter the kernel. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **IMSIC** (incoming message-signalled interrupt controller): AIA component, one per hart, that receives MSIs as memory writes. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **INIT**: The IPI that resets an x86 application processor before a STARTUP IPI starts it. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **initialiser**: See capDL initialiser. See [Microkit internals](sel4/microkit-internals.md).
- **instance store**: A local SSD on some EC2 types, with its own NVMe controller, erased when the instance stops. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **instance type**: An EC2 machine shape such as `m7g.large`; its name encodes CPU, generation, options and size. See [EC2 instance types](concepts/ec2-instance-types.md).
- **integrity**: The proved property that a thread cannot modify anything without a capability authorising it. See [The seL4 proofs](sel4/verification.md).
- **interrupt source override**: A MADT entry saying an ISA IRQ is wired to a different I/O APIC pin or polarity. See [ACPI tables](concepts/acpi-tables.md), also [ISA](concepts/isa.md).
- **INTID**: A GIC interrupt number; device tree numbers are offset from it. See [GICv2](concepts/gicv2.md).
- **intransitive non-interference**: The information-flow property proved of seL4's specification, alongside confidentiality. See [The seL4 proofs](sel4/verification.md).
- **invariant TSC**: A TSC that ticks at a constant rate regardless of power management. See [TSC](concepts/tsc.md).
- **invocation**: A message sent to a capability whose label selects the method; every operation on a kernel object is one. See [System calls and invocations](sel4/syscalls-and-invocations.md).
- **invocation stub**: Generated libsel4 C on top of `seL4_Call` that marshals arguments into message registers. See [libsel4 and the runtime](sel4/libsel4.md).
- **IOMMU**: Hardware that translates and restricts the memory addresses devices use for DMA. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **IOPL** (I/O privilege level): Two `RFLAGS` bits: rings numbered at or below it may use all I/O ports. See [I/O ports and MMIO](concepts/io-ports.md).
- **IOPort**: The seL4 capability to a range of x86 I/O ports, issued from IOPortControl. See [I/O ports and MMIO](concepts/io-ports.md).
- **IORT**: The ACPI table describing SMMUs and how requester IDs map to stream IDs and ITS device IDs. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **IOSpace**: The seL4 capability type for IOMMU address spaces; the root task gets one master cap. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **IPA** (intermediate physical address): What an Arm guest sees as a physical address, translated again by stage 2. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md), also [AArch64 paging](concepts/aarch64-paging.md).
- **IPC** (inter-process communication): seL4's synchronous message passing between threads through endpoints. See [IPC and endpoints](sel4/ipc.md).
- **IPC buffer**: A page shared between a thread and the kernel holding message words that do not fit in registers. See [IPC and endpoints](sel4/ipc.md).
- **IPI** (inter-processor interrupt): An interrupt one core sends another, used for rescheduling, TLB shootdown and starting cores. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md), also [Local APIC and I/O APIC](concepts/apic.md).
- **IRQ** (interrupt request): A device's signal that it needs the CPU, turned by an interrupt controller into a numbered interrupt. See [IRQ](concepts/irq.md).
- **IRQControl**: The root task's capability from which one IRQHandler capability per interrupt is made. See [Interrupt delivery](sel4/irq-handling.md).
- **IRQHandler**: The capability to one interrupt: a driver binds a notification to it and acknowledges through it. See [Interrupt delivery](sel4/irq-handling.md).
- **ISA** (Industry Standard Architecture): The PC's original bus, surviving as the legacy devices at fixed I/O ports and IRQs 0 to 15. See [ISA](concepts/isa.md).
- **ISA** (instruction set architecture): The other meaning: the instruction set of a processor, as in RISC-V extensions. See [ISA](concepts/isa.md).
- **Isabelle/HOL**: The proof assistant in which seL4's specifications and proofs are written. See [l4v and Isabelle](sel4/l4v.md).
- **ISS** (instruction-specific syndrome): The low 25 bits of `ESR_ELx`, whose meaning depends on the exception class. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **IST** (interrupt stack table): Seven stack pointers in the TSS that an interrupt gate can demand unconditionally. See [x86-64 basics](concepts/x86-64-basics.md), also [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **ITS** (Interrupt Translation Service): The GICv3 component that turns devices' MSI writes into LPIs using tables in memory. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **IVRS**: The ACPI table describing AMD-Vi. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).

## K

- **Kani**: Bounded model checker for Rust, built on CBMC. See [Verifying user-level software](sel4/user-level-verification.md).
- **keep-alive**: An AENQ event the ENA device sends about once a second. See [ENA](concepts/ena.md).
- **kernel log buffer**: A large frame user level supplies for the kernel's tracing output. See [Debugging](sel4/debugging.md).
- **kernel object**: One of the fixed set of types the kernel implements (TCB, endpoint, CNode, frame ...), created by retyping untyped memory. See [Kernel objects](sel4/kernel-objects.md).
- **kernel window**: The region of kernel virtual addresses mapping physical memory at a fixed offset. See [x86-64 paging](concepts/x86-paging.md).
- **KVM**: Linux's hardware virtualisation, with which QEMU runs guest code directly; also the basis of Compute Engine. See [QEMU](concepts/qemu.md).

## L

- **l4v**: The repository holding the Isabelle/HOL specifications and proofs of seL4. See [l4v and Isabelle](sel4/l4v.md).
- **label**: The field of the message info word that selects an invocation's method. See [System calls and invocations](sel4/syscalls-and-invocations.md).
- **LAPIC** (local APIC): The per-core x86 controller that takes interrupts, sends IPIs and holds a timer. See [Local APIC and I/O APIC](concepts/apic.md).
- **LAPIC timer**: The per-core x86 timer, a countdown at an unknown rate or an absolute TSC deadline. See [Local APIC timer and TSC deadline mode](concepts/lapic-timer.md).
- **LBA format**: The NVMe namespace setting that gives the block size, 512 or 4096 bytes. See [NVMe](concepts/nvme.md).
- **leaf**: The number in `eax` selecting what `cpuid` reports; some leaves take a subleaf in `ecx`. See [CPUID and MSRs](concepts/cpuid-and-msrs.md).
- **Lean**: A theorem prover that is also a programming language; used as the prover for Rust via Aeneas. See [Verifying user-level software](sel4/user-level-verification.md).
- **level-triggered**: An interrupt asserted for as long as the device holds its line. See [IRQ](concepts/irq.md).
- **libmicrokit**: The library a Microkit protection domain is written against; it provides the event loop. See [Microkit](sel4/microkit.md).
- **libsel4**: The kernel's ABI written down as C: types, constants, system call wrappers and invocation stubs. See [libsel4 and the runtime](sel4/libsel4.md).
- **libvmm**: Trustworthy Systems' library for writing virtual machine monitors on Microkit. See [LionsOS and libvmm](sel4/lionsos.md).
- **linker script**: The file that decides where each section of an image is loaded and at which address it runs. See [ELF and linking](concepts/elf.md).
- **Linuxulator**: FreeBSD's support for running unmodified Linux binaries. See [A Linux personality on seL4](sel4/linux-personality.md).
- **LionsOS**: Trustworthy Systems' operating system kit assembled from Microkit protection domains and sDDF drivers. See [LionsOS and libvmm](sel4/lionsos.md).
- **list register**: A register of the GIC's hypervisor interface through which a hypervisor presents a virtual interrupt to a guest. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **LLQ** (low-latency queue): ENA push mode: the driver writes descriptors and the first packet bytes straight to the device. See [ENA](concepts/ena.md).
- **load address**: The physical address at which an ELF segment is placed, as distinct from the virtual address it runs at. See [ELF and linking](concepts/elf.md).
- **LPI** (Locality-specific Peripheral Interrupt): The GICv3 interrupt class that MSIs arrive as, by way of the ITS. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **`ltimer`**: util_libs' timer interface, implemented per platform. See [seL4_libs and util_libs](sel4/sel4-libs.md).
- **LVT** (local vector table): The local APIC's configuration of its own sources, such as the timer and `LINT` pins. See [Local APIC and I/O APIC](concepts/apic.md).
- **lwIP**: The usual network stack for an sDDF client. See [sDDF networking](sel4/sddf-net.md).

## M

- **M-mode**: RISC-V's machine mode, the most privileged, used by firmware. See [Privilege levels](concepts/privilege-levels.md), also [RISC-V basics](concepts/riscv-basics.md).
- **machine interface**: The hardware operations the specifications call, whose behaviour the proofs assume. See [l4v and Isabelle](sel4/l4v.md).
- **machine queue**: The scripts and service through which upstream CI runs tests on real boards. See [Upstream CI](sel4/ci.md).
- **machine type**: A Compute Engine machine shape such as `c4a-standard-2`; its series decides architecture, NIC and disk interface. See [Compute Engine machine types](concepts/gce-machine-types.md).
- **MADT** (Multiple APIC Description Table): The ACPI table (signature `APIC`) listing local APICs, I/O APICs and interrupt source overrides. See [ACPI tables](concepts/acpi-tables.md).
- **maintenance interrupt**: The interrupt a GIC raises to tell a hypervisor a list register has freed up. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **management interrupt**: The gVNIC interrupt telling the driver to read the device status. See [gVNIC](concepts/gvnic.md).
- **manifest**: A file defining a consistent set of repository versions; a manifest repository records which kernel commit the proofs match. See [Ecosystem and repositories](sel4/ecosystem.md).
- **MCFG**: The ACPI table that locates PCI Express configuration space (ECAM). See [ACPI tables](concepts/acpi-tables.md), also [PCI and PCI Express](concepts/pci.md).
- **MCP** (maximum controlled priority): The highest priority a thread may give to a thread, itself included. See [Threads and TCBs](sel4/threads.md), also [Scheduling](sel4/scheduling.md).
- **MCS** (mixed-criticality systems): The kernel build option replacing the periodic tick with scheduling contexts and one-shot timer deadlines. See [MCS kernel](sel4/mcs.md).
- **MDB** (mapping database): The kernel's Haskell-derived name for the structure behind the capability derivation tree. See [Capabilities](sel4/capabilities.md).
- **message info**: The tag word of an IPC message (`seL4_MessageInfo_t`): label, length and capability counts. See [IPC and endpoints](sel4/ipc.md).
- **metadata server**: The HTTP service at `169.254.169.254` from which a Compute Engine guest reads its configuration. See [Google Compute Engine](concepts/gce.md).
- **metaprogram**: The Python script (`meta.py`) that generates an sDDF system's description and config structs. See [sDDF](sel4/sddf.md).
- **microkernel**: A kernel that provides only mechanisms (threads, address spaces, IPC, access control) and leaves policy to user level. See [seL4 overview](sel4/overview.md).
- **Microkit**: The seL4 Foundation's small SDK for static systems of protection domains described in XML. See [Microkit](sel4/microkit.md).
- **minimality principle**: The L4 rule that the kernel contains only what cannot be done at user level. See [History and key papers](sel4/history-and-papers.md).
- **Mint**: The CNode invocation that copies a capability and also sets its badge or guard. See [Capabilities](sel4/capabilities.md).
- **MMIO** (memory-mapped I/O): Device registers reached as memory addresses, mapped uncached, rather than through I/O ports. See [I/O ports and MMIO](concepts/io-ports.md).
- **MMU** (memory management unit): The hardware that translates virtual addresses to physical ones through page tables. See [Virtual memory](concepts/virtual-memory.md).
- **monitor**: The Microkit component that is the fault handler of last resort and prints fault dumps. See [Microkit internals](sel4/microkit-internals.md).
- **monolithic kernel**: A kernel that implements file systems, networking and drivers itself, in one privileged address space. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **`MPIDR`**: The Arm register identifying a core; PSCI `CPU_ON` takes its values, not indices. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **MR** (memory region): In Microkit, a range of memory declared in the system description and mapped into protection domains. See [Microkit](sel4/microkit.md).
- **MR** (message register): One word of an IPC message, held in a CPU register or the IPC buffer. See [IPC and endpoints](sel4/ipc.md).
- **MSI** (Message Signalled Interrupt): A PCI device interrupts by writing a value to an address; up to 32 vectors, set in configuration space. See [MSI and MSI-X](concepts/msi-msix.md).
- **MSI-X**: The MSI variant with up to 2048 vectors, configured from a table in a BAR. See [MSI and MSI-X](concepts/msi-msix.md).
- **MSR** (model-specific register): An x86 control register reached with `rdmsr`/`wrmsr`. See [CPUID and MSRs](concepts/cpuid-and-msrs.md).
- **`MSR` (Arm)**: The AArch64 instruction that writes a system register; `MRS` reads one. See [AArch64 basics](concepts/aarch64-basics.md).
- **Multiboot**: The protocols (versions 1 and 2) by which GRUB hands seL4 its memory map, root task image and ACPI pointer. See [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md).
- **multikernel**: A one-kernel-per-core design being pursued because the SMP configuration is not verified. See [SMP](sel4/smp.md).
- **multiserver operating system**: An operating system built from separate user-level servers above a microkernel. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **musllibc**: The old fork of the musl C library used by the classic user-level libraries. See [libsel4 and the runtime](sel4/libsel4.md).
- **MXR** (make executable readable): RISC-V status bit letting loads succeed on execute-only pages. See [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).

## N

- **namespace**: A disk behind an NVMe controller, numbered from 1. See [NVMe](concepts/nvme.md).
- **Native API (NT)**: The `Nt*` calls exported by `ntdll.dll`, the interface below Win32 that the NT Executive serves. See [Neptune OS](sel4/neptune-os.md).
- **Neptune OS**: An independent project that runs a reimplemented NT Executive as the seL4 root task. See [Neptune OS](sel4/neptune-os.md).
- **nested virtualisation**: Running a hypervisor inside a virtual machine, as seL4's hypervisor mode needs when the kernel itself runs in a virtual machine. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md), also [Compute Engine machine types](concepts/gce-machine-types.md).
- **Ninja**: The build tool CMake generates files for. See [Build system and configuration](sel4/build-system.md).
- **Nitro**: The system EC2 runs on: a hypervisor plus cards that provide network and storage devices. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **NT Executive**: The part of Windows NT that implements objects, processes, I/O and memory management. See [Neptune OS](sel4/neptune-os.md).
- **NMI** (non-maskable interrupt): An x86 interrupt that the interrupt flag does not mask. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **notification**: A kernel object holding one word of pending signal bits; signalling never blocks. See [Notifications](sel4/notifications.md).
- **NVMe**: The standard PCI storage controller interface, used by EC2 for every disk. See [NVMe](concepts/nvme.md).

## O

- **OCW** (operation command word): A byte written to an 8259 in normal operation, for example to mask lines. See [8259 PIC](concepts/pic-8259.md).
- **OpenSBI**: The usual M-mode firmware under seL4 on RISC-V, providing the SBI. See [RISC-V basics](concepts/riscv-basics.md), also [Elfloader](sel4/elfloader.md).
- **overlay**: A fragment applied on top of a base device tree, adding or overriding nodes and properties. See [Device trees](concepts/device-tree.md).

## P

- **packed virtqueue**: The newer virtqueue layout, an alternative to the split one. See [virtio](concepts/virtio.md).
- **Pancake**: Small imperative language for verifiable drivers, with a compiler verified in HOL4 on top of CakeML. See [Verifying user-level software](sel4/user-level-verification.md).
- **paravirtual device**: A device designed for a guest that knows it is virtualised, such as virtio. See [virtio](concepts/virtio.md).
- **pass-through**: Giving a guest direct access to a real device; without an IOMMU it breaks isolation. See [Virtualisation support](sel4/hypervisor.md).
- **passive protection domain**: A Microkit PD that gives up its scheduling context after `init` and then runs only on its callers'. See [Microkit](sel4/microkit.md).
- **passive server**: On MCS, a server with no scheduling context of its own that runs on its caller's when called. See [MCS kernel](sel4/mcs.md).
- **PAT** (page attribute table): An x86 MSR of eight cache-mode slots chosen per page. See [x86-64 paging](concepts/x86-paging.md).
- **`pc99`**: The single x86 platform of the seL4 kernel. See [Platform ports](sel4/platform-port.md).
- **PCI**: The bus by which almost every device is found: functions with configuration spaces and BARs. See [PCI and PCI Express](concepts/pci.md).
- **PCI Express**: The serial successor to PCI, keeping its software model: a root complex, switches and endpoints. See [PCI and PCI Express](concepts/pci.md).
- **PCID** (process-context identifier): x86's tag on TLB entries, its equivalent of an ASID; often hidden in VMs. See [x86-64 paging](concepts/x86-paging.md).
- **PD** (page directory): The level 2 x86 page table, whose entries can map 2 MiB pages. See [x86-64 paging](concepts/x86-paging.md).
- **PD** (protection domain): Microkit's unit of isolation: a single-threaded program with its own address space and capabilities. See [Microkit](sel4/microkit.md).
- **PDPT** (page directory pointer table): The level 3 x86 page table, whose entries can map 1 GiB pages. See [x86-64 paging](concepts/x86-paging.md).
- **PE/COFF**: The executable format UEFI loads. See [UEFI](concepts/uefi.md).
- **period**: The interval over which a scheduling context's budget may be used. See [MCS kernel](sel4/mcs.md).
- **personality (OS personality)**: A layer that presents one operating system's interface on another kernel. See [A Linux personality on seL4](sel4/linux-personality.md).
- **phandle**: A number unique to a device tree node, by which other nodes refer to it. See [Device trees](concepts/device-tree.md).
- **phase bit**: A bit in each completion entry that the device flips to mark new entries on a ring. See [ENA](concepts/ena.md), also [NVMe](concepts/nvme.md).
- **physical memory window**: The Arm kernel's mapping of all RAM at a fixed offset; it bounds usable RAM. See [AArch64 paging](concepts/aarch64-paging.md).
- **PIC** (programmable interrupt controller): See 8259 PIC. See [8259 PIC](concepts/pic-8259.md).
- **PIE** (position-independent executable): An ELF file whose code works at any load address. See [ELF and linking](concepts/elf.md).
- **PIT** (Programmable Interval Timer): The PC's original timer chip, a 16-bit down-counter at 1 193 182 Hz, against which seL4 calibrates. See [PIT](concepts/pit.md).
- **PL011**: Arm's UART. See [UARTs: 16550 and PL011](concepts/uart.md).
- **platform**: The kernel's build-time description of one board or machine family. See [Platform ports](sel4/platform-port.md).
- **platform owner**: The person who keeps a platform's tests passing on `master`. See [Platform ports](sel4/platform-port.md).
- **PLIC** (Platform-Level Interrupt Controller): The RISC-V controller for external interrupts, which seL4 drives directly. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **PML4**: The top-level x86-64 page table, rooted at `CR3`. See [x86-64 paging](concepts/x86-paging.md).
- **polarity**: Whether an asserted interrupt line means high or low. See [IRQ](concepts/irq.md).
- **posted interrupts**: VT-x feature delivering an interrupt to a running guest with no VM exit. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **PPC** (protected procedure call): A Microkit call over a channel into a higher-priority PD, which runs and replies. See [Microkit](sel4/microkit.md).
- **PPI** (Private Peripheral Interrupt): GIC interrupts 16 to 31, for devices that exist once per core, such as the generic timer. See [GICv2](concepts/gicv2.md).
- **preemption point**: An explicit place in a long kernel operation where interrupts are checked and the system call may abort and restart. See [Kernel design and execution model](sel4/kernel-design.md).
- **preprocess check**: The CI check showing whether a pull request changes the preprocessed C that the proofs read. See [Upstream CI](sel4/ci.md), also [Proof impact of a change](sel4/proof-impact.md).
- **program header**: An ELF table entry describing a segment to load. See [ELF and linking](concepts/elf.md).
- **protocol (UEFI)**: An interface, identified by GUID, through which UEFI devices and services are reached. See [UEFI](concepts/uefi.md).
- **PRP** (physical region page): An NVMe data pointer: the physical address of a memory page. See [NVMe](concepts/nvme.md).
- **`ps_io_ops`**: util_libs' interface behind which platform drivers reach device memory, ports and interrupts. See [seL4_libs and util_libs](sel4/sel4-libs.md).
- **PSCI** (Power State Coordination Interface): Arm's standard firmware service for starting, stopping and resetting cores. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **PSTATE**: The AArch64 processor state, a set of fields reached separately rather than one flags register. See [AArch64 basics](concepts/aarch64-basics.md).
- **PT** (page table): The level 1 x86 page table, mapping 4 KiB pages. See [x86-64 paging](concepts/x86-paging.md).
- **`PT_LOAD`**: The program header type for a segment that must be loaded into memory. See [ELF and linking](concepts/elf.md).

## Q

- **QEMU**: A full-system emulator, with TCG or KVM, where most seL4 development first runs. See [QEMU](concepts/qemu.md).
- **QPL** (queue page list): gVNIC addressing mode in which the driver registers a fixed set of pages per queue. See [gVNIC](concepts/gvnic.md).

## R

- **radix**: A CNode has 2^radix slots, so radix bits of a CPtr select one. See [CSpaces and capability addressing](sel4/cspace.md).
- **RDA** (raw DMA addressing): gVNIC addressing mode in which descriptors carry guest-physical addresses. See [gVNIC](concepts/gvnic.md).
- **ready queue**: The per-priority queue of runnable threads; the current thread is not in one. See [Scheduling](sel4/scheduling.md).
- **real mode**: The 16-bit mode in which an x86 core starts. See [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md), also [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **receive slot**: The empty CSpace slot a receiver names beforehand to accept a transferred capability. See [IPC and endpoints](sel4/ipc.md).
- **redirection table**: The I/O APIC's table of one 64-bit entry per pin, giving vector, destination and trigger. See [Local APIC and I/O APIC](concepts/apic.md).
- **redistributor**: The per-core GICv3 component handling that core's private interrupts and LPIs. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **refill**: A pair (time usable from, amount) by which MCS tracks a scheduling context's budget. See [MCS kernel](sel4/mcs.md).
- **refinement**: Every behaviour of the lower layer is one the upper layer allows; how each proof layer relates to the next. See [The seL4 proofs](sel4/verification.md).
- **region**: An EC2 geographic area, containing availability zones. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **release queue**: The per-core MCS queue of threads waiting for their next refill. See [MCS kernel](sel4/mcs.md).
- **relocation**: A note saying "patch the address of symbol S into this location". See [ELF and linking](concepts/elf.md).
- **reply capability**: On non-MCS kernels, the one-shot capability a `Call` gives the receiver to answer its caller. See [IPC and endpoints](sel4/ipc.md).
- **reply object**: On MCS, the kernel object that holds a caller's reply state and links donated scheduling contexts. See [IPC and endpoints](sel4/ipc.md), also [MCS kernel](sel4/mcs.md).
- **requester ID**: The 16-bit ID a PCI device puts on its DMA and MSI writes, by which an IOMMU tells devices apart. See [PCI and PCI Express](concepts/pci.md).
- **reset vector**: The address where an x86 processor begins executing firmware. See [x86 boot: BIOS, GRUB and Multiboot](concepts/x86-boot.md).
- **resource container**: In Djawula, an object holding an amount of a resource from which tasks and connections are allocated. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **restart**: After a preempted or faulting operation, the thread is left ready to run its system call again from the top. See [Kernel design and execution model](sel4/kernel-design.md).
- **retype**: `seL4_Untyped_Retype`: carving kernel objects out of an untyped. See [Untyped memory and retyping](sel4/untyped-memory.md).
- **revoke**: Deleting every capability derived from a given one; on an untyped, the only way to get memory back. See [Capabilities](sel4/capabilities.md), also [Untyped memory and retyping](sel4/untyped-memory.md).
- **RFC** (Request for Comments): A design document proposed as a pull request to `seL4/rfcs` before a substantial change. See [Governance and RFCs](sel4/governance.md).
- **ring**: An x86 privilege level; the kernel runs in ring 0 and user code in ring 3. See [Privilege levels](concepts/privilege-levels.md).
- **RMRR** (reserved memory region reporting): DMAR entry naming memory that devices must keep access to because firmware uses it. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **root complex**: The CPU end of a PCI Express hierarchy. See [PCI and PCI Express](concepts/pci.md).
- **root task**: The one user thread the kernel creates at boot, holding a capability to everything in the machine. See [BootInfo and the root task](sel4/bootinfo-and-root-task.md).
- **RSDP** (Root System Description Pointer): The ACPI structure that points to the XSDT; Multiboot passes a copy. See [ACPI tables](concepts/acpi-tables.md).
- **RSDT**: The older, 32-bit form of the XSDT. See [ACPI tables](concepts/acpi-tables.md).
- **runtime services**: The few UEFI calls (variables, time) that stay usable after the OS takes over. See [UEFI](concepts/uefi.md).
- **rust-sel4**: Rust support for seL4 user level: bindings, runtimes, the capDL initialiser and a kernel loader. See [rust-sel4](sel4/rust-sel4.md).

## S

- **S-mode**: RISC-V's supervisor mode, in which seL4 runs. See [Privilege levels](concepts/privilege-levels.md), also [RISC-V basics](concepts/riscv-basics.md).
- **`satp`**: The RISC-V CSR holding the root of the current page tables. See [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).
- **SBI** (Supervisor Binary Interface): The RISC-V firmware services an S-mode kernel reaches with `ecall`. See [RISC-V basics](concepts/riscv-basics.md).
- **SC** (scheduling context): An MCS kernel object holding a budget and a period: the right to CPU time. See [MCS kernel](sel4/mcs.md).
- **`scause`**: The RISC-V CSR giving the cause of a trap. See [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).
- **sDDF** (seL4 Device Driver Framework): Trustworthy Systems' framework of drivers, virtualisers and clients joined by shared-memory queues. See [sDDF](sel4/sddf.md).
- **SDF** (system description file): The XML file describing a Microkit system's protection domains, channels, memory regions and interrupts. See [Microkit](sel4/microkit.md).
- **SDK**: How Microkit ships: prebuilt kernels, library and tool, matched to each other. See [Microkit](sel4/microkit.md).
- **Secure Boot**: UEFI's refusal to run unsigned loaders; it must be off, or the loader signed, to boot a kernel of your own. See [UEFI](concepts/uefi.md), also [Booting a custom kernel on a cloud](concepts/cloud-boot-images.md).
- **segment (ELF)**: A part of an ELF file described by a program header; `PT_LOAD` segments are loaded. See [ELF and linking](concepts/elf.md).
- **segment (x86)**: A region described by a GDT descriptor; mostly vestigial in 64-bit mode except the FS and GS bases. See [x86-64 basics](concepts/x86-64-basics.md).
- **seL4 Foundation**: The body whose Technical Steering Committee sets process and grants reviewer and committer roles. See [Governance and RFCs](sel4/governance.md).
- **seL4_libs**: The classic C libraries for dynamic systems: allocators, virtual memory, process creation. See [seL4_libs and util_libs](sel4/sel4-libs.md).
- **sel4bench**: The kernel's benchmark suite, companion to sel4test. See [sel4test and sel4bench](sel4/sel4test.md).
- **sel4runtime**: The minimal C runtime that sits on libsel4. See [libsel4 and the runtime](sel4/libsel4.md).
- **sel4test**: The kernel's functional test suite, run by upstream CI on every kernel pull request. See [sel4test and sel4bench](sel4/sel4test.md).
- **selector**: The value loaded into an x86 segment register to choose a descriptor. See [x86-64 basics](concepts/x86-64-basics.md).
- **session**: A unit of Isabelle proof, cached as a heap image once finished. See [l4v and Isabelle](sel4/l4v.md).
- **SGI** (Software Generated Interrupt): GIC interrupts 0 to 15: Arm's inter-processor interrupt. See [GICv2](concepts/gicv2.md).
- **SGL** (scatter-gather list): NVMe's optional alternative to PRPs: lists of address and length. See [NVMe](concepts/nvme.md).
- **Simpl**: The small imperative language with formal semantics into which the C parser translates each function. See [l4v and Isabelle](sel4/l4v.md).
- **size bits**: An object's size written as a power of two: size bits 11 is 2048 bytes. See [Kernel objects](sel4/kernel-objects.md).
- **SKIM window**: The reduced kernel mapping present in user page tables as seL4's Meltdown mitigation (`KernelSkimWindow`). See [x86-64 paging](concepts/x86-paging.md).
- **slot**: One entry of a CNode, holding at most one capability. See [CSpaces and capability addressing](sel4/cspace.md).
- **slot region**: A range of slots in the root CNode (`seL4_SlotRegion`), `end` exclusive. See [BootInfo and the root task](sel4/bootinfo-and-root-task.md).
- **SMAP**: x86 protection: ring 0 may not read or write user pages unless `RFLAGS.AC` is set. See [x86-64 paging](concepts/x86-paging.md).
- **SMC** (Secure Monitor Call): The Arm instruction that calls firmware at EL3; one of the two SMCCC conduits. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **SMCCC** (SMC Calling Convention): Arm's standard for calling firmware or a hypervisor: function identifier in `x0`, then `SMC` or `HVC`. See [PSCI and SMCCC](concepts/psci-smccc.md).
- **SMEP**: x86 protection: ring 0 may not execute user pages. See [x86-64 paging](concepts/x86-paging.md).
- **SMI** (system management interrupt): An interrupt that suspends kernel and hypervisor alike to run firmware in SMM. See [Privilege levels](concepts/privilege-levels.md).
- **SMM** (system management mode): An x86 mode belonging to the firmware, entered by SMIs, invisible to the kernel. See [Privilege levels](concepts/privilege-levels.md).
- **SMMU** (System MMU): Arm's IOMMU; seL4 has unverified support for SMMUv2. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **SMP** (symmetric multiprocessing): seL4 on several cores: one kernel image under one big lock; not verified. See [SMP](sel4/smp.md).
- **snapshot**: A stored disk image; an AMI points at one or more. See [Amazon EC2 and the Nitro system](concepts/ec2.md).
- **SPCR** (serial port console redirection): The ACPI table giving the console UART's type, address, interrupt and baud rate. See [UARTs: 16550 and PL011](concepts/uart.md).
- **SPDX**: The licence header format every upstream file must carry. See [Contributing a patch](sel4/contributing-a-patch.md).
- **SPI** (Shared Peripheral Interrupt): GIC interrupts 32 to 1019: ordinary device interrupts, routable to any core. See [GICv2](concepts/gicv2.md).
- **Spin**: Model checker for concurrent protocols written in Promela; checks sDDF's signalling. See [Verifying user-level software](sel4/user-level-verification.md).
- **spin table**: The older Arm way to start cores: secondaries poll a memory word for an address to jump to. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md), also [PSCI and SMCCC](concepts/psci-smccc.md).
- **split virtqueue**: The original virtqueue layout: descriptor table, available ring and used ring. See [virtio](concepts/virtio.md).
- **sporadic server**: The real-time scheduling scheme behind MCS refills. See [MCS kernel](sel4/mcs.md).
- **spurious interrupt**: An interrupt number meaning "nothing pending": 1023 on a GIC. See [GICv2](concepts/gicv2.md).
- **Sstc**: The RISC-V extension adding `stimecmp`, a timer compare register S-mode can write itself. See [RISC-V interrupts and timers](concepts/riscv-interrupts.md).
- **stage 2**: The second address translation a hypervisor applies to a guest's physical addresses. See [AArch64 paging](concepts/aarch64-paging.md), also [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **Starnix**: Fuchsia's user-space component that runs unmodified Linux binaries. See [A Linux personality on seL4](sel4/linux-personality.md).
- **STARTUP**: The IPI giving an x86 application processor the real-mode address at which to start. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **stream ID**: How an SMMU identifies a device; for PCI, derived from the requester ID. See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **StrictC**: The Isabelle C parser's name for the subset of C it accepts. See [The verified C subset](sel4/verified-c-subset.md).
- **`stvec`**: The RISC-V CSR holding the address of the S-mode trap handler. See [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).
- **subleaf**: The value in `ecx` that some CPUID leaves take as a second index. See [CPUID and MSRs](concepts/cpuid-and-msrs.md).
- **submission queue**: Ring on which a driver places commands or packets for an NVMe or ENA device. See [NVMe](concepts/nvme.md), also [ENA](concepts/ena.md).
- **Sv39**: RISC-V three-level paging with 39-bit virtual addresses; Sv48 adds a level. See [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).
- **SVM**: AMD's equivalent of VT-x, with the VMCB as its control block. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **`swapgs`**: Exchanges the `GS_BASE` MSR with `KERNEL_GS_BASE`, giving the kernel its per-CPU pointer. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **symbol patching**: How a Microkit program learns addresses: the tool writes values into named variables in its ELF. See [Microkit](sel4/microkit.md).
- **`syscall`**: The x86-64 system call instruction; it overwrites `rcx` and `r11`. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md).
- **system register**: An AArch64 control register, read with `MRS` and written with `MSR`. See [AArch64 basics](concepts/aarch64-basics.md).
- **System V AMD64 calling convention**: The x86-64 C calling convention the kernel's code follows. See [x86-64 basics](concepts/x86-64-basics.md).

## T

- **TCB** (thread control block): The kernel object that is a thread: saved registers plus its capabilities and scheduling parameters. See [Threads and TCBs](sel4/threads.md).
- **TCB** (trusted computing base): The other meaning: everything a system's security depends on. See [Virtualisation support](sel4/hypervisor.md).
- **TCG** (tiny code generator): QEMU's default mode, translating guest instructions to host instructions; slow, and its time is not real time. See [QEMU](concepts/qemu.md).
- **TF-A** (Trusted Firmware-A): Arm's reference firmware, in stages BL1, BL2 and BL31. See [Arm boot flow](concepts/arm-boot.md).
- **THRE** (transmit holding register empty): The 16550 line status bit a driver polls before sending a byte. See [UARTs: 16550 and PL011](concepts/uart.md).
- **timeout endpoint**: On MCS, the endpoint that receives a timeout fault when a thread's budget runs out. See [MCS kernel](sel4/mcs.md), also [Faults and fault handlers](sel4/faults.md).
- **timer calibration**: Finding a clock's rate by timing it against another whose rate is known. See [Timer calibration](concepts/timer-calibration.md).
- **timers** (the map): Every clock and timer seL4 work meets, by architecture, and how they fit together. See [Timers: a map](concepts/timers.md).
- **timeslice**: On non-MCS kernels, the ticks a thread may run before going to the back of its priority's queue. See [Scheduling](sel4/scheduling.md).
- **TLB** (translation lookaside buffer): The MMU's cache of translations, which a kernel must flush after editing page tables. See [Virtual memory](concepts/virtual-memory.md).
- **TLB shootdown**: Telling other cores to flush a translation after a page table changes. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **trampoline**: Low-memory code that takes a newly started x86 core from real mode up to long mode. See [Multiprocessor bring-up and IPIs](concepts/smp-bringup.md).
- **transitional device**: A virtio device that offers both the legacy and the modern interface. See [virtio](concepts/virtio.md).
- **translation table**: Arm's name for a page table. See [AArch64 paging](concepts/aarch64-paging.md).
- **translator**: A Hurd server attached to a node in the file system. See [Multiserver operating systems](sel4/multiserver-systems.md).
- **trap**: An entry to the kernel; on RISC-V the single word for exceptions and interrupts alike. See [Exceptions, interrupts and traps](concepts/exceptions-and-traps.md), also [RISC-V paging and traps](concepts/riscv-paging-and-traps.md).
- **Trustworthy Systems** (TS): The UNSW group behind seL4's research, sDDF and LionsOS. See [Governance and RFCs](sel4/governance.md).
- **TSC** (Technical Steering Committee): The seL4 Foundation committee that sets process and grants the reviewer and committer roles. See [Governance and RFCs](sel4/governance.md).
- **TSC** (Time Stamp Counter): A 64-bit per-core x86 counter read with `RDTSC`; nothing architectural gives its frequency. See [TSC](concepts/tsc.md).
- **TSC deadline mode**: Local APIC timer mode programmed with an absolute TSC value. See [Local APIC timer and TSC deadline mode](concepts/lapic-timer.md).
- **TSS** (task state segment): The x86 structure holding the ring 0 stack pointer, the IST pointers and the I/O permission bitmap offset. See [x86-64 basics](concepts/x86-64-basics.md).
- **`TTBR0`, `TTBR1`**: The two AArch64 page table roots, for the low and high halves of the address space. See [AArch64 paging](concepts/aarch64-paging.md).

## U

- **U-Boot**: The usual boot loader on Arm development boards. See [Arm boot flow](concepts/arm-boot.md).
- **U-mode**: RISC-V's user mode. See [Privilege levels](concepts/privilege-levels.md).
- **UART**: The serial port: where a debug kernel prints, and often the only console a board or virtual machine has. See [UARTs: 16550 and PL011](concepts/uart.md).
- **UEFI** (Unified Extensible Firmware Interface): The firmware interface that replaced the BIOS; it loads a PE executable from a FAT partition. See [UEFI](concepts/uefi.md).
- **uImage**: U-Boot's own image format, with a header giving load address, entry point and checksum. See [Arm boot flow](concepts/arm-boot.md).
- **untyped**: A capability to a block of physical memory that is not yet any kernel object. See [Untyped memory and retyping](sel4/untyped-memory.md).
- **`userError`**: The debug kernel's printed reason for a failed invocation. See [System calls and invocations](sel4/syscalls-and-invocations.md), also [Debugging](sel4/debugging.md).
- **util_libs**: The classic C libraries of platform drivers, `ltimer`, and ELF, CPIO and FDT parsers. See [seL4_libs and util_libs](sel4/sel4-libs.md).

## V

- **`VBAR_ELx`**: The AArch64 register holding the address of the 16-entry exception vector table. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **VCPU** (virtual CPU): The kernel object holding a guest's processor state; one per TCB. See [Virtualisation support](sel4/hypervisor.md).
- **vector**: On x86, the number (0 to 255) by which the CPU indexes the IDT for an interrupt or exception. See [x86-64 exceptions and system calls](concepts/x86-exceptions-syscalls.md), also [IRQ](concepts/irq.md).
- **vector table**: The AArch64 table of 16 exception entry points. See [AArch64 exceptions](concepts/aarch64-exceptions.md).
- **verified configuration**: One of the few exact kernel configurations the proofs apply to. See [The seL4 proofs](sel4/verification.md).
- **Verus**: Verifier for Rust code against specifications written in Rust syntax, using the Z3 SMT solver. See [Verifying user-level software](sel4/user-level-verification.md).
- **VHE** (Virtualization Host Extensions): Armv8.1 feature letting an unmodified EL1 kernel run at EL2. See [Arm virtualisation (EL2)](concepts/arm-virtualisation.md).
- **Viper**: SMT-based verification language from ETH Zürich; Pancake code is proved by translating it to Viper. See [Verifying user-level software](sel4/user-level-verification.md).
- **virtio**: The standard family of paravirtual devices, with one queue mechanism and three transports. See [virtio](concepts/virtio.md).
- **virtqueue**: The virtio mechanism carrying buffers from driver to device and back. See [virtio](concepts/virtio.md).
- **virtualiser**: The sDDF component that shares one device among several clients. See [sDDF](sel4/sddf.md).
- **`vka`**: The seL4_libs interface for allocating kernel objects, implemented by allocman. See [seL4_libs and util_libs](sel4/sel4-libs.md).
- **vLPI** (virtual LPI): An LPI a GICv4 delivers straight to a guest, without a trap to the hypervisor. See [GICv3 and the ITS](concepts/gicv3-its.md).
- **VM attributes**: The architecture-specific flags (such as caching) passed when mapping a frame. See [Address spaces (VSpace)](sel4/vspace.md).
- **VM exit**: The transition from a guest back to the hypervisor in VMX root operation. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **VM fault**: The fault message sent when a thread touches an address with no valid mapping or permission. See [Faults and fault handlers](sel4/faults.md).
- **VMCB**: AMD SVM's control block, a plain memory structure. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **VMCS** (virtual machine control structure): The Intel structure holding a guest's state and the controls that decide what causes a VM exit. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **VMID** (virtual machine identifier): A tag in `VTTBR_EL2` marking TLB entries per guest, as an ASID does per process. See [AArch64 paging](concepts/aarch64-paging.md).
- **VMM** (virtual machine monitor): The user-level program, one per guest, that does everything for a VM the kernel does not. See [Virtualisation support](sel4/hypervisor.md).
- **VMX**: Intel's virtualisation instruction set, with root operation for the hypervisor and non-root for guests. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **VPID** (virtual processor identifier): A 16-bit TLB tag so that VM entries and exits need not flush the TLB. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).
- **VS-mode, VU-mode**: The virtualised supervisor and user modes the RISC-V hypervisor extension adds for guests. See [Privilege levels](concepts/privilege-levels.md).
- **VSpace**: A seL4 address space: a tree of page-table objects with frames at the leaves and an ASID naming the root. See [Address spaces (VSpace)](sel4/vspace.md).
- **VT-d**: Intel's IOMMU, for which seL4 has unverified support (`KernelIOMMU`). See [IOMMUs: VT-d and SMMU](concepts/iommu.md).
- **VT-x**: Intel's hardware support for running guests: VMX operation, the VMCS and EPT. See [x86 virtualisation (VT-x)](concepts/x86-virtualisation.md).

## W

- **watermark**: The mark in an untyped below which memory has been given out; see free index. See [Untyped memory and retyping](sel4/untyped-memory.md).
- **WCET** (worst-case execution time): The longest the kernel can run without taking an interrupt, analysed separately from the proofs. See [The seL4 proofs](sel4/verification.md).

## X

- **x2APIC**: The local APIC mode reached through MSRs, with 32-bit APIC IDs. See [Local APIC and I/O APIC](concepts/apic.md).
- **XCR0** (extended control register 0): The x86 register saying which FPU and vector state components are enabled. See [FPU and SIMD state](concepts/fpu-state.md).
- **XSAVE**: The x86 instruction family that saves and restores FPU and vector state. See [FPU and SIMD state](concepts/fpu-state.md).
- **XSDT**: The ACPI table listing pointers to all other tables. See [ACPI tables](concepts/acpi-tables.md).

## Y

- **yielding call**: An SMCCC call that may be pre-empted and resumed, unlike a fast call. See [PSCI and SMCCC](concepts/psci-smccc.md).

## Z

- **zombie capability**: A capability type the kernel uses for an object part-way through deletion; visible in debug dumps. See [Capabilities](sel4/capabilities.md).
