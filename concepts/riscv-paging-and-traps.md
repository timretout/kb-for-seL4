# RISC-V paging and traps

> How an S-mode kernel on RISC-V translates addresses (Sv39 or Sv48 tables rooted at `satp`, one entry format at every level) and takes traps (one handler at `stvec`, cause in `scause`, return with `sret`); seL4's whole entry path is one assembly function, `trap_entry`, and one page table object type.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [RISC-V](../INDEX.md#risc-v) · ← [RISC-V basics](riscv-basics.md) · [RISC-V interrupts and timers](riscv-interrupts.md) →

Read first: [RISC-V basics](riscv-basics.md), [Virtual memory](virtual-memory.md), [Exceptions, interrupts and traps](exceptions-and-traps.md).

| At a glance | |
|---|---|
| Kind | Processor mechanism (address translation and trap entry) |
| Architecture | RISC-V |
| Reached through | CSRs `satp`, `stvec`, `sepc`, `scause`, `stval`, `sscratch`; the `sret` and `sfence.vma` instructions |
| Key numbers | Sv39: 3 levels, 39 bits; Sv48: 4 levels, 48 bits; tables of 512 eight-byte entries; `ecall` from U-mode is cause 8 |
| seL4 code | [`src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S), [`src/arch/riscv/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/vspace.c) |
| seL4 config | `KernelPTLevels` (2, 3 by default, 4) |
| seL4 use | One entry function, `trap_entry`; one table type, `seL4_RISCV_PageTableObject` |

## What it is

Both mechanisms are controlled entirely through the supervisor CSRs
listed on [RISC-V basics](riscv-basics.md). There are no descriptor
tables in memory and nothing is pushed on a stack.

### Paging modes

The `satp` (supervisor address translation and protection) register
selects the scheme and the root table. On RV64:

```
 63    60 59           44 43                               0
+--------+---------------+----------------------------------+
|  MODE  |     ASID      |  PPN (root table address >> 12)  |
+--------+---------------+----------------------------------+
```

| `MODE` | Name | Levels | Virtual address | Covered by one root entry |
|---|---|---|---|---|
| 0 | Bare | none | no translation: virtual = physical | |
| 8 | Sv39 | 3 | 39 bits (512 GiB) | 1 GiB |
| 9 | Sv48 | 4 | 48 bits (256 TiB) | 512 GiB |
| 10 | Sv57 | 5 | 57 bits | 256 TiB |

RV32 has one scheme, Sv32: `MODE` is a single bit, with two levels of
1024 four-byte entries. Sv39 is the common denominator on 64-bit
hardware; writing an unsupported `MODE` leaves `satp` unchanged, which
is how a kernel probes.

In all the RV64 schemes a table is one 4 KiB page of 512 eight-byte
entries, each level consumes 9 bits, and the unused upper bits of a
virtual address must all equal the highest used bit (bit 38 in Sv39),
as with x86-64's canonical addresses. Sv39 therefore has a 256 GiB
low half and a 256 GiB high half:

```
 38       30 29       21 20       12 11         0
+-----------+-----------+-----------+------------+
|  VPN[2]   |  VPN[1]   |  VPN[0]   |   offset   |
+-----------+-----------+-----------+------------+
 satp.PPN ─▶ level 2 ───▶ level 1 ───▶ level 0 ───▶ 4 KiB page
               └ leaf: 1 GiB gigapage   └ leaf: 2 MiB megapage
```

The specification numbers levels from the leaf end (`VPN[0]` indexes
the last table). The ASID field is up to 16 bits on RV64; an
implementation may provide fewer, or none.

### Page table entries

Every level uses the same 64-bit entry (PTE):

| Bits | Name | Meaning |
|---|---|---|
| 0 | V | valid; if 0 the other bits are free for software |
| 1, 2, 3 | R, W, X | readable, writable, executable |
| 4 | U | accessible in U-mode |
| 5 | G | global: present in every address space, kept across ASIDs |
| 6 | A | accessed |
| 7 | D | dirty (written) |
| 8, 9 | RSW | reserved for software |
| 10 to 53 | PPN | physical page number of the page or the next table |
| 54 to 63 | | reserved or used by extensions; zero otherwise |

There is no "page size" bit. **An entry with any of R, W or X set is a
leaf; an entry with V set and R, W, X all zero points to the next
level.** A leaf above the last level is a superpage (megapage 2 MiB,
gigapage 1 GiB, terapage 512 GiB in Sv48) and its low PPN bits must be
zero or the access faults. W without R is reserved. An X-only mapping
is legal, and so is a readable page that is not executable: there is
no need for a separate no-execute bit.

