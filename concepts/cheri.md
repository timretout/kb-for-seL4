# CHERI (Capability Hardware Enhanced RISC Instructions)

> CHERI extends an instruction set so that every pointer is a hardware capability (an address plus bounds, permissions and a hidden validity tag) that cannot be forged or enlarged, which gives C and C++ memory safety inside one address space; it exists as Arm's Morello prototype and as a draft standard RISC-V extension, and seL4 work meets it through an experimental CHERI-aware fork of the kernel.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [Capability hardware](../INDEX.md#capability-hardware) · ← [RISC-V interrupts and timers](riscv-interrupts.md) · [ACPI tables](acpi-tables.md) →

Read first: [Virtual memory](virtual-memory.md), [Privilege levels](privilege-levels.md), [RISC-V basics](riscv-basics.md).

| At a glance | |
|---|---|
| Kind | Instruction set extension for memory protection |
| Architecture | RISC-V (draft standard `RV64Y`), AArch64 (Arm Morello prototype), earlier MIPS |
| Introduced | Research from 2010 (Cambridge and SRI); Morello boards from 2022 |
| Reached through | Capability registers twice the width of an address, new instructions, `pcc` and `ddc` |
| Found through | `misa.Y` on RISC-V; `riscv,isa` strings in the [device tree](device-tree.md) |
| Key numbers | 128-bit capability plus 1 tag bit on 64-bit machines; one tag per 16 bytes of memory |
| seL4 code | None upstream; an experimental fork, [CHERI-seL4](../sel4/cheri-sel4.md) |
| seL4 use | Memory safety inside user-level components, which seL4 isolates from each other |

## What it is

### The problem it addresses

An ordinary processor lets any integer be used as an address. A
pointer in C is just a number; if a bug lets an attacker change that
number (a buffer overflow, a use after free, a type confusion), the
program will read or write wherever the number says, provided the
[page tables](virtual-memory.md) allow it. The MMU protects one address
space from another, at page granularity. It does nothing about one part
of a program corrupting another part of the same program.

seL4 sits exactly on that boundary. Its proofs say that one protection
domain cannot touch another's memory without a capability that allows
it. They say nothing about what goes on inside a protection domain: a C
network stack, a file system or a virtual machine monitor in one
address space is as exposed to its own memory bugs as it would be on
Linux.

CHERI (Capability Hardware Enhanced RISC Instructions) moves
protection to the pointer itself. It is a joint research project of the
University of Cambridge and SRI International, funded by DARPA since
2010 and, since 2019, by the UK's Digital Security by Design programme,
which paid for Arm's Morello prototype. It has been applied to 64-bit
MIPS, 32-bit and 64-bit RISC-V, and AArch64.

### Capabilities in hardware

On a CHERI machine a pointer is a **capability**: the address, plus
metadata saying which range of memory it may reach (its **bounds**) and
what it may do there (its **permissions**). Every register that can
hold an address, including the program counter, is widened to twice the
address width: 128 bits on a 64-bit machine. The address stays in the
low half, so integer code that only reads the address still works; the
metadata is in the high half, with the bounds stored compressed
relative to the address.

Each capability register and each naturally aligned 16-byte word of
memory also carries a one-bit **tag**, held out of band where no load
or store can reach it. The tag says "this is a valid capability". The
hardware keeps three rules:

- **Provenance.** A valid capability can only be made from another
  valid one. Writing ordinary data over any byte of a tagged word
  clears its tag, so a pointer cannot be built from an integer.
- **Monotonicity.** Deriving a capability can shrink its bounds and
  remove permissions, never grow or add them. An attempt to do so
  produces a capability with its tag cleared.
- **Integrity.** A capability whose bytes were altered in memory is no
  longer tagged, and using an untagged capability to reach memory raises
  an exception.

![A 128-bit CHERI capability (tag, metadata, address) and two capabilities to the same memory: the root covering everything, and one derived from it with smaller bounds and fewer permissions.](../images/cheri-capability.svg)

*A capability is an address with bounds and permissions attached, and
a hidden tag. Derivation only ever narrows: the allocator below hands
out a capability to one object, and nothing holding that capability can
widen it back to the root.*

Every load, store and instruction fetch is checked against a
capability: data accesses against the capability used as the pointer,
fetches against the **program counter capability** (`pcc`). The check
covers the tag, the bounds, the permissions and whether the capability
is sealed. A failure raises a CHERI exception, a new trap cause beside
page faults. All of this is in addition to the MMU, not instead of it:
the page tables still decide which physical memory an address space can
reach at all.

The draft RISC-V specification defines these permissions:

| Permission | Allows |
|---|---|
| R | reading data |
| W | writing data |
| X | executing instructions |
| C | loading and storing tags, so capabilities themselves can pass through this memory |
| LM | keeping write permission on capabilities loaded through this one |
| ASR | privileged instructions and access to control registers, when held in `pcc` |

