# Generated code

> Much of what the kernel compiles is not in the repository: capability and object accessors come from bitfield specifications (`.bf`), system call numbers, invocation labels and libsel4 stubs from XML, device addresses and memory regions from device trees, and `CONFIG_*` macros from CMake, all written into the build directory.

Read first: [Source layout](source-layout.md), [Build system](build-system.md).

## What it is

Grep the kernel for the definition of `cap_endpoint_cap_get_capEPPtr()`,
`SysCall`, `TCBConfigure` or `avail_p_regs` and you find uses but no
definition. Four generators run before the compiler and write headers
into the build directory:

| Generator | Input | Output (kernel build directory) |
|---|---|---|
| `tools/bitfield_gen.py` | `*.bf` bitfield specifications | `generated/**/*_gen.h`: structure types and accessors; optionally Isabelle theories |
| `tools/syscall_header_gen.py`, `tools/invocation_header_gen.py` | `libsel4/include/api/syscall.xml`, `libsel4/**/interfaces/*.xml` | `gen_headers/arch/api/syscall.h`, `gen_headers/api/invocation.h`, `gen_headers/arch/api/invocation.h`, `gen_headers/arch/api/sel4_invocation.h`, `generated/invocations_all.json` |
| `tools/hardware_gen.py` | Device tree (`tools/dts/<plat>.dts` + overlays), `tools/hardware.yml` | `gen_headers/plat/machine/devices_gen.h`, `platform_gen.yaml`, `platform_gen.json`; `kernel.dts`, `kernel.dtb` |
| CMake `config_*` helpers | `config.cmake` files | `gen_config/kernel/gen_config.h` (and `.json`, `.yaml`), `autoconf/autoconf.h` |

libsel4 runs the same tools for user level and adds
`libsel4/tools/syscall_stub_gen.py`, which writes the C stubs for every
invocation.

### The bitfield generator

Kernel data structures are bit-packed: a capability is two machine words
holding a type tag, rights bits and a pointer squeezed together. C's own
bitfields leave layout to the compiler, which is no basis for a proof
about memory. seL4 instead describes each layout in a small language and
generates plain C that shifts and masks, **together with Isabelle/HOL
definitions and proofs that the C does what the specification says**.
The proofs therefore never reason about shifts and masks in kernel code,
and nor does the reader.

A real example, from `include/object/structures_64.bf`:

```
block endpoint_cap(capEPBadge, capCanGrantReply, capCanGrant, capCanSend,
                   capCanReceive, capEPPtr, capType) {
    field capEPBadge       64

    field capType          5
    field capCanGrantReply 1
    field capCanGrant      1
    field capCanReceive    1
    field capCanSend       1
    field_ptr capEPPtr     word_size - 5 - 4
}
```

| Keyword | Meaning |
|---|---|
| `base 64(48,1)` | Word size, and for 64-bit the number of significant ("canonical") address bits and whether pointers are sign-extended. The kernel's own `.bf` files do not write it: it arrives through the preprocessed includes for the configuration (unchecked where exactly) |
| `block name(args) { ... }` | A structure of whole words, fields listed from the most significant bit of the first word. The optional argument list fixes the parameters and their order for the constructor |
| `field name n` | An `n`-bit field |
| `padding n` | `n` unused bits, always zero |
| `field_high name n` | Stores the top `n` significant bits of a value whose low bits are known to be zero: an aligned pointer. The getter shifts it back (and sign-extends where the architecture needs it) |
| `field_ptr(align) name n` | Shorthand for padding plus a `field_high` sized for a canonical pointer with `align` low zero bits |
| `tagged_union name tagfield { tag blockname value ... }` | A union of blocks that all have `tagfield` in the same place, with the tag value for each |
| `word_size`, `canonical_size` | Constants usable in size expressions |

For a block `B` with field `f` the generator emits a type `B_t` (a struct
wrapping an array of words) and:

| Function | Does |
|---|---|
| `B_new(args...)` | Builds a value |
| `B_get_f(b)` | Reads a field from a value |
| `B_set_f(b, v)` | Returns a copy with the field changed |
| `B_ptr_get_f(&b)`, `B_ptr_set_f(&b, v)`, `B_ptr_new(&b, ...)` | The same through a pointer, in place |

