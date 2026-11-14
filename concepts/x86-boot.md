# x86 boot: BIOS, UEFI, GRUB and Multiboot

> How a PC gets from reset to a kernel: BIOS or UEFI firmware, a boot loader (usually GRUB), and the Multiboot 1 and 2 protocols that hand seL4 its memory map, root task image and ACPI pointer in 32-bit protected mode.

Read first: [x86-64 basics](x86-64-basics.md), [x86 paging](x86-paging.md).

## What it is

### From reset to firmware

An x86 core leaves reset in **real mode**: 16-bit code, segment:offset
addressing that reaches 1 MiB, no paging and no protection. It starts
executing at the **reset vector**, physical address `0xfffffff0`, 16 bytes
below 4 GiB, where the firmware ROM is mapped (unchecked: Intel SDM
volume 3, section 10.1.4). Firmware initialises memory and devices, then
finds something to boot. There are two kinds of firmware.

| | BIOS (legacy) | [UEFI](uefi.md) |
|---|---|---|
| Finds the loader in | the first 512-byte sector of the disk (the MBR, master boot record), ending `0x55 0xaa` | a file on the FAT-formatted EFI system partition, such as `\EFI\BOOT\BOOTX64.EFI` |
| Loader format | raw 16-bit code loaded at `0x7c00` | a PE/COFF executable |
| CPU mode at hand-over | real mode | 64-bit long mode, identity-mapped paging |
| Services | software interrupts (`int 0x10` video, `int 0x13` disk, `int 0x15` memory map "E820") | function tables: boot services and runtime services |
| ACPI root pointer | found by scanning low memory | given in a configuration table |

(The BIOS column is from memory, unchecked.) A BIOS loader cannot fit in
446 bytes of MBR code, so it comes in stages: the MBR code loads a larger
image from fixed sectors, which understands file systems and loads the
rest. A UEFI loader is one ordinary file and can call firmware to read
others.

### GRUB

GRUB 2 is the usual loader for seL4 on PCs and builds for both firmware
kinds (`i386-pc` for BIOS, `x86_64-efi` for UEFI). Either way it reads a
kernel and **modules** (other files to place in memory) from disk, gets
the memory map from firmware, leaves firmware behind, and jumps to the
kernel in the state a boot protocol defines. Its `multiboot` and `module`
commands speak Multiboot 1; `multiboot2` and `module2` speak Multiboot 2.

### Multiboot 1

A kernel announces itself with a **header** in the first 8192 bytes of
its file, 4-byte aligned:

| Field | Value |
|---|---|
| `magic` | `0x1BADB002` |
| `flags` | bit 0: align modules to 4 KiB; bit 1: must provide memory information; bit 2: must provide video mode information (and the header carries a preferred mode); bit 16: use the header's load addresses instead of the [ELF](elf.md) headers |
| `checksum` | makes the three fields sum to zero |

The loader enters the kernel with `EAX` = `0x2BADB002` and `EBX` = the
physical address of the **Multiboot information structure**. That
structure starts with its own `flags` word saying which fields are valid:

| Bit | Fields | Meaning |
|---|---|---|
| 0 | `mem_lower`, `mem_upper` | KiB of memory below 1 MiB and above it |
| 2 | `cmdline` | address of the NUL-terminated command line |
| 3 | `mods_count`, `mods_addr` | array of modules, each `mod_start`, `mod_end`, `string` |
| 6 | `mmap_length`, `mmap_addr` | the memory map: entries of `size`, 64-bit `base_addr`, 64-bit `length`, `type` (1 = usable RAM, 3 = ACPI reclaimable, 4 = ACPI NVS, 5 = bad) |
| 11 | `vbe_*` | VESA BIOS Extensions video mode information |

Multiboot 1 has no field for the ACPI root pointer (RSDP, see
[ACPI tables](acpi-tables.md)); a kernel must find it itself.

### Multiboot 2

Multiboot 2 replaces both fixed structures with lists of **tags**. The
header (magic `0xE85250D6`, architecture, length, checksum, within the
first 32768 bytes, 8-byte aligned) is followed by tags of
`u16 type, u16 flags, u32 size` that request things (an information
request, a framebuffer mode, an EFI entry point, "I am relocatable"),
ending with a tag of type 0 and size 8.

