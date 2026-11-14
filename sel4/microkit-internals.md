# Microkit internals

> How the `microkit` tool turns a system description into a boot image (a capDL specification realised by the Rust capDL initialiser as root task), and how the loader, monitor and libmicrokit's event loop map Microkit's abstractions onto seL4 objects.

Read first: [Microkit](microkit.md), [Capabilities](capabilities.md), [BootInfo and the root task](bootinfo-and-root-task.md).

## What it is

A Microkit image holds the kernel, a root task, and every protection
domain (PD) program. The pieces, in boot order:

```
 build time                         run time
 ----------                         --------
 system.xml  PD ELFs                [U-Boot / Multiboot loader]
      \        /                              |
     microkit tool                  loader      (Arm, RISC-V only)
      |  parse SDF, patch symbols             |
      |  build capDL spec                   seL4 kernel
      |  check it fits the board              |
      v                             capDL initialiser (root task)
 loader.img (+ report.txt)            creates objects, caps, mappings
                                              |
                                    monitor + all PDs start
```

### The tool

`tool/microkit/` is a Rust program. Given the system description file
(SDF), `--board` and `--config`, it:

1. loads the SDK's files for that board and configuration, including
   the kernel ELF and the kernel's configuration (`sel4.rs`,
   `build_kernel_config`);
2. parses and validates the XML (`sdf.rs` and `sdf/`): unique names,
   identifier ranges, priority rule for protected procedure calls
   (PPC), overlapping mappings, page sizes;
3. reads each PD's [ELF](../concepts/elf.md) file (`elf.rs`) and
   **patches symbols** (`symbols.rs`, `ElfFile::write_symbol`): it
   finds the named symbol in the symbol table and overwrites the bytes
   of that variable in the file's data with the value. This serves the
   user's `setvar_*` attributes and libmicrokit's own variables:
   `microkit_name`, `microkit_passive` and the bit masks
   `microkit_irqs`, `microkit_notifications`, `microkit_pps`,
   `microkit_ioports`;
4. builds a **capDL specification** (`capdl/builder.rs`): a list of
   every kernel object the system needs (TCBs, scheduling contexts,
   CNodes, page tables, frames, endpoints, notifications, IRQ handlers,
   vCPUs) and every capability in every CSpace, with rights and badges;
5. embeds the specification and the frame contents into the
   initialiser's ELF (`capdl/packaging.rs`, `capdl/initialiser.rs`);
6. on Arm and RISC-V, **emulates the kernel's boot**
   (`emulate_kernel_boot` in `sel4.rs`) from the board's device tree to
   learn exactly which untyped capabilities the root task will receive,
   checks that every object fits and every fixed-address frame lies in
   real memory, and passes the expected untyped list to the initialiser.
   An image that builds will therefore initialise. On x86-64 the memory
   map is only known at boot, so this check cannot be made;
7. writes the image (`loader.rs`: raw binary, ELF or uImage) and the
   report.

**capDL** (capability distribution language) describes a system's
objects and capabilities declaratively; it comes from the
[CAmkES](camkes-capdl.md) world. The **initialiser** (`initialiser/`) is
a thin wrapper around the Rust crate `sel4-capdl-initializer` from
[rust-sel4](rust-sel4.md). It runs as the root task, retypes
[untyped memory](untyped-memory.md) into the listed objects, fills
CNodes, maps frames, configures and resumes every TCB, then stops.

This scheme dates from **release 2.1.0**. Before it (1.x and 2.0.x) the
tool itself emulated the root task: it computed the exact sequence of
kernel invocations needed and stored them in the image, and the
**monitor** was the root task and replayed them. Older papers and talks
describe that design, and it needed kernel patches; the capDL scheme
runs on unmodified seL4.

### The monitor

`monitor/src/main.c` is now an ordinary PD, at priority 255 (above any
user PD, whose maximum is 254) and in domain 0. It has two jobs:

