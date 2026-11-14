# ELF and linking

> ELF is the file format of every kernel, loader and user program in an seL4 system; reading its program headers and the linker script behind them explains where each image is loaded, at which virtual address it runs, and what boot code can assume.

Read first: [Virtual memory](virtual-memory.md).

## What it is

**ELF** (Executable and Linkable Format) is one format for three kinds
of file: relocatable objects (`.o`, type `ET_REL`), executables
(`ET_EXEC`) and shared objects (`ET_DYN`). A file has two overlapping
descriptions of the same bytes, for two different readers:

```
+----------------------+
| ELF header           |  magic 0x7f 'E' 'L' 'F', class (32/64 bit),
|                      |  byte order, e_type, e_machine, e_entry,
+----------------------+  where the two tables below are
| program header table |  SEGMENTS: what a loader needs
+----------------------+
| .text                |
| .rodata              |
| .data                |  the contents
| .symtab .strtab ...  |
+----------------------+
| section header table |  SECTIONS: what the linker and debugger need
+----------------------+
```

`e_machine` names the architecture (`EM_386` 3, `EM_X86_64` 62,
`EM_AARCH64` 183, `EM_RISCV` 243) and `e_entry` is the virtual address
of the first instruction to run.

### Segments: the loader's view

A loader reads only the ELF header and the **program headers**. Each
describes a **segment**; the kind that matters is `PT_LOAD`:

| Field | Meaning |
|---|---|
| `p_offset` | where the segment's bytes start in the file |
| `p_vaddr` | the virtual address the code was linked to run at |
| `p_paddr` | the physical *load* address, for loaders that run without paging |
| `p_filesz` | bytes present in the file |
| `p_memsz` | bytes occupied in memory; if larger than `p_filesz` the loader zero-fills the rest (this is how `.bss` is represented) |
| `p_flags` | `PF_R` (4), `PF_W` (2), `PF_X` (1): permissions to map with |
| `p_align` | alignment, usually the page size |

Loading an ELF is: for each `PT_LOAD`, copy `p_filesz` bytes from
`p_offset` to the segment's address, zero up to `p_memsz`, then jump to
`e_entry`. An OS loading a process uses `p_vaddr` and builds page tables.
A boot loader with no paging uses `p_paddr`. For an ordinary Linux
program the two are equal and `p_paddr` is ignored; for a kernel they
differ, which is the crux of the next sections.

Other segment types: `PT_DYNAMIC` and `PT_INTERP` (dynamic linking),
`PT_NOTE`, `PT_TLS` (the initial image of thread-local storage, which a
loader or runtime must copy per thread), `PT_PHDR`.

### Sections: the linker's view

The **section headers** name finer-grained pieces. The linker combines
same-named sections from many objects; debuggers and tools find things
by section. A loader never needs them and a stripped file can lack them.

| Section | Holds |
|---|---|
| `.text` | machine code |
| `.rodata` | constants, string literals |
| `.data` | initialised writable variables |
| `.bss` | zero-initialised variables; type `SHT_NOBITS`, occupying no file space |
| `.symtab`, `.strtab` | the symbol table (name, address, size, type per function and variable) and its names |
| `.rela.*` | relocations |
| `.debug_*` | DWARF debugging information |

A C compiler can be told to place an item in a named section with
`__attribute__((section(".name")))`, which is how kernels sort code into
groups for the linker script to place.

### Static, dynamic, PIE, relocations

A **relocation** is a note saying "patch the address of symbol S into
this location". Linking resolves most of them. A **statically linked**
`ET_EXEC` has none left: every address is final and the file runs only
at its linked address. A **dynamically linked** program leaves
relocations for the run-time linker named in `PT_INTERP`. A **PIE**
(position-independent executable) is an `ET_DYN` file whose code works at
any base address; a static PIE applies its own few relocations at start.
seL4's kernel and typical root tasks are static, non-PIE executables;
nothing in the system could act as a dynamic linker.