The loader enters with `EAX` = `0x36d76289` and `EBX` pointing at
`u32 total_size, u32 reserved` followed by information tags of
`u32 type, u32 size`, each padded to 8 bytes:

| Type | Tag |
|---|---|
| 0 | end |
| 1 | command line |
| 3 | module (`mod_start`, `mod_end`, string); one tag per module |
| 4 | basic memory information |
| 6 | memory map |
| 8 | framebuffer (address, pitch, width, height, bits per pixel) |
| 11, 12 | EFI 32-bit and 64-bit system table pointer |
| 14, 15 | copy of the ACPI 1.0 RSDP, of the ACPI 2.0+ RSDP |
| 17 | EFI memory map |

The RSDP tags matter on UEFI machines, which have no legacy BIOS area to
scan.

### Machine state at kernel entry

Both protocols (Multiboot 1 section 3.2, Multiboot 2 section 3.3) enter
the kernel in **32-bit protected mode**: `CR0.PE` set and `CR0.PG` clear
(paging off), flat 4 GiB code and data segments, interrupts disabled
(`EFLAGS.IF` clear), the A20 gate enabled. `ESP`, the GDT register and
the IDT register are undefined: the kernel must load its own stack and
tables before using them. A 64-bit kernel therefore has to climb to long
mode itself, even when UEFI firmware had been in long mode a moment
earlier.

## In seL4

seL4 on x86 is a Multiboot kernel and nothing else: it has no UEFI entry
point, no Linux boot protocol, and no [elfloader](../sel4/elfloader.md)
(that is for Arm and RISC-V). The loader's module takes the elfloader's
place as the carrier of the root task.

- **Headers.**
  [`src/arch/x86/multiboot.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/multiboot.S)
  emits section `.mbh`, which the linker script
  [`src/plat/pc99/linker.lds`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/linker.lds)
  places first in the image. `KernelMultiboot1Header` emits the Multiboot 1
  header with flags 3 (or 7 with a `KernelMultibootGFXMode`);
  `KernelMultiboot2Header` emits a Multiboot 2 header with no request
  tags, only the end tag. Both can be present and the loader picks.
- **The ELF.** The kernel is linked at physical 1 MiB (`KLOAD_PADDR`)
  with a `.phys` segment of 32-bit entry code and the rest at high
  virtual addresses. The x86-64 kernel links as `elf64-x86-64`; the build
  system's
  [`rootserver.cmake`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/helpers/rootserver.cmake)
  then runs `objcopy -O elf32-i386` over it to make the image that is
  booted, because Multiboot loaders expect a 32-bit ELF.
- **Entry.** `_start` in
  [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S)
  is `.code32`. It saves `EAX` and `EBX`, loads `boot_stack_top`, clears
  `EFLAGS`, and calls `common_init`: clear `CR0.PG`, `setup_pml4` (boot
  page tables, after `huge_page_check` insists on 1 GiB pages by
  [CPUID](cpuid-and-msrs.md)), `enable_x64_mode` (load `CR3`, set
  `CR4.PAE`, set `EFER.LME` by `wrmsr`, set `CR0.PG`), `lgdt`. A far jump
  `ljmp $8, $_start64` reloads `CS` with a 64-bit segment, and `_start64`
  jumps to the high-address `_entry_64`, which calls `boot_sys` with the
  magic and the pointer. Failures here print through `print_string` and
  `hang`.
- **Parsing.** `boot_sys` in
  [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c)
  switches on the magic. `try_boot_sys_mbi1` requires info flags 0 and 3,
  records the first module as the root task and the end of the last
  module, feeds usable memory-map entries at or above `HIGHMEM_PADDR` to
  `add_mem_p_regs` (via `parse_mem_map`), copies the raw map (up to
  `SEL4_MULTIBOOT_MAX_MMAP_ENTRIES`) and VBE information for the root
  task's [bootinfo](../sel4/bootinfo-and-root-task.md), and calls
  `acpi_init` to scan the BIOS area for the RSDP. `try_boot_sys_mbi2`
  walks the tags: 1 command line, 3 module, 6 memory map, 8 framebuffer,
  14 and 15 RSDP (copied into `boot_state.acpi_rsdp`). Both end in
  `try_boot_sys`, described in [kernel boot](../sel4/kernel-boot.md).
- **Root task.** At least one module is required. `load_boot_module`
  checks that the first is an ELF, loads it after the last module, and
  the kernel then moves it to follow the kernel image.
- **Command line.**
  [`src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c)
  parses `name=value` options:

  | Option | Effect | Default |
  |---|---|---|
  | `console_port=0x…` | [I/O port](io-ports.md) of the kernel's serial console (`KernelPrinting` builds) | first COM port in the BIOS data area at `0x400`, else `0x3f8` |
  | `debug_port=0x…` | port for the kernel debugger (`KernelDebugBuild`) | same |
  | `disable_iommu` | ignore the ACPI DMAR table; do not use the [IOMMU](iommu.md) | false |

