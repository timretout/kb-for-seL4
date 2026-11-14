# Kernel boot

> The path from the kernel's entry point to the first user thread: architecture assembly sets up a stack and the kernel's address space, C code discovers or is told the machine's memory, then generic helpers build the root task's CNode, address space, thread and untypeds before the first `schedule()`.

Read first: [Kernel design](kernel-design.md), [Boot code and the proof boundary](boot-code.md).

## What it is

seL4's boot has one job: build the first user thread, the **root task**,
and give it capabilities to everything else. The kernel starts no
drivers and mounts nothing. When boot ends, the kernel's own state is a
handful of objects (root CNode, the root task's TCB and page tables, the
idle thread) and all remaining memory has been handed to the root task
as [untyped](untyped-memory.md) capabilities
([BootInfo and the root task](bootinfo-and-root-task.md)).

All of this code is marked `BOOT_CODE`, placed in a `.boot` section and
never run again; it is outside the functional correctness proof
([boot code](boot-code.md)).

### What the kernel must be handed

The kernel does not load anything from storage or parse an ELF file for
itself (except on x86, the root task's). Somebody else puts the kernel
and the root task image in memory and tells the kernel where:

| | x86 (`pc99`) | Arm, RISC-V |
|---|---|---|
| Loaded by | A Multiboot 1 or 2 boot loader (GRUB, QEMU `-kernel`) ([x86 boot](../concepts/x86-boot.md)) | The [elfloader](elfloader.md), or Microkit's loader ([Arm boot](../concepts/arm-boot.md)) |
| CPU state at entry | 32-bit protected mode, paging off | Kernel's exception level or supervisor mode, MMU on with the kernel already mapped at its virtual address |
| Root task image | A Multiboot module: an ELF file the kernel loads itself (`load_boot_module()`, `elf_load()`) | Already loaded; passed as a physical range |
| Memory map | Multiboot memory map, at run time | `avail_p_regs[]`, compiled in from the device tree ([generated code](generated-code.md)) |
| Devices | [ACPI tables](../concepts/acpi-tables.md), at run time | Compiled in (`kernel_device_frames[]`) |
| Arguments | `boot_sys(multiboot_magic, mbi)` | `init_kernel(ui_p_reg_start, ui_p_reg_end, pv_offset, v_entry, dtb_addr_p, dtb_size)` |

The Arm and RISC-V arguments mean:

| Argument | Meaning |
|---|---|
| `ui_p_reg_start`, `ui_p_reg_end` | Physical start and end of the loaded user image (the root task) |
| `pv_offset` | Physical minus virtual address of the user image: where its virtual addresses were loaded |
| `v_entry` | The root task's virtual entry point |
| `dtb_addr_p`, `dtb_size` | Physical address and size of a device tree blob to pass on to the root task; size 0 if none. The kernel does not interpret it |

RISC-V with SMP adds `hart_id` and `core_id`.

### The common sequence

Whatever the architecture, boot goes through the same stages:

1. **Assembly entry**: mask interrupts, set up a stack
   (`kernel_stack_alloc`), get into the right CPU mode, call C.
2. **Kernel address space**: build and switch to the kernel's own page
   tables (the "kernel window": all physical memory at a fixed offset,
   plus kernel devices).
3. **CPU and platform initialisation**: trap vectors, FPU, interrupt
   controller, timer, serial port.
4. **Free memory**: collect the available physical regions, subtract the
   kernel image, the user image and anything reserved, and carve out one
   block for the root task's initial objects.
5. **Root task objects**: root CNode, interrupt and other control
   capabilities, the BootInfo frame, the address space with the user image
   mapped, the IPC buffer, an ASID pool, the idle thread, the initial TCB.
6. **Untypeds**: everything left over, and device memory, as untyped
   capabilities in the root CNode.
7. **Go**: start other cores, then `schedule()` and `activateThread()`
   choose the root task, and the assembly returns to user level through
   the normal `restore_user_context` exit.

## In seL4

### Generic helpers: `src/kernel/boot.c`

Two boot-only globals carry state between steps:

- `ndks_boot` ("non-deterministic kernel state, boot"): the free-memory
  list `freemem[]`, the reserved list, a pointer to the BootInfo frame
  being filled in, and `slot_pos_cur`, the next free slot in the root
  CNode;
- `rootserver`: pointers to the memory set aside for each initial object
  (`cnode`, `vspace`, `asid_pool`, `ipc_buf`, `boot_info`, `extra_bi`,
  `tcb`, `paging` and, on MCS, `sc`).

| Function | Does |
|---|---|
| `init_freemem()` | Takes available and reserved region lists, removes the reserved from the available, fills `ndks_boot.freemem[]`, then finds a free region big enough and calls `create_rootserver_objects()` |
| `create_rootserver_objects()`, `alloc_rootserver_obj()` | Carves the root task's objects out of one contiguous block, largest first so each is aligned. This is the only "allocator" in the kernel and it runs once |
| `create_root_cnode()` | Makes the root CNode (`BIT(CONFIG_ROOT_CNODE_SIZE_BITS)` slots) and puts a capability to it in its own slot `seL4_CapInitThreadCNode` |
| `create_domain_cap()` | The domain-control capability |
| `init_irqs()` (architecture) | Marks every IRQ inactive, reserves the kernel's own (timer, IPIs), writes `seL4_CapIRQControl` |
| `populate_bi_frame()` | Clears the BootInfo frame and fills in node count, IPC buffer address, CNode size, and the extra-BootInfo size |
| `create_it_address_space()` (architecture, `vspace.c`) | Creates the root task's top-level page table, copies in the kernel's mappings, and creates and maps every intermediate page table needed to cover `it_v_reg`, the virtual range of image, IPC buffer and BootInfo |
| `create_bi_frame_cap()`, `create_ipcbuf_frame_cap()`, `create_frames_of_region()` | Frame capabilities for the BootInfo frame, the IPC buffer, and every page of the user image, mapped into the new address space; the image's frame caps are recorded as `userImageFrames` |
| `create_it_asid_pool()`, `write_it_asid_pool()` | An ASID pool and the root task's address-space identifier |
| `create_idle_thread()` | The per-core idle thread, which runs in kernel mode |
| `create_initial_thread()` | The root task's TCB: CSpace and VSpace roots, IPC buffer, entry point `v_entry`, first argument register set to the BootInfo frame's address, maximum priority, and `seL4_CapInitThreadTCB` |
| `init_core_state()` | Sets `ksSchedulerAction` to the initial thread, `ksCurThread` to the idle thread |
| `create_untypeds()` | Turns every remaining free region into untyped capabilities in power-of-two pieces (`create_untypeds_for_region()`, `provide_untyped_cap()`), and records each in BootInfo's `untypedList`; architectures call the same code for device regions with `isDevice` set |
| `bi_finalise()` | Records the range of empty slots left in the root CNode |

### Arm

1. `_start` in [`src/arch/arm/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/head.S)
   (or `32/head.S`): mask interrupts (`msr daifset`), select the kernel
   stack pointer, set the system control register bits, point `sp` at
   `kernel_stack_alloc` (indexed by core on SMP), call `arm_errata`, then
   `bl init_kernel` with the elfloader's six arguments still in `x0` to
   `x5`. When `init_kernel` returns, it branches to `restore_user_context`.
2. `init_kernel()` in [`src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c):
   on the boot core calls `try_init_kernel()`, on others
   `try_init_kernel_secondary_core()`; then `schedule(); activateThread();`.
3. `try_init_kernel()`:
   1. compute the user image's regions and the virtual addresses of the
      IPC buffer and BootInfo frames, placed just after the image;
   2. `map_kernel_window()`: build the kernel's final page tables,
      including `map_kernel_devices()` from `kernel_device_frames[]`
      ([AArch64 paging](../concepts/aarch64-paging.md));
   3. `init_cpu()`: activate those tables, set the vector table, FPU, and
      with hypervisor support the EL2 state; initialise the per-core
      interrupt controller interface and timer;
   4. `init_plat()`: the interrupt controller's distributor
      ([GICv2](../concepts/gicv2.md), [GICv3](../concepts/gicv3-its.md))
      and platform quirks;
   5. `arch_init_freemem()`: reserve the kernel image, the user image and
      the DTB, then `init_freemem()` with `avail_p_regs[]`;
   6. `create_root_cnode()`, `create_domain_cap()`, `init_irqs()`,
      `init_smmu()`, `init_smc()`;
   7. `populate_bi_frame()`, then copy the DTB into the extra BootInfo
      region under a `SEL4_BOOTINFO_HEADER_FDT` header;
   8. `create_it_address_space()`, `create_bi_frame_cap()`,
      `init_sched_control()` (MCS), `create_ipcbuf_frame_cap()`,
      `create_frames_of_region()` for the user image,
      `create_it_asid_pool()`, `write_it_asid_pool()`;
   9. `create_idle_thread()`, `create_initial_thread()`,
      `init_core_state()`;
   10. `create_untypeds()`, `bi_finalise()`, cache and TLB invalidation;
   11. on SMP `clh_lock_init()` and `release_secondary_cpus()`: the other
       cores have been waiting in the kernel since the elfloader started
       them ([SMP bring-up](../concepts/smp-bringup.md)).

### RISC-V

The same shape with fewer steps. `_start` in
[`src/arch/riscv/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/head.S)
sets the global pointer and stack and does `jal init_kernel` with the
arguments in `a0` to `a5` (and the hart ID in `a6` on SMP).
`try_init_kernel()` in `src/arch/riscv/kernel/boot.c` runs
`map_kernel_window()`, `init_cpu()` (trap vector `stvec`, FPU),
`init_plat()` (the PLIC, [RISC-V interrupts](../concepts/riscv-interrupts.md)),
`arch_init_freemem()`, then the same generic sequence from
`create_root_cnode()` to `bi_finalise()`.

### x86

x86 does more itself, because nothing like the elfloader runs first.

1. `_start` in [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S),
   in 32-bit code: saves the Multiboot magic and information pointer,
   then `common_init`: checks for required CPU features (huge pages,
   PCID and `syscall` where configured), `setup_pml4` builds boot page
   tables and `enable_x64_mode` turns on long mode and paging
   ([x86 paging](../concepts/x86-paging.md)). A far jump reaches
   `_start64`, then `_entry_64` at the kernel's high virtual address
   sets the stack and jumps to `boot_sys`.
2. `boot_sys()` in [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c):
   by the magic number calls `try_boot_sys_mbi1()` or
   `try_boot_sys_mbi2()`, which parse the kernel command line
   (`cmdline_parse()`), find the boot module, add each usable region of
   the memory map with `add_mem_p_regs()`, and find the ACPI RSDP
   (`acpi_init()` for Multiboot 1; Multiboot 2 can supply it in a tag).
3. `try_boot_sys()`:
   1. `x86_cpuid_initialize()`, a check that the CPU matches the
      configured micro-architecture, Meltdown-related checks
      ([CPUID and MSRs](../concepts/cpuid-and-msrs.md));
   2. `copy_boot_code_aps()` on SMP: copy the trampoline for other cores
      to low memory;
   3. `pic_remap_irqs()` and, when using the I/O APIC, `pic_disable()`
      ([8259 PIC](../concepts/pic-8259.md));
   4. `acpi_validate_rsdp()`, `acpi_fadt_scan()`, `acpi_dmar_scan()`
      ([IOMMU](../concepts/iommu.md)), `acpi_madt_scan()` for the list of
      CPUs and I/O APICs ([APIC](../concepts/apic.md));
   5. `load_boot_module()`: check the root task ELF and load it just
      after the modules (`elf_load()`), yielding `ui_info` (physical
      region, `pv_offset`, entry point);
   6. `platAddDevices()`;
   7. `try_boot_sys_node(cpus[0])`: `map_kernel_window()`,
      `map_skim_window()`, then `init_cpu()` (`init_vm_state()`,
      `init_dtrs()` for GDT, IDT and TSS, the `syscall`/`sysenter` MSRs,
      SMEP/SMAP, FPU, `apic_init()` which also calibrates the
      [local APIC timer](../concepts/lapic-timer.md), VT-x), then
      `init_sys_state()`;
   8. `ioapic_init()`, and on SMP `clh_lock_init()`, `start_boot_aps()`.
4. `init_sys_state()` in [`src/arch/x86/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot.c)
   is x86's equivalent of the second half of `try_init_kernel()`:
   `arch_init_freemem()`, `create_root_cnode()`, the
   `seL4_CapIOPortControl` capability, `create_domain_cap()`,
   `init_irqs()`, `tsc_init()` ([TSC](../concepts/tsc.md)),
   `populate_bi_frame()` and the extra BootInfo chunks (VBE information,
   the ACPI RSDP, the framebuffer, the Multiboot memory map, the TSC
   frequency), then the same generic sequence through
   `create_initial_thread()`, `create_untypeds()` and device untypeds.
5. Back in `boot_sys()`: `schedule(); activateThread();` and return to
   assembly, which exits to the root task.

## Gotchas

- Boot failures are silent in release builds: every step returns
  `false` up to `fail()`, and the messages that say which step failed are
  `printf`s that exist only with `KernelPrinting`. Debug a boot problem
  with a debug kernel.
- The serial port is only usable after it is mapped: on Arm and RISC-V
  nothing can be printed before `map_kernel_window()` and `init_cpu()`
  finish, so a hang before that looks like a dead machine.
- On Arm and RISC-V the kernel trusts the build-time memory map. If the
  loader put the user image or DTB outside `avail_p_regs[]`, or the
  machine has less RAM than the device tree said, `init_freemem()` fails
  or the kernel later touches memory that is not there.
- The kernel's physical load address is fixed at build time
  (`physBase()`); the loader must put it exactly there. The user image,
  by contrast, can be anywhere: that is what `pv_offset` expresses.
- The number of untypeds reported is capped by
  `CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS` (default 230; 50 in the verified
  x86 configuration). A fragmented memory map (common on x86 firmware and
  clouds) can exceed it; the kernel then drops regions with a warning in
  debug builds.
- The root CNode must hold a capability for every frame of the user
  image plus every untyped. A large root task needs a larger
  `KernelRootCNodeSizeBits`, or `provide_cap()` fails and boot aborts.
- x86 reads ACPI tables before its own page tables are final and assumes
  the firmware's tables are within the boot mappings; hypervisors and
  clouds that put tables in unusual places expose this.
- Secondary cores take a different path
  (`try_init_kernel_secondary_core()`, `boot_node()` on x86) that only
  initialises per-core state. A new per-CPU initialisation step has to be
  added to both paths.

## See also

- [Boot code and the proof boundary](boot-code.md): what `BOOT_CODE` means for a patch
- [Elfloader](elfloader.md): what runs before `init_kernel` on Arm and RISC-V
- [BootInfo and the root task](bootinfo-and-root-task.md): the result, as the root task sees it
- [x86 boot](../concepts/x86-boot.md) and [Arm boot](../concepts/arm-boot.md): firmware and boot loaders up to the kernel's entry
- [SMP bring-up](../concepts/smp-bringup.md): starting the other cores
- [Untyped memory](untyped-memory.md): what `create_untypeds()` produces
- [Generated code](generated-code.md): where `avail_p_regs[]` and `kernel_device_frames[]` come from
- [Porting to a platform](platform-port.md): the boot steps a new platform has to get right
- [ELF and linking](../concepts/elf.md): ELF is the file format of every kernel, loader and user program in an seL4 system
- [Debugging](debugging.md): the tools for finding out why an seL4 system misbehaves
- [Microkit internals](microkit-internals.md): how the `microkit` tool turns a system description into a boot image
- [Source layout](source-layout.md): A tour of the `seL4/seL4` repository

## References

- [seL4 `src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c):
  `ndks_boot`, `rootserver`, and the helper functions tabulated above
  (function list read; bodies mostly not re-read today). *Checked 2026-11-14.*
- [seL4 `src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c):
  `init_kernel()` and the call sequence of `try_init_kernel()`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/head.S):
  `_start` up to `bl init_kernel` and `b restore_user_context`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/riscv/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/kernel/boot.c)
  and [`src/arch/riscv/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/riscv/head.S):
  the arguments and call sequence. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S):
  `_start`, `common_init`, `setup_pml4`, `enable_x64_mode`, `_entry_64`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c):
  `boot_sys()`, `try_boot_sys_mbi1/2()`, `try_boot_sys()`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot.c):
  `init_cpu()` and `init_sys_state()`. *Checked 2026-11-14.*
- [seL4 `config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake):
  `KernelMaxNumBootinfoUntypedCaps` (default 230), `KernelRootCNodeSizeBits`.
  *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
