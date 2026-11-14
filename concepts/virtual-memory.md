# Virtual memory

> How an MMU translates the addresses programs use into physical ones through multi-level page tables, with TLBs, address-space identifiers, large pages, permissions and a second stage for virtual machines; seL4 does no demand paging and exposes the tables themselves as objects, keeping only a fixed window of its own.

Read first: [Privilege levels](privilege-levels.md).

## What it is

Every address a program uses on a modern CPU is a *virtual address*.
A hardware unit, the MMU (memory management unit), translates it to a
*physical address* (a location in RAM or a device register) on every
access, using tables the kernel maintains. Two programs can therefore
use the same virtual address for different memory, and neither can
name memory the kernel has not mapped for it. This is the mechanism
behind process isolation, and in seL4 behind most of what a capability
to memory means.

### Pages, frames and the table walk

Translation works in fixed-size units. The virtual address space is
cut into *pages* and physical memory into *frames* of the same size,
4 KiB (2^12 bytes) on all three architectures in their usual
configuration. The low 12 bits of an address are the offset inside the
page and pass through unchanged; only the upper bits, the *virtual
page number*, are translated.

A flat array indexed by page number would be enormous (2^36 entries
for a 48-bit space), so the table is a radix tree. The page number is
split into fields, 9 bits each on 64-bit machines because a 4 KiB
table holds 512 eight-byte entries. A register holds the physical
address of the root table. The MMU indexes the root with the top
field, reads an entry that points at the next table, indexes that with
the next field, and so on, until a *leaf* entry gives the frame:

```
 virtual address:   | ix3 | ix2 | ix1 | ix0 | offset |
                       |     |     |     |       |
 root register ─▶ [L3] ─▶ [L2] ─▶ [L1] ─▶ [L0] ─▶ frame + offset
```

Unused parts of the address space cost nothing: an entry marked
invalid ends the walk and needs no table below it. An access through
an invalid entry, or one that the entry's permissions forbid, raises a
*page fault* [exception](exceptions-and-traps.md), with the faulting
address in a register for the kernel to read.

| | x86-64 | AArch64 | RISC-V (RV64) |
|---|---|---|---|
| Root register | `CR3` | `TTBR0_EL1` (low half), `TTBR1_EL1` (high half) | `satp` |
| Levels × bits, usual | 4 × 9 (48-bit) | 4 × 9 (48-bit) | 3 × 9 (Sv39, 39-bit) |
| Larger option | 5 levels (57-bit) | 52-bit variants | Sv48, Sv57 |
| Page sizes with 4 KiB granule | 4 KiB, 2 MiB, 1 GiB | 4 KiB, 2 MiB, 1 GiB | 4 KiB, 2 MiB, 1 GiB |
| Address-space tag | PCID, 12 bits | ASID, 8 or 16 bits | ASID, up to 16 bits |
| Fault address | `CR2` | `FAR_EL1` | `stval` |
| Details | [x86-64 paging](x86-paging.md) | [AArch64 paging](aarch64-paging.md) | [RISC-V paging and traps](riscv-paging-and-traps.md) |

### Large pages

A leaf entry may appear above the last level. It then maps the whole
range that entry covers as one *large page* (also huge page, block,
superpage, megapage): 2 MiB one level up, 1 GiB two levels up. The
walk is shorter and one TLB entry covers far more memory, at the price
of needing that much contiguous, aligned physical memory.

### Permissions

Each leaf entry carries permission bits: readable, writable,
executable (or its inverse, *no-execute*, NX on x86, XN on Arm) and
whether user mode may use the mapping at all. The MMU checks them on
every access. Entries also carry *accessed* and *dirty* bits, which
the CPU sets, or faults for the kernel to set, so that a paging kernel
knows which pages have been used.

The checks apply to the kernel too, with extra rules meant to stop a
confused kernel being exploited: features such as x86's SMEP and SMAP,
Arm's PXN and PAN and RISC-V's `SUM` bit stop supervisor code from
executing or touching user-accessible pages unless it asks to.

### The TLB

Walking four tables for every memory access would be hopeless, so the
CPU caches finished translations in the TLB (translation lookaside
buffer). The TLB is not kept in step with the tables automatically.
After changing or removing a mapping, software must invalidate the
stale entry with an explicit instruction (`invlpg` on x86, `tlbi` on
Arm, `sfence.vma` on RISC-V), or a thread can go on using memory it no
longer has a right to. On a multiprocessor each core has its own TLB,
so the kernel must make the other cores invalidate too, usually by an
inter-processor interrupt (a *TLB shootdown*; Arm has broadcast `tlbi`
forms that do it in hardware).

Switching address space means loading a new root, and originally that
flushed the whole TLB. To avoid the cost, entries are tagged with an
*address-space identifier* (ASID; PCID on x86) that the kernel assigns
to each address space and loads alongside the root. Entries of other
ASIDs stay cached but do not match. The identifier is small, so a
kernel with more address spaces than ASIDs must recycle them and flush
when it does. Mappings marked *global* match under every ASID; kernels
use that for their own half.

