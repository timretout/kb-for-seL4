# Boot code and the proof boundary

> Kernel code marked `BOOT_CODE` runs once before the first user thread and is then discarded; seL4's functional correctness proof does not cover it, which changes what a patch to it costs.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Inside the kernel](../INDEX.md#inside-the-kernel) · ← [Kernel boot sequence](kernel-boot.md) · [Elfloader](elfloader.md) →

| At a glance | |
|---|---|
| Kind | Kernel mechanism (the `BOOT_CODE` mark and the proof boundary) |
| Key source | On x86: `boot_sys.c`, `boot.c`, `pit.c`, `hardware.c`, `apic.c` |
| Used by | [Kernel boot](kernel-boot.md); [timer calibration](../concepts/timer-calibration.md) |
| Verified | No: covered by assumptions about the state it leaves, not by proof |

## What it is

seL4 splits the kernel image into code that runs only while the kernel
sets itself up (finding memory, starting cores, measuring timers,
building the root task) and code that runs for the life of the system.
Functions in the first group are marked `BOOT_CODE`, which places them in
a section that is reclaimed once boot finishes: the macro puts the
function in `.boot.text`, the linker script collects the boot sections
at the start of the image, up to the symbol `ki_boot_end`, and
`create_untypeds()` hands that region to the root task as untyped
memory ([BootInfo and the root task](bootinfo-and-root-task.md)).

seL4's proof of functional correctness covers the C code of the kernel,
but in the words of the kernel's `CAVEATS.md`, "not machine code,
compiler, linker, boot code, cache or TLB management". The boot process is
covered by assumptions about the state it leaves, not by proof.

## In seL4

- Boot code is everywhere the hardware is first met: `boot_sys.c` and
  `boot.c` on x86, the [timer calibration](../concepts/timer-calibration.md)
  in `pit.c`, `hardware.c` and `apic.c`.
- A change to boot code in a file compiled into a verified configuration
  (pc99 for x64, for example) still changes the text the proof tools see.
  It needs no proof update, but it must still pass upstream CI's C parser
  check, and maintainers will want the "boot code only" claim confirmed.

## Gotchas

- "Outside the proof" is not "untested": a boot code bug can still hang
  every boot on some machine.
- A function that runs at boot but is not marked `BOOT_CODE` is not in
  this category. Check the mark, not the name.

## See also

- [Timer calibration](../concepts/timer-calibration.md): an example of boot code
- [PIT](../concepts/pit.md): its kernel driver is entirely boot code
- [ELF and linking](../concepts/elf.md): ELF is the file format of every kernel, loader and user program in an seL4 system
- [BootInfo and the root task](bootinfo-and-root-task.md): at the end of boot the kernel creates one user thread, the root task, hands it a capability to everything...
- [Contributing a patch](contributing.md): the path of a change into upstream seL4
- [Kernel boot sequence](kernel-boot.md): the path from the kernel's entry point to the first user thread
- [Proof impact of a change](proof-impact.md): A procedure for deciding, before sending a kernel patch, whether it changes code the proofs cover
- [The seL4 proofs](verification.md): seL4's proofs show, for a few exact kernel configurations, that the C code behaves as an abstract...
- [The verified C subset](verified-c-subset.md): verified seL4 code must be written in the subset of C99 that the Isabelle C parser accepts

## References

- [seL4 `CAVEATS.md`](https://github.com/seL4/seL4/blob/master/CAVEATS.md),
  the section on proofs: what the proof does not cover.
  *Checked 2026-11-14.*
- [seL4 `include/linker.h`](https://github.com/seL4/seL4/blob/master/include/linker.h):
  `BOOT_CODE` as `SECTION(".boot.text")`;
  [`src/arch/arm/common_arm.lds`](https://github.com/seL4/seL4/blob/master/src/arch/arm/common_arm.lds)
  (and the RISC-V and pc99 scripts): the boot sections and
  `ki_boot_end`;
  [`src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c),
  `get_p_reg_kernel_img_boot` and `create_untypeds`: the recycled boot
  memory. *Checked 2026-11-14.*
