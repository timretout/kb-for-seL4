# Address spaces (VSpace)

> A seL4 address space is a tree of page-table objects that user level retypes from untyped memory and links together with `Map` invocations, with frames at the leaves and an ASID naming the root; the kernel only checks and installs what it is asked to.

Read first: [Capabilities](capabilities.md), [Untyped memory and retyping](untyped-memory.md), [x86-64 paging](../concepts/x86-paging.md) or [AArch64 paging](../concepts/aarch64-paging.md).

## What it is

Linux owns every page table and offers `mmap`. seL4 has no `mmap`, no
page cache and no demand paging in the kernel. Instead each hardware
paging structure is a [kernel object](kernel-objects.md) with a
capability, and a thread holding the right caps builds an address space
(a **VSpace**) by hand:

1. retype untyped memory into a top-level table, the **VSpace root**;
2. give the root an **ASID** (address space identifier, below);
3. retype and map intermediate tables under it, one level at a time;
4. retype **frames** (pages of memory) and map them at virtual addresses;
5. name the root in a thread with `seL4_TCB_SetSpace` or
   `seL4_TCB_Configure` ([Threads](threads.md)).

A page fault is not handled by the kernel: it becomes a
[fault message](faults.md) to the thread's fault handler, which may map
something and resume the thread. Paging policy is entirely user level.

### The objects, per architecture

| | x86-64 | AArch64 | RISC-V 64 |
|---|---|---|---|
| VSpace root | `seL4_X64_PML4Object` | `seL4_ARM_VSpaceObject` | `seL4_RISCV_PageTableObject` |
| Intermediate tables | `seL4_X86_PDPTObject`, `seL4_X86_PageDirectoryObject`, `seL4_X86_PageTableObject` | `seL4_ARM_PageTableObject` at every level | `seL4_RISCV_PageTableObject` at every level |
| 4 KiB frame | `seL4_X86_4K` | `seL4_ARM_SmallPageObject` | `seL4_RISCV_4K_Page` |
| 2 MiB frame | `seL4_X86_LargePageObject` | `seL4_ARM_LargePageObject` | `seL4_RISCV_Mega_Page` |
| 1 GiB frame | `seL4_X64_HugePageObject` | `seL4_ARM_HugePageObject` | `seL4_RISCV_Giga_Page` |
| ASID bits (pools + index) | 3 + 9 | 7 + 9 | 7 + 9 |

The size constants are `seL4_PageBits` (12), `seL4_LargePageBits` (21)
and `seL4_HugePageBits` (30) on all three; the x86 1 GiB type exists
only when the kernel is built with `CONFIG_HUGE_PAGE`. x86 keeps one object type per
level because each level has its own invocation; AArch64 and RISC-V use
one page-table type for every level below the root, and on RISC-V the
root is an ordinary page table too (`seL4_VSpaceBits` is
`seL4_PageTableBits`). An AArch64 root is 4 KiB, or 8 KiB
(`seL4_VSpaceBits` 13) when the kernel is a hypervisor with 40-bit
physical addresses, because stage 2 translation then starts with a
concatenated three-level table ([Virtualisation support](hypervisor.md)).

### Mapping

```
seL4_X86_PDPT_Map(pdpt, vspace, vaddr, attr)          x86: one call per level,
seL4_X86_PageDirectory_Map(pd, vspace, vaddr, attr)        in order
seL4_X86_PageTable_Map(pt, vspace, vaddr, attr)
seL4_X86_Page_Map(frame, vspace, vaddr, rights, attr)

seL4_ARM_PageTable_Map(pt, vspace, vaddr, attr)       Arm, RISC-V: the same call
seL4_ARM_Page_Map(frame, vspace, vaddr, rights, attr)      for every level
seL4_RISCV_PageTable_Map / seL4_RISCV_Page_Map
```

Every call names the VSpace root and a virtual address, never a parent
table. The kernel walks from the root towards `vaddr`:

- A table is installed in the first empty slot the walk reaches. If the
  walk gets to the bottom level, or meets a frame, the call fails with
  `seL4_DeleteFirst`: something is already there.
- A frame is installed at the level that matches its size (a 2 MiB frame
  in a level-2 slot). If the tables above that slot are not all present,
  the call fails with `seL4_FailedLookup`, and the error's lookup-failure
  field says how many address bits were left untranslated, which tells
  the caller which level is missing.
- `vaddr` must be aligned to the object's size (`seL4_AlignmentError`)
  and lie below the top of user memory, `USER_TOP`
  (`seL4_InvalidArgument`). The kernel's own half of the address space
  is filled in when the root is created and is out of reach.