Other encodings add more; Morello, for example, has separate
permissions for loading and storing capabilities. A capability can also
be **sealed**: then it cannot be changed or used to reach memory, only
jumped to, and it is unsealed as it is installed in `pcc`. A sealed
entry capability (a **sentry**) gives a callee an entry point its
caller cannot redirect.

When the machine starts, the boot code holds **root capabilities**
covering the whole address space with every permission. Everything else
is derived from them: firmware narrows them for the kernel, the kernel
for each process, the process's allocator for each object.

### Purecap, hybrid and legacy code

Software meets CHERI in one of three ways:

- **Purecap** (pure-capability) code is compiled with every pointer as
  a capability. The memory allocator sets bounds on each allocation
  (and the compiler on stack objects and globals (unchecked)), so an
  out-of-bounds access traps. C and C++ need few changes, but some: `sizeof(void *)` is now
  16 on a 64-bit machine, so code that stores pointers in `long` or
  builds them from integers (a device address written as a constant,
  say) must change. The dialect is called CHERI C.
- **Hybrid** code is ordinary code in which chosen pointers are
  declared as capabilities with the `__capability` qualifier and the
  rest stay integers.
- **Legacy** code is unmodified. CHERI runs it by checking each integer
  address against a default capability instead of the pointer.

The RISC-V specification makes this a mode of the processor. The
optional `Zyhybrid` extension adds a mode bit to each capability, read
from `pcc`: in **capability pointer mode** pointer operands are
capabilities; in **integral pointer mode** they are plain addresses,
checked against the **default data capability** register (`ddc`) for
data and against `pcc` for fetches. Setting `ddc` and `pcc` to a range
confines unmodified code to that range. Implementations without
`Zyhybrid` are "CHERI purecap" and always use capability mode.

CHERI gives purecap code **spatial safety** (no access outside an
object's bounds) and **referential safety** (no forged or corrupted
pointers) directly. **Temporal safety**, stopping use of a pointer
after its memory is freed, needs software as well: something must find
and clear stale capabilities before memory is reused (unchecked).

Because capabilities can be confined, a single address space can also
be split into **compartments**: pieces of code that each hold
capabilities only to their own memory and enter each other only
through sealed entry points. This is compartmentalisation without
separate page tables.

### Implementations

| Implementation | Architecture | State |
|---|---|---|
| Arm Morello | AArch64 (Armv8.2-A with CHERI), based on Neoverse N1 | Prototype SoC and board, 4 cores, from 2022; also an Arm FVP model and QEMU |
| CHERI-RISC-V | RISC-V `RV64Y`/`RV32Y` with `Zyhybrid` and others | Draft standard under review at RISC-V International; FPGA cores such as Toooba and CVA6, Codasip's X730, QEMU |
| CHERIoT | 32-bit RISC-V for microcontrollers | Microsoft's design, with an Ibex-based core; an experimental extension in the RISC-V draft |

Morello is an industrial demonstrator, not a product: two clusters of
two out-of-order cores built in 7 nm, with an interconnect and DRAM
controllers extended to carry tag bits. Its devices that do not
understand CHERI, such as the GPU, clear tags on any memory they
overwrite.

The RISC-V specification renamed itself during review. Earlier drafts
named extensions `Zcheripurecap` and `Zcherihybrid` (unchecked); the
current draft makes CHERI a new base, `RV64Y` (written in full
`RV64LYA`, the final letter naming the capability encoding), with
`Zyhybrid`, `Zylevels1` and others on top, and sets `misa.Y` when
CHERI is present. Its source still carries open review notes, so names
and encodings may change before ratification.

The software around these implementations is substantial: CHERI
versions of LLVM and Clang, CheriBSD (FreeBSD with a purecap kernel and
user space), CHERI Linux, FreeRTOS and Zephyr ports, and QEMU and Sail
models.

### Supervisor changes

A kernel on a CHERI machine has new work even if it is not purecap
itself:

- **Wider context.** Every general register, the saved program counter
  (`sepc` on RISC-V, `ELR_EL1` on Morello) and `ddc` are capabilities.
  Context switch code saves and restores them with capability loads and
  stores, so each thread's saved registers double in size.
- **Trap vector.** `stvec` and `sepc` on RISC-V are capabilities, so
  the trap handler runs from a capability the kernel installed.
- **Enabling.** A bit in `senvcfg` on RISC-V (`CRE`) turns CHERI on
  for user mode.
- **Page tables.** On RV64 a field in each leaf page table entry
  controls whether capabilities may pass through the page: with its
  bit clear, capability loads return untagged values and storing a
  tagged capability faults. This lets a kernel stop pointers flowing
  through shared memory into another address space.
- **New faults.** CHERI exceptions arrive with their own cause codes
  and must be reported to whoever handles faults.
- **Making user capabilities.** Only a holder of a capability can make
  another, so the kernel has to build the initial `pcc`, stack
  capability and `ddc` of each new thread from capabilities it holds.
