# seL4_libs and util_libs

> The classic C libraries for building dynamic systems on seL4: seL4_libs (allocators, virtual memory, process creation, the BootInfo abstraction) and util_libs (platform drivers behind `ps_io_ops`, the `ltimer` timer interface, ELF, CPIO and FDT parsers); sel4test, sel4bench and CAmkES are built on them, Microkit and sDDF are not.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [libsel4 and the runtime](libsel4.md) · [sel4test and sel4bench](sel4test.md) →

Read first: [libsel4 and the runtime](libsel4.md), [Untyped memory and retyping](untyped-memory.md), [CSpaces](cspace.md).

| At a glance | |
|---|---|
| Kind | Libraries: two repositories of BSD-licensed C libraries |
| Repository | [`seL4/seL4_libs`](https://github.com/seL4/seL4_libs), `seL4/util_libs` |
| Key source | One directory per library; [`libplatsupport`](https://github.com/seL4/util_libs/tree/master/libplatsupport) for drivers |
| Config options | Prefixed `LibSel4...` or `LibPlatSupport...` |
| API | `simple_t`, `vka_t`, `vspace_t`, `ps_io_ops_t`, `ltimer_t` |
| Built on | [libsel4](libsel4.md), `sel4runtime`, musllibc |
| Used by | [sel4test](sel4test.md), sel4bench, the tutorials, [CAmkES](camkes-capdl.md); not Microkit, sDDF or LionsOS |
| Verified | No |

## What it is

[libsel4](libsel4.md) exposes the kernel's mechanisms and nothing
else. Creating one thread with it takes a dozen invocations and three
decisions the kernel leaves to user level: which
[untyped](untyped-memory.md) to retype, which CSpace slot receives
the capability, and which virtual address the stack goes at. Two
repositories of BSD-licensed C libraries, grown at NICTA and Data61
alongside the kernel, make those decisions:

- **seL4_libs** (`seL4/seL4_libs`): libraries that know about seL4.
- **util_libs** (`seL4/util_libs`): libraries meant to be
  OS-independent, reaching the OS only through tables of function
  pointers.

They are the foundation of [sel4test](sel4test.md), sel4bench, the
seL4 tutorials and [CAmkES](camkes-capdl.md). A kernel contributor
meets them mostly through sel4test: when it fails on a new machine,
the fault is often in one of these libraries' drivers, not in the
kernel.

### How they layer

```
 application: sel4test-driver, a tutorial, a CAmkES component
 ---------------------------------------------------------------
 sel4utils     processes, threads, ELF loading, a vspace
               implementation, an RPC and a serial server
 sel4platsupport   seL4 glue for platsupport: ps_io_ops built from
               vka/vspace/simple, IRQ and timer capabilities
 ---------------------------------------------------------------
 allocman      implements vka       |  sel4sync, sel4debug,
 vspace        VM interface         |  sel4test, sel4bench,
 vka           allocation interface |  sel4muslcsys
 simple        BootInfo abstraction |
 ---------------------------------------------------------------
 util_libs: platsupport (drivers, ps_io_ops, ltimer), utils,
            elf, cpio, fdt, pci, ethdrivers
 ---------------------------------------------------------------
 musllibc + sel4runtime + libsel4            (libsel4.md)
```

### seL4_libs

| Library | What it provides |
|---|---|
| `libsel4simple` | `simple_t`: a table of functions answering "what did I get at boot?" (the nth untyped, the nth initial capability, a frame capability for a physical address, the IRQ control capability, extended BootInfo). `libsel4simple-default` fills it from [BootInfo](bootinfo-and-root-task.md), so the same code runs as a root task or under another loader such as CAmkES. |
| `libsel4vka` | `vka_t`, the allocator *interface*: `cspace_alloc`/`cspace_free` (slots), `utspace_alloc`/`utspace_alloc_at`/`utspace_free` (objects from untypeds, optionally at a given physical address), `utspace_paddr`. Inline helpers on top: `vka_alloc_endpoint`, `vka_alloc_frame`, `vka_alloc_tcb`, each returning a `vka_object_t`. A `cspacepath_t` holds the root, index and depth triple of a slot. |
| `libsel4allocman` | The allocator behind `vka_t`: CSpace managers (one- and two-level CNode trees), untyped managers (`utspace/split.c` splits power-of-two blocks on demand), and its own memory pool. |
| `libsel4vspace` | `vspace_t`, the virtual memory *interface*: reserve a range, `vspace_new_pages`, `vspace_map_pages`, `vspace_new_stack`, `vspace_new_ipc_buffer`, share memory between two vspaces. |
| `libsel4utils` | The implementations: a `vspace_t` that keeps a shadow page table to remember which capability is mapped where (the kernel offers no way to ask; see [VSpace](vspace.md)), `sel4utils_configure_process` and `sel4utils_spawn_process` (new CSpace, VSpace, ELF loaded with `libelf`, initial thread), `sel4utils_configure_thread`, capability transfer into a child (`sel4utils_copy_cap_to_process`). |
| `libsel4platsupport` | Glue between util_libs' `libplatsupport` and seL4: `sel4platsupport_new_io_ops` builds a `ps_io_ops_t` from a vspace, vka and simple; serial set-up (`platsupport_serial_setup_simple`); IRQ capability helpers. Also where `printf` output goes: `seL4_DebugPutChar` when `LibSel4PlatSupportUseDebugPutChar` and a debug kernel, a user-level serial driver otherwise. |
| `libsel4sync` | Mutexes, semaphores and condition variables built on [notifications](notifications.md). |
| `libsel4debug` | Helpers for printing capabilities, faults and registers. |
| `libsel4test` | The test framework sel4test uses: `DEFINE_TEST`, `test_eq`, `test_assert`, result printing. |
| `libsel4bench` | Cycle counter and performance counter access for benchmarks. |
| `libsel4muslcsys` | The Linux system call shim under musl; see [libsel4](libsel4.md). |

**Bootstrapping** is the awkward part: the allocator needs memory for
its own bookkeeping before it can allocate memory. allocman starts
from a static array supplied by the caller:

```c
static char pool[ALLOCATOR_STATIC_POOL_SIZE];
simple_default_init_bootinfo(&simple, sel4runtime_bootinfo());
allocman = bootstrap_use_current_simple(&simple, sizeof(pool), pool);
/* (condensed from sel4test-driver's main.c) */
allocman_make_vka(&vka, allocman);
sel4utils_bootstrap_vspace_with_bootinfo_leaky(&vspace, &data,
        simple_get_pd(&simple), &vka, sel4runtime_bootinfo());
```

`bootstrap_use_current_simple` adopts the root task's existing CNode
and the untypeds `simple` lists; the vspace is then told which
addresses BootInfo says are already mapped. Later allocman is given a
virtual range (`bootstrap_configure_virtual_pool`) so its bookkeeping
can grow. This sequence opens sel4test-driver and every tutorial.

### util_libs

| Library | What it provides |
|---|---|
| `libplatsupport` | Device drivers per platform (`src/plat/<plat>/`, about 30 platforms), shared SoC families in `src/mach/`, architecture code in `src/arch/`: serial, timers, clocks, pin multiplexing, I2C, GPIO on some Arm boards. Two interfaces matter most, below. |
| `libutils` | Macros and small utilities used everywhere: `BIT`, `ROUND_UP`, `ZF_LOGE`/`ZF_LOGF` logging (zf_log), lists, compile-time asserts. |
| `libelf`, `libcpio`, `libfdt` | Parsers for [ELF](../concepts/elf.md) files, CPIO archives (how a root task carries its child programs) and flattened [device trees](../concepts/device-tree.md). The [elfloader](elfloader.md) uses the first two as well. |
| `libpci` | [PCI](../concepts/pci.md) configuration space scanning through I/O ports. |
| `libethdrivers` | Ethernet drivers (`src/plat/`: pc99 Intel cards, virtio over PCI, i.MX6, Zynq and other SoC MACs), with `liblwip` and `libpicotcp` wrappers for IP stacks. |
| `libvirtio`, `libsatadrivers` | Smaller driver collections. |

**`ps_io_ops_t`** (`platsupport/io.h`) is how a driver reaches the
machine without knowing the OS. It is a struct of sub-tables:
`io_mapper` (map a physical range, returning a pointer), `io_port_ops`
(x86 [port I/O](../concepts/io-ports.md)), `dma_manager`, `io_fdt`
(the device tree), `malloc_ops`, `irq_ops` (register a handler for an
interrupt), and on Arm `clock_sys` and `mux_sys`. On seL4,
`libsel4platsupport` fills it in: mapping means finding the device
untyped, retyping to frames and mapping them; a port read means
invoking an I/O port capability.

**`ltimer_t`** (`platsupport/ltimer.h`), the "logical timer", hides
whatever hardware a platform has behind one interface: `get_time`
(nanoseconds since start), `set_timeout(ns, type)` with
`TIMEOUT_ABSOLUTE`, `TIMEOUT_RELATIVE` or `TIMEOUT_PERIODIC`,
`get_resolution`, `reset`, `destroy`, and a callback on expiry. Each
platform implements it in `src/plat/<plat>/ltimer.c`, often from two
hardware timers (one free-running for time, one for timeouts).
`ltimer_default_init` picks the platform's default. This is a
*user-level* timer: the kernel has its own
([timer calibration](../concepts/timer-calibration.md)), and the two
must not share a device.

### The x86 (pc99) timer

On x86, `src/plat/pc99/ltimer.c` chooses at run time:

1. `ltimer_default_describe` parses the [ACPI](../concepts/acpi-tables.md)
   tables with libplatsupport's own parser (`src/plat/pc99/acpi/`)
   looking for an [HPET](../concepts/hpet.md) table.
2. If there is one and it can be mapped, the ltimer is the HPET: time
   is the main counter, timeouts are a comparator, the interrupt is an
   [MSI](../concepts/msi-msix.md) if the HPET supports FSB delivery,
   else an I/O APIC line.
3. Otherwise ("HPET failed - use the pit") timeouts come from the
   [PIT](../concepts/pit.md) (`pit.c`) and time from the
   [TSC](../concepts/tsc.md): `tsc_get_time(freq)`, with `freq`
   measured once at start by `tsc_calculate_frequency_pit` in
   `src/arch/x86/tsc.c`, which counts TSC ticks across PIT periods.

So on a machine with no HPET, which includes Compute Engine's and
EC2's x86 instance types, every user-level time in sel4test rests on
the PIT's emulation quality and on that one calibration loop. The
serial port is the 16550 at COM1, port `0x3f8`
(`plat_include/pc99/platsupport/plat/serial.h`; see
[UART](../concepts/uart.md)).

### Who uses them, and status

sel4test, sel4bench, the tutorials, CAmkES (its templates and
runtime call `vka`, `vspace`, `sel4utils`, `sel4sync` and
`platsupport`) and the CAmkES VMM all depend on these libraries.
[Microkit](microkit.md), [sDDF](sddf.md) and [LionsOS](lionsos.md) use
none of them: a Microkit system is laid out at build time, so there
is nothing to allocate at run time, and sDDF has its own, much
smaller, drivers.

Both repositories are maintained under the seL4 Foundation's GitHub
organisation and still receive commits (new platforms, fixes; both had
changes in September and October 2026), but they are in maintenance:
new driver and framework work happens in sDDF and Microkit. seL4_libs'
own README calls libsel4debug "potentially hacky", and none of these
libraries is verified.

## In seL4

Where a fix lands when sel4test misbehaves on a new x86 machine:

| Symptom | Look in |
|---|---|
| No output from the test driver after the kernel's boot messages | `seL4_libs/libsel4platsupport/src/` (`serial.c`, `common.c`) and `util_libs/libplatsupport/src/plat/pc99/serial.c`, `chardev.c` |
| Hang or assertion in `init_timer`, or "Failed to setup the timers" | `util_libs/libplatsupport/src/plat/pc99/ltimer.c`, `hpet.c`, `pit.c`, `acpi/` |
| Timed tests fail, sleep too long or too short | `util_libs/libplatsupport/src/arch/x86/tsc.c` (calibration) and `pit.c` |
| IRQ for the timer never arrives | `seL4_libs/libsel4platsupport/src/irq.c`, `arch/x86/`; the kernel's [IRQ handling](irq-handling.md) |
| Allocation failures early in the driver on a machine with a lot of RAM or a fragmented memory map | `seL4_libs/libsel4allocman/src/bootstrap.c`, `utspace/` |

Source, with the paths as they appear in a sel4test checkout
(`projects/seL4_libs`, `projects/util_libs`):

- [`seL4_libs`](https://github.com/seL4/seL4_libs): one directory per
  library, each with `include/<name>/` and `src/`.
- [`util_libs/libplatsupport`](https://github.com/seL4/util_libs/tree/master/libplatsupport):
  `include/platsupport/` (generic interfaces),
  `plat_include/<plat>/platsupport/plat/`, `src/plat/<plat>/`,
  `src/mach/<family>/`, `src/arch/{arm,riscv,x86}/`.
- [`libplatsupport/src/plat/pc99/ltimer.c`](https://github.com/seL4/util_libs/blob/master/libplatsupport/src/plat/pc99/ltimer.c):
  `ltimer_default_init`, `_ltimer_default_describe`,
  `ltimer_pit_init_freq` (lets a caller supply the TSC frequency
  instead of calibrating).

Both build with the kernel's [CMake system](build-system.md): each
library is a CMake target (`sel4vka`, `platsupport`, ...) with
`config_option` settings prefixed `LibSel4...` or `LibPlatSupport...`.

## Gotchas

- **A change here is a different repository and a different review.**
  A sel4test failure fixed in util_libs needs its own pull request
  there; the kernel pull request's CI uses util_libs' `master`
  ([Upstream CI](ci.md)).
- **The kernel and user level can fight over a timer.** On x86 the
  kernel uses the [local APIC timer](../concepts/lapic-timer.md) and
  calibrates it with the PIT at boot; user level then takes the PIT
  or HPET. On Arm and RISC-V boards the ltimer must be a device the
  kernel does not use.
- **`pit_init` may be called once.** The pc99 ltimer comments on it;
  a second ltimer in the same system needs
  `ltimer_pit_init_freq` with a known frequency or the HPET.
- **The ACPI parser is separate from the kernel's.** It scans for the
  RSDP itself unless given one (`ltimer_default_describe_with_rsdp`);
  on a UEFI machine with no legacy BIOS area the RSDP must come from
  BootInfo's extended region ([UEFI](../concepts/uefi.md)).
- **"Leaky" means it.** `sel4utils_bootstrap_vspace_with_bootinfo_leaky`
  and static-pool allocation never give memory back; fine for a test
  driver, wrong for a long-running system.
- **vka frees are not kernel frees.** `vka_free_object` returns
  bookkeeping to allocman; the memory is reusable only when allocman
  can revoke the untyped it came from
  ([untyped memory](untyped-memory.md)).
- **MCS changes many signatures** here too (scheduling contexts and
  reply objects are extra parameters), under `#ifdef CONFIG_KERNEL_MCS`
  ([MCS](mcs.md)).

## See also

- [libsel4 and the runtime](libsel4.md): the layer below, and libsel4muslcsys
- [sel4test and sel4bench](sel4test.md): the main users
- [CAmkES and capDL](camkes-capdl.md): the component framework built on these libraries
- [sDDF](sddf.md): the driver framework that replaces platsupport in Microkit systems
- [BootInfo and the root task](bootinfo-and-root-task.md): what `simple` abstracts
- [PIT](../concepts/pit.md), [HPET](../concepts/hpet.md), [TSC](../concepts/tsc.md), [timer calibration](../concepts/timer-calibration.md): the hardware behind the pc99 ltimer
- [UART](../concepts/uart.md): the serial device the pc99 driver expects
- [Ecosystem and repositories](ecosystem.md): how the repositories fit together

## References

- [seL4_libs `README.md`](https://github.com/seL4/seL4_libs/blob/master/README.md):
  the list of libraries and one line on each. *Checked 2026-11-14.*
- [seL4_libs headers](https://github.com/seL4/seL4_libs):
  `libsel4vka/include/vka/vka.h`, `libsel4simple/include/simple/simple.h`,
  `libsel4allocman/include/allocman/bootstrap.h`,
  `libsel4utils/include/sel4utils/process.h` and `vspace.h`,
  `libsel4platsupport/include/sel4platsupport/io.h`: the function
  names above. *Checked 2026-11-14.*
- [util_libs `README.md`](https://github.com/seL4/util_libs/blob/master/README.md):
  the list of libraries. *Checked 2026-11-14.*
- [`platsupport/io.h`](https://github.com/seL4/util_libs/blob/master/libplatsupport/include/platsupport/io.h)
  and [`platsupport/ltimer.h`](https://github.com/seL4/util_libs/blob/master/libplatsupport/include/platsupport/ltimer.h):
  `struct ps_io_ops`, the `ltimer_t` operations. *Checked 2026-11-14.*
- [`libplatsupport/src/plat/pc99/ltimer.c`](https://github.com/seL4/util_libs/blob/master/libplatsupport/src/plat/pc99/ltimer.c)
  and [`src/arch/x86/tsc.c`](https://github.com/seL4/util_libs/blob/master/libplatsupport/src/arch/x86/tsc.c):
  the HPET-then-PIT choice, TSC calibration. *Checked 2026-11-14.*
- [sel4test `apps/sel4test-driver/src/main.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/main.c):
  the bootstrap sequence and `init_timer` in use.
  *Checked 2026-11-14.*
- [seL4 tutorials, "Dynamic libraries"](https://docs.sel4.systems/Tutorials/libraries-1.html):
  a walk through simple, vka, allocman and vspace.
  *Unchecked: not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
