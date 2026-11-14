# AArch64 paging

> AArch64 address translation: two page table roots (`TTBR0` for the low half of the address space, `TTBR1` for the high half), up to four levels of 4 KiB tables, ASIDs to tag TLB entries, and an optional second stage for hypervisors; seL4's VSpace objects are these tables.

Read first: [Virtual memory](virtual-memory.md), [AArch64 basics](aarch64-basics.md).

## What it is

[Virtual memory](virtual-memory.md) explains page tables, TLBs and ASIDs
in general. This page is how AArch64 does it. Arm calls the page tables
**translation tables** and the unit behind them the MMU, enabled by bit 0
(`M`) of `SCTLR_EL1`.

### Two halves, two roots

At EL1 and EL0 the 64-bit virtual address space has two usable ranges,
each with its own root table:

```
0xffff_ffff_ffff_ffff +----------------+
                      |  kernel half   |  root: TTBR1_EL1, size 2^(64-T1SZ)
0xffff_0000_0000_0000 +----------------+
                      |  (no mapping:  |
                      |   any access   |
                      |    faults)     |
0x0000_ffff_ffff_ffff +----------------+
                      |   user half    |  root: TTBR0_EL1, size 2^(64-T0SZ)
0x0000_0000_0000_0000 +----------------+
```

The top bits of an address must be all ones (use `TTBR1`) or all zeros
(use `TTBR0`). A context switch rewrites only `TTBR0_EL1`; the kernel's
tables are never part of a process's tables, unlike x86 where the kernel
half is copied into every top-level table.

`TCR_EL1` (translation control register) configures both halves:

| Field | Meaning |
|---|---|
| `T0SZ`, `T1SZ` | Size of each half: 64 minus the number of address bits. 16 gives 48 bits |
| `TG0`, `TG1` | **Granule** (smallest page and table size): 4 KiB, 16 KiB or 64 KiB |
| `IPS` | Physical address size the tables produce (32 to 48 bits, 52 with extensions) |
| `AS` | ASID size: 0 = 8 bits, 1 = 16 bits |
| `A1` | Which `TTBR` carries the current ASID |

EL2 and EL3 have their own regimes with a single root each (`TTBR0_EL2`,
`TTBR0_EL3`) covering only the low range, unless the VHE extension is in
use ([Arm virtualisation](arm-virtualisation.md)).

### Levels

With the 4 KiB granule and 48-bit addresses there are four levels,
numbered 0 to 3. Each table is one 4 KiB page of 512 eight-byte
**descriptors**, indexed by 9 bits of the address:

| Level | Index bits | One entry covers | May map memory directly |
|---|---|---|---|
| 0 | 47 to 39 | 512 GiB | No |
| 1 | 38 to 30 | 1 GiB | Yes: 1 GiB **block** |
| 2 | 29 to 21 | 2 MiB | Yes: 2 MiB block |
| 3 | 20 to 12 | 4 KiB | Yes: 4 KiB **page** |

A smaller address space starts at a later level: 39 bits (`TxSZ` = 25)
needs only levels 1 to 3. The 16 KiB and 64 KiB granules use bigger
tables and different block sizes (with 64 KiB: 512 MiB blocks at level
2); seL4 uses only 4 KiB.

### Descriptors

Bits 1 and 0 give the type:

| Bits 1:0 | At levels 0 to 2 | At level 3 |
|---|---|---|
| `x0` | Invalid: access faults | Invalid |
| `01` | Block | Reserved (invalid) |
| `11` | Table: points to the next level | Page |

Block and page descriptors hold the output address in the middle bits
and attributes at both ends:

| Bits | Field | Meaning |
|---|---|---|
| 4:2 | `AttrIndx` | Index into `MAIR_EL1`, eight bytes each naming a memory type: normal cacheable, normal uncached, device |
| 7:6 | `AP` | Access permissions: `00` kernel read-write, `01` kernel and user read-write, `10` kernel read-only, `11` both read-only |
| 9:8 | `SH` | Shareability for caches; inner shareable (`11`) for normal memory on multiprocessors |
| 10 | `AF` | Access flag: 0 causes an access flag fault on first use, unless hardware sets it |
| 11 | `nG` | Not global: the TLB entry is tagged with the current ASID |
| 53 | `PXN` | Privileged execute never |
| 54 | `UXN` | User execute never (`XN` in single-privilege regimes) |

The indirection through `MAIR_EL1` (memory attribute indirection
register) is the surprise for x86 readers: whether a mapping is cached
RAM or device memory is a 3-bit index in the descriptor, and the meaning
of each index is whatever the kernel wrote to `MAIR_EL1` at boot.

### ASIDs and the TLB