For the tagged union `cap`, whose tag field is `capType`, the names
combine: `cap_get_capType(cap)` reads the tag, `cap_endpoint_cap_new(...)`
builds an endpoint capability, `cap_endpoint_cap_get_capEPPtr(cap)` reads
its pointer and (in debug builds) asserts the tag is right. The tag
values become an enum: `cap_endpoint_cap`, `cap_null_cap`, ...

The kernel's `.bf` files:

| File | Describes |
|---|---|
| `include/object/structures_32.bf`, `structures_64.bf` | Generic capabilities, endpoints, notifications, thread state, the mapping database node, lookup faults, generic faults |
| `include/arch/<arch>/arch/object/structures.bf`, `include/arch/<arch>/arch/<wordsize>/mode/object/structures.bf` | Architecture capabilities (frames, page tables, ASID pools, I/O ports, VCPUs), page table entries, architecture faults |
| `include/plat/pc99/plat/<wordsize>/plat_mode/machine/hardware.bf` | x86 hardware formats such as IOMMU entries |
| `libsel4/mode_include/<wordsize>/sel4/shared_types.bf`, `libsel4/sel4_arch_include/<sel4arch>/sel4/sel4_arch/types.bf` | Types shared with user level: `seL4_MessageInfo`, `seL4_CapRights`, fault messages |