A and D are handled in one of two ways, the implementation's choice:
the hardware sets them, or it raises a page fault when it meets A = 0
(or D = 0 on a write) and expects software to set them. A kernel that
does not want those faults creates its leaf entries with A and D
already set.

Two bits of `sstatus` change the checks for S-mode itself. With
**SUM** (permit supervisor user memory access) clear, S-mode faults on
any access to a page with U = 1; S-mode can never execute such a page.
**MXR** (make executable readable) lets loads succeed on X-only pages.

### The TLB

`sfence.vma rs1, rs2` (supervisor fence, virtual memory) tells the
hart that page tables have changed. `rs1` is a virtual address and
`rs2` an ASID; `x0` in either position means "all". So `sfence.vma`
with no operands flushes everything, and `sfence.vma x0, a0` flushes
one address space (global mappings excepted). It acts on the executing
hart only: other harts are reached through the SBI "remote
`sfence.vma`" calls or by an IPI. Writing `satp` does not flush
anything by itself.

### Taking a trap

*Trap* is RISC-V's word for any transfer to a handler, caused either
by an *exception* (synchronous) or an *interrupt*. For a trap
delegated to S-mode the hart does the following and nothing more:

1. `sepc` ← the `pc` of the instruction that trapped or was
   interrupted;
2. `scause` ← the cause; `stval` ← extra information (the faulting
   virtual address for access and page faults, possibly the
   instruction bits for an illegal instruction, otherwise zero);
3. `sstatus.SPP` ← the mode it came from (0 = U, 1 = S),
   `sstatus.SPIE` ← `SIE`, then `SIE` ← 0, which masks interrupts;
4. mode ← S, and `pc` ← the handler address from `stvec`.

`stvec` holds a 4-byte-aligned address with a mode in its low two
bits: 0, *direct*, sends every trap to that address; 1, *vectored*,
sends interrupts to `BASE + 4 × cause` and exceptions to `BASE`.

`scause` has the top bit (bit 63 on RV64) set for an interrupt, so a
signed compare with zero separates the two classes. The codes an
S-mode kernel meets:

| Interrupt | Code | | Exception | Code |
|---|---|---|---|---|
| Supervisor software | 1 | | Instruction address misaligned | 0 |
| Supervisor timer | 5 | | Instruction access fault | 1 |
| Supervisor external | 9 | | Illegal instruction | 2 |
| | | | Breakpoint (`ebreak`) | 3 |
| | | | Load address misaligned | 4 |
| | | | Load access fault | 5 |
| | | | Store address misaligned | 6 |
| | | | Store access fault | 7 |
| | | | Environment call (`ecall`) from U-mode | 8 |
| | | | Instruction page fault | 12 |
| | | | Load page fault | 13 |
| | | | Store page fault | 15 |

A *page fault* means the walk found no valid, permitted mapping. An
*access fault* means the physical address reached was not allowed
(outside RAM, or blocked by M-mode's physical memory protection). The
interrupt sources are on [RISC-V interrupts](riscv-interrupts.md).

The handler starts with all 31 registers holding user values and no
stack. `sscratch` exists to break the deadlock: the kernel leaves a
pointer there while user code runs, and the handler's first
instruction, `csrrw t0, sscratch, t0`, swaps it with a register. The
handler then has one pointer and can save everything else through it.

`sret` returns: `pc` ← `sepc`, mode ← `SPP`, `SIE` ← `SPIE`. Because
`sepc` is the trapping instruction, returning unchanged retries it,
which is right for a fixed-up fault and wrong for `ecall`: software
must add 4 (`ecall` has no compressed form, so always 4).

## In seL4

### Traps

`init_cpu` in
[`src/arch/riscv/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/boot.c)
writes the address of `trap_entry` to `stvec`. The address is aligned,
so the mode is direct: every trap from user level arrives at
`trap_entry` in
[`src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S),
which does this:

1. `csrrw t0, sscratch, t0`: `sscratch` held a pointer to the current
   thread's register array in its TCB (on SMP it holds the core's
   kernel stack top instead, and the TCB pointer is stored just below
   it).
2. Stores `x1` to `x31` into that array at the offsets of the enum in
   `registerset.h`, then `sstatus`, `scause` and `sepc` (as
   `FaultIP`).
3. Reloads `gp` for the kernel and sets `sp` to the top of
   `kernel_stack_alloc`.
4. Dispatches on `scause`: negative means an interrupt, so `NextIP` ←
   `sepc` and jump to `c_handle_interrupt`; 8 means a system call, so
   `NextIP` ← `sepc + 4`, and the call goes to the fast path
   (`c_handle_fastpath_call` or `c_handle_fastpath_reply_recv`, chosen
   by the system call number in `a7`) or to `c_handle_syscall`;
   anything else gets `NextIP` ← `sepc` and `c_handle_exception`.