### Kernel and user halves

A kernel wants its own code and data mapped while it handles a system
call for any process, without switching tables on every entry. The
usual answer is to split each address space: user mappings in the low
half, kernel mappings in the high half, identical in every address
space and not user-accessible. On x86-64 and RISC-V this is one root
table whose upper entries are copied into every process's root;
AArch64 has two root registers and the kernel half never changes.
Addresses between the halves are invalid (*non-canonical*).

Inside its half, a kernel commonly maps all physical memory at a
fixed offset, so that converting a physical address to a pointer is
one addition. Linux calls this the direct map; seL4 calls it the
*kernel window* or physical memory window.

### Device memory and cache attributes

Device registers are reached through the same tables
([I/O ports and MMIO](io-ports.md)), but must not be cached, speculatively read or have
writes merged as RAM may. Page table entries therefore also select a
memory type: the PAT and cache-disable bits on x86, the `MAIR` index
on Arm. RISC-V has no such bits in the base format: the platform
fixes each physical region's attributes (the Svpbmt extension adds
bits).

### Two stages

A virtual machine's guest kernel builds page tables as usual, but the
"physical" addresses in them are *guest-physical*. The hardware
translates those through a second set of tables owned by the
hypervisor: EPT on Intel, stage 2 on Arm, G-stage on RISC-V. Every
step of the guest's walk is itself translated, which makes TLB misses
much more expensive and large pages more valuable. See
[x86 virtualisation](x86-virtualisation.md) and
[Arm virtualisation](arm-virtualisation.md). A kernel running on a
cloud instance is on the guest side of this and cannot see it.

## In seL4

seL4 has no demand paging, no swapping, no copy-on-write and no page
cache. The kernel never allocates a page table on its own initiative
and never resolves a page fault. Instead:

- **Page tables and frames are kernel objects.** User level creates
  them from untyped memory and maps them with invocations such as
  `seL4_X86_Page_Map` or `seL4_RISCV_PageTable_Map`; the kernel only
  checks the capabilities and writes the entry. A "VSpace" is the root
  table object. See [Address spaces](../sel4/vspace.md).
- **A page fault is a message.** `handleVMFaultEvent` turns it into a
  `VMFault` delivered to the thread's fault handler
  ([Faults](../sel4/faults.md)), which may map something and resume
  the thread: paging policy lives in user level.
- **Accessed and dirty bits are not used**, since nothing in the
  kernel pages memory out.
- **ASIDs are explicit.** A VSpace must be assigned an ASID from an
  ASID pool object before it can be used; the kernel uses the ASID for
  TLB tagging where the hardware has it and to find a VSpace's root
  when unmapping.

### The kernel window