- **Fault handler of last resort.** Every PD without a parent has the
  monitor's endpoint as its [fault](faults.md) endpoint, badged with
  the PD's index plus one. On a fault, in a debug build, the monitor
  prints lines prefixed `MON|ERROR:`: the faulting PD's name, the kind
  (`VMFault` with instruction pointer and fault address, `CapFault`,
  `UserException`, vCPU fault), a register dump, and hints such as
  "potential stack overflow" when the address is within a page of the
  stack. It never replies, so the PD stays blocked for ever.
- **Making PDs passive.** A PD marked `passive` sends an empty message
  to `MONITOR_EP` when `init` returns; the monitor unbinds that PD's
  scheduling context and binds it to the PD's notification
  ([MCS](mcs.md)).

### The loader (Arm and RISC-V)

`loader/` is Microkit's own small bootloader; it plays the role the
[Elfloader](elfloader.md) plays in other seL4 projects, but shares no
code with it. The tool appends a `struct loader_data` (`loader.h`): a
magic number (`0x5e14dead14de5ead` on 64-bit), the kernel's entry
point, the root task's physical region (`ui_p_reg_start`,
`ui_p_reg_end`), its `pv_offset` and virtual entry `v_entry` (the
values the kernel takes as boot arguments, see
[kernel boot](kernel-boot.md)), and a list of `struct region`
(`load_addr`, `size`, `offset`, `type`) followed by the data. The tool
has already split the kernel and initialiser ELFs into those regions
and computed the initial page tables (`tool/microkit/src/loader.rs`),
so the loader contains no ELF parser.

`main` in `loader.c` then:

1. initialises a UART (debug builds) and an exception handler;
2. relocates itself if it was not loaded at its link address
   (`crt0.S`), which is why U-Boot may load the image anywhere;
3. checks the magic and copies each region to its `load_addr`
   (`copy_data`); from here U-Boot's memory may be overwritten;
4. starts secondary cores (`plat_start_cpu`: on Arm through
   [PSCI](../concepts/psci-smccc.md) or a spin table, on RISC-V through
   SBI calls in `riscv/sbi.c`);
5. on each core, moves to the exception level the kernel expects
   (`ensure_correct_el` in `aarch64/el.c`: EL2 for hypervisor-mode
   kernels, EL1 for boards such as `qemu_virt_aarch64_el1`), sets up
   the GICv2 where firmware has not (`configure_gicv2`), enables the
   MMU with the precomputed tables (`arch_mmu_enable`) and jumps to the
   kernel (`arch_jump_to_kernel`).

It prints `LDR|INFO:` lines in debug builds.

**x86-64 has no loader.** The kernel is a Multiboot image and does its
own early set-up ([x86 boot](../concepts/x86-boot.md)); the tool emits
the kernel ELFs and the initialiser as the boot module.

### libmicrokit on kernel objects