### Linker scripts

The linker (`ld`) decides addresses and segment layout from a **linker
script**. A user program uses the built-in default. A kernel supplies
its own (`-T file`), because it must control exactly these things:

```ld
ENTRY(_start)                     /* sets e_entry */
KERNEL_OFFSET = 0xffffffff80000000 - 0x100000;
SECTIONS
{
    . = 0xffffffff80100000;       /* the location counter: a VIRTUAL address */
    .text . : AT(ADDR(.text) - KERNEL_OFFSET)   /* AT() = LOAD address */
    {
        *(.text)                  /* input sections, from all objects */
        KEEP(*(.vectors))         /* survive --gc-sections though unreferenced */
    }
    . = ALIGN(4K);
    .bss . (NOLOAD) : AT(ADDR(.bss) - KERNEL_OFFSET) { *(.bss) *(COMMON) }
    ki_end = .;                   /* a symbol C can see */
}
```

- **`.` (the location counter)** is the virtual address being assigned.
  It becomes `p_vaddr` and the value of every symbol.
- **`AT(addr)`** gives the **load address**, which becomes `p_paddr`.
  A kernel runs at a high virtual address but must be placed in low
  physical memory by a loader that has no page tables; `AT()` records
  both facts in one file. The code that runs before paging is on must be
  position-independent or linked separately at physical addresses.
- **Symbols assigned in the script** (`ki_end = .;`) have an address and
  no storage. C sees them with `extern char ki_end[];` and uses the
  *address* (`ki_end`, never its contents).
- **`PHDRS { }`** names the segments explicitly and `:name` after an
  output section assigns it to one; without it the linker groups
  sections into segments by permissions.
- **`KEEP()`**, **`ALIGN()`**, **`NOLOAD`**, **`PROVIDE()`** (define a
  symbol only if the program does not) are the other things one meets.

Scripts are often run through the C preprocessor first so they can use
the build's `#define`s.

### Tools

| Command | Shows |
|---|---|
| `readelf -h f` | ELF header: class, machine, type, entry point |
| `readelf -lW f` | program headers: the load map (compare `VirtAddr` and `PhysAddr`), and which sections fall in which segment |
| `readelf -SW f` | section headers |
| `nm -n f` | symbols sorted by address; `nm -S --size-sort f` for the largest |
| `objdump -d f` | disassembly; `-S` interleaves source if built with `-g`; `--start-address=` to bound it |
| `addr2line -e f 0x...` | source line for an address, such as a faulting program counter |
| `objcopy -O binary f f.bin` | a flat image: the `PT_LOAD` contents laid out by load address, gaps filled, headers and `.bss` dropped |
| `objcopy -O elf32-i386 f g` | rewrite the container in another ELF format, contents unchanged |
| `size f` | text, data and bss totals |

Use the cross tools' names for foreign architectures
(`aarch64-linux-gnu-readelf`); `readelf` itself reads any ELF.