`.bf` files are run through the C preprocessor first, so they can contain
`#ifdef CONFIG_...` and `#include`. The build also "prunes": it finds
which accessors the kernel actually calls and generates only those, which
keeps the proof obligations down. The full manual is
[`tools/bitfield_gen.md`](https://github.com/seL4/seL4/blob/master/tools/bitfield_gen.md).

### System calls and invocations

`libsel4/include/api/syscall.xml` lists system call names in groups:
`api-master` (`Call`, `ReplyRecv`, `Send`, `NBSend`, `Recv`, `Reply`,
`Yield`, `NBRecv`), `api-mcs` (the MCS set, with `NBSendRecv`,
`NBSendWait`, `Wait`, `NBWait` and no `Reply`), and `debug` groups guarded
by conditions such as `CONFIG_PRINTING`. `syscall_header_gen.py` numbers
them downwards from -1, so the generated enum starts `SysCall = -1`,
`SysReplyRecv = -2`. Inserting a name in the middle renumbers everything
after it: an ABI break.

Object invocations are described as interfaces and methods in
`libsel4/include/interfaces/object-api.xml` (generic),
`libsel4/arch_include/<arch>/interfaces/object-api-arch.xml` and
`libsel4/sel4_arch_include/<sel4arch>/interfaces/object-api-sel4-arch.xml`.
Each `<method id="UntypedRetype" name="Retype">` lists typed `in` and
`out` parameters and carries the manual's text. Two things are generated:

- `invocation_header_gen.py` turns the method `id`s, in file order, into
  the `invocation_label` enum (`InvalidInvocation = 0`, `UntypedRetype`,
  `TCBReadRegisters`, ...), continued by the architecture enums. The
  kernel's decode functions switch on these
  ([system calls and invocations](syscalls-and-invocations.md));
- `libsel4/tools/syscall_stub_gen.py` writes `sel4_client.h`: one inline
  C function per method (`seL4_Untyped_Retype()`), which marshals
  arguments into message registers and capability slots, builds the
  `seL4_MessageInfo_t` with the label, calls `seL4_CallWithMRs()` and
  unmarshals the result.

There is no generated kernel-side unmarshalling: decode functions read
arguments by hand with `getSyscallArg(i, buffer)`. Adding an argument
means editing the XML and the decode function consistently.

### Hardware headers from device trees

On Arm and RISC-V the kernel does not parse a [device tree](../concepts/device-tree.md)
at run time. At build time:

1. the platform's `config.cmake` lists `tools/dts/<plat>.dts` and overlay
   files (`src/plat/<plat>/overlay-<plat>.dts`); the build concatenates
   them into `kernel.dts` and compiles that with `dtc` into `kernel.dtb`;
2. the overlay's `chosen` node says which devices the kernel uses:
   `seL4,kernel-devices = &{/pl011@9000000}, &{/intc@8000000}, &{/timer};`
   (and `seL4,elfloader-devices` for the [elfloader](elfloader.md));
3. `tools/hardware.yml` maps `compatible` strings to what the kernel
   needs from such a device: which `reg` regions to map and under which
   macro name (`arm,gic-v3` region 0 becomes `GICD_PPTR`, size `0x10000`),
   which interrupts get names (`INTERRUPT_VGIC_MAINTENANCE`), and under
   which `CONFIG_` condition;
4. `hardware_gen.py` combines them into `devices_gen.h`.

`devices_gen.h` contains:

| Item | Meaning |
|---|---|
| `physBase()` / `PHYS_BASE_RAW` | The physical address the kernel is linked to run at, derived from the start of memory |
| `#define UART_PPTR (KDEV_BASE + 0x...)` etc. | Kernel virtual addresses of its devices |
| `kernel_device_frames[]` | The frames `map_kernel_devices()` maps at boot, and whether user level may also have each |
| `avail_p_regs[]` | The RAM regions, from `/memory` nodes minus `/reserved-memory`: the source of all [untyped memory](untyped-memory.md) |
| `KERNEL_TIMER_IRQ`, `INTERRUPT_...` | Named interrupt numbers |

`platform_gen.yaml` and `platform_gen.json` carry the same memory and
device-region facts for tools (Microkit reads them to know where device
untypeds will be). A separate `gen_headers/plat/platform_gen.h` is made
from `src/arch/<arch>/platform_gen.h.in` with the timer frequency,
`MAX_IRQ` and driver includes named in `declare_default_headers()`.

x86 uses none of this: `pc99` discovers memory from the boot loader and
devices from [ACPI](../concepts/acpi-tables.md) at run time.

## In seL4

### Finding the generated files

In a stand-alone kernel build they are directly in the build directory;
in a project build (sel4test), under `<build>/kernel/`, with libsel4's
under `<build>/libsel4/`:

```
<build>/kernel/
├── gen_config/kernel/gen_config.{h,json,yaml}
├── autoconf/autoconf.h
├── gen_headers/api/invocation.h
├── gen_headers/arch/api/{syscall.h,invocation.h,sel4_invocation.h}
├── gen_headers/plat/platform_gen.h
├── gen_headers/plat/machine/{devices_gen.h,platform_gen.json,platform_gen.yaml}
├── generated/.../structures_gen.h     (included as <arch/object/structures_gen.h> etc.)
├── generated/invocations_all.json
├── kernel.dts, kernel.dtb
├── kernel_all.c, kernel_all_pp.c
└── kernel.elf
<build>/libsel4/
├── include/sel4/{syscall.h,invocation.h,shared_types_gen.h}
├── include/interfaces/sel4_client.h
└── sel4_arch_include/<sel4arch>/sel4/sel4_arch/{invocation.h,types_gen.h}
```

Reading them is the quickest answer to many debugging questions:

- "Is this option on?" `grep CONFIG_X gen_config/kernel/gen_config.h`.
- "What is system call -7?" `gen_headers/arch/api/syscall.h`.
- "What label is 0x2b?" `gen_headers/api/invocation.h` and the two
  architecture ones; labels depend on configuration, because methods can
  be conditional.
- "What memory does the kernel think this board has?" `avail_p_regs` in
  `devices_gen.h`, or `platform_gen.yaml`.
- "What did the overlays do?" `kernel.dts` is the concatenated source;
  decompile `kernel.dtb` with `dtc -I dtb -O dts` for the merged result.
- "What exactly does this accessor do?" Search `kernel_all_pp.c`, the
  fully preprocessed kernel, for the function: every generated accessor
  appears there as ordinary C.

### The CMake glue

The rules are in the kernel's [`CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt)
(invocation and system call headers, the bitfield prune-and-generate
loop over `bf_declarations`) and [`config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake)
(the `dtc` step and the `hardware_gen.py` command; `KernelCustomDTS`
replaces the platform's device tree and `KernelCustomDTSOverlay` adds
overlays). `.bf` files are registered with `add_bf_source_old()` in the
`config.cmake` beside them. libsel4's rules are in
[`libsel4/CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/libsel4/CMakeLists.txt).

The Isabelle side of the bitfield generator is not part of a normal
build: the proof repository runs the generator itself to produce
definitions and proofs for the same `.bf` files ([l4v](l4v.md)).

## Gotchas

- Field order in a `.bf` block is layout, and the layout of capabilities
  and thread state is relied on by the assembly fast paths and by the
  proofs. Reordering, widening or adding a field is a
  [proof-relevant](proof-impact.md) change even though "only a generated
  header" differs.
- A block must be a whole number of words; the generator rejects one that
  is not. A capability has exactly two words on every architecture, so a
  new field has to fit in existing padding.
- `field_high` and `field_ptr` drop low bits silently: storing a pointer
  that is not aligned as the field assumes loses information. Debug
  builds assert; release builds do not.
- The getter of a tagged-union member asserts the tag only in debug
  builds. Calling `cap_frame_cap_get_...` on a non-frame capability in a
  release build returns garbage quietly.
- The order of entries in `syscall.xml` and of methods in the interface
  XML is the ABI. Append; do not insert. Conditional methods shift later
  labels, which is why user code must be built against the libsel4
  generated for exactly the same kernel configuration.
- `hardware.yml` matches on `compatible` strings. A device tree whose UART
  or interrupt controller has an unlisted `compatible` produces a kernel
  with no such device and no error until it fails to boot or print.
- The kernel's idea of memory is fixed at build time on Arm and RISC-V.
  A board (or virtual machine) with more or less RAM than `kernel.dts`
  says needs a different device tree, not a run-time fix.
- Generated headers are rebuilt by dependency, but a stale build
  directory after switching branches can keep old ones; when a generated
  name is "missing", rebuild from a clean directory before debugging.

## See also

- [Source layout](source-layout.md): where the inputs live
- [Build system](build-system.md): `gen_config.h` and the options behind it
- [System calls and invocations](syscalls-and-invocations.md): the labels in use
- [libsel4](libsel4.md): the generated stubs as an API
- [Capabilities](capabilities.md) and [Kernel objects](kernel-objects.md): what the bitfields encode
- [Device tree](../concepts/device-tree.md): the format `hardware_gen.py` reads
- [Porting to a platform](platform-port.md): writing the DTS, overlay and `hardware.yml` entries
- [Verified C subset](verified-c-subset.md): why hand-written shifts and C bitfields are avoided

## References

- [seL4 `tools/bitfield_gen.md`](https://github.com/seL4/seL4/blob/master/tools/bitfield_gen.md):
  the generator's manual: purpose, `block`, `field`, `padding`,
  `field_high`, `field_ptr`, `word_size`, `canonical_size`, the accessor
  families (read to the `field_ptr` section; tagged unions not re-read).
  *Checked 2026-11-14.*
- [seL4 `include/object/structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf):
  the `endpoint_cap` block quoted above. *Checked 2026-11-14.*
- [seL4 `libsel4/include/api/syscall.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/api/syscall.xml)
  and [`tools/syscall_header_gen.py`](https://github.com/seL4/seL4/blob/master/tools/syscall_header_gen.py):
  the groups, and numbering from -1. *Checked 2026-11-14.*
- [seL4 `libsel4/include/interfaces/object-api.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/interfaces/object-api.xml)
  and [`libsel4/tools/syscall_stub_gen.py`](https://github.com/seL4/seL4/blob/master/libsel4/tools/syscall_stub_gen.py):
  the method descriptions and the stub shape. *Checked 2026-11-14.*
- [seL4 `CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt),
  [`config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake)
  and [`libsel4/CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/libsel4/CMakeLists.txt):
  output paths, the `dtc` and `hardware_gen.py` commands, the pruning
  step. *Checked 2026-11-14.*
- [seL4 `tools/hardware.yml`](https://github.com/seL4/seL4/blob/master/tools/hardware.yml)
  and [`tools/hardware/outputs/c_header.py`](https://github.com/seL4/seL4/blob/master/tools/hardware/outputs/c_header.py):
  the GIC entries; `physBase`, `kernel_device_frames`, `avail_p_regs`.
  *Checked 2026-11-14.*
- [seL4 `src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts`](https://github.com/seL4/seL4/blob/master/src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts):
  `seL4,kernel-devices` and `seL4,elfloader-devices`. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