The C side is
[`src/arch/riscv/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/c_traps.c).
`c_handle_exception` halts if `sstatus.SPP` shows the trap came from
the kernel itself, sends the six access-fault and page-fault codes to
`handleVMFaultEvent` and everything else to `handleUserLevelFault`
(see [Exceptions, interrupts and traps](exceptions-and-traps.md) for
those shared functions). `handleVMFault` in `vspace.c` reads `stval`
and reports the fault to user level as a load, store or instruction
*access* fault code (5, 7 or 1) whichever of the two hardware causes
occurred.

`restore_user_context` in the same file is the exit: it reloads the
registers from the current TCB, writes `NextIP` to `sepc` and the
saved `SSTATUS` to `sstatus`, puts the TCB pointer back in `sscratch`,
and executes `sret`. It also executes a dummy `sc.w` first, to clear
any `lr`/`sc` reservation so that one thread's load-reserved cannot
pair with another's store-conditional.

### Paging

| Option | Values | Meaning |
|---|---|---|
| `KernelPTLevels` (`CONFIG_PT_LEVELS`) | 2, 3 (default), 4 | Sv32 (forced on `riscv32`), Sv39, Sv48; selects `SATP_MODE` in `include/arch/riscv/arch/machine.h` |

The code is
[`src/arch/riscv/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/vspace.c).
Because the entry format is the same at every level, so is seL4's
view of it:

- **One table type.** `seL4_RISCV_PageTableObject` (4 KiB) is used at
  every level, the root included: a VSpace is just a page table that
  has been assigned an ASID. `seL4_RISCV_PageTable_Map` installs a
  table in the first empty slot found walking down from the root, so
  user level builds an address space top-down by mapping tables at the
  same virtual address repeatedly.
- **Frames.** `seL4_RISCV_4K_Page`, `seL4_RISCV_Mega_Page` (2 MiB),
  `seL4_RISCV_Giga_Page` (1 GiB) and, with four levels,
  `seL4_RISCV_Tera_Page` (512 GiB).
- **One walk.** `lookupPTSlot(root, vptr)` descends while
  `isPTEPageTable` (V set, R, W, X clear) and returns the slot reached
  with `ptBitsLeft`, the size in bits that slot maps. Mapping a frame
  succeeds only if `ptBitsLeft` equals the frame's size, which is how
  the kernel checks that the right number of tables is in place.
- **User entries.** `makeUserPTE` sets U, A and D, clears G, and
  derives R and W from the capability's rights and X from the
  `seL4_RISCV_ExecuteNever` attribute. Setting A and D up front means
  the kernel never sees the "set the accessed bit" page fault.
- **Kernel entries.** `map_kernel_window` builds
  `kernel_root_pageTable` at boot with global RWX gigapages, and
  `copyGlobalMappings` copies its upper entries (from `PPTR_BASE` up)
  into every new root table. The layout, with a diagram, is in
  [`include/arch/riscv/arch/64/mode/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/64/mode/hardware.h):
  for Sv39 the window is `PPTR_BASE` `0xFFFFFFC000000000` to
  `PPTR_TOP` `0xFFFFFFFF80000000` (254 GiB), then 1 GiB for the kernel
  image at `KERNEL_ELF_BASE` and the top 1 GiB at `KDEV_BASE` for
  kernel devices. User addresses end at `seL4_UserTop`,
  `0x0000003ffffff000`.

![The seL4 address space under Sv39: user addresses from 0 to `seL4_UserTop` in the low half, and in the high half the kernel window from `PPTR_BASE` to `PPTR_TOP` (254 GiB), 1 GiB for the kernel image and the top 1 GiB for kernel devices.](../images/riscv-paging-and-traps-sv39-layout.svg)

*The high half is the same in every address space, because
`copyGlobalMappings` copies those root entries into each new root table.*

**ASIDs.** seL4 ASIDs on `riscv64` are 16 bits: 7 bits choose one of
128 ASID pools (`seL4_NumASIDPoolsBits`) and 9 bits a slot in the pool
(`seL4_ASIDPoolIndexBits`); a pool is a 4 KiB object of 512 root table
pointers. `setVMRoot` looks the thread's ASID up with
`findVSpaceForASID`, checks it still names the thread's root table,
and calls `setVSpaceRoot(paddr, asid)`, which writes `satp` with the
seL4 ASID used directly as the hardware ASID. A thread with no valid
VSpace runs on `kernel_root_pageTable` with ASID 0.

**Flushing.** `setVSpaceRoot` executes a full `sfence.vma` after
every `satp` write, `unmapPage` and `unmapPageTable` call `sfence()`
(everything, and on SMP every hart through `sbi_remote_sfence_vma`),
and deleting an ASID calls `hwASIDFlush`. The functions are in
[`include/arch/riscv/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine.h).