An **ASID** (address space identifier) of 8 or 16 bits sits in bits 63 to
48 of `TTBR0_EL1` (or `TTBR1_EL1`, by `TCR_EL1.A1`). TLB entries from
non-global (`nG` = 1) mappings are tagged with it, so switching address
space needs no TLB flush. The hardware never invalidates TLB entries
itself; software does with `TLBI` system instructions:

| Instruction | Invalidates |
|---|---|
| `tlbi vmalle1` | Everything for the current EL1 regime (current VMID) |
| `tlbi aside1, Xt` | All entries of one ASID (ASID in bits 63:48 of `Xt`) |
| `tlbi vae1, Xt` | One virtual address for one ASID (page number in the low bits) |
| `tlbi alle1`, `alle2` | Everything for EL1 (all VMIDs), for EL2 |
| `tlbi ipas2e1, Xt` | Stage 2 entries for one guest-physical address |
| `tlbi vmalls12e1` | Stage 1 and 2 entries for the current VMID |

A suffix `is` (`vae1is`) broadcasts the invalidation to all cores in the
inner-shareable domain, with no IPI needed. A `TLBI` is followed by `dsb`
(wait for completion) and `isb`.

**Break-before-make**: the architecture forbids replacing one valid
descriptor directly with another that changes the output address, block
size or memory type, because two cores' TLBs could briefly hold
conflicting entries. The required sequence is: write an invalid
descriptor, `TLBI`, then write the new one.

### Stage 2

With a hypervisor at EL2, what a guest's tables produce is not a physical
address but an **intermediate physical address** (IPA), translated again
by **stage 2** tables rooted at `VTTBR_EL2` and configured by
`VTCR_EL2`. Stage 2 descriptors have the same shape with different
attribute fields (`S2AP` permissions, memory type inline in place of the
`MAIR` index). `VTTBR_EL2` carries a **VMID** (virtual machine
identifier, 8 or 16 bits) that tags TLB entries per guest as an ASID does
per process. More in [Arm virtualisation](arm-virtualisation.md).

### Caches and executable pages

Arm cores have separate instruction and data caches that are not kept
coherent automatically. After writing code into memory (loading a
program, a JIT), software must clean the data cache for those lines (`dc
cvau`) and invalidate the instruction cache (`ic ivau`), then `dsb` and
`isb`, or the core may execute stale instructions.

## In seL4

The code is
[`src/arch/arm/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c);
the layout is drawn in comments in
[`include/arch/arm/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/hardware.h).

**Kernel layout (EL1 kernel).** The kernel uses `TTBR1_EL1` for itself
and `TTBR0_EL1` for the current thread. Only the top 512 GiB is mapped:

| Range | Name | Contents |
|---|---|---|
| 2^64 - 2^39 up to 2^64 - 2^30 | `PPTR_BASE` to `PPTR_TOP` | The **physical memory window**: all RAM at a fixed offset, so the kernel can reach any object |
| from 2^64 - 2^30 | `KERNEL_ELF_BASE` | The kernel image |
| 2^64 - 2 x 2^21 | `KS_LOG_PPTR` | Benchmark log buffer |
| 2^64 - 2^21 | `KDEV_BASE` | Kernel devices (UART, interrupt controller, timer), 4 KiB pages |

`map_kernel_window` builds this at boot and `activate_kernel_vspace`
installs it with `setCurrentKernelVSpaceRoot`.

**Hypervisor build.** At EL2 there is only `TTBR0_EL2`, so the kernel is
linked in the low range instead: the same window sits just below 2^40.
User threads and guests then run under tables installed in `VTTBR_EL2`
in stage 2 format, which is why `setCurrentUserVSpaceRoot` writes
`vttbr_el2` in that configuration and `ttbr0_el1` otherwise.

