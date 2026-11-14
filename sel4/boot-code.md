# Boot code and the proof boundary

> Kernel code marked `BOOT_CODE` runs once before the first user thread and is then discarded; seL4's functional correctness proof does not cover it, which changes what a patch to it costs.

## What it is

seL4 splits the kernel image into code that runs only while the kernel
sets itself up (finding memory, starting cores, measuring timers,
building the root task) and code that runs for the life of the system.
Functions in the first group are marked `BOOT_CODE`, which places them in
a section that is reclaimed once boot finishes (unchecked: the exact
mechanism).

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

## References

- [seL4 `CAVEATS.md`](https://github.com/seL4/seL4/blob/master/CAVEATS.md),
  the section on proofs: what the proof does not cover.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
