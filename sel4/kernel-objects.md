# Kernel objects

> The fixed set of object types the seL4 kernel implements (TCBs, endpoints, CNodes, page tables, frames and so on), which are created by retyping untyped memory, and the capability types that exist with no object behind them.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [CSpaces and capability addressing](cspace.md) · [Untyped memory and retyping](untyped-memory.md) →

Read first: [Capabilities](capabilities.md), [CSpaces](cspace.md).

| At a glance | |
|---|---|
| Kind | Kernel objects: the fixed set of types, and the capability types with no object |
| Key source | [`libsel4/include/sel4/objecttype.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/objecttype.h), [`src/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/object/objecttype.c), [`include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h) |
| Config options | `CONFIG_VTX`, `CONFIG_IOMMU`, `CONFIG_ARM_HYPERVISOR_SUPPORT`, MCS add types |
| API | `seL4_Untyped_Retype` with a `seL4_ObjectType` |
| Object size | A power of two, 2^(size bits) bytes; on 64-bit: endpoint 4, TCB 11 or 12 (RV64 10 or 11), frames 12 and up |
| Built on | [Untyped memory](untyped-memory.md), [capabilities](capabilities.md) |

## What it is

Everything the kernel manages is a **kernel object** of one of a small,
fixed set of types, and user level reaches each through
[capabilities](capabilities.md). There are two kinds of thing a
capability can name:

- **Retypable objects** occupy memory. User level creates them with
  `seL4_Untyped_Retype` ([untyped memory](untyped-memory.md)), naming a
  type from the `seL4_ObjectType` enumeration. Each occupies a
  power-of-two number of bytes, written as **size bits** (an object of
  size bits 11 is 2^11 = 2048 bytes), and is aligned to its size.
- **Capability-only types** have no memory of their own. The capability
  itself carries the authority (to an interrupt number, a range of I/O
  ports, a core's scheduler). The kernel creates the first of each at
  boot and gives it to the [root task](bootinfo-and-root-task.md);
  others are derived by invoking that one.

### Objects created by retype

Sizes are for 64-bit kernels, from libsel4's constants; "arg" means the
`size_bits` argument of Retype chooses.

| Object (`seL4_...Object`) | What it is | Size bits: x86-64 | AArch64 | RV64 |
|---|---|---|---|---|
| `Untyped` | A smaller block of untyped memory | arg, 4 to 47 | arg, 4 to 47 | arg, 4 to 38 |
| `TCB` | Thread control block: registers, state, priority, and five capability slots (CSpace root, VSpace root, ...) ([threads](threads.md)) | 11, or 12 if `CONFIG_XSAVE_SIZE` >= 832 | 11, or 12 with hardware debug or similar options | 11 with FPU, else 10 |
| `Endpoint` | Rendezvous point for synchronous [IPC](ipc.md): a queue of blocked threads | 4 | 4 | 4 |
| `Notification` | A word of signal bits and a queue of waiters ([notifications](notifications.md)) | 5 (MCS: 6) | 5 (MCS: 6) | 5 (MCS: 6) |
| `CapTable` (CNode) | 2^arg capability slots of 2^5 bytes ([CSpaces](cspace.md)) | arg + 5 | arg + 5 | arg + 5 |
| `SchedContext` (MCS) | CPU budget and period, with room for refills ([MCS](mcs.md)) | arg, at least 7 | same | same |
| `Reply` (MCS) | Holds the right to reply to one caller | 5 | 5 | 5 |
| Frames | Memory mappable into an address space ([VSpace](vspace.md)) | `X86_4K` 12, `X86_LargePage` 21, `X64_HugePage` 30 | `ARM_SmallPage` 12, `ARM_LargePage` 21, `ARM_HugePage` 30 | `RISCV_4K_Page` 12, `RISCV_Mega_Page` 21, `RISCV_Giga_Page` 30, `RISCV_Tera_Page` 39 (4-level only) |
| Page-table levels | One object per node of the translation tree | `X64_PML4`, `X86_PDPT`, `X86_PageDirectory`, `X86_PageTable`: 12 each | `ARM_VSpace` (top level) 12, or 13 for a hypervisor kernel with 40-bit physical addresses; `ARM_PageTable` (every lower level) 12 | `RISCV_PageTable` (every level, top included) 12 |
| `VCPU` | State of one virtual CPU ([virtualisation](hypervisor.md)) | `X86_VCPU` 14 (needs `CONFIG_VTX`) | `ARM_VCPU` 12 (needs `CONFIG_ARM_HYPERVISOR_SUPPORT`) | none |
| Second-stage tables on x86 | Extended page tables for a guest | `X86_EPTPML4`, `EPTPDPT`, `EPTPD`, `EPTPT`: 12 each (`CONFIG_VTX`) | uses the ordinary types | - |
| `IOPageTable` | IOMMU page table ([IOMMUs](../concepts/iommu.md)) | `X86_IOPageTable` 12 (`CONFIG_IOMMU`) | `ARM_IOPageTable` 12 (`CONFIG_TK1_SMMU` only) | - |

The top-level page table of an address space is called its **VSpace
root**; the paging pages
([x86-64](../concepts/x86-paging.md),
[AArch64](../concepts/aarch64-paging.md),
[RISC-V](../concepts/riscv-paging-and-traps.md)) explain the levels.

One object is made from untyped memory but not by Retype: an **ASID
pool** (2^12 bytes on all three) is created by
`seL4_X86_ASIDControl_MakePool` (or the `ARM`/`RISCV` equivalent), which
consumes a 4 KiB untyped. An ASID (address space identifier) is the
kernel's short name for a VSpace; a pool is a table of them.

### Capability types with no object

| Capability | Authority | How obtained |
|---|---|---|
| `IRQControl` | Create an IRQ handler capability for any interrupt | Root task, slot `seL4_CapIRQControl` |
| `IRQHandler` | Acknowledge one interrupt and bind it to a notification ([interrupt delivery](irq-handling.md)) | `seL4_IRQControl_Get` and its per-architecture variants |
| `ASIDControl` | Make ASID pools | Root task |
| `Domain` | Assign threads to scheduling domains ([scheduling](scheduling.md)) | Root task, `seL4_CapDomain` |
| `SchedControl` (MCS) | Set scheduling context parameters on one core; one capability per core | Root task (range given in BootInfo) |
| `Reply` (non-MCS) | Reply once to a caller; lives in a special TCB slot, generated by `seL4_Call` | Implicit |
| `IOPortControl`, `IOPort` (x86) | Issue capabilities to ranges of [I/O ports](../concepts/io-ports.md); use a range | Root task; `seL4_X86_IOPortControl_Issue` |
| `IOSpace` (x86 with IOMMU) | Assign a PCI device to an IOMMU address space | Root task, `seL4_CapIOSpace` |
| `SMC` (Arm, optional) | Make secure monitor calls ([PSCI and SMCCC](../concepts/psci-smccc.md)) | Root task, `seL4_CapSMC` |
| `SGISignal` (Arm) | Raise one software-generated interrupt | From `IRQControl`, with `seL4_IRQControl_IssueSGISignal` |
| `SIDControl`, `SID`, `CBControl`, `CB` (Arm SMMU) | Configure SMMU stream IDs and context banks | Root task |
| `Null` | Nothing: an empty slot | - |
| `Zombie` | Internal: an object part-way through deletion | Never visible to the API |

Each type has its own methods, listed in the manual's API chapter and
in the interface XML
([system calls and invocations](syscalls-and-invocations.md)).

## In seL4

- **Type numbers** come from four nested enumerations in libsel4, so
  the numeric values differ between architectures and configurations:
  generic types in
  [`libsel4/include/sel4/objecttype.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/objecttype.h)
  (`seL4_UntypedObject` = 0 ... `seL4_NonArchObjectTypeCount`), then
  `libsel4/sel4_arch_include/<sel4arch>/sel4/sel4_arch/objecttype.h`
  (up to `seL4_ModeObjectTypeCount`), then
  `libsel4/arch_include/<arch>/sel4/arch/objecttype.h` (up to
  `seL4_ObjectTypeCount`). A type compiled out by configuration is
  given an out-of-range value such as `0xfffe` so that code still
  compiles and Retype rejects it.