**Physical address size.** `KernelArmPASizeBits40` or
`KernelArmPASizeBits44` is chosen in
[`src/arch/arm/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/arm/config.cmake)
from the core type (Cortex-A35, A53 and A55 get 40; A57 and A72 get 44)
and fixes the stage 2 format in hypervisor builds. With 40 bits the
stage 2 tables have three levels and a double-size root, which is why
`seL4_VSpaceBits` is 13 there (hypervisor support with 40-bit physical
addresses) and 12 otherwise.

**Objects.** User level sees a small set of types:

| Object | Size | Role |
|---|---|---|
| `seL4_ARM_VSpaceObject` | `seL4_VSpaceBits` (12 or 13) | The root table |
| `seL4_ARM_PageTableObject` | 4 KiB | A table at any lower level |
| `seL4_ARM_SmallPageObject` | 4 KiB (`seL4_PageBits` 12) | Frame |
| `seL4_ARM_LargePageObject` | 2 MiB (`seL4_LargePageBits` 21) | Frame, mapped as a level 2 block |
| `seL4_ARM_HugePageObject` | 1 GiB (`seL4_HugePageBits` 30) | Frame, mapped as a level 1 block |

Older names (`PageGlobalDirectory`, `PageUpperDirectory`,
`PageDirectory`) survive as aliases in `deprecated.h`: every intermediate
level is now a `PageTable`. `lookupPTSlot` walks the levels generically.
See [Address spaces (VSpace)](../sel4/vspace.md).

**ASIDs.** seL4's ASIDs are 16 bits: the top 7 (`seL4_NumASIDPoolsBits`)
select an ASID pool and the low 9 (`seL4_ASIDPoolIndexBits`) an entry in
it, which records the VSpace root. What reaches the hardware differs:

- EL1 kernel: `armv_contextSwitch` puts the seL4 ASID straight into
  `TTBR0_EL1` with the root's physical address. No allocation.
- EL2 kernel: the hardware tag is an 8-bit VMID, fewer than there are
  ASIDs, so `getHWASID` assigns one on demand. `findFreeHWASID` scans
  `armKSHWASIDTable`; when all are taken it steals the one at
  `armKSNextASID`, flushing its TLB entries (`invalidateTranslationASID`)
  and clearing the victim's stored value (`invalidateASID`).

`setVMRoot` runs on every switch to a thread; a thread without a valid
VSpace gets the empty `armKSGlobalUserVSpace` with `hwASIDReserved`.

**TLB and cache instructions** are wrapped in
[`mode/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/machine.h):
`tlbi vae1` and `aside1` for an EL1 kernel, `ipas2e1` and `vmalls12e1`
for EL2, and `dc cvau`/`ic ivau` behind the `seL4_ARM_Page_*` and
`seL4_ARM_VSpace_*` cache-maintenance invocations.

## Gotchas

- **User level must do the cache maintenance for code it loads.** seL4
  maps a frame; it does not know the frame holds new instructions. A
  loader calls `seL4_ARM_Page_Unify_Instruction` (or the VSpace
  equivalent) after writing code.
- **In a hypervisor build, native threads' tables are stage 2 tables.**
  Permission and attribute bits differ from the stage 1 format, so
  descriptor-building code in `vspace.c` is conditional on
  `CONFIG_ARM_HYPERVISOR_SUPPORT`. Review both branches.
- **The physical memory window bounds usable RAM.** Memory above what
  `PPTR_BASE` to `PPTR_TOP` can cover (under 512 GiB at EL1, far less at
  EL2 below 2^40) is not usable by the kernel.
- **`KernelArmPASizeBits` follows the core type, not the machine.** A
  platform whose RAM or devices sit above 2^40 needs the 44-bit setting
  whatever the core is.
- **`AF` = 0 faults.** A descriptor built by hand without the access
  flag set looks valid and faults on first touch.

## See also

- [Virtual memory](virtual-memory.md): the architecture-neutral picture
- [x86-64 paging](x86-paging.md): the same job with one root, `CR3`
- [AArch64 exceptions](aarch64-exceptions.md): the aborts a missing
  mapping raises, and the fault status codes
- [Arm virtualisation](arm-virtualisation.md): stage 2 and VMIDs in use
- [Address spaces (VSpace)](../sel4/vspace.md): the seL4 API over these
  tables
- [IOMMUs: VT-d and SMMU](iommu.md): an IOMMU translates and restricts the memory addresses devices use for DMA, which is what keeps a...
- [RISC-V paging and traps](riscv-paging-and-traps.md): how an S-mode kernel on RISC-V translates addresses

## References

- Arm Architecture Reference Manual for A-profile (DDI 0487), chapter
  "The AArch64 Virtual Memory System Architecture": translation regimes,
  descriptor formats, "TLB maintenance requirements and the TLB
  maintenance instructions" and break-before-make. *Unchecked
  (developer.arm.com refuses scripted fetches).*
- [seL4 `hardware.h` for AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/hardware.h):
  the kernel address map at EL1 and EL2.
  *Checked 2026-11-14.*
- [seL4 `vspace.c` for AArch64](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/kernel/vspace.c):
  `setVMRoot`, `findFreeHWASID`, `lookupPTSlot`.
  *Checked 2026-11-14.*
- [seL4 `context_switch.h` for Armv8 AArch64](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/context_switch.h):
  `armv_contextSwitch` and when `getHWASID` is used.
  *Checked 2026-11-14.*
- [libsel4 AArch64 `constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/sel4/sel4_arch/constants.h):
  object sizes and ASID bit counts.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/arm/config.cmake):
  `KernelArmPASizeBits40` and `44` by core type.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