- **Tag memory.** Tags must be stored somewhere. Some platforms set
  aside a region of DRAM for them, which the kernel must not hand out.

## In seL4

Upstream seL4 has no CHERI support as of November 2026. An
experimental fork, [CHERI-seL4](../sel4/cheri-sel4.md), adds it for
CHERI-RISC-V and Morello, with a matching fork of
[Microkit](../sel4/microkit.md); proposals to bring a smaller form of
it upstream are under discussion. That page describes the design.

The two kinds of capability do different jobs. An seL4
[capability](../sel4/capabilities.md) is a kernel-held reference to a
kernel object, named by a CPtr and checked by the kernel on each system
call; it decides which address spaces, threads and devices a component
has. A CHERI capability is a pointer checked by the processor on every
memory access; it decides what each pointer inside one address space
may reach. Neither replaces the other: seL4 isolates components, CHERI
protects each component from its own bugs.

## Gotchas

- **Pointers are 16 bytes.** Any structure shared between purecap code
  and code compiled without CHERI changes layout if it holds a pointer.
  The CHERI-seL4 fork pads `seL4_BootInfo` so that a purecap kernel
  interface and a non-CHERI root task agree on where each field is.
- **No pointers from integers.** Purecap drivers cannot cast a physical
  or device address to a pointer; whoever sets up the address space
  must hand them a capability to each device region.
- **Tags need memory that keeps them.** DMA from a device that does not
  understand CHERI clears tags, and memory without tag storage cannot
  hold capabilities at all.
- **The MMU still applies.** A root capability does not get past the
  page tables; CHERI checks come first, then translation.

## See also

- [CHERI-seL4](../sel4/cheri-sel4.md): the experimental CHERI-aware seL4 kernel and Microkit
- [Capabilities](../sel4/capabilities.md): seL4's software capabilities, which CHERI's complement
- [Virtual memory](virtual-memory.md): the page-granularity protection CHERI adds to
- [RISC-V basics](riscv-basics.md): the extension naming that `RV64Y` and `Zyhybrid` follow
- [AArch64 basics](aarch64-basics.md): the architecture Morello extends
- [Verifying user-level software](../sel4/user-level-verification.md): the other route to trustworthy code inside a component

## References

- [RISC-V Specification for CHERI Extensions, source](https://github.com/riscv/riscv-cheri),
  `src/cheri/introduction.adoc` (the `RV64Y` base and its extensions),
  `riscv-unpriv-integration.adoc` sections "CHERI Protection Model",
  "Capability Registers and Format", "Capability Type (CT)",
  "Architectural Permissions (AP)" and "Root Capabilities",
  `riscv-hybrid-integration.adoc` (`Zyhybrid`, the two pointer modes and
  `ddc`), `riscv-priv-integration.adoc` ("Machine ISA (misa) Register",
  "Supervisor Environment Configuration Register", "The pte.rvy Field for
  Capability Flow Control"); read on `main`. *Checked 2026-11-24.*
- [CHERI project page](https://www.cl.cam.ac.uk/research/security/ctsrd/cheri/),
  University of Cambridge: history, funding, the ISAs CHERI has been
  applied to. *Checked 2026-11-24.*
- [The Arm Morello Board](https://www.cl.cam.ac.uk/research/security/ctsrd/cheri/cheri-morello.html),
  University of Cambridge: what Morello is, its SoC, tag storage and
  devices that clear tags. *Checked 2026-11-24.*
- [CHERI-seL4: Enhancing seL4's C/C++ userspace memory safety using CHERI](https://sel4.systems/Summit/2024/slides/cheri-morello.pdf),
  seL4 Summit 2024 slides: CHERI C rules (`sizeof(void *) != sizeof(long)`,
  provenance), hybrid and purecap models, the list of implementations
  including CHERIoT. *Checked 2026-11-24.*
- [CHERI-seL4 project page](https://www.cl.cam.ac.uk/research/security/ctsrd/cheri/cheri-sel4.html),
  University of Cambridge: spatial and referential but not temporal
  safety for seL4 tasks. *Checked 2026-11-24.*
- [CHERI-seL4 kernel fork](https://github.com/CHERI-Alliance/CHERI-seL4),
  branch `cheri-microkit`: `bootinfo_types.h` padding, `senvcfg.CRE`,
  `stvec` as a capability, tag memory reserved on CVA6. *Checked 2026-11-24.*
- [CHERI Alliance on GitHub](https://github.com/CHERI-Alliance): the
  CHERI ports of LLVM, Linux, Zephyr, FreeBSD, QEMU, OpenSBI and the Sail
  model. *Checked 2026-11-24.*
- [CHERI C/C++ Programming Guide](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-947.pdf),
  UCAM-CL-TR-947: the CHERI C dialect in full. *Unchecked.*
- [Capability Hardware Enhanced RISC Instructions: CHERI Instruction-Set Architecture (Version 9)](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-987.pdf),
  UCAM-CL-TR-987: the research ISA the RISC-V draft is based on. *Unchecked.*
