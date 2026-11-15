# BootInfo and the root task

> At the end of boot the kernel creates one user thread, the root task, hands it a capability to everything in the machine, and describes what it handed over in a `seL4_BootInfo` page; every seL4 system starts by reading that page.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [Interrupt delivery](irq-handling.md) · [SMP](smp.md) →

Read first: [Capabilities](capabilities.md), [CSpaces and capability addressing](cspace.md), [Untyped memory and retyping](untyped-memory.md).

| At a glance | |
|---|---|
| Kind | Kernel mechanism: the first user thread and the page describing what it was given |
| Key source | [`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c), [`libsel4/include/sel4/bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h) |
| Config options | `KernelRootCNodeSizeBits` (default 12), `CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS` (default 230), `CONFIG_PADDR_USER_DEVICE_TOP` |
| API | `seL4_BootInfo`, passed by pointer in the first argument register; 16 fixed capability slots |
| Object size | `seL4_BootInfo` fits in one 4 KiB page; extra BootInfo follows it |
| Used by | sel4test-driver, the capDL loader ([CAmkES](camkes-capdl.md)), the [Microkit](microkit.md) initialiser, hand-written root tasks |
| Verified | No: all [`BOOT_CODE`](boot-code.md), outside the proofs' scope |

## What it is

seL4 has no `init` process, no filesystem and no notion of a user. When
the [kernel finishes booting](kernel-boot.md) it creates exactly one
thread, the **root task** (also "initial thread" or "rootserver"), from
a user-level ELF image that the boot loader placed in memory beside the
kernel. That thread receives a [capability](capabilities.md) to every
resource the kernel does not keep for itself. From then on the kernel
creates nothing by itself: all later threads, address spaces and
drivers come from the root task spending those capabilities.

The kernel builds for the root task:

| Thing | Details |
|---|---|
| A CSpace | one [CNode](cspace.md) of 2^`CONFIG_ROOT_CNODE_SIZE_BITS` slots (CMake `KernelRootCNodeSizeBits`, default 12, so 4096 slots) |
| A [VSpace](vspace.md) | the ELF image mapped at its link addresses, then one page for the IPC buffer, one for BootInfo, then any extra BootInfo pages, all directly after the image |
| A [TCB](threads.md) | running at the highest priority (`seL4_MaxPrio`, 255) with the same maximum controlled priority, program counter at the ELF entry point |
| An ASID pool | holding the root task's own ASID |
| Under [MCS](mcs.md) | a scheduling context for the thread |

It starts with a pointer to BootInfo in its first argument register
(`capRegister`: `rdi` on x86-64, `x0` on AArch64, `a0` on RISC-V). The
root task has no stack set up by the kernel and no fault handler: the
C runtime it is linked with (`sel4runtime`, or the Rust or Microkit
equivalent) provides the stack, saves the pointer, and
`platsupport_get_bootinfo()` or the language's equivalent returns it.

### The fixed capability slots

The first 16 slots of the root CNode have fixed meanings
(`enum seL4_RootCNodeCapSlots`):

| Slot | Name | What it is |
|---|---|---|
| 0 | `seL4_CapNull` | always empty |
| 1 | `seL4_CapInitThreadTCB` | the root task's own TCB |
| 2 | `seL4_CapInitThreadCNode` | the root CNode itself |
| 3 | `seL4_CapInitThreadVSpace` | the root task's VSpace root |
| 4 | `seL4_CapIRQControl` | authority to create [interrupt handlers](irq-handling.md) |
| 5 | `seL4_CapASIDControl` | authority to create [ASID pools](vspace.md) |
| 6 | `seL4_CapInitThreadASIDPool` | the first ASID pool |
| 7 | `seL4_CapIOPortControl` | x86: authority to issue [I/O port](../concepts/io-ports.md) caps; null elsewhere |
| 8 | `seL4_CapIOSpace` | x86 with VT-d: the [IOMMU](../concepts/iommu.md) master cap; null otherwise |
| 9 | `seL4_CapBootInfoFrame` | the frame holding BootInfo |
| 10 | `seL4_CapInitThreadIPCBuffer` | the frame holding the IPC buffer |
| 11 | `seL4_CapDomain` | authority to assign threads to scheduling domains |
| 12, 13 | `seL4_CapSMMUSIDControl`, `seL4_CapSMMUCBControl` | Arm SMMU control; null if not configured |
| 14 | `seL4_CapInitThreadSC` | MCS: the root task's scheduling context; null otherwise |
| 15 | `seL4_CapSMC` | Arm: authority to make SMC calls to firmware; null if not configured |