The usual user-level loop is therefore: try to map the frame; on
`seL4_FailedLookup` allocate and map a table, and retry. Libraries
(`libsel4vspace`, Microkit's tool, [rust-sel4](rust-sel4.md)) do this
for you or compute the tables in advance.

`rights` is a `seL4_CapRights_t` mask. The kernel intersects it with the
rights on the frame cap, so a read-only frame cap can never produce a
writable mapping. `attr` is a set of architecture **VM attributes**:

| Architecture | Attributes | Default |
|---|---|---|
| x86 | cache mode: `seL4_X86_WriteBack` (0), `WriteThrough`, `CacheDisabled`, `Uncacheable`, `WriteCombining` | `seL4_X86_Default_VMAttributes` (0) |
| Arm | `seL4_ARM_PageCacheable` (1), `seL4_ARM_ParityEnabled` (2), `seL4_ARM_ExecuteNever` (4) | `seL4_ARM_Default_VMAttributes` (cacheable and parity) |
| RISC-V | `seL4_RISCV_ExecuteNever` (1) | `seL4_RISCV_Default_VMAttributes` (0) |

On Arm, clearing `PageCacheable` selects the device memory type
(`DEVICE_nGnRnE`), which is what a driver wants for registers; the
kernel also forces execute-never on a mapping without read rights.

### One cap, one mapping

A frame cap records where it is mapped: the ASID and the virtual address
(`capFMappedASID`, `capFMappedAddress`). So:

- A frame cap that is already mapped can only be mapped again at the same
  address in the same VSpace, which is how rights or attributes are
  changed (the old `Remap` invocation is gone; `Map` does it). A
  different address gives `seL4_InvalidArgument`, a different VSpace
  `seL4_InvalidCapability`.
- To map the same memory twice (shared memory, or one frame in two
  VSpaces), copy the cap with `seL4_CNode_Copy` or `Mint` and map the
  copy. The copy starts unmapped, and its rights can be reduced when it
  is made, giving read-only sharing.
- `Unmap` takes only the cap: the kernel knows where to look. Deleting or
  revoking a mapped frame cap unmaps it, so
  [revoking](capabilities.md) the original frame cap tears down every
  mapping of that memory.

Table caps carry the same record. An unmapped table cap, or a root
without an ASID, cannot be copied (`seL4_IllegalOperation`), and a table
can only be unmapped through the last cap to it (`seL4_RevokeFirst`
otherwise).

### ASIDs

The kernel finds "the VSpace this cap is mapped in" through an **ASID**,
a small integer naming a VSpace root. It is also what tags TLB entries
on hardware that supports it ([x86-64 paging](../concepts/x86-paging.md),
[AArch64 paging](../concepts/aarch64-paging.md)). ASIDs are handed out
in two levels:

- The `ASIDControl` cap, given to the
  [root task](bootinfo-and-root-task.md), makes **ASID pools**:
  `seL4_X86_ASIDControl_MakePool(asidControl, untyped, root, index, depth)`
  (and the `ARM` and `RISCV` equivalents) turns one 4 KiB untyped into a
  pool of 2^`seL4_ASIDPoolIndexBits` ASIDs and puts the pool cap in the
  named slot. `seL4_DeleteFirst` means every pool already exists.
- `seL4_X86_ASIDPool_Assign(pool, vspace)` gives a root the first free
  ASID in the pool; `seL4_DeleteFirst` here means the pool is full.

The root task starts with one pool (`seL4_CapInitThreadASIDPool`).
Holding a pool cap is the authority to create address spaces; a system
that hands a subsystem its own pool bounds how many it can make.

### The rest of the interface

- `seL4_X86_Page_GetAddress` (also `ARM`, `RISCV`): the physical address
  of a frame, which a driver needs to program a device for DMA.
- Arm cache maintenance, since user code cannot issue all of it itself:
  `seL4_ARM_Page_Clean_Data`, `Invalidate_Data`, `CleanInvalidate_Data`
  and `Unify_Instruction` on a mapped frame, and the same four on
  `seL4_ARM_VSpace` for a virtual address range. Clean writes dirty
  cache lines back to memory, invalidate discards them (so it requires a
  writable mapping), and unify makes the instruction cache agree with
  the data cache after code has been written.
- `seL4_X86_PageDirectory_GetStatusBits`: the accessed and dirty bits of
  a mapping.
- `MapIO` (frames into an [IOMMU](../concepts/iommu.md) address space)
  and, on x86, `MapEPT` (frames into a guest's
  [EPT](../concepts/x86-virtualisation.md)); a frame cap is mapped in
  one kind of space at a time.

### Device memory

Frames retyped from a **device untyped** (one covering memory the kernel
does not use as RAM, such as device registers) are device frames. The
kernel does not zero them at retype, and refuses one as an IPC buffer.
Otherwise they map like any frame, normally uncached. This is the whole
of seL4's MMIO story: finding the right untyped is described in
[BootInfo and the root task](bootinfo-and-root-task.md).

## In seL4

| What | Where |
|---|---|
| Invocation decode and perform | `src/arch/x86/kernel/vspace.c` and `src/arch/x86/64/kernel/vspace.c`; `src/arch/arm/64/kernel/vspace.c`; `src/arch/riscv/kernel/vspace.c` |
| Entry points | `decodeX86MMUInvocation`, `decodeARMMMUInvocation`, `decodeRISCVMMUInvocation`, reached from `Arch_decodeInvocation` |
| Creating objects, copying and deleting caps | `Arch_createObject`, `Arch_deriveCap`, `Arch_finaliseCap` in `src/arch/*/object/objecttype.c` |
| Cap and PTE layouts | `include/arch/*/arch/64/mode/object/structures.bf` ([Generated code](generated-code.md)) |
| User-level interface | `libsel4/arch_include/*/interfaces/object-api-arch.xml`, `libsel4/sel4_arch_include/*/interfaces/object-api-sel4-arch.xml` |
| Constants | `libsel4/sel4_arch_include/*/sel4/sel4_arch/constants.h` |

Reading `decodeARMFrameInvocation` shows the shape all three share:
check the VSpace cap is a root with an ASID, check `findVSpaceForASID`
agrees, mask the rights, check alignment, apply the remap rules, call
`lookupPTSlot` and compare the level it stopped at with the frame size,
build the PTE with `makeUserPagePTE`, and only then call
`performPageInvocationMap`, which writes the PTE and the updated cap.
Decode can fail; perform cannot. That split is required by the
[proofs](verification.md).

`Arch_deriveCap` is where a copied frame cap loses its mapping record
(`capFMappedASID` set to `asidInvalid`) and where copying an unmapped
table cap is refused. Unmapping and TLB invalidation on deletion are in
`Arch_finaliseCap` and `unmapPage`.

The ASID table is `x86KSASIDTable`, `armKSASIDTable` or
`riscvKSASIDTable`: an array of `nASIDPools` pointers to pools, indexed
by `ASID_HIGH(asid)`, each pool an array indexed by `ASID_LOW(asid)`.
On AArch64 a pool entry also holds the hardware ASID or VMID
(virtual machine identifier) state where the hardware field is narrower
than seL4's 16 bits.

## Gotchas

- `seL4_FailedLookup` from a frame map nearly always means "a table is
  missing", and `seL4_DeleteFirst` from a table map means "that level is
  already there". Allocators rely on telling the two apart.
- On RISC-V, mapping a frame at an address that already has a mapping
  fails with `seL4_DeleteFirst`. `decodeARMFrameInvocation` makes no such
  check on AArch64: the new PTE replaces the old one, and the cap that
  made the old mapping still believes it is mapped.
- The mapping record lives in the cap, not the object. Two caps to one
  frame know nothing of each other's mappings; unmapping through one
  leaves the other's mapping in place.
- A VSpace root with no ASID looks valid but every `Map` into it fails,
  and a thread given it will fault at once. `Assign` comes first.
- x86-64 has only 2^12 ASIDs (8 pools of 512), so at most 4096 address
  spaces exist at once.
- Device frames must be mapped with the right attributes by the caller:
  the kernel does not pick uncached for you.
- AArch32 and ia32 have their own object sets (sections, supersections,
  a PAE PDPT); the table above covers only the 64-bit architectures.

## See also

- [Kernel objects](kernel-objects.md): the full list of object types and sizes
- [Untyped memory and retyping](untyped-memory.md): where tables and frames come from
- [x86-64 paging](../concepts/x86-paging.md), [AArch64 paging](../concepts/aarch64-paging.md), [RISC-V paging and traps](../concepts/riscv-paging-and-traps.md): the hardware formats these objects are
- [Virtual memory](../concepts/virtual-memory.md): TLBs and ASIDs in general
- [Faults and fault handlers](faults.md): what a page fault turns into
- [Virtualisation support](hypervisor.md): second-stage address spaces built the same way
- [BootInfo and the root task](bootinfo-and-root-task.md): the initial VSpace, ASID pool and device untypeds

## References

- [seL4 `src/arch/arm/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c):
  `decodeARMFrameInvocation`, `decodeARMPageTableInvocation`, the ASID
  pool and cache-flush cases, `makeUserPagePTE`. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/vspace.c):
  the x86 frame and table decode, remap checks, `GetAddress`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/vspace.c):
  the "already mapped" `seL4_DeleteFirst` check. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/64/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/object/objecttype.c):
  `Arch_deriveCap`, `Arch_createObject` and device frames.
  *Checked 2026-11-14.*
- [seL4 `libsel4/arch_include/x86/interfaces/object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml),
  and the `arm` and `riscv` files beside it: every invocation named
  here, with its arguments and documented errors. *Checked 2026-11-14.*
- [seL4 `libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h),
  and the `x86_64` and `riscv64` equivalents: page, VSpace and ASID pool
  sizes. *Checked 2026-11-14.*
- [seL4 reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  chapter 7 "Address Spaces and Virtual Memory": the model in prose.
  *Unchecked (not opened today).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
