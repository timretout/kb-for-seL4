# x86-64 basics

> The registers, operating modes, leftover segmentation (GDT, TSS, FS and GS bases), control registers and calling convention of 64-bit x86, as much as is needed to read seL4's `src/arch/x86/64/`.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [x86-64](../INDEX.md#x86-64) · ← [ELF and linking](elf.md) · [CPUID and MSRs](cpuid-and-msrs.md) →

Read first: [Privilege levels](privilege-levels.md).

| At a glance | |
|---|---|
| Kind | Processor architecture: AMD's 64-bit extension of 32-bit x86 |
| Architecture | x86-64 (also AMD64, Intel 64, "long mode") |
| Key numbers | Sixteen 64-bit general-purpose registers; 48-bit virtual addresses with 4-level paging; 128-byte red zone |
| seL4 code | `src/arch/x86/64/`, starting at [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S) |
| seL4 config | `KernelArch` `x86` with sel4arch `x86_64` or `ia32` |
| seL4 use | Climbs to long mode itself in `head.S`; GDT and TSS set up per core; per-CPU data through `gs` on SMP |

## What it is

x86-64 (also AMD64, Intel 64, "long mode") is AMD's 64-bit extension of
the 32-bit x86 architecture (IA-32). It kept everything older for
compatibility, so a kernel meets forty years of layers.

### Registers

Sixteen 64-bit general-purpose registers, each with names for its low
parts:

| 64 | 32 | 16 | 8 | Convention (System V) |
|---|---|---|---|---|
| `rax` | `eax` | `ax` | `al` | return value |
| `rbx` | `ebx` | `bx` | `bl` | callee-saved |
| `rcx` | `ecx` | `cx` | `cl` | argument 4 |
| `rdx` | `edx` | `dx` | `dl` | argument 3 |
| `rsi` | `esi` | `si` | `sil` | argument 2 |
| `rdi` | `edi` | `di` | `dil` | argument 1 |
| `rbp` | `ebp` | `bp` | `bpl` | callee-saved (frame pointer) |
| `rsp` | `esp` | `sp` | `spl` | stack pointer |
| `r8`, `r9` | `r8d` | `r8w` | `r8b` | arguments 5, 6 |
| `r10`, `r11` | `r10d` | `r10w` | `r10b` | caller-saved |
| `r12` to `r15` | `r12d` | `r12w` | `r12b` | callee-saved |

Writing a 32-bit name zeroes the upper 32 bits; writing a 16- or 8-bit
name leaves the rest alone. `rip` is the instruction pointer, not
directly writable. `rflags` holds the arithmetic flags and a few
control bits a kernel cares about:

| Bit | Name | Meaning |
|---|---|---|
| 9 | IF | maskable interrupts enabled |
| 10 | DF | direction of string instructions; the ABI requires 0 at calls |
| 12 to 13 | IOPL | ring allowed to use [I/O ports](io-ports.md) and change IF |
| 18 | AC | with SMAP, lets the kernel touch user pages ([paging](x86-paging.md)) |

The **System V AMD64 calling convention**, used by GCC and Clang on
everything but Windows: integer arguments in `rdi, rsi, rdx, rcx, r8,
r9`, the rest on the stack; result in `rax`; `rbx, rbp, r12` to `r15`
preserved by the callee; stack 16-byte aligned at a `call`. User code
may use 128 bytes below `rsp` (the red zone) without moving `rsp`,
which a kernel must disable for its own code (`-mno-red-zone`) or
protect by taking interrupts on another stack, because an interrupt
pushed onto the same stack would overwrite it.

Assembly comes in two syntaxes. seL4 and Linux use AT&T: source first,
`%` on registers, `$` on constants, so `movl %cr0, %eax` copies CR0
into EAX.

### Modes