- **QEMU.** `./simulate` (from
  [`simulate.py`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/simulate_scripts/simulate.py))
  runs `qemu-system-x86_64 -kernel <kernel> -initrd <root task>`. QEMU's
  `-kernel` contains a Multiboot 1 loader, and `-initrd` becomes the
  module. No firmware boot loader runs at all.

For images that boot on cloud machines, see
[cloud boot images](cloud-boot-images.md).

## Gotchas

- QEMU `-kernel` speaks only Multiboot 1 (unchecked beyond seL4's own use
  of it), so a kernel built with only `KernelMultiboot2Header` will not
  start there. Test Multiboot 2 paths with GRUB in a disk image.
- Under Multiboot 1 on UEFI firmware the RSDP scan of the BIOS area finds
  nothing and boot stops in `acpi_init`. Use `multiboot2` in `grub.cfg`
  on any UEFI machine, which includes most cloud instance types.
- seL4's Multiboot 2 header requests nothing, so GRUB decides what tags
  to send; the kernel ignores the EFI tags (11, 12, 17) entirely.
- The serial default reads the BIOS data area at physical `0x400`. UEFI
  firmware need not fill it in; if console output is missing, pass
  `console_port=0x3f8` explicitly.
- Only memory at or above `HIGHMEM_PADDR` (1 MiB) is used; the legacy
  first megabyte is left alone apart from the
  [SMP](smp-bringup.md) trampoline.
- `boot_sys` checks the module count but the kernel only ever loads the
  first module as the root task; extra modules are just memory the root
  task can find from bootinfo.
- An early failure before `cmdline_parse` has set up the serial port is
  silent.

## See also

- [UEFI](uefi.md): the firmware interface GRUB hides from seL4
- [Kernel boot](../sel4/kernel-boot.md): what `try_boot_sys` does next
- [ELF](elf.md): the image format the loader reads
- [ACPI tables](acpi-tables.md): what the RSDP leads to
- [Cloud boot images](cloud-boot-images.md): packaging GRUB, kernel and root task for EC2 and Compute Engine
- [SMP bring-up](smp-bringup.md): how the other cores start after this one
- [QEMU](qemu.md): the usual first test target
- [Arm boot flow](arm-boot.md): the chain from reset to a kernel on a 64-bit Arm machine

## References

- [Multiboot Specification version 0.6.96](https://www.gnu.org/software/grub/manual/multiboot/multiboot.html),
  sections 3.1 "OS image format", 3.2 "Machine state", 3.3 "Boot
  information format". *Checked 2026-11-14.*
- [Multiboot2 Specification version 2.0](https://www.gnu.org/software/grub/manual/multiboot2/multiboot.html),
  sections 3.1 (header and its tags), 3.3 "I386 machine state", 3.6 "Boot
  information" (tag types). *Checked 2026-11-14.*
- seL4 [`src/arch/x86/multiboot.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/multiboot.S),
  [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S),
  [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c),
  [`src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c),
  [`include/arch/x86/arch/kernel/multiboot2.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/kernel/multiboot2.h).
  *Checked 2026-11-14.*
- seL4_tools [`cmake-tool/helpers/rootserver.cmake`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/helpers/rootserver.cmake)
  (the `elf32-i386` conversion) and
  [`simulate.py`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/simulate_scripts/simulate.py).
  *Checked 2026-11-14.*
- Intel SDM volume 3, chapter 10 "Processor Management and
  Initialization": reset state and mode switching. *Unchecked: intel.com
  refuses scripted fetches.*
- [GRUB manual](https://www.gnu.org/software/grub/manual/grub/grub.html):
  `multiboot2`, `module2` commands. *Unchecked: not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
