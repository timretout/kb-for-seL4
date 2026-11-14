# Source layout

> A tour of the `seL4/seL4` repository: generic code in `src/{api,kernel,object,model,machine}`, one directory per architecture and per platform beside it, a mirrored `include/` tree chosen by include paths, and `libsel4` for user level; with a table of where to look for what.

Read first: [seL4 overview](overview.md).

## What it is

The kernel repository, [`seL4/seL4`](https://github.com/seL4/seL4), holds
three things: the kernel's C and assembly (`src/`, `include/`), the
user-level interface library `libsel4`, and the build and code-generation
tools both need. The kernel proper is small, around ten thousand lines of
C for any one configuration (unchecked), but the tree holds the code for
three architecture families and about forty boards, so most of what you
see in a listing is not compiled into the kernel you are building.

### Top level

| Path | What it holds |
|---|---|
| `src/` | Kernel C and assembly sources |
| `include/` | Kernel-internal headers, mirroring `src/` |
| `libsel4/` | The user-level library: system call stubs, types and constants. It is also the kernel's definition of its own ABI: the kernel includes its headers |
| `tools/` | Python and CMake helpers: the bitfield generator, the device-tree hardware generator, `tools/dts/*.dts` (one device tree per Arm and RISC-V board), `helpers.cmake` |
| `configs/` | `*_verified.cmake` files, the configurations that have proofs, and `seL4Config.cmake` |
| `manual/` | LaTeX source of the reference manual |
| `CMakeLists.txt`, `config.cmake` | The build and the generic configuration options ([build system](build-system.md)) |
| `gcc.cmake`, `llvm.cmake` | CMake toolchain files for the two supported compiler families |
| `FindseL4.cmake` | Lets a larger project find and import the kernel |
| `CAVEATS.md`, `CHANGES.md`, `CONTRIBUTING.md` | Known limitations, the release notes, and how to contribute |

### Under `src/`

| Path | What it holds |
|---|---|
| `api/` | `syscall.c`: `handleSyscall()`, `handleInterruptEntry()` and friends, the architecture-independent top of every kernel entry. `faults.c`: building fault messages |
| `kernel/` | `boot.c` (generic boot helpers), `cspace.c` (capability lookup), `thread.c` (the scheduler, IPC transfer), `faulthandler.c`, `sporadic.c` (MCS budgets), `stack.c` |
| `object/` | One file per object type: `cnode.c`, `endpoint.c`, `notification.c`, `tcb.c`, `untyped.c`, `interrupt.c`, `reply.c`, `schedcontext.c`, `schedcontrol.c`, `domain.c`; and `objecttype.c`, the dispatcher over capability types |
| `model/` | The kernel's global state (`statedata.c`), `preemption.c`, `smp.c` |
| `machine/` | Machine-level helpers that are not architecture specific: `registerset.c`, `fpu.c`, `io.c` (the kernel's `printf`), `capdl.c` (debug dump) |
| `fastpath/` | `fastpath.c`: the hand-optimised IPC paths for `seL4_Call` and `seL4_ReplyRecv` |
| `smp/` | `ipi.c` (cross-core calls) and `lock.c`; the big kernel lock itself is mostly inline in `include/smp/lock.h` |
| `arch/<arch>/` | `arm`, `riscv`, `x86`: each repeats the generic layout (`api/`, `kernel/`, `object/`, `machine/`, `model/`, `smp/`), plus `c_traps.c`, and holds word-size-specific code in `32/` and `64/` (on Arm and x86; RISC-V keeps its `head.S` and `traps.S` at the top of `arch/riscv`) |
| `arch/arm/armv/` | Code per Arm architecture version: `armv7-a`, `armv8-a` |
| `plat/<plat>/` | One directory per platform. Always a `config.cmake`; for Arm and RISC-V usually just that and device-tree overlays; for `pc99` (the only x86 platform) real code under `machine/`: `acpi.c`, `ioapic.c`, `pic.c`, `pit.c`, `intel-vtd.c`, `hardware.c` |
| `drivers/` | Drivers shared between Arm platforms: `serial/` (`pl011.c`, `imx.c`, ...), `timer/` (`generic_timer.c`, ...), `smmu/` (`smmuv2.c`) |
| `string.c`, `util.c`, `assert.c`, `inlines.c` | `memcpy`/`memset`/`strncmp`, bit-counting helpers, the `assert` failure path |

Interrupt controller code does not have a `src/drivers/irq`: the
[GIC](../concepts/gicv2.md) drivers are `src/arch/arm/machine/gic_v2.c`
and `gic_v3.c`, and the other controllers (RISC-V's PLIC, a few old Arm
ones) are header-only in `include/drivers/irq/`.

### The generic/architecture split and its names

Generic code calls down into architecture code through functions with
fixed names; there are no function-pointer tables. The prefix tells you
the layer:

| Prefix or place | Meaning | Example |
|---|---|---|
| none, in `src/object` etc. | Generic | `decodeInvocation()`, `finaliseCap()` |
| `Arch_` | The architecture's hook for the generic function of the same name | `Arch_decodeInvocation()`, `Arch_finaliseCap()`, `Arch_createObject()`, `Arch_switchToThread()` |
| `Mode_` | The 32- or 64-bit variant under one architecture | `Mode_deriveCap()`, `Mode_initContext()` (x86) |
| `plat_` or plain snake case | Machine-level helpers | `plat_cleanL2Range()`, `init_kernel()` |

"Mode" throughout the tree means word size: `aarch32` against `aarch64`,
`ia32` against `x86_64`. So a generic operation such as "delete a
capability" can pass through `finaliseCap()` (`src/object/objecttype.c`),
`Arch_finaliseCap()` (`src/arch/x86/object/objecttype.c`) and
`Mode_finaliseCap()` (`src/arch/x86/64/object/objecttype.c`).

Three build variables pick the directories ([build system](build-system.md)):

| Variable | Values | Selects |
|---|---|---|
| `KernelArch` | `arm`, `riscv`, `x86` | `src/arch/<arch>`, `libsel4/arch_include/<arch>` |
| `KernelSel4Arch` | `aarch32`, `aarch64`, `arm_hyp`, `riscv32`, `riscv64`, `ia32`, `x86_64` | `libsel4/sel4_arch_include/<sel4arch>`, and (through `KernelWordSize`) the `32`/`64` directories |
| `KernelPlatform` | `pc99`, `qemu-arm-virt`, ... | `src/plat/<plat>`, `libsel4/sel4_plat_include/<plat>` |

### `include/`

`include/` mirrors `src/`: `src/object/tcb.c` has `include/object/tcb.h`.
The kernel never writes an architecture name in an `#include`; instead
the build adds these directories to the include path, in the kernel's
`CMakeLists.txt`:

```
include
include/<wordsize>
include/arch/<arch>
include/arch/<arch>/arch/<wordsize>
include/plat/<plat>
include/plat/<plat>/plat/<wordsize>
```

so the same line resolves differently per configuration:

| Written in the source | File found on x86_64 |
|---|---|
| `#include <object/tcb.h>` | `include/object/tcb.h` |
| `#include <arch/object/vcpu.h>` | `include/arch/x86/arch/object/vcpu.h` |
| `#include <mode/machine.h>` | `include/arch/x86/arch/64/mode/machine.h` |
| `#include <plat/machine.h>` | `include/plat/pc99/plat/machine.h` |

Only `pc99` and `tk1` have hand-written directories in `include/plat/`;
other platforms get their platform header generated from the device tree
([generated code](generated-code.md)). The object layouts themselves are
not C structures but bitfield specifications, `include/object/structures_64.bf`
and `include/arch/<arch>/arch/object/structures.bf`, also covered there.

### `libsel4/`

| Path | What it holds |
|---|---|
| `include/sel4/` | Generic API headers: `sel4.h`, `types.h`, `bootinfo_types.h`, `constants.h` |
| `include/api/syscall.xml` | The list of system calls |
| `include/interfaces/object-api.xml` | The generic object invocations, as an interface description |
| `arch_include/<arch>/` | Per architecture (`arm`, `riscv`, `x86`): `sel4/arch/*.h` and `interfaces/object-api-arch.xml` |
| `sel4_arch_include/<sel4arch>/` | Per word size and mode: `sel4/sel4_arch/*.h` (system call stubs in assembly-in-C, register lists, object sizes) and `interfaces/object-api-sel4-arch.xml` |
| `sel4_plat_include/<plat>/` | Per platform: `sel4/plat/api/constants.h` |
| `mode_include/<32,64>/` | Word-size-only definitions: `sel4/mode/types.h` |
| `tools/` | The stub and header generators (`syscall_stub_gen.py`, ...) |
| `src/sel4_bootinfo.c` | The library's only C file |

See [libsel4](libsel4.md) for the library as a user sees it.

## In seL4

### One translation unit

The kernel is not compiled file by file. `add_sources()` calls in
`src/config.cmake`, `src/arch/*/config.cmake`, `src/plat/*/config.cmake`
and `src/drivers/*/config.cmake` build a list of C files for the chosen
configuration; `tools/cpp_gen.sh` concatenates them, with `#line`
directives, into `kernel_all.c` in the build directory; and
`kernel.elf` is built from that one file plus the assembly sources. The
preprocessed form, `kernel_all_pp.c`, is what the C parser of the
[proofs](verification.md) reads. Consequences:

- a `static` function is visible to every later file, and order in the
  `add_sources()` list matters;
- a new source file is not built until it is listed in a `config.cmake`;
- the compiler can inline across files, which the kernel relies on for
  performance;
- compiler errors name the original file and line, thanks to the `#line`
  directives, but the `kernel_all.c` they came through is in the build
  directory if you need to see the surrounding text.

### Where to look

| Looking for | Look in |
|---|---|
| A system call's entry in assembly | `src/arch/<arch>/<wordsize>/traps.S` (Arm, x86), `src/arch/riscv/traps.S` ([x86](../concepts/x86-exceptions-syscalls.md), [AArch64](../concepts/aarch64-exceptions.md)) |
| Its first C code | `src/arch/<arch>/c_traps.c` (`c_handle_syscall()`), then `src/api/syscall.c` (`handleSyscall()`) |
| The IPC fast path | `src/fastpath/fastpath.c`, `include/arch/<arch>/arch/fastpath/`, `include/fastpath/` |
| A generic invocation's decode | `src/object/<object>.c`: `decodeTCBInvocation()`, `decodeUntypedInvocation()`, ...; dispatched from `decodeInvocation()` in `src/object/objecttype.c` ([system calls and invocations](syscalls-and-invocations.md)) |
| An architecture invocation's decode (pages, page tables, I/O ports, VCPUs) | `Arch_decodeInvocation()` in `src/arch/<arch>/object/objecttype.c`, then `src/arch/<arch>/kernel/vspace.c`, `src/arch/<arch>/object/*.c` |
| An invocation's label and user-level signature | `libsel4/include/interfaces/object-api.xml` and the `arch_include`/`sel4_arch_include` equivalents |
| The system call numbers | `libsel4/include/api/syscall.xml` |
| The layout of a capability or object | `include/object/structures_<32,64>.bf`, `include/arch/<arch>/arch/object/structures.bf`, `include/object/structures.h` |
| The scheduler | `src/kernel/thread.c` (`schedule()`, `chooseThread()`), `src/kernel/sporadic.c`, `src/object/schedcontext.c` ([scheduling](scheduling.md)) |
| Kernel globals | `src/model/statedata.c`, `include/model/statedata.h`, and `src/arch/<arch>/model/statedata.c` |
| Boot | `src/arch/<arch>/kernel/boot.c`, `src/kernel/boot.c`; on x86 also `boot_sys.c` ([kernel boot](kernel-boot.md)) |
| Page tables and address spaces | `src/arch/<arch>/kernel/vspace.c` or `src/arch/<arch>/<wordsize>/kernel/vspace.c` |
| A platform's devices (Arm, RISC-V) | `tools/dts/<plat>.dts`, `src/plat/<plat>/overlay-*.dts`, `tools/hardware.yml`, and the driver in `src/drivers/` |
| A platform's devices (x86) | `src/plat/pc99/machine/`, `src/arch/x86/kernel/apic.c` and neighbours |
| Interrupt controllers | `src/arch/arm/machine/gic_v2.c`, `gic_v3.c`; `include/drivers/irq/`; `src/plat/pc99/machine/ioapic.c`, `pic.c` |
| A configuration option's definition | `config.cmake` (generic), `src/arch/<arch>/config.cmake`, `src/plat/<plat>/config.cmake`, `src/drivers/*/config.cmake`: search for the `Kernel...` name or the `CONFIG_` name without its prefix |
| What the kernel prints | `src/machine/io.c`; `printf` exists only with `CONFIG_PRINTING` |

`git grep` is the practical tool: the names are unique enough
(`decodeTCBInvocation`, `Arch_switchToVSpace`) that a grep lands on one
definition per architecture.

## Gotchas

- Most files in the tree are not in your build. Before reading a function,
  check its directory matches your `KernelArch`, word size and platform;
  the build directory's `kernel_all.c` settles any doubt.
- `KernelSel4Arch` `arm_hyp` is AArch32 with the kernel in hypervisor
  mode. It has its own `libsel4/sel4_arch_include/arm_hyp`, but shares the
  kernel's `32/` directories with `aarch32`. AArch64 hypervisor mode has
  no separate name: it is `aarch64` with `KernelArmHypervisorSupport` on.
- A header under `include/arch/x86/arch/64/mode/` is included as
  `<mode/...>`, not `<arch/64/mode/...>`: the directory structure contains
  the include prefix itself (`arch/`, `mode/`, `plat/`) one level down.
- `libsel4/` is part of the kernel's own include path. A change to a
  libsel4 header can change the kernel, and the [proofs](proof-impact.md).
- File order in `kernel_all.c` hides missing `#include`s: a file can
  compile only because an earlier file pulled the header in.
- Names keep the Haskell prototype's camel case (`decodeInvocation`) in
  generic code and use snake case in machine-level code (`init_kernel`,
  `map_kernel_window`); both styles are deliberate, do not "fix" either
  ([kernel design](kernel-design.md)).

## See also

- [Build system](build-system.md): how the configuration picks directories
- [Generated code](generated-code.md): the `.bf` files, XML and device trees
- [Kernel design](kernel-design.md): the rules all of this code follows
- [Kernel boot](kernel-boot.md): a walk through the boot files
- [System calls and invocations](syscalls-and-invocations.md): the path from trap to decode
- [libsel4](libsel4.md): the user-level side of the same repository
- [Porting to a platform](platform-port.md): which of these files a new platform touches
- [Ecosystem and repositories](ecosystem.md): seL4 is some thirty repositories in two GitHub organisations
- [Kernel objects](kernel-objects.md): the fixed set of object types the seL4 kernel implements

## References

- [seL4 repository at `master`](https://github.com/seL4/seL4): the
  directory listings above. *Checked 2026-11-14.*
- [seL4 `CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt):
  the `include_directories()` calls, the `kernel_all.c` rule and
  `kernel.elf`. *Checked 2026-11-14.*
- [seL4 `src/config.cmake`](https://github.com/seL4/seL4/blob/master/src/config.cmake):
  the generic `add_sources()` list. *Checked 2026-11-14.*
- [seL4 `tools/cpp_gen.sh`](https://github.com/seL4/seL4/blob/master/tools/cpp_gen.sh):
  concatenation with `#line` directives. *Checked 2026-11-14.*
- [seL4 `include/arch/arm/arch/object/objecttype.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/arch/object/objecttype.h)
  and [`include/arch/x86/arch/object/objecttype.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/object/objecttype.h):
  the `Arch_` and `Mode_` hooks. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