`seL4_NumInitialCaps` is 16. Everything after that is laid out
dynamically and described by BootInfo.

![The root task's address space holds its image, IPC buffer, BootInfo page and extra BootInfo pages in that order, and the BootInfo page names the slot regions of the root CNode that follow the 16 fixed slots.](../images/bootinfo-and-root-task-layout.svg)

*What the kernel builds for the root task. The four slot regions shown
are fields of `seL4_BootInfo`, explained next; the diagram does not show
their order in the CNode.*

### `seL4_BootInfo`, field by field

A **slot region** (`seL4_SlotRegion { start, end }`) is a range of slots
in the root CNode, `end` exclusive.

| Field | Meaning |
|---|---|
| `extraLen` | bytes of extra BootInfo following this page (below) |
| `nodeID`, `numNodes` | this core's number and the number of cores the kernel runs on ([SMP](smp.md)) |
| `numIOPTLevels` | x86 IOMMU page-table depth, 0 without one |
| `ipcBuffer` | virtual address of the root task's IPC buffer |
| `empty` | the free slots: everything the kernel did not fill |
| `sharedFrames` | set to the empty region by the Arm and RISC-V boot code; a leftover of the multikernel design of the first public release (2014), where ia32 filled it and the Arm code noted "ARM has no multikernel support"; the manual now calls it reserved |
| `userImageFrames` | caps to the frames holding the root task's own image, in virtual address order |
| `userImagePaging` | caps to the page tables the kernel made for the root task |
| `ioSpaceCaps` | Arm SMMU I/O space caps |
| `extraBIPages` | caps to the frames holding the extra BootInfo |
| `initThreadCNodeSizeBits` | `CONFIG_ROOT_CNODE_SIZE_BITS` again |
| `initThreadDomain` | the root task's scheduling domain |
| `schedcontrol` | MCS only: one `SchedControl` cap per core, the authority to give scheduling contexts time on that core |
| `untyped` | the slot region holding all untyped caps |
| `untypedList[]` | one `seL4_UntypedDesc` per cap in `untyped`, in the same order |

`untypedList[i]` describes the cap in slot `untyped.start + i`:

```c
typedef struct seL4_UntypedDesc {
    seL4_Word  paddr;     /* physical address of the region        */
    seL4_Uint8 sizeBits;  /* the region is 2^sizeBits bytes        */
    seL4_Uint8 isDevice;  /* 1: not RAM (device registers, holes)  */
} seL4_UntypedDesc;
```

The array has `CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS` entries (default
230), and the whole structure must fit in one 4 KiB page.

### Finding memory and devices

The untyped list is the root task's complete map of the machine:

- **RAM** the kernel did not use arrives as ordinary untypeds
  (`isDevice` 0), each a power-of-two block, so a region of awkward
  size is split into several. Kernel memory used only during boot is
  recycled into untypeds too.
- **Everything else** in the physical address space up to
  `CONFIG_PADDR_USER_DEVICE_TOP` that is not RAM and not reserved by the
  kernel arrives as **device untypeds** (`isDevice` 1). The kernel does
  not know what devices exist: it simply covers the gaps. To reach a
  device with registers at physical address `P`, the root task finds
  the device untyped containing `P`, retypes it down to the 4 KiB frame
  at `P` (retyping from an untyped allocates in address order, so this
  means retyping and discarding what lies before it, or using a
  library that does) and [maps that frame](vspace.md).

Where `P` comes from is not the kernel's business: on Arm and RISC-V the
root task reads the [device tree](../concepts/device-tree.md), on x86 it
walks [ACPI tables](../concepts/acpi-tables.md) and
[PCI](../concepts/pci.md) configuration space, and static systems
(Microkit) have the addresses written into their system description.

### Extra BootInfo

Larger, optional data follows the BootInfo page in the root task's
address space, at `(char *)bootinfo + seL4_BootInfoFrameSize`, for
`extraLen` bytes. It is a sequence of chunks, each starting with

```c
typedef struct seL4_BootInfoHeader {
    seL4_Word id;   /* SEL4_BOOTINFO_HEADER_* */
    seL4_Word len;  /* length of the chunk, including this header */
} seL4_BootInfoHeader;
```

| `id` | Contents | Architecture |
|---|---|---|
| `SEL4_BOOTINFO_HEADER_PADDING` (0) | filler to the end of the last page | all |
| `X86_VBE` (1) | VESA BIOS video mode information from the boot loader | x86 |
| `X86_MBMMAP` (2) | the [Multiboot](../concepts/x86-boot.md) memory map | x86 |
| `X86_ACPI_RSDP` (3) | a copy of the ACPI root pointer (RSDP), the way in to the [ACPI tables](../concepts/acpi-tables.md) | x86 |
| `X86_FRAMEBUFFER` (4) | Multiboot 2 framebuffer description | x86 |
| `X86_TSC_FREQ` (5) | the kernel's measured [TSC](../concepts/tsc.md) frequency, a 32-bit value in MHz | x86 |
| `FDT` (6) | the flattened [device tree](../concepts/device-tree.md) the boot loader passed in | Arm, RISC-V |

A root task walks the chunks by `len` until it finds the `id` it wants.

### What root tasks exist

- **sel4test-driver**: the [test suite](sel4test.md)'s root task. It
  bootstraps allocators from BootInfo (`simple`, `allocman`, `vka` from
  [seL4_libs](sel4-libs.md)) and creates a process per test.
- **capDL loader**: a generic root task that reads a capDL specification
  (a description of every object and capability the system should have)
  and creates exactly that, then starts the threads. [CAmkES](camkes-capdl.md)
  systems boot this way, with the C `capdl-loader-app`.
- **Microkit**: current [Microkit](microkit.md) also uses capDL. Its
  tool emits a specification and the root task is the Rust capDL
  initialiser from [rust-sel4](rust-sel4.md) (`initialiser/` in the
  Microkit repository); a separate small **monitor** protection domain
  then stays as the fault handler of last resort. Before that change the
  monitor itself was the root task and replayed a list of invocations
  computed by the tool. See [Microkit internals](microkit-internals.md).
- Hand-written root tasks, in C or Rust, as in the seL4 tutorials.

## In seL4

Generic code is in
[`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c),
driven by `try_init_kernel` in each `src/arch/*/kernel/boot.c` (x86:
`init_sys_state` in `src/arch/x86/kernel/boot.c`). All of it is
[`BOOT_CODE`](boot-code.md), outside the proofs' scope. The Arm order,
which the others follow closely:

| Step | Function |
|---|---|
| Choose the virtual layout: image, IPC buffer, BootInfo, extra BootInfo | start of `try_init_kernel` |
| Work out free memory; carve the root task's objects from the top of it | `arch_init_freemem` → `init_freemem`, `create_rootserver_objects` |
| Root CNode, with its own cap in slot 2 | `create_root_cnode` |
| Domain cap, IRQ state and `IRQControl`, SMMU, SMC caps | `create_domain_cap`, `init_irqs`, `init_smmu`, `init_smc` |
| Fill in the BootInfo page; copy the device tree into extra BootInfo | `populate_bi_frame` |
| VSpace and its page tables (`userImagePaging`) | `create_it_address_space` |
| Map BootInfo, extra BootInfo, IPC buffer and the image frames (`userImageFrames`) | `create_bi_frame_cap`, `create_frames_of_region`, `create_ipcbuf_frame_cap` |
| `SchedControl` caps (MCS) | `init_sched_control` |
| ASID pool, and the root VSpace's ASID | `create_it_asid_pool`, `write_it_asid_pool` |
| Idle thread, then the root task's TCB | `create_idle_thread`, `create_initial_thread` |
| Turn all remaining memory and all device regions into untypeds | `create_untypeds` |
| Record the `empty` region | `bi_finalise` |

`ndks_boot` holds the boot-time bookkeeping: `bi_frame`, the next free
slot `slot_pos_cur`, the `freemem[]` regions and the `reserved[]`
regions. `create_untypeds` walks `reserved[]` and makes device untypeds
for every gap between reserved regions (so "reserved" here means RAM and
anything else the kernel must keep user level away from), then ordinary
untypeds for boot-only kernel memory and for what is left of `freemem`.
`provide_untyped_cap` writes each cap and its `untypedList` entry.

The structures are in
[`libsel4/include/sel4/bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h);
the x86 chunk layouts (`seL4_X86_BootInfo_VBE`, `seL4_X86_BootInfo_mmap`
and so on) are in `libsel4/arch_include/x86/sel4/arch/bootinfo_types.h`.
The x86 chunks are written in `src/arch/x86/kernel/boot.c`, the FDT
chunk in the Arm and RISC-V `boot.c`.

The root task image itself comes from the boot loader: a Multiboot
module on x86 ([x86 boot](../concepts/x86-boot.md)), and on Arm and
RISC-V an ELF file the [elfloader](elfloader.md) unpacks and reports to
the kernel as a physical region and entry point.

## Gotchas

- If the machine has more untyped regions than
  `CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS`, the kernel prints "Kernel
  init: Too many untyped regions for boot info" and silently drops the
  rest. Machines with fragmented memory maps (large cloud instances,
  [UEFI](../concepts/uefi.md) firmware) can hit this; the symptom is
  missing RAM or a device whose untyped does not exist.
- A device above `CONFIG_PADDR_USER_DEVICE_TOP` has no untyped at all,
  for example a PCI device with a 64-bit BAR placed high.
- Device untypeds cover holes, not devices. An untyped being present at
  an address says nothing about hardware being there.
- The root CNode must hold the fixed caps, every image frame and page
  table, and every untyped. A large root task image with a small
  `KernelRootCNodeSizeBits` fails at boot, not at build time.
- The root task's image frames are not backed by untypeds the root task
  holds: the only caps to that memory are the frame caps in
  `userImageFrames`. A loader that wants its own memory back must hand
  on or delete those.
- `X86_TSC_FREQ` is in MHz, so it loses precision; and it is whatever
  the kernel's [calibration](../concepts/timer-calibration.md) measured.
- The x86 chunks appear only when the boot loader supplied the data: no
  RSDP chunk does not mean no ACPI.
- The root task runs at priority 255 and never yields unless it blocks,
  so threads it starts at lower priorities do not run until it does.

## See also

- [Kernel boot sequence](kernel-boot.md): everything before the root task exists
- [Boot code and the proof boundary](boot-code.md): why this code is `BOOT_CODE` and what the proofs assume of it
- [Untyped memory and retyping](untyped-memory.md): what to do with the untyped list
- [Address spaces (VSpace)](vspace.md): mapping device frames; ASID pools
- [Interrupt delivery](irq-handling.md): using `IRQControl`
- [Elfloader](elfloader.md): where the root task image comes from on Arm and RISC-V
- [Microkit internals](microkit-internals.md), [CAmkES and capDL](camkes-capdl.md): root tasks driven by a specification
- [libsel4 and the runtime](libsel4.md): how a C program gets the BootInfo pointer

## References

- [seL4 `libsel4/include/sel4/bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h):
  the initial cap slots, `seL4_BootInfo`, `seL4_UntypedDesc`, the extra
  BootInfo header and IDs. *Checked 2026-11-14.*
- [seL4 `src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c):
  `create_initial_thread` (priority, `capRegister`), `create_untypeds`,
  `provide_untyped_cap`, `bi_finalise`. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c):
  `try_init_kernel`, the order of creation and the FDT chunk.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot.c):
  the five x86 chunks, including the 4-byte TSC frequency.
  *Checked 2026-11-14.*
- [seL4 `config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake):
  `KernelRootCNodeSizeBits` (default 12),
  `KernelMaxNumBootinfoUntypedCaps` (default 230). *Checked 2026-11-14.*
- [Microkit `CHANGES.md`](https://github.com/seL4/microkit/blob/main/CHANGES.md):
  the transition to capDL for system initialisation; `initialiser/` and
  `monitor/` in the repository. *Checked 2026-11-14.*
- [sel4test `apps/sel4test-driver`](https://github.com/seL4/sel4test/tree/master/apps/sel4test-driver):
  the test suite's root task. *Checked 2026-11-14 (that it exists; its
  allocator bootstrap is from memory).*
- [seL4 reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  chapter 9 "System Bootstrapping". *Checked 2026-11-14 (version
  17.0.0).*
- [seL4 at its first public release, `src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/91b7da8625d28ad533d5bd801be5f89ad1b50d80/src/arch/arm/kernel/boot.c)
  and [`src/arch/ia32/kernel/boot.c`](https://github.com/seL4/seL4/blob/91b7da8625d28ad533d5bd801be5f89ad1b50d80/src/arch/ia32/kernel/boot.c):
  the shared-frame caps of the multikernel. *Checked 2026-11-14.*