| Mode | Entered by | Addresses |
|---|---|---|
| Real | reset | 16-bit, segment × 16 + offset, no protection |
| Protected | setting `CR0.PE` | 32-bit, segmentation, optional paging |
| Long, 64-bit submode | `EFER.LME`, then `CR0.PG`, then a jump to a code segment with L=1 | 64-bit, paging mandatory |
| Long, compatibility submode | running a code segment with L=0 under a long-mode kernel | 32-bit user code |

A CPU still resets into real mode. Firmware climbs some of the way,
but a kernel started by a Multiboot loader arrives in 32-bit protected
mode with paging off and must do the last step itself: build page
tables, set `CR4.PAE`, set `EFER.LME`, set `CR0.PG`, load a GDT with a
64-bit code segment and far-jump into it. Secondary cores start in
real mode and climb the whole ladder ([SMP bring-up](smp-bringup.md)).
See [x86 boot](x86-boot.md).

![The three modes drawn as a ladder: reset enters real mode, setting CR0.PE enters protected mode, and six steps from page tables to a far jump enter 64-bit long mode; a Multiboot loader starts the kernel on the middle rung.](../images/x86-64-basics-modes.svg)

*The climb from reset to long mode. A Multiboot kernel starts on the middle
rung and does the last step itself.*

### What is left of segmentation

In protected mode every memory access went through a **segment**: a
base, a limit and permissions, described by an 8-byte **descriptor** in
the **GDT** (global descriptor table) and chosen by a **selector**
loaded into a segment register (`cs, ds, es, ss, fs, gs`). A selector
is the table index shifted left by 3, with the requested privilege
level in the low two bits. In 64-bit mode bases and limits are ignored
(treated as 0 and unlimited) for all but two registers, yet the
machinery still matters:

- **`cs`** holds the current privilege level in its low two bits, and
  its descriptor's L bit selects 64-bit or compatibility submode. A
  kernel needs a ring 0 and a ring 3 code descriptor and matching data
  descriptors for `ss`.
- **`fs` and `gs`** keep a full 64-bit base, set through the MSRs
  `FS_BASE` and `GS_BASE` ([MSRs](cpuid-and-msrs.md)) or the FSGSBASE
  instructions. User code uses one for thread-local storage; kernels
  use `gs` to find per-CPU data, exchanging the user and kernel bases
  with `swapgs` on entry.
- The **TSS** (task state segment), found through a 16-byte GDT
  descriptor and the task register (`ltr`), no longer switches tasks.
  In 64-bit mode it holds `RSP0` (the stack loaded when an interrupt
  arrives in ring 3), seven **IST** (interrupt stack table) pointers
  that an interrupt gate can demand unconditionally, and the offset of
  the [I/O permission bitmap](io-ports.md).
- The **IDT** (interrupt descriptor table) is a sibling table of gates
  for interrupts; see
  [x86 exceptions and system calls](x86-exceptions-syscalls.md).

### Control registers

| Register | Role | Bits to know |
|---|---|---|
| `CR0` | basic mode control | PE (0) protected mode, TS (3) trap on FPU use, WP (16) ring 0 honours read-only pages, PG (31) paging |
| `CR2` | faulting address of the last page fault | |
| `CR3` | physical address of the top page table, plus PCID | |
| `CR4` | feature enables | PAE (5), PGE (7), OSFXSR (9), VMXE (13), FSGSBASE (16), PCIDE (17), OSXSAVE (18), SMEP (20), SMAP (21) |
| `CR8` | task priority, a window on the local [APIC](apic.md)'s TPR | |
| `EFER` (MSR `0xC0000080`) | long-mode control | SCE (0) `syscall` enabled, LME (8), LMA (10) long mode active, NXE (11) |

Control registers are read and written with `mov` in ring 0 only.

### Canonical addresses