Each PD gets one TCB, one scheduling context, one VSpace, one CNode of
fixed layout, **one endpoint and one notification**. The notification
is bound to the TCB, so a single receive on the endpoint returns either
a message or a signal ([Notifications](notifications.md), "bound
notifications").

| Microkit | Kernel objects and capabilities |
|---|---|
| `microkit_notify(ch)` | `seL4_Signal` on a notification capability to the *other* PD's notification, badged `1 << id-at-the-other-end` |
| IRQ on channel `id` | the IRQ handler's notification is the PD's own, badged `1 << id`; `microkit_irq_ack` is `seL4_IRQHandler_Ack` |
| `microkit_ppcall(ch)` | `seL4_Call` on a capability to the callee's endpoint, badged `1<<63 \| id-at-the-callee` |
| child fault | the child's fault endpoint is the parent's endpoint, badged `1<<62 \| child id` |
| `protected` returning | `seL4_ReplyRecv` through the PD's one reply object |

The event loop (`handler_loop` in `libmicrokit/src/main.c`) is:

```c
for (;;) {
    if (have_reply)            tag = seL4_ReplyRecv(INPUT_CAP, reply_tag, &badge, REPLY_CAP);
    else if (have_signal)      tag = seL4_NBSendRecv(signal_cap, signal_msg, INPUT_CAP, &badge, REPLY_CAP);
    else                       tag = seL4_Recv(INPUT_CAP, &badge, REPLY_CAP);

    if (badge >> 62 & 1)       have_reply = fault(badge & 0xff, tag, &reply_tag);
    else if (badge >> 63)    { reply_tag = protected(badge & 0x3f, tag); have_reply = true; }
    else for each set bit i in badge: notified(i);
}
```

Because signals to one notification are ORed together, the badge of a
notification wake-up is a bit set of channels, and bits 62 and 63 are
reserved to tell faults and calls apart: hence 62 usable channel
identifiers. `seL4_NBSendRecv` is how `microkit_deferred_notify` and
`microkit_deferred_irq_ack` fold one send into the next wait.

The CSpace is one CNode whose slots are fixed constants shared by
`microkit.h` and `capdl/builder.rs`:

| Slot | Capability |
|---|---|
| 1 | `INPUT_CAP`: own endpoint |
| 3 | own VSpace |
| 4 | `REPLY_CAP`: reply object |
| 5 | `MONITOR_EP` |
| 6 | own TCB (benchmark configuration) |
| 7 | Arm SMC capability, if `smc="true"` |
| 10 + ch | `BASE_OUTPUT_NOTIFICATION_CAP`: notification of the PD at the other end of `ch` |
| 74 + ch | `BASE_ENDPOINT_CAP`: endpoint for PPC on `ch` |
| 138 + ch | `BASE_IRQ_CAP`: IRQ handler |
| 202 + id | `BASE_TCB_CAP`: child PD's TCB |
| 266 + id, 330 + id | `BASE_VM_TCB_CAP`, `BASE_VCPU_CAP`: a guest's vCPU |
| 394 + id | `BASE_IOPORT_CAP`: x86 I/O port range |
| 458 + n | `BASE_USER_CAPS`: capabilities requested with the SDF `cspace` element (at most 128) |

The IPC buffer is the top page of the user address space and the stack
sits below it; neither appears in the SDF.

## In seL4

### The SDK build

`build_sdk.py` holds a `BoardInfo` per board (name, architecture,
`gcc_cpu`, `loader_link_address`, `smp_cores`, `kernel_options`) and a
`ConfigInfo` per configuration. For each pair it builds seL4 with CMake
and installs kernel, libmicrokit, loader, monitor and initialiser under
`board/<board>/<config>/`. Options applied to every kernel:

| Scope | Options |
|---|---|
| all | `KernelIsMCS`, `KernelRootCNodeSizeBits=17`, `LibSel4UseThreadLocals=OFF`, `KernelNumDomains=16`, `KernelNumDomainSchedules=100` |
| AArch64 | `KernelArmHypervisorSupport`, `KernelArmExportPCNTUser` |
| x86-64 | `KernelPlatform=pc99`, `KernelX86MicroArch=generic`, `KernelIOMMU`, `KernelSupportPCID=OFF`; `KernelVTX` and `KernelX86_64VTX64BitGuests` on `x86_64_generic_vtx` |
| `debug` | `KernelDebugBuild`, `KernelVerificationBuild=OFF` |
| `benchmark` | `KernelBenchmarks=track_utilisation`, `KernelSignalFastpath`, PMU export on Arm, `KernelX86DangerousMSR` on x86 |
| `smp-*` | `KernelMaxNumNodes` = the board's `smp_cores` |

The seL4 revision an SDK is built from is chosen by whoever runs
`build_sdk.py --sel4 <path>`; each release is tested against one
revision (unchecked: where that is recorded).

### Adding a board

The manual's "Adding Platform Support" section lists the steps. The
kernel must support the platform first ([Platform ports](platform-port.md)).
Then: a `BoardInfo` entry in `build_sdk.py` with the right
`KernelPlatform` and loader link address; a UART case in
`loader/src/uart.c` for debug output; CPU start-up details in the
loader if the board is multi-core; an entry in `platforms.yml` and a
manual section. No per-board code exists in the tool, monitor or
libmicrokit.

### Debugging aids

- **`report.txt`** (the `-r` option): the tool's account of what it
  built, including the kernel objects of the capDL specification; not a
  stable format.
- **`microkit_dbg_puts`**, `microkit_dbg_putc`, `microkit_dbg_put32`:
  print through the kernel's debug console system call, so they work
  only in `debug` configurations ([Debugging](debugging.md)).
- **Monitor fault dumps**, and the loader's `LDR|` lines.
- `--override-kernel <elf>` to try a kernel you built yourself, and
  `--viper-output` to emit each PD's capability table for verification
  tools.
- `microkit_internal_crash(err)` in libmicrokit deliberately writes to
  address `err`, so a fault address that is a small number is often an
  `seL4_Error` value from a failed invocation.

## Gotchas

- **Papers and older posts describe the pre-2.1.0 design** (monitor as
  root task replaying invocations, patched kernel). Check the release
  before trusting a description.
- **The kernel-boot emulation must track the kernel.** A kernel change
  that alters how boot-time memory is carved up (reserved regions, the
  order untypeds are created in) can make the tool's prediction wrong
  for Arm and RISC-V boards; that is a reason kernel boot changes get
  tested with Microkit.
- **x86-64 errors appear at boot, not at build**: the tool cannot check
  a specification against a memory map it does not have, so an
  over-large system or a bad `phys_addr` fails in the initialiser.
- **libmicrokit acknowledges every IRQ once at start-up**, before the
  event loop, working around
  [seL4 issue 1536](https://github.com/seL4/seL4/issues/1536).
- **A PD with an x86 vCPU is different**: its loop enters the guest
  with `seL4_SysVMEnter` in place of `seL4_Recv`, and it can neither
  receive PPCs nor have child PDs.
- **Slot numbers are an internal contract**, not an API, and may
  change between releases. Use the `microkit_*` functions.

## See also

- [Microkit](microkit.md): the abstractions as a user sees them
- [CAmkES and capDL](camkes-capdl.md): where capDL comes from
- [rust-sel4](rust-sel4.md): home of the capDL initialiser crate
- [Elfloader](elfloader.md): the loader used outside Microkit
- [Kernel boot](kernel-boot.md): what the tool emulates
- [Platform ports](platform-port.md): the kernel side of a new board
- [Index](../INDEX.md): the reading order
- [Arm boot flow](../concepts/arm-boot.md): the chain from reset to a kernel on a 64-bit Arm machine
- [Build system and configuration](build-system.md): seL4 builds with CMake and Ninja

## References

- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md), "Internals" and "Adding Platform Support": the flow, loader, initialiser, monitor and build-time checking. *Checked 2026-11-14.*
- [`CHANGES.md`](https://github.com/seL4/microkit/blob/main/CHANGES.md), "Release 2.1.0": "Transition to using capDL for system initialisation", no kernel patches needed. *Checked 2026-11-14.*
- [`tool/microkit/src/capdl/builder.rs`](https://github.com/seL4/microkit/blob/main/tool/microkit/src/capdl/builder.rs): slot constants, `FAULT_BADGE`, `PPC_BADGE`, channel badges. *Checked 2026-11-14.*
- [`libmicrokit/src/main.c`](https://github.com/seL4/microkit/blob/main/libmicrokit/src/main.c): `handler_loop`, passive start-up, VMEnter path. *Checked 2026-11-14.*
- [`loader/src/loader.c`](https://github.com/seL4/microkit/blob/main/loader/src/loader.c) and [`loader.h`](https://github.com/seL4/microkit/blob/main/loader/src/loader.h): `loader_data`, `copy_data`, `start_kernel`. *Checked 2026-11-14.*
- [`monitor/src/main.c`](https://github.com/seL4/microkit/blob/main/monitor/src/main.c): fault messages, passive binding. *Checked 2026-11-14.*
- [`build_sdk.py`](https://github.com/seL4/microkit/blob/main/build_sdk.py): kernel options per board and configuration. *Checked 2026-11-14.*
- [`sel4-capdl-initializer`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-capdl-initializer): the crate the initialiser wraps. *Unchecked.* Path not opened today; the dependency name is from `initialiser/Cargo.toml`.

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