- **Sizes** are the `seL4_*Bits` constants in
  `libsel4/sel4_arch_include/<sel4arch>/sel4/sel4_arch/constants.h`
  (and `libsel4/arch_include/x86/sel4/arch/constants.h` for the x86
  VCPU). The kernel's own structure definitions, in
  [`include/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/object/structures.h)
  and `include/arch/<arch>/arch/object/structures.h`, carry
  `compile_assert`s that each C struct fits its `seL4_*Bits` (for
  example `sizeof(endpoint_t) == BIT(seL4_EndpointBits)`), so a patch
  that grows a struct past its power of two fails to build.
- **`getObjectSize(type, userObjSize)`** in
  [`src/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/object/objecttype.c)
  maps a type to size bits, calling `Arch_getObjectSize` for
  architecture types. For a CNode it returns `seL4_SlotBits +
  userObjSize`; for Untyped and SchedContext, `userObjSize`.
- **`createObject`** (same file) and `Arch_createObject`
  (`src/arch/<arch>/object/objecttype.c`) initialise one object and
  build its first capability; `createNewObjects` calls them in a loop
  for a Retype.
- **Per-type code** is one file each in `src/object/` (`tcb.c`,
  `endpoint.c`, `notification.c`, `cnode.c`, `untyped.c`,
  `interrupt.c`, `schedcontext.c`, `schedcontrol.c`, `reply.c`,
  `domain.c`) and `src/arch/<arch>/object/` for frames, page tables,
  VCPUs, I/O ports and so on.