With 4-level [paging](x86-paging.md) only 48 bits of a virtual address
are translated, and bits 63 to 48 must all equal bit 47. Such an
address is **canonical**. That splits the space into a low half
(`0` to `0x00007fff_ffffffff`, user) and a high half
(`0xffff8000_00000000` up, kernel) with an unusable hole between.
Using a non-canonical address raises a general protection fault (a
stack fault, #SS, if the access is a stack reference), not a page
fault.

## In seL4

seL4's x86 port has two **sel4arch** values under `KernelArch` `x86`:
`x86_64` and `ia32` (32-bit, unverified, little used). Shared code is
in `src/arch/x86/` and `include/arch/x86/arch/`; mode-specific code is
in `src/arch/x86/64/` and `include/arch/x86/arch/64/mode/` (with `32/`
siblings), so `#include <mode/machine.h>` resolves per build.

- **Climbing to long mode:**
  [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S).
  Its header comment says the Multiboot loader does not enter long
  mode; `setup_pml4` clears `CR0.PG` and fills `boot_pml4` and
  `boot_pdpt`, then the code sets PAE in `CR4`, writes `IA32_EFER_MSR`,
  sets PG, runs `lgdt _gdt64_ptr` and `ljmp $8, $_start64`. Selector 8
  is GDT index 1, the 64-bit code segment.
- **GDT and TSS:** `init_gdt()` and `init_tss()` in
  [`src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c),
  called per core from `src/arch/x86/kernel/vspace.c`; `init_dtrs()`
  then loads GDT, IDT, a null LDT and the task register. The table
  (`include/arch/x86/arch/64/mode/object/structures.h`):

  | Index | Name | Selector | Use |
  |---|---|---|---|
  | 0 | `GDT_NULL` | `0x00` | required null entry |
  | 1 | `GDT_CS_0` | `0x08` | kernel code, L=1 |
  | 2 | `GDT_DS_0` | `0x10` | kernel data |
  | 3, 4 | `GDT_TSS` | `0x18` | TSS (two slots) |
  | 5 | `GDT_CS_3` | `0x2b` | user code, L=1, DPL 3 |
  | 6 | `GDT_DS_3` | `0x33` | user data |
  | 7, 8 | `GDT_FS`, `GDT_GS` | `0x3b`, `0x43` | user `fs` and `gs` |

  `init_tss()` leaves `RSP0` to `RSP2` zero and points IST 1 at a
  per-core `x64KSIRQStack`; it fills the I/O bitmap with ones so user
  `in`/`out` always fault.
- **User context:** `enum _register` in
  [`include/arch/x86/arch/64/mode/machine/registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/machine/registerset.h)
  is the order registers are saved in each TCB: `RDI` (capability and
  badge register) first, `RSI` (message info), then `RAX` ... `FLAGS`,
  the virtual registers `NextIP` and `Error`, `RSP`, `FaultIP`, `R11`,
  `RCX`, `CS`, `SS`, and finally `FS_BASE` (alias `TLS_BASE`) and
  `GS_BASE`. The comment warns that `traps.S` depends on the order,
  which is arranged for `syscall`/`sysret`.
- **Bit names:** `CR0_*`, `CR4_*` and `FLAGS_*` in
  [`include/arch/x86/arch/machine/cpu_registers.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine/cpu_registers.h).
  A new thread starts with `FLAGS_USER_DEFAULT`: IF set, IOPL 0.
- **Per-CPU data through `gs`:** on SMP builds
  `src/arch/x86/64/model/smp.c` points `IA32_KERNEL_GS_BASE_MSR` at the
  core's `node_info`, and `mode/machine.h` reads and writes the user's
  `gs` base through that MSR while in the kernel, because `swapgs` has
  exchanged them.

## Gotchas

- **32-bit writes zero-extend, 16- and 8-bit writes do not.** A patch
  that changes `movl` to `movw` changes the upper bits.
- **The kernel has no FPU, and its red zone needs care.** Kernel C
  must be built so that the compiler does not emit SSE: seL4's
  `CMakeLists.txt` passes `-mno-mmx -mno-sse -mno-sse2 -mno-3dnow`,
  and hand-written assembly must keep to it. seL4 does not pass
  `-mno-red-zone`. Instead every IDT gate uses IST 1, so the CPU never
  pushes onto the kernel stack, and the nested-interrupt path in
  `traps.S` skips 128 bytes below the interrupted `rsp` "to respect
  the red zone".
- **`gs` has two bases.** After `swapgs` the "user" value is in
  `IA32_KERNEL_GS_BASE`, so code that sets a thread's GS base from
  inside the kernel must write that MSR, not `GS_BASE`. seL4's
  `mode/machine.h` has a comment on exactly this.
- **Loading a segment register clobbers its base.** `init_dtrs()`
  wraps the GDT install in a pair of `swapgs` for this reason.
- **A TSS descriptor is 16 bytes** in long mode, which is why
  `GDT_CS_3` is index 5, not 4.
- **Non-canonical addresses raise #GP (or #SS), with no faulting
  address in `CR2`.**

## See also

- [Privilege levels](privilege-levels.md): rings, and what sits beneath ring 0
- [CPUID and MSRs](cpuid-and-msrs.md): feature discovery and the registers `mov` cannot reach
- [x86 paging](x86-paging.md): what `CR3` points at
- [x86 exceptions and system calls](x86-exceptions-syscalls.md): the IDT, and how the TSS stacks are used
- [I/O ports](io-ports.md): IOPL and the TSS bitmap
- [x86 boot](x86-boot.md): firmware, Multiboot and the state the kernel starts in
- [FPU state](fpu-state.md): the vector registers left out here
- [AArch64 basics](aarch64-basics.md) and [RISC-V basics](riscv-basics.md): the same ground on the other architectures

## References

- [seL4 `src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S):
  the climb from 32-bit protected mode to long mode. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c):
  `init_tss()`, `init_gdt()`, `init_dtrs()`, `init_syscall_msrs()`.
  *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/64/mode/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/object/structures.h)
  and [`include/arch/x86/arch/object/structures.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/object/structures.h):
  `GDT_*` indices and `SEL_*` selectors. *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/64/mode/machine/registerset.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/machine/registerset.h):
  the saved register order. *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/machine/cpu_registers.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine/cpu_registers.h):
  `CR0`, `CR4` and `FLAGS` bit numbers (PE, TS, WP, PG; OSFXSR, VMXE,
  OSXSAVE, SMEP, SMAP; IF, DF, IOPL, AC). *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/64/mode/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/64/mode/machine.h):
  the `swapgs` comment and GS base accessors. *Checked 2026-11-14.*
- [seL4 `CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt)
  and [`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S):
  the x86 compiler flags (no SSE, no `-mno-red-zone`) and the red-zone
  skip in `EXPAND_EXCEPT_0`. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual, combined volumes](https://cdrdv2.intel.com/v1/dl/getContent/671200)
  (order number 325462-093US, September 2026), volume 1 chapter 3
  (registers, modes, 3.3.7.1 "Canonical Addressing") and volume 3
  chapters 2 "System Architecture Overview" (control registers,
  `IA32_EFER`), 3 "Protected-Mode Memory Management", 10.7 "Task
  Management in 64-bit Mode" (8.7 in older revisions) and 12.8.5
  "Initializing IA-32e Mode". *Checked 2026-11-14.*
- [AMD64 Architecture Programmer's Manual, volume 2: System Programming](https://www.amd.com/en/search/documentation/hub.html)
  (publication 24593), chapters 1, 4 and 14 (long mode and how to enter
  it). *Unchecked (amd.com serves no PDF to scripted fetches; the
  chapter titles were read in a mirrored copy of revision 3.38).*
- [System V Application Binary Interface, AMD64 Architecture Processor Supplement](https://gitlab.com/x86-psABIs/x86-64-ABI)
  ([source of chapter 3](https://gitlab.com/x86-psABIs/x86-64-ABI/-/blob/master/x86-64-ABI/low-level-sys-info.tex)),
  section 3.2 "Function Calling Sequence": argument registers,
  callee-saved registers, `DF`, stack alignment, red zone.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
