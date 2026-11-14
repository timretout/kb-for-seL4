# Elfloader

> The small boot program from `seL4_tools` that Arm and RISC-V images start with: it carries the kernel and root task ELF files in a CPIO archive, loads them, builds first page tables, enables the MMU, starts the other cores and jumps to the kernel's `init_kernel` with the user image's location.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Inside the kernel](../INDEX.md#inside-the-kernel) · ← [Boot code and the proof boundary](boot-code.md) · [Platform ports](platform-port.md) →

Read first: [Arm boot](../concepts/arm-boot.md), [ELF](../concepts/elf.md), [Kernel boot](kernel-boot.md).

| At a glance | |
|---|---|
| Kind | Tool (boot program for Arm and RISC-V images) |
| Repository | [`seL4_tools`](https://github.com/seL4/seL4_tools), directory `elfloader-tool/` |
| Key source | `src/common.c`, `src/arch-arm/sys_boot.c`, `src/arch-riscv/boot.c` |
| Config options | `ElfloaderImage`, `ElfloaderIncludeDtb`, `ElfloaderRootserversLast`, `ElfloaderHashInstructions` |
| API | Calls the kernel's `init_kernel()` with six arguments |
| Built on | A boot loader (U-Boot, UEFI firmware, OpenSBI); a CPIO archive of `kernel.elf` and the root task |
| Used by | Project builds such as sel4test, on Arm and RISC-V; not x86, not [Microkit](microkit.md) |

## What it is

seL4 on Arm and RISC-V expects a lot of its caller. The kernel is linked
to run at a high virtual address and its entry point assumes the MMU is
already on with the kernel mapped there, the root task is already in
memory, and the CPU is at the right privilege level. No stock boot
loader (U-Boot, UEFI firmware, OpenSBI) leaves a machine like that, and
the kernel deliberately contains no code to get there from a cold start:
such code would be unverified and different on every board. The
**elfloader** fills the gap. It is what the boot loader actually loads
and runs; the kernel and the root task ride inside it.

x86 does not need it. A Multiboot boot loader already loads the kernel
ELF and the root task as a module, and the x86 kernel's own `head.S`
enables paging ([x86 boot](../concepts/x86-boot.md)).

### The image

A sel4test or similar project build produces one file for Arm or RISC-V,
named like `images/sel4test-driver-image-arm-qemu-arm-virt`. It is the
elfloader linked together with an archive:

```
┌──────────────────────────────┐ IMAGE_START_ADDR
│ elfloader code and data      │
├──────────────────────────────┤ _archive_start
│ CPIO archive:                │
│   kernel.elf                 │
│   kernel.dtb   (optional)    │
│   rootserver   (root task)   │
│   hashes       (optional)    │
└──────────────────────────────┘
```

CPIO is the simple Unix archive format also used for Linux initramfs; the
elfloader has a tiny reader for it (`cpio_get_file()`). `kernel.dtb` is
the kernel's build-time device tree, included when `ElfloaderIncludeDtb`
is on (the default).
The option's help text says it is there "in case bootloader doesn't
provide one", but when it is on the archive's copy is preferred.

`ElfloaderImage` picks the outer format, to suit the boot loader:

| `ElfloaderImage` | Result | Loaded by |
|---|---|---|
| `elf` | An ELF file | Loaders that understand ELF: QEMU `-kernel`, U-Boot `bootelf` |
| `binary` | A raw binary that must be placed at `IMAGE_START_ADDR` and entered at its first byte | U-Boot `go`, QEMU `-device loader`, vendor loaders |
| `uimage` | A raw binary wrapped in U-Boot's legacy header carrying load and entry address | U-Boot `bootm` |
| `efi` | A PE/COFF [UEFI](../concepts/uefi.md) application (Arm only); relocatable | UEFI firmware, GRUB chain-load |

The default per platform is set in
`cmake-tool/helpers/application_settings.cmake`.

`IMAGE_START_ADDR` is the physical address the elfloader is linked to
run at. A few platforms fix it (`0x10000000` on the Raspberry Pi 4,
`0x81000000` on `spike` and `qemu-riscv-virt`); otherwise the build's
`shoehorn.py` computes one from the platform's memory description
(`platform_gen.yaml`) and the image size, so that the elfloader does not
sit where it will unpack the kernel.

### What it does at run time (Arm)

1. **Entry** (`_start` in `src/arch-arm/64/crt0.S` or `32/crt0.S`): set
   up a stack, keep the boot loader's argument, call `main()`.
2. **Devices**: `initialise_devices()` starts the UART driver so the
   elfloader can print, then `platform_init()`.
3. **Find the boot loader's DTB**: for `uimage` the argument is checked
   for the device tree magic number; for `efi` the tree comes from the
   firmware's configuration table, and the elfloader calls
   `efi_exit_boot_services()`.
4. **Load** (`load_images()` in `src/common.c`): look up `kernel.elf` in
   the archive, check it, and copy its segments to the physical addresses
   in its program headers. Choose the DTB: the archive's `kernel.dtb` if
   present, else the boot loader's. Copy the DTB to the first page
   boundary after the kernel, then load the root task ELF after that,
   packed upwards (or, with `ElfloaderRootserversLast`, at the end of
   memory). The results are two `image_info` records: physical region,
   virtual region, virtual entry, and physical-minus-virtual offset.
5. **Relocate if in the way** (`relocate_below_kernel()`): if the
   elfloader's own image overlaps the kernel's target region, which can
   happen under UEFI since firmware chose the load address, it copies
   itself lower and restarts in `continue_boot()`.
6. **Exception level**: a kernel built without
   `KernelArmHypervisorSupport` runs at EL1 (supervisor); if the
   elfloader finds itself at EL2 (hypervisor) it calls `leave_hyp()` to
   drop down. A hypervisor-mode kernel needs to be entered at EL2, and
   the elfloader cannot climb: firmware must have started it there
   ([AArch64 basics](../concepts/aarch64-basics.md),
   [Arm virtualisation](../concepts/arm-virtualisation.md)).
7. **Boot page tables**: `init_boot_vspace()` (or
   `init_hyp_boot_vspace()`) builds a minimal set: an identity mapping so
   the elfloader keeps running when the MMU turns on, and the kernel
   image at its virtual address ([AArch64 paging](../concepts/aarch64-paging.md)).
8. **Other cores**: with `CONFIG_MAX_NUM_NODES > 1`, `smp_boot()` starts
   each secondary through `plat_cpu_on()`, normally
   [PSCI](../concepts/psci-smccc.md) `CPU_ON`, otherwise a platform
   driver. Each runs `non_boot_main()`, enables its MMU with the same
   tables and enters the kernel, where it waits for the boot core
   ([SMP bring-up](../concepts/smp-bringup.md)).
9. **MMU on**: `arm_enable_mmu()` or `arm_enable_hyp_mmu()`. The UART is
   unusable from here.
10. **Jump** to the kernel's ELF entry point as a C function:

```c
((init_arm_kernel_t)kernel_info.virt_entry)(user_info.phys_region_start,
                                            user_info.phys_region_end,
                                            user_info.phys_virt_offset,
                                            user_info.virt_entry,
                                            (word_t)dtb, dtb_size);
```

These are exactly `init_kernel()`'s parameters: `ui_p_reg_start`,
`ui_p_reg_end`, `pv_offset`, `v_entry`, `dtb_addr_p`, `dtb_size`
([kernel boot](kernel-boot.md)). The kernel replaces the boot page
tables with its own almost at once, so nothing of the elfloader survives
except the loaded images and the DTB copy, which the kernel passes on to
the root task in BootInfo.

![The boot loader runs the elfloader, which loads the kernel, DTB and root task, adjusts the exception level, builds boot page tables, starts the other cores, enables the MMU and calls init_kernel() with six arguments; the loaded images lie in memory as kernel, then DTB copy, then root task.](../images/elfloader-handoff.svg)

*The steps above in one picture, and where `load_images()` puts the three
things the kernel is told about.*

### RISC-V

The flow in `src/arch-riscv/boot.c` is the same with different
furniture:

- The firmware is normally **OpenSBI**, which runs in machine mode and
  starts its payload in supervisor mode with the hart (hardware thread)
  ID in `a0` and a DTB pointer in `a1`. The project build can wrap the
  elfloader image as OpenSBI's payload (`UseRiscVOpenSBI`), giving one
  file that firmware-less QEMU or a board can boot.
- Console output goes through SBI calls, so there is no UART driver
  matching step ([RISC-V basics](../concepts/riscv-basics.md)).
- `map_kernel_window()` builds the boot page table and
  `enable_virtual_memory()` writes `satp`
  ([RISC-V paging and traps](../concepts/riscv-paging-and-traps.md)).
- Secondary harts are started with the SBI **HSM** (hart state
  management) extension, `sbi_hart_start()`, when the firmware has it;
  each enters at `secondary_entry()`.
- The kernel is called with the same six arguments, plus `hart_id` and
  `core_id` on SMP.

There is no privilege-level decision: the kernel always runs in
supervisor mode.

## In seL4

The elfloader is not in the kernel repository. It lives in
[`seL4_tools`](https://github.com/seL4/seL4_tools), directory
`elfloader-tool/`, checked out at `tools/seL4/elfloader-tool` in a
project ([build system](build-system.md)):

| Path | Holds |
|---|---|
| `CMakeLists.txt` | Options (`ElfloaderImage`, `ElfloaderMode`, `ElfloaderIncludeDtb`, `ElfloaderRootserversLast`, `ElfloaderHashInstructions`, `ElfloaderArmV8LeaveAarch64`), the CPIO rule (`MakeCPIO(archive.o ...)`), `IMAGE_START_ADDR` and `shoehorn.py` |
| `src/common.c` | `load_images()`, `load_elf()`: shared by both architectures |
| `src/arch-arm/sys_boot.c` | `main()`, `relocate_below_kernel()`, `continue_boot()` |
| `src/arch-arm/64/`, `32/` | `crt0.S`, `mmu.c` (boot page tables), mode switching |
| `src/arch-arm/smp_boot.c`, `psci.c` | Secondary cores |
| `src/arch-riscv/` | `crt0.S`, `boot.c`, `console.c` |
| `src/drivers/` | `driver.c`, `uart/*.c`, `smp/`, `timer/` |
| `src/binaries/efi/`, `elf/` | Entry stubs and headers for those image types |
| `src/plat/` | The few platforms that need special code |

### The driver model

The elfloader needs a UART to print and sometimes a platform method to
start cores, and it finds them from the device tree at build time, in
the same way the kernel does ([generated code](generated-code.md)). The
kernel's platform overlay names the devices:

```
chosen {
    seL4,elfloader-devices = &{/pl011@9000000}, &{/psci}, &{/timer};
};
```

and the kernel's `hardware_gen.py` (its `elfloader` output) writes a
header with an `elfloader_devices[]` array (each entry a `compatible`
string and register addresses) and an `elfloader_cpus[]` array from the
`/cpus` node. Each driver declares the strings it handles:

```c
static const struct dtb_match_table pl011_uart_matches[] = {
    { .compatible = "arm,pl011" },
    { .compatible = NULL /* sentinel */ },
};
...
ELFLOADER_DRIVER(pl011_uart);
```

`ELFLOADER_DRIVER` puts a pointer in a linker section; at start-up
`initialise_devices()` walks `elfloader_devices[]`, and for each walks
the driver list (`__start__driver_list` to `__stop__driver_list`) calling
the `init` of any driver whose table has the device's `compatible`.
UART drivers exist for 8250/16550, PL011, i.MX, Meson, Exynos, BCM,
Xilinx and a few others. Porting to a board with an unlisted UART means
adding a driver here as well as in the kernel
([porting to a platform](platform-port.md), [UART](../concepts/uart.md)).

### Microkit does not use it

[Microkit](microkit.md) has its own, smaller loader. The `microkit` tool
does at build time most of what the elfloader does at run time: it
lays out the kernel, the monitor and every protection domain in physical
memory and emits a flat image with a table of regions; the loader only
copies regions, sets up page tables and the exception level, starts
secondary cores and jumps to the kernel with the same `init_kernel`
arguments ([Microkit internals](microkit-internals.md)). A fix to boot
behaviour may therefore be needed in two loaders.

## Gotchas

- The elfloader's UART output stops when the MMU is enabled (step 9). A
  boot log that ends at "Enabling MMU and jumping to entry point..."
  (or the hypervisor-mode equivalent) means the kernel was entered and then failed before its own
  console came up, not that the elfloader hung.
- The kernel is entered at the level the elfloader ends up at. Booting a
  hypervisor-mode kernel on a machine or cloud instance whose firmware
  hands over at EL1 cannot work; the elfloader prints the mismatch only
  in some paths (unchecked which).
- Two device trees are in play: the one compiled into the archive
  (matching the kernel's build-time memory map) and the one the boot
  loader passes. With `ElfloaderIncludeDtb` on, the archive's wins and
  the root task sees the build-time tree, not the real machine's; turn it
  off to pass the firmware's tree through.
- `IMAGE_START_ADDR` must match where the boot loader puts a `binary` or
  `uimage` image; the code is not position-independent except in the
  `efi` case. Loading at the wrong address fails before any output.
- The image must not overlap where the kernel and root task will be
  unpacked. `shoehorn.py` and `relocate_below_kernel()` handle the usual
  cases, but a very large root task on a small-memory board can still
  collide.
- The loaded root task must lie inside the kernel's build-time
  `avail_p_regs[]`; a machine with less memory than the kernel's device
  tree claims fails in the kernel's `init_freemem()`, not here.
- On SMP the elfloader starts only as many cores as
  `CONFIG_MAX_NUM_NODES`, in `elfloader_cpus[]` order, and the kernel
  waits for all of them. A core that fails to start hangs the boot.
- Hash checking of the unpacked images (`ElfloaderHashInstructions`) is
  an integrity check against corruption, not secure boot.

## See also

- [Kernel boot](kernel-boot.md): what happens after the jump
- [Arm boot](../concepts/arm-boot.md): what runs before the elfloader on Arm
- [ELF](../concepts/elf.md): the format it unpacks
- [Device tree](../concepts/device-tree.md): the blob it forwards and the source of its device list
- [SMP bring-up](../concepts/smp-bringup.md) and [PSCI and SMCCC](../concepts/psci-smccc.md): starting secondary cores
- [UEFI](../concepts/uefi.md): the `efi` image type's environment
- [Cloud boot images](../concepts/cloud-boot-images.md): wrapping the result for EC2 and Compute Engine
- [Microkit internals](microkit-internals.md): Microkit's own loader
- [Build system](build-system.md): where the elfloader's options are set
- [QEMU](../concepts/qemu.md): QEMU emulates whole machines
- [BootInfo and the root task](bootinfo-and-root-task.md): at the end of boot the kernel creates one user thread, the root task, hands it a capability to everything...
- [rust-sel4](rust-sel4.md): `seL4/rust-sel4` is the Rust support for seL4 user level

## References

- [seL4_tools `elfloader-tool/src/arch-arm/sys_boot.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/sys_boot.c):
  `main()`, `relocate_below_kernel()`, `continue_boot()`, the
  `leave_hyp()` condition, and the call into the kernel quoted above.
  *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/common.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/common.c):
  `load_images()`: `kernel.elf` and `kernel.dtb` lookup, DTB choice and
  placement after the kernel. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/CMakeLists.txt`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/CMakeLists.txt):
  `ElfloaderImage` choices, the CPIO file list, `IMAGE_START_ADDR` and
  `shoehorn`. *Checked 2026-11-14.*
- [seL4_tools `cmake-tool/helpers/application_settings.cmake`](https://github.com/seL4/seL4_tools/blob/master/cmake-tool/helpers/application_settings.cmake):
  per-platform image type and fixed `IMAGE_START_ADDR` values.
  *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/drivers/driver.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/drivers/driver.c)
  and [`drivers/uart/pl011-uart.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/drivers/uart/pl011-uart.c):
  the match loop and a driver's table. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/arch-arm/smp_boot.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/smp_boot.c):
  `smp_boot()`, `non_boot_main()`, `plat_cpu_on()`. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/arch-riscv/boot.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-riscv/boot.c):
  `main(hart_id, bootloader_dtb)`, `map_kernel_window()`,
  `enable_virtual_memory()`, `sbi_hart_start()`. *Checked 2026-11-14.*
- [seL4 `src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts`](https://github.com/seL4/seL4/blob/master/src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts):
  `seL4,elfloader-devices`. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/README.md`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/README.md)
  and [`src/arch-arm/README.md`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/README.md):
  the maintainers' own description, including the image types' boot
  protocols. *Unchecked: not opened today; the image-type table's
  "loaded by" column and the Microkit loader summary are from memory.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