- **Capability layouts** for all of the above, including the
  capability-only types, are in the `structures.bf` files
  ([capabilities](capabilities.md) has the tag table). Small objects
  (endpoint, notification, the non-register part of others) are
  bitfield `block`s there too.
- **Deleting**: `finaliseCap` and `Arch_finaliseCap` say what happens
  when the last capability to each type goes away.

## Gotchas

- **Size arguments mean different things.** For a CNode `size_bits` is
  the log2 of the number of *slots*, not bytes; for Untyped and
  SchedContext it is log2 bytes; for fixed-size types it is ignored.
- **Sizes vary with configuration.** A TCB grows with the FPU state
  ([FPU state](../concepts/fpu-state.md)): on x86-64 `CONFIG_XSAVE_SIZE`
  of 832 or more (AVX-512 sized) makes it 2^12. Notifications grow
  under MCS. Never hard-code a size: use the libsel4 constant for the
  kernel actually built.
- **Object type numbers are not stable** across architectures or
  options (MCS inserts two generic types, which shifts every
  architecture type). Tools that serialise them, such as
  [Microkit](microkit-internals.md) and capDL, must match the kernel
  configuration.
- **The page-table type names are historical.** `seL4_ARM_PageTableObject`
  serves every level below the top on AArch64, and RISC-V uses one
  type for all levels; x86 has a type per level.
- **32-bit sizes differ** (slots are 2^4 bytes, TCBs smaller, different
  frame sizes). This page gives 64-bit values only.
- **No "process" object.** A process is whatever user level assembles
  from a TCB, a CSpace and a VSpace.
- **An IRQ handler or I/O port capability is not backed by memory**, so
  revoking untyped memory does not remove it; revoke or delete the
  capability itself.

## See also

- [Capabilities](capabilities.md): capability types and tags
- [Untyped memory and retyping](untyped-memory.md): how objects are created and reclaimed
- [Threads and TCBs](threads.md), [IPC and endpoints](ipc.md), [Notifications](notifications.md), [Address spaces](vspace.md), [Interrupt delivery](irq-handling.md), [MCS](mcs.md): the main object types in detail
- [libsel4 and the runtime](libsel4.md): where the constants and stubs come from
- [Source layout](source-layout.md): finding the per-object files
- [Generated code](generated-code.md): much of what the kernel compiles is not in the repository

## References

- [libsel4 `include/sel4/objecttype.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/objecttype.h)
  and the `sel4_arch_include` and `arch_include` `objecttype.h` files
  for x86_64, aarch64, riscv64: the type enumerations. *Checked 2026-11-14.*
- [libsel4 x86_64 `constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/x86_64/sel4/sel4_arch/constants.h),
  [aarch64 `constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h),
  [riscv64 `constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/riscv64/sel4/sel4_arch/constants.h):
  every size in the table. *Checked 2026-11-14.*
- [libsel4 x86 `arch/constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/sel4/arch/constants.h):
  `seL4_VCPUBits` 14. *Checked 2026-11-14.*
- [seL4 `src/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/object/objecttype.c):
  `getObjectSize`. *Checked 2026-11-14.*
- [seL4 x86-64, AArch64 and RISC-V `structures.bf`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/object/structures.bf):
  the capability-only types per architecture. *Checked 2026-11-14.*
- [libsel4 `bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h):
  which control capabilities the root task receives. *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  section 2.3 "Kernel Objects" and chapter 10 "seL4 API Reference": the
  methods of each type. *Checked 2026-11-14 (version 17.0.0; section
  2.3 read, chapter 10 only for the methods looked up).*
- [libsel4 Arm `object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/arm/interfaces/object-api-arch.xml)
  and [seL4 `src/arch/arm/object/interrupt.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/interrupt.c):
  `IssueSGISignal` on `IRQControl`. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
