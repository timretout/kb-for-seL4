# Device trees

> A device tree is a data structure describing hardware that cannot be discovered by probing; on Arm and RISC-V seL4's build compiles one into the kernel, and Microkit and sDDF generate system descriptions from it.

Read first: [IRQ](irq.md), [Arm boot](arm-boot.md).

## What it is

A [PCI](pci.md) device announces itself: the OS reads a vendor and device
ID from configuration space. Most hardware on an Arm or RISC-V
system-on-chip does not. A UART is simply some registers at a physical
address, wired to some interrupt line, and nothing in the machine says
where. Linux once carried a C "board file" per board; the **device tree**
replaced those with data handed to the kernel at boot. (x86 PCs and Arm
servers solve the same problem with [ACPI tables](acpi-tables.md).)

Three forms of the same thing:

| Form | What it is |
|---|---|
| **DTS** (device tree source) | Text, C-like syntax. `.dtsi` files are included by `.dts` files |
| **DTB** (device tree blob), also **FDT** (flattened device tree) | The binary the boot loader passes on |
| **dtc** | The compiler between them: `dtc -I dts -O dtb` and back with `-I dtb -O dts` |

### Nodes and properties

The tree is made of **nodes**, named `name@unit-address`, each holding
**properties** (name and value) and child nodes. A value is a string, a
list of 32-bit **cells** in `< >`, or bytes.

```dts
/ {
    #address-cells = <2>;  #size-cells = <2>;
    interrupt-parent = <&gic>;

    gic: intc@8000000 {
        compatible = "arm,cortex-a15-gic";
        #interrupt-cells = <3>;
        interrupt-controller;
        reg = <0x0 0x08000000 0x0 0x10000>,
              <0x0 0x08010000 0x0 0x10000>;
    };
    pl011@9000000 {
        compatible = "arm,pl011", "arm,primecell";
        reg = <0x0 0x09000000 0x0 0x1000>;
        interrupts = <0 1 4>;
        status = "okay";
    };
};
```

- **`compatible`**: a list of strings, most specific first, usually
  `"vendor,device"`. It is how a driver finds its device: the OS matches
  the strings against the ones each driver claims.
- **`reg`**: address and size pairs. How many cells each takes is set by
  the *parent's* **`#address-cells`** and **`#size-cells`** (defaults 2
  and 1 if absent), so the same `reg` bytes mean different things under
  different parents. Above, each is two cells (64 bits).
- **`ranges`**: on a bus node, triplets (child address, parent address,
  length) translating the children's addresses into the parent's address
  space. An empty `ranges;` means the two are identical; no `ranges` at
  all means the children are not memory-mapped from the parent.
- **`phandle`**: a 32-bit number unique to a node, by which other nodes
  refer to it. In source one writes a label (`gic:`) and a reference
  (`&gic`); dtc invents the numbers.
- **`interrupts`**: one or more interrupt specifiers, whose length is the
  **`#interrupt-cells`** of the node's interrupt controller. The
  controller is named by **`interrupt-parent`** (a phandle), inherited
  from the nearest ancestor that has one. `interrupts-extended` carries a
  phandle with each specifier, for a device wired to two controllers.
- **`status`**: `"okay"` or `"disabled"` (also `"reserved"` and
  `"fail"`). A missing `status` means okay. Tools skip disabled nodes.

The [GIC](gicv2.md)'s specifier has three cells: type (0 for a shared
peripheral interrupt, SPI; 1 for a per-processor one, PPI), the number
*within that type*, and trigger flags (1 rising edge, 4 level high). SPIs
start at interrupt ID 32 and PPIs at 16, so `<0 1 4>` above is interrupt
ID 33, level triggered. A RISC-V PLIC uses one cell.

### Standard nodes