The kernel's own half is built once at boot and never changes. It
maps physical memory from `PADDR_BASE` at virtual address `PPTR_BASE`
up to `PPTR_TOP` with large pages. A *pptr* in kernel source is a
pointer in this window; a *paddr* is a physical address. The
conversions are in
[`include/machine.h`](https://github.com/seL4/seL4/blob/master/include/machine.h):

```c
paddr_to_pptr(p)  ==  (void *)(p + PPTR_BASE_OFFSET)
pptr_to_paddr(v)  ==  (paddr_t)v - PPTR_BASE_OFFSET
/* PPTR_BASE_OFFSET = PPTR_BASE - PADDR_BASE, include/hardware.h */
```

The kernel image itself is linked at a different address,
`KERNEL_ELF_BASE`, mapped separately, and addresses in it convert with
`kpptr_to_paddr`. A small region at `KDEV_BASE` holds the kernel's
own device mappings (interrupt controller, timer, debug UART).

Every kernel object must lie inside the window. The kernel reaches
TCBs, CNodes, endpoints and page tables by pointer while running on
whichever VSpace happens to be current, with no temporary mappings and
no possibility of a fault, which is also what the proofs assume. The
consequence is a hard limit: RAM above `PADDR_TOP` (`PPTR_TOP -
PPTR_BASE_OFFSET`) cannot hold kernel objects. `init_avail_reg` in
[`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c)
prints that such a region "is outside the kernel window, only
potentially available as device untypeds", and user level can use it
only as frames.

| `KernelSel4Arch` | Layout defined in | `PPTR_BASE` | `PPTR_TOP` | Window |
|---|---|---|---|---|
| `x86_64` | [`include/plat/pc99/plat/64/plat_mode/machine/hardware.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/64/plat_mode/machine/hardware.h) | `0xffffff8000000000` | `0xffffffff80000000` | 510 GiB |
| `aarch64` | [`include/arch/arm/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/hardware.h) | `0xffffff8000000000` | `0xffffffffc0000000` | 511 GiB |
| `riscv64` (Sv39) | [`include/arch/riscv/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/64/mode/hardware.h) | `0xFFFFFFC000000000` | `0xFFFFFFFF80000000` | 254 GiB |
| `aarch32`, `riscv32` | `include/arch/*/arch/32/mode/hardware.h` | `seL4_UserTop` | below 4 GiB | under 1 GiB |
| `ia32` | `include/plat/pc99/plat/32/plat_mode/machine/hardware.h` | `0xe0000000` | below 4 GiB | under 512 MiB |

The AArch64 values are for the kernel in EL1; in EL2 (hypervisor
mode) there is a single translation regime and the same file gives a
low layout (`PPTR_BASE` `0x0000008000000000`). Each of these headers
carries an ASCII diagram of the layout, the best first thing to read.
`USER_TOP` is `seL4_UserTop` from libsel4's
`sel4_arch/constants.h` (`0x00007ffffffff000` on x86_64); the kernel
refuses to map user frames at or above it.

## Gotchas

- x86-64 breaks the pattern in the table above: its layout constants
  are in the `pc99` *platform* header, not under
  `include/arch/x86/arch/64/mode/`. Grepping only `include/arch` for
  `PPTR_BASE` finds nothing for x86-64.
- "pptr" does not mean "any kernel pointer". A pointer into the
  kernel image (a global variable, the idle thread's stack) is not in
  the window; passing it to `pptr_to_paddr` gives a wrong physical
  address without any diagnostic. Use `kpptr_to_paddr`.
- The window is not the whole of RAM on a large machine. An instance
  with more memory than the window, or with RAM placed high in the
  physical address space, boots but offers the excess only as device
  untyped memory.
- On the 32-bit architectures and on RISC-V 32-bit `PADDR_BASE` is
  `physBase()`, not zero, so `PPTR_BASE_OFFSET` depends on the
  platform's load address. Code that assumes "pptr minus `PPTR_BASE`
  is the paddr" is wrong there.
- The kernel maps its window with the largest pages it can, and with
  one set of attributes. Device memory inside the window's range is
  not usable through it; the kernel maps its own devices at
  `KDEV_BASE` and gives the rest to user level as device untypeds.
- seL4 flushes the TLB itself when a mapping is removed or a
  capability revoked, including on other cores, but user level sees
  no accessed or dirty information and must track it by other means
  (mapping read-only and taking the fault, for example).
- Under a hypervisor a "physical" address is guest-physical. Costs
  that look odd from inside (slow first touch of memory, slow TLB
  misses) are often the second stage.

## See also

- [x86-64 paging](x86-paging.md): `CR3`, the four levels, PCID
- [AArch64 paging](aarch64-paging.md): `TTBR0`/`TTBR1`, descriptors, stage 2
- [RISC-V paging and traps](riscv-paging-and-traps.md): Sv39, `satp`
- [Address spaces (VSpace)](../sel4/vspace.md): the object types and invocations built on this
- [Exceptions, interrupts and traps](exceptions-and-traps.md): how a page fault reaches the kernel
- [Faults and fault handlers](../sel4/faults.md): how it reaches user level
- [I/O ports and MMIO](io-ports.md): device registers as mapped memory
- [Kernel design and execution model](../sel4/kernel-design.md): why the kernel wants everything mapped up front
- [ELF and linking](elf.md): ELF is the file format of every kernel, loader and user program in an seL4 system
- [IOMMUs: VT-d and SMMU](iommu.md): an IOMMU translates and restricts the memory addresses devices use for DMA, which is what keeps a...
- [CSpaces and capability addressing](../sel4/cspace.md): A thread's CSpace is the tree of CNodes

## References

- [seL4 `include/machine.h`](https://github.com/seL4/seL4/blob/master/include/machine.h)
  and [`include/hardware.h`](https://github.com/seL4/seL4/blob/master/include/hardware.h):
  `paddr_to_pptr`, `pptr_to_paddr`, `kpptr_to_paddr`,
  `PPTR_BASE_OFFSET`, `PADDR_TOP`. *Checked 2026-11-14.*
- [seL4 `include/arch/riscv/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/64/mode/hardware.h):
  the layout diagram and its comment on how much of the address space
  the window takes on each 64-bit architecture. *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/64/mode/hardware.h)
  and [`include/plat/pc99/plat/64/plat_mode/machine/hardware.h`](https://github.com/seL4/seL4/blob/master/include/plat/pc99/plat/64/plat_mode/machine/hardware.h):
  the constants in the table. *Checked 2026-11-14.*
- [seL4 `src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c),
  `init_avail_reg`: memory outside the window. *Checked 2026-11-14.*
- [The RISC-V Instruction Set Manual, Volume II, supervisor chapter](https://github.com/riscv/riscv-isa-manual/blob/main/src/priv/supervisor.adoc),
  "Sv39": the plainest specification of a multi-level walk, written
  as an algorithm. *Checked 2026-11-14.*
- Intel 64 and IA-32 Architectures Software Developer's Manual, volume
  3, chapter 4 "Paging". *Unchecked: intel.com refuses scripted
  fetches; the x86 and Arm facts in "What it is" are from memory and
  are covered in detail, with their own marks, on the
  per-architecture pages.*
- Arm Architecture Reference Manual for A-profile (DDI 0487), chapter
  D8 "The AArch64 Virtual Memory System Architecture". *Unchecked:
  developer.arm.com refuses scripted fetches.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