A flat binary has no entry-point field and no load address: both become
conventions between the image and whatever loads it (enter at the first
byte, load where the board's loader was told).

## In seL4

### The kernel image

The kernel is compiled as one translation unit (`kernel_all.c`) and
linked `-static -nostdlib` with a preprocessed script (`linker.lds_pp`,
passed with `-Wl,-T`); see [Build system](../sel4/build-system.md). The
scripts:

| Architecture | Script |
|---|---|
| x86 | [`src/plat/pc99/linker.lds`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/linker.lds) |
| Arm | [`src/arch/arm/common_arm.lds`](https://github.com/seL4/seL4/blob/master/src/arch/arm/common_arm.lds) |
| RISC-V | [`src/arch/riscv/common_riscv.lds`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/common_riscv.lds) |

All follow the pattern above: `KERNEL_OFFSET = KERNEL_ELF_BASE_RAW -
KERNEL_ELF_PADDR_BASE_RAW` (virtual base minus physical base, both
generated per platform), sections placed at virtual addresses with
`AT(ADDR(.x) - KERNEL_OFFSET)`, and symbols for C: `ki_boot_end`,
`ki_end` and others that the boot code uses to know what memory the
image occupies.

The section attributes are in
[`include/linker.h`](https://github.com/seL4/seL4/blob/master/include/linker.h):
`BOOT_CODE` puts a function in `.boot.text`, and `BOOT_DATA`,
`BOOT_RODATA` and `BOOT_BSS` do the same for data. The script gathers
them into a `.boot` output section ending at `ki_boot_end`, so that all
initialisation-only code is contiguous and can be given back after boot;
it is also the line the proofs draw. See [Boot code and the proof
boundary](../sel4/boot-code.md).

**x86 has a third region.** The pc99 script declares three segments
(`PHDRS { phys; boot; virt }`). `.phys` holds the Multiboot headers
(`.mbh`) and the 32-bit entry code marked `PHYS_CODE` (`.phys.text`),
linked *at physical addresses* starting at `KLOAD_PADDR` (1 MiB) because
it runs before paging is enabled; `.boot` and the rest are linked at
`KLOAD_VADDR` and loaded just above. See [x86 boot](x86-boot.md).

**The 32-bit wrapper.** A 64-bit x86 kernel is linked as
`elf64-x86-64`, but Multiboot loaders load 32-bit ELF files. So the
build runs `objcopy -O elf32-i386` on `kernel.elf`
([`rootserver.cmake`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/helpers/rootserver.cmake)
in `seL4_tools`): the same bytes with 32-bit headers, in which the high
virtual addresses are truncated but the load addresses, which are what
the loader uses, are intact (unchecked: the truncation is from memory,
not from inspecting a converted file today). Disassemble the 64-bit `kernel.elf`, boot
the converted one.

### Who loads what

| Image | Loaded by | Using |
|---|---|---|
| x86 kernel | GRUB, QEMU `-kernel`, any Multiboot loader | `PT_LOAD` physical addresses of the 32-bit ELF |
| x86 root task | **the kernel**: the loader only places the ELF file in memory as a Multiboot *module*; the kernel's boot code parses its headers and maps its segments into the initial thread's address space ([Kernel boot sequence](../sel4/kernel-boot.md)) | `p_vaddr`, since it runs under paging |
| Arm, RISC-V kernel and root task | the [elfloader](../sel4/elfloader.md): both ELF files sit in a CPIO archive linked into the elfloader; it copies the kernel's segments to their physical addresses and the root task after it, and tells the kernel where the root task landed and its virtual entry point | `p_paddr` for the kernel |
| Microkit system | the Microkit tool at build time | see below |

On Arm and RISC-V the kernel does not parse ELF at all: it is handed a
physical region, a virtual offset and an entry point.

The elfloader itself is an ELF that is usually converted to a flat
binary or a U-Boot/EFI image for the board's loader.

### Microkit

The [Microkit](../sel4/microkit.md) tool has its own ELF reader
([`tool/microkit/src/elf.rs`](https://github.com/seL4/microkit/blob/main/tool/microkit/src/elf.rs)).
It reads each protection domain's ELF, takes the `PT_LOAD` segments as
the memory to map, and **patches variables by symbol name**:
`find_symbol()` looks a name up in `.symtab` and `write_symbol()`
overwrites the bytes of that variable in the segment data. That is how
`setvar` values in a system description, such as the virtual address a
region was mapped at, reach a program that was compiled before the
system was laid out. Consequently Microkit programs **must not be
stripped** (unchecked: inferred from the symbol lookup). See [Microkit internals](../sel4/microkit-internals.md).

## Gotchas

- **`VirtAddr` and `PhysAddr` in `readelf -l` are both meaningful for a
  kernel.** A boot failure straight after the loader hands over is often
  a load address problem: check `PhysAddr` against where RAM actually is
  on the machine.
- **Symbols are virtual.** `nm kernel.elf` gives run-time addresses; to
  find where a symbol sits in physical memory before paging, subtract
  `KERNEL_OFFSET`. A debugger attached before the MMU is on needs the
  same adjustment.
- **`p_memsz` > `p_filesz` must be zeroed by the loader.** A loader that
  skips it leaves `.bss` holding stale memory, which shows up only on
  real hardware or after a warm reboot, since emulators start with
  zeroed RAM.
- **`objcopy -O binary` fills gaps.** Two segments with distant load
  addresses produce a huge file; and the output silently loses the entry
  point.
- **A linker-script symbol is an address, not a variable.** `extern
  word_t ki_end; x = ki_end;` reads memory at that address; the idiom is
  `extern char ki_end[];`.
- **Unreferenced sections vanish** under `--gc-sections` unless wrapped
  in `KEEP()`: headers found by a loader's scan (Multiboot) rather than
  by a symbol reference are the usual casualty.
- **The 32-bit x86 wrapper confuses tools**: `objdump -d` on the
  converted kernel decodes 64-bit code as 32-bit, and its symbol values
  are truncated to 32 bits.
- **Section order within an output section follows the script**, so a
  header that must be in the first few kilobytes of the file (Multiboot's
  must) depends on where the script puts its input section.

## See also

- [Virtual memory](virtual-memory.md): why link and load addresses differ
- [x86 boot](x86-boot.md): Multiboot, the `.phys` code and the 32-bit ELF
- [Arm boot](arm-boot.md): flat images and their headers
- [UEFI](uefi.md): PE/COFF, the format UEFI loads instead
- [Cloud boot images](cloud-boot-images.md): getting the ELF onto a disk a cloud will boot
- [Elfloader](../sel4/elfloader.md): the ELF loader for Arm and RISC-V
- [Kernel boot sequence](../sel4/kernel-boot.md): the x86 kernel loading the root task
- [Boot code and the proof boundary](../sel4/boot-code.md): what `.boot` means
- [Build system](../sel4/build-system.md): how `kernel.elf` is linked
- [Microkit internals](../sel4/microkit-internals.md): ELF patching in the tool
- [Debugging](../sel4/debugging.md): using symbols with GDB and fault addresses
- [Index](../INDEX.md): the reading order

## References

- glibc `/usr/include/elf.h` ([source](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/elf.h)):
  header structures, `PT_*`, `PF_*`, `ET_*`, `EM_*`, `SHT_NOBITS`.
  *Checked 2026-11-14 (the installed copy).*
- [System V Application Binary Interface, chapter 4 "Object Files" and chapter 5 "Program Loading"](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html):
  the specification of the format. *Unchecked (not opened today).*
- [GNU ld manual, "Linker Scripts"](https://sourceware.org/binutils/docs/ld/Scripts.html):
  `SECTIONS`, `AT`, `PHDRS`, `KEEP`, `PROVIDE`. *Unchecked (not opened
  today; the script semantics above are from memory).*
- [seL4 `src/plat/pc99/linker.lds`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/linker.lds)
  and [`src/arch/arm/common_arm.lds`](https://github.com/seL4/seL4/blob/master/src/arch/arm/common_arm.lds):
  the kernel's layout. *Checked 2026-11-14.*
- [seL4 `include/linker.h`](https://github.com/seL4/seL4/blob/master/include/linker.h):
  `BOOT_CODE` and friends. *Checked 2026-11-14.*
- [seL4 `CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt):
  link flags and `linker.lds_pp`. *Checked 2026-11-14.*
- [seL4_tools `cmake-tool/helpers/rootserver.cmake`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/helpers/rootserver.cmake):
  the `objcopy -O elf32-i386` step. *Checked 2026-11-14.*
- [Microkit `tool/microkit/src/elf.rs`](https://github.com/seL4/microkit/blob/main/tool/microkit/src/elf.rs):
  `find_symbol()`, `write_symbol()`. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