| Node | Holds |
|---|---|
| `/chosen` | Parameters for the OS, not hardware: `bootargs` (the command line), `stdout-path` (which node is the console, such as `"/pl011@9000000"` or `"serial0:115200n8"`), the initrd's addresses |
| `/memory@...` | `device_type = "memory"` and `reg`: where RAM is |
| `/reserved-memory` | Children are regions of RAM the OS must not use freely (firmware, frame buffers) |
| `/cpus` | One `cpu@N` child per core, with `reg` (the core's hardware ID: MPIDR on Arm, hart ID on RISC-V) and `enable-method` (for instance `"psci"`, see [PSCI and SMCCC](psci-smccc.md)) |
| `/aliases` | Short names for node paths (`serial0`) |

### The blob

All fields are big-endian, whatever the CPU.

```
+---------------------------+  struct fdt_header: ten 32-bit fields
| header                    |  magic 0xd00dfeed, totalsize,
+---------------------------+  off_dt_struct, off_dt_strings,
| memory reservation block  |  off_mem_rsvmap, version (17),
|  (u64 address, u64 size)* |  last_comp_version (16),
+---------------------------+  boot_cpuid_phys, size_dt_strings,
| structure block           |  size_dt_struct
|  tokens, 4-byte aligned   |
+---------------------------+
| strings block             |  property names, NUL-terminated
+---------------------------+
```

The structure block is the tree, flattened to a token stream:
`FDT_BEGIN_NODE` (1) followed by the node's name, `FDT_PROP` (3) followed
by a length, an offset into the strings block for the property's name and
then the value, `FDT_END_NODE` (2), `FDT_NOP` (4) and a final `FDT_END`
(9). There is no index: finding a node means walking the stream, which is
why even a minimal parser (`libfdt`) is a few thousand lines.

### Bindings and overlays

The specification fixes the format and a few standard properties. What
properties a given `compatible` string requires is written in its
**binding**, a schema kept in the Linux tree under
`Documentation/devicetree/bindings/`. Linux is in practice the registry;
the board files in `arch/*/boot/dts/` are where most other projects,
seL4 included, get their trees.

An **overlay** is a fragment applied on top of a base tree, adding or
overriding nodes and properties. Standard overlays are compiled `.dtbo`
files that a boot loader merges at boot (Raspberry Pi firmware's
`dtoverlay=`). seL4's "overlays" are simpler: see below.

### Who provides it

The stage before the kernel, which puts the blob's address in a register
(`x0` on AArch64, `a1` on RISC-V; see [Arm boot](arm-boot.md)):

- **Board firmware or U-Boot** loads a `.dtb` file from storage, or
  carries its own, and usually edits it on the way: filling in
  `/memory` with the RAM actually fitted, `/chosen/bootargs`, MAC
  addresses.
- **[UEFI](uefi.md)** firmware publishes it as a configuration table.
- **[QEMU](qemu.md)** generates one for its `virt` machines to match the
  command line; `-machine virt,dumpdtb=file.dtb` writes it out and exits.

## In seL4

**The kernel does not parse a device tree at run time.** A parser would
be a great deal of code to verify. Instead the build does the reading:

1. The platform's `config.cmake` appends to `KernelDTSList` the file
   `tools/dts/<plat>.dts` (a copy of Linux's tree for that board,
   refreshed by `tools/dts/update-dts.sh`) and
   `src/plat/<plat>/overlay-<plat>.dts`.
2. [`config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake)
   concatenates the list into `kernel.dts` in the build directory and
   runs `dtc` to make `kernel.dtb`. An seL4 overlay is therefore plain
   DTS appended to the base file: later definitions of a node merge with
   and override earlier ones.
3. `tools/hardware_gen.py` reads `kernel.dtb` with
   [`tools/hardware.yml`](https://github.com/seL4/seL4/blob/master/tools/hardware.yml),
   which says, per `compatible` string, what the kernel does with such a
   device (which driver, which register region to map at which kernel
   address, which interrupt), and writes C headers. [Generated
   code](../sel4/generated-code.md) walks through the outputs.

The overlay's main job is the `/chosen` node, where seL4 defines its own
properties: `seL4,kernel-devices` lists the nodes the kernel itself
drives (console UART, interrupt controller, timer),
`seL4,elfloader-devices` those the [elfloader](../sel4/elfloader.md)
needs (UART, PSCI), and `seL4,boot-cpu` the core the kernel boots on.
Overlays also correct `/memory` and reserve regions.

The consequences:

- **Memory is fixed at build time.** The `/memory` nodes become the
  kernel's table of physical memory regions, and every device region not
  claimed by the kernel becomes device untyped memory (see [Untyped
  memory](../sel4/untyped-memory.md)). A kernel built for a board with
  2 GiB sees 2 GiB on the 8 GiB model, and one built for 8 GiB will fault
  on the 2 GiB model. Boards that vary need a build per variant;
  `KernelCustomDTSOverlay` adds an overlay from the command line and
  `KernelCustomDTS` replaces the whole tree. This is the opposite of x86,
  where the kernel reads memory from the boot loader's map at boot (see
  [x86 boot](x86-boot.md)).
- **The DTB still reaches user level.** The elfloader passes the kernel
  the address and size of a DTB (the build's `kernel.dtb` from its
  archive, or else the boot loader's), and `init_kernel()` copies it
  into the root task's extra [BootInfo](../sel4/bootinfo-and-root-task.md)
  as a chunk with header `SEL4_BOOTINFO_HEADER_FDT`
  ([Arm](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c),
  and the same in the RISC-V `boot.c`). The kernel only copies; a root
  task may parse it with `libfdt`.
- **The elfloader** uses the build-time tree too: its UART and PSCI
  drivers are selected by `compatible` strings from
  `seL4,elfloader-devices` through generated tables.
- **x86 has none of this**: no DTS for `pc99`; devices come from ACPI and
  PCI.

Above the kernel:

- **[Microkit](../sel4/microkit.md)** fixes the whole system at build
  time. Its SDK ships a kernel per board, built from that board's tree,
  and its system description (SDF) file gives device addresses and
  interrupt numbers as literals.
- **[sDDF](../sel4/sddf.md)** removes the hand copying. Each driver has a
  `config.json` listing the `compatible` strings it serves and the
  resources it needs by index (`"dt_index": 0` is the first `reg` entry
  or the first interrupt). A per-example `meta.py` script using the
  `sdfgen` library is given the board's DTB (`--dtb`), finds a node,
  and emits the SDF with the right memory regions and interrupts, plus
  configuration data for each component
  ([echo server's `meta.py`](https://github.com/au-ts/sddf/blob/main/examples/echo_server/meta.py)).
  The DTB it reads is usually the one from the kernel build.

## Gotchas

- **`reg` cannot be read without the parent.** The cell counts come from
  the parent node and the addresses may need translating through each
  ancestor's `ranges`. A script that reads `reg` raw works until it meets
  a bus with a non-empty `ranges`.
- **GIC interrupt numbers are offset.** The second cell is not the
  interrupt ID: add 32 for an SPI, 16 for a PPI. seL4's interrupt numbers
  on Arm are the IDs, so a device tree `<0 1 4>` is seL4 IRQ 33.
- **The kernel's tree and the machine's can disagree**, and nothing
  checks. The kernel believes its build-time tree; a boot loader's edited
  tree (real RAM size, a moved UART) is ignored by the kernel though it
  may be the one passed to user level. On QEMU, changing `-m` or
  `-smp` or `gic-version` changes QEMU's generated tree, so the kernel
  must be rebuilt to match.
- **A device with `status = "disabled"` is skipped**, including by
  seL4's and sDDF's tools: a board tree often disables a UART or NIC that
  an `.dts` including it was meant to enable.
- **Linux's trees change.** Node names and `compatible` strings are
  renamed between Linux releases, which breaks overlays that refer to
  nodes by path (`&{/pl011@9000000}`).
- **Arm servers and cloud instances use ACPI**, not device trees: EC2's
  Graviton and Compute Engine's Arm machines boot through UEFI with ACPI
  tables, so a device tree for them has to be written by hand from what
  ACPI says.

## See also

- [ACPI tables](acpi-tables.md): the other way of describing a machine
- [Arm boot](arm-boot.md): how the blob's address reaches the kernel
- [PSCI and SMCCC](psci-smccc.md): the `/psci` node and `enable-method`
- [GICv2 and GICv3](gicv2.md): the controller the three-cell specifier addresses
- [UARTs: 16550 and PL011](uart.md): what `stdout-path` points at
- [QEMU](qemu.md): generates a tree per command line
- [Generated code](../sel4/generated-code.md): `hardware_gen.py` and its outputs
- [Elfloader](../sel4/elfloader.md): chooses and relocates the DTB
- [BootInfo and the root task](../sel4/bootinfo-and-root-task.md): where the DTB arrives
- [Build system](../sel4/build-system.md): `KernelCustomDTS` and platform `config.cmake`
- [Platform ports](../sel4/platform-port.md): writing a DTS and overlay
- [Index](../INDEX.md): the reading order

## References

- [Devicetree Specification, chapter 2 "The Devicetree"](https://devicetree-specification.readthedocs.io/en/stable/devicetree-basics.html):
  sections 2.3 (standard properties: `compatible`, `phandle`, `status`,
  `#address-cells`, `reg`, `ranges`) and 2.4 (interrupts).
  *Checked 2026-11-14.*
- [Devicetree Specification, chapter 5 "Flattened Devicetree (DTB) Format"](https://devicetree-specification.readthedocs.io/en/stable/flattened-format.html):
  header, memory reservation block, tokens. *Checked 2026-11-14.*
- Devicetree Specification, chapter 3 "Device Node Requirements":
  `/chosen`, `/memory`, `/reserved-memory`, `/cpus`. *Unchecked (not
  opened today; the node descriptions above are from memory).*
- [seL4 `config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake):
  `KernelCustomDTS`, `KernelCustomDTSOverlay`, the `dtc` step.
  *Checked 2026-11-14.*
- [seL4 `tools/hardware/fdt.py`](https://github.com/seL4/seL4/blob/master/tools/hardware/fdt.py):
  the `seL4,kernel-devices`, `seL4,elfloader-devices` and `seL4,boot-cpu`
  properties. *Checked 2026-11-14.*
- [seL4 `src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts`](https://github.com/seL4/seL4/blob/master/src/plat/qemu-arm-virt/overlay-qemu-arm-virt.dts):
  a small overlay. *Checked 2026-11-14.*
- [sDDF `drivers/network/virtio/mmio/config.json`](https://github.com/au-ts/sddf/blob/main/drivers/network/virtio/mmio/config.json):
  a driver's `compatible` list and `dt_index` resources.
  *Checked 2026-11-14.*
- Linux kernel documentation, `Documentation/devicetree/bindings/interrupt-controller/arm,gic.yaml`:
  the three-cell GIC specifier. *Unchecked (from memory).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