## Gotchas

- seL4 flushes the whole local TLB on every address space switch, so
  the ASID in `satp` buys no performance today. Correctness does not
  depend on how many ASID bits the hardware implements.
- seL4 never sets `sstatus.SUM`: the kernel reaches user memory (the
  IPC buffer) through its own window mapping, not through the user's.
  A patch that dereferences a user virtual address in the kernel
  faults in S-mode and hits the "KERNEL ABORT" halt.
- A PTE with V set and R, W, X clear is a pointer, so a mapping with
  no permissions cannot be expressed; `makeUserPTE` returns an invalid
  entry instead.
- The specification numbers levels from the leaf (level 0 is the
  last); seL4's variable `lvl1pt` is the *root*, and `lookupPTSlot`
  counts `level` down from `CONFIG_PT_LEVELS - 1`.
- seL4's fault message uses access-fault codes for page faults too,
  so a user-level handler cannot distinguish "not mapped" from "bad
  physical address" by the code.
- `KernelPTLevels` is a build-time choice. A kernel built for Sv48
  does not fall back to Sv39 on hardware without it, and the physical
  address limit differs: `structures.bf` keeps 39 bits of physical
  address in capabilities with three levels.
- `stval` is allowed to read as zero for some exceptions on some
  hardware (illegal instructions especially). Do not rely on it
  outside access and page faults.
- With `ENABLE_SMP_SUPPORT` the meaning of `sscratch` changes from
  "TCB register pointer" to "kernel stack top"; patches to `traps.S`
  have to keep both paths working, and neither is covered by the
  proofs (assembly, and `restore_user_context` is `DONT_TRANSLATE`).

## See also

- [RISC-V basics](riscv-basics.md): the registers, CSR instructions and the SBI
- [RISC-V interrupts and timers](riscv-interrupts.md): what raises the three interrupt causes
- [Virtual memory](virtual-memory.md): the general picture, and seL4's kernel window
- [Exceptions, interrupts and traps](exceptions-and-traps.md): the shared C entry points
- [x86-64 paging](x86-paging.md) and [AArch64 paging](aarch64-paging.md): the same job on the other architectures
- [Address spaces (VSpace)](../sel4/vspace.md): the object model across architectures
- [Faults and fault handlers](../sel4/faults.md): the `VMFault` message
- [x86-64 exceptions and system calls](x86-exceptions-syscalls.md): how an x86-64 CPU enters the kernel
- [System calls and invocations](../sel4/syscalls-and-invocations.md): seL4 has only about a dozen real system calls, all forms of sending to or receiving from a capability

## References

- [The RISC-V Instruction Set Manual, Volume II: supervisor-level ISA](https://github.com/riscv/riscv-isa-manual/blob/main/src/priv/supervisor.adoc):
  sections "Supervisor Trap Vector Base Address (`stvec`) Register",
  "Supervisor Cause (`scause`) Register", "Supervisor Address
  Translation and Protection (`satp`) Register" (ASID length at most
  16), "Supervisor Memory-Management Fence Instruction" (the four
  operand cases), "Sv39" and "Sv48", and the Svade text on A and D.
  Section titles and the quoted points were opened; the cause code
  table and PTE bit positions agree with seL4's headers but were not
  read in the specification. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/traps.S)
  and [`src/arch/riscv/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/c_traps.c):
  entry, dispatch and `restore_user_context`. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/vspace.c):
  `lookupPTSlot`, `isPTEPageTable`, `makeUserPTE`, `setVMRoot`,
  `unmapPage`, `handleVMFault`, `copyGlobalMappings`. *Checked 2026-11-14.*
- [seL4 `include/arch/riscv/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine.h)
  and [`include/arch/riscv/arch/machine/hardware.h`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/machine/hardware.h):
  `setVSpaceRoot`, the `sfence` helpers, `SATP_MODE_*`, the
  `vm_fault_type` cause codes. *Checked 2026-11-14.*
- [seL4 `include/arch/riscv/arch/64/mode/object/structures.bf`](https://github.com/seL4/seL4/blob/master/include/arch/riscv/arch/64/mode/object/structures.bf):
  the `pte` and `satp` bitfield layouts. *Checked 2026-11-14.*
- [seL4 `libsel4/sel4_arch_include/riscv64/sel4/sel4_arch/constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/riscv64/sel4/sel4_arch/constants.h)
  and the `objecttype.h` files beside it: page sizes, ASID pool sizes,
  object types. *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/config.cmake):
  `KernelPTLevels`. *Checked 2026-11-14.*
