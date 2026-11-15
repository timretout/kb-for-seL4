# PSCI and SMCCC (Power State Coordination Interface, SMC Calling Convention)

> Arm's standard way for a kernel to call firmware or a hypervisor (SMCCC: a function identifier in `x0`, then `SMC` or `HVC`), and the standard service built on it for starting, stopping and resetting cores (PSCI); seL4's loaders use it to start secondary cores and the kernel can pass calls through for user level.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [AArch64](../INDEX.md#aarch64) · ← [Arm boot flow](arm-boot.md) · [GICv2](gicv2.md) →

Read first: [AArch64 exceptions](aarch64-exceptions.md), [Arm boot flow](arm-boot.md).

| At a glance | |
|---|---|
| Kind | Firmware interface (a calling convention and a power management service) |
| Architecture | Arm |
| Reached through | `SMC` (to EL3) or `HVC` (to EL2), with a function identifier in `w0` |
| Found through | [Device tree](device-tree.md) `psci` node and its `method`; with ACPI, FADT flags |
| Key numbers | `CPU_ON` is `0x84000003` (SMC32) or `0xC4000003` (SMC64); PSCI is owner 4; results in `x0` to `x3` |
| seL4 code | [`src/arch-arm/psci.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/psci.c) (elfloader), [`src/arch/arm/object/smc.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/smc.c) |
| seL4 config | `KernelAllowSMCCalls` (AArch64 only, default off) |
| seL4 use | Loaders start secondary cores with `CPU_ON`; the kernel never calls PSCI but can pass `SMC` calls through for user level |

## What it is

On Arm, turning a core on or off, or resetting the machine, means
writing to a power controller that differs on every system-on-chip and
usually belongs to the secure world. Rather than have every kernel carry
a driver per chip, the firmware that stays resident at EL3 (BL31 of
Trusted Firmware-A, see [Arm boot flow](arm-boot.md)) offers these
operations as functions. Two specifications define how:

- **SMCCC**, the SMC Calling Convention (Arm DEN 0028), says how any
  such call is made: which instruction, which registers, how functions
  are numbered.
- **PSCI**, the Power State Coordination Interface (Arm DEN 0022), is
  one set of functions using that convention, for power management.

They play the role that ACPI sleep states, the INIT/SIPI sequence and
the keyboard-controller reset play on a PC, and the role SBI plays on
RISC-V ([RISC-V basics](riscv-basics.md)).

### SMCCC: making a call

The caller puts a 32-bit **function identifier** in `w0`, arguments in
`x1` onwards, and executes one of two instructions, each with immediate
0:

- `SMC` (secure monitor call) traps to EL3: firmware answers.
- `HVC` (hypervisor call) traps to EL2: a hypervisor answers.

Which one to use is the **conduit**. A kernel on bare metal uses `SMC`.
A guest in a virtual machine normally uses `HVC`, and the hypervisor
implements the functions itself or forwards them. A hypervisor can also
trap a guest's `SMC` (`HCR_EL2.TSC`) and emulate it. The conduit is not
discoverable by trying: `SMC` is undefined where there is no EL3, so the
platform description states it (below).

Results come back in `x0` to `x3`. Later versions of the convention let
an SMC64 call use `x1` to `x17` for arguments and `x0` to `x17` for
results; `x4` to `x17` are preserved unless the function returns results
in them (SMCCC 1.0 left them unpredictable). Code that passes calls
through blindly, as
seL4 does, treats `x0` to `x7` as in and out and `x8` to `x17` as
clobbered.

The function identifier is a bit field:

| Bits | Field | Meaning |
|---|---|---|
| 31 | Type | 1 = **fast call**: short, atomic, runs with interrupts masked. 0 = **yielding call**: may be pre-empted and resumed (used by trusted OSes) |
| 30 | Convention | 0 = SMC32 (32-bit arguments), 1 = SMC64 (64-bit arguments) |
| 29:24 | Owner | Which service: see below |
| 23:16 | | Zero for fast calls (from SMCCC 1.3, bit 16 is a hint that the caller has no live SVE state) |
| 15:0 | Function number | Within the owner's range |

| Owner | Service |
|---|---|
| 0 | Arm architecture calls (`SMCCC_VERSION` is `0x80000000`, `SMCCC_ARCH_FEATURES` `0x80000001`) |
| 1 | CPU services |
| 2 | SiP: the silicon vendor's own calls |
| 3 | OEM calls |
| 4 | Standard secure services: **PSCI lives here** |
| 5 | Standard hypervisor services |
| 6 | Vendor-specific hypervisor services |
| 48 to 49 | Trusted applications |
| 50 to 63 | Trusted OS |

So `0x84000000` reads as fast, SMC32, owner 4, function 0, and
`0xC4000003` as fast, SMC64, owner 4, function 3. An unknown function
returns -1 (`NOT_SUPPORTED`) in `x0`; the generic SMCCC error codes are
0 success, -1 not supported, -2 not required, -3 invalid parameter.

### PSCI functions

A function with address-sized arguments has two identifiers, SMC32 and
SMC64; a 64-bit kernel uses the SMC64 one.

| Function | SMC32 ID | SMC64 ID | Arguments | Effect |
|---|---|---|---|---|
| `PSCI_VERSION` | `0x84000000` | | none | Returns major version in bits 31:16, minor in 15:0 |
| `CPU_SUSPEND` | `0x84000001` | `0xC4000001` | power state, entry point, context ID | Calling core enters a low-power state; may return, or resume at the entry point |
| `CPU_OFF` | `0x84000002` | | none | Calling core powers off; does not return on success |
| `CPU_ON` | `0x84000003` | `0xC4000003` | target core, entry point, context ID | Starts another core |
| `AFFINITY_INFO` | `0x84000004` | `0xC4000004` | target, level | Is that core on (0), off (1) or coming on (2)? |
| `SYSTEM_OFF` | `0x84000008` | | none | Power the machine off |
| `SYSTEM_RESET` | `0x84000009` | | none | Cold reset |
| `PSCI_FEATURES` | `0x8400000A` | | function ID | Is that function implemented? (PSCI 1.0) |
| `SYSTEM_RESET2` | `0x84000012` | `0xC4000012` | type, cookie | Reset of a chosen kind (PSCI 1.1) |

`CPU_ON` is the one that matters for bring-up. The target is named by
the affinity fields of its `MPIDR_EL1` (the core's hardware identifier:
see [AArch64 basics](aarch64-basics.md)), not by a 0-based index; on a
simple four-core chip they happen to be 0 to 3, on others `0x100`,
`0x200` and so on. The entry point is a **physical** address. The new
core arrives there at the highest non-secure exception level the
firmware has enabled (EL2 where EL3 permits `HVC`, otherwise EL1),
normally the level the calling loader was itself entered at, with
the MMU and caches off, interrupts masked, and the context ID in `x0`
(PSCI DEN 0022 section 6.4, "Initial state after CPU_ON,
CPU_SUSPEND"). It has no stack, so
the entry code must find one itself.

Return codes, as a signed value in `x0`:

| Value | Name | Typical meaning |
|---|---|---|
| 0 | `SUCCESS` | |
| -1 | `NOT_SUPPORTED` | Function not implemented |
| -2 | `INVALID_PARAMETERS` | For `CPU_ON`: no such core |
| -3 | `DENIED` | |
| -4 | `ALREADY_ON` | Target core is already running |
| -5 | `ON_PENDING` | A `CPU_ON` for that core is in progress |
| -6 | `INTERNAL_FAILURE` | |
| -7 | `NOT_PRESENT` | |
| -8 | `DISABLED` | |
| -9 | `INVALID_ADDRESS` | Entry point not acceptable |

### How the conduit is advertised

In a [device tree](device-tree.md), by a `psci` node:

```
psci {
    compatible = "arm,psci-1.0", "arm,psci-0.2";
    method = "smc";          /* or "hvc" */
};
```

and each `cpu` node carries `enable-method = "psci"`. The oldest
version (`"arm,psci"`, PSCI 0.1) had no fixed function identifiers and
listed them in properties (`cpu_on = <...>`); from 0.2 the identifiers
above are fixed and those properties are ignored.

With [ACPI](acpi-tables.md), by two bits of the FADT's "ARM Boot
Architecture Flags" field: bit 0 `PSCI_COMPLIANT` and bit 1
`PSCI_USE_HVC`.

The alternative to PSCI for bring-up, on boards without it, is the
**spin table**: secondary cores sit in a firmware loop polling a memory
location (`cpu-release-addr`) for an address to jump to. See
[Multiprocessor bring-up](smp-bringup.md).

## In seL4

The kernel proper never calls PSCI: there is no PSCI code under `src/`.
On Arm the secondary cores are started by the loader before the kernel
runs, and the kernel has no power management or reset path.

### Elfloader

The [elfloader](../sel4/elfloader.md) starts secondary cores when
`CONFIG_MAX_NUM_NODES > 1` (`smp_boot` called from `continue_boot`).

- [`src/arch-arm/psci.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/psci.c)
  defines the identifiers (`SMC_FID_CPU_ON` is `0xc4000003` on AArch64,
  `0x80000003` on AArch32, which is not the standard `0x84000003`) and
  the wrappers `psci_version`, `psci_cpu_on`, `psci_cpu_off`,
  `psci_cpu_suspend`, `psci_system_reset`. Return codes are in
  [`include/arch-arm/psci.h`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/include/arch-arm/psci.h).
- [`psci_asm.S`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/armv/armv8-a/64/psci_asm.S)
  is the whole conduit: `psci_func` is `smc #0; ret`, since the C calling
  convention already has the arguments in `x0` to `x3`.
- [`drivers/smp-psci.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/drivers/smp-psci.c)
  is a driver matched on `"arm,psci-0.2"` and `"arm,psci-1.0"` in the
  device tree the elfloader was built with. `smp_psci_cpu_on` stores the
  C entry point and a stack in the global `secondary_data`, then calls
  `psci_cpu_on(cpu->cpu_id, &secondary_startup, 0)`.
  `secondary_startup` (in `crt0.S`) loads that stack and jumps to the
  entry. Because `secondary_data` is a single global, cores are started
  one at a time.
- If the `psci` node says `method = "hvc"` the driver prints "HVC is
  not supported for PSCI!" and fails. Its siblings `smp-spin-table.c`,
  `smp-imx6.c` and `smp-zynq7000.c` cover boards without PSCI.

![The elfloader on the boot core stores an entry point and a stack in `secondary_data` and calls `psci_cpu_on`, which executes `smc #0`; the EL3 firmware starts the secondary core at `secondary_startup`, which loads the stack and jumps to the C entry.](../images/psci-smccc-cpu-on.svg)

*One `CPU_ON` call as the elfloader makes it. The new core has no stack
until `secondary_startup` loads the one left for it.*

Microkit's loader has its own copy of the same logic in
[`loader/src/aarch64/cpus.c`](https://github.com/seL4/microkit/blob/main/loader/src/aarch64/cpus.c),
with a per-board table `psci_target_cpus` of `MPIDR` values
([Microkit internals](../sel4/microkit-internals.md)).

### The SMC capability

User level cannot execute `SMC` (it is undefined at EL0), yet drivers
sometimes need firmware services: a vendor's clock or pin control calls
(owner 2), or a virtual machine monitor forwarding a guest's PSCI calls.
With `KernelAllowSMCCalls` (`CONFIG_ALLOW_SMC_CALLS`, AArch64 only,
default off) the kernel makes the call on a thread's behalf:

- At boot, `init_smc` in
  [`src/arch/arm/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/kernel/boot.c)
  puts an SMC capability with badge 0 in the root task's slot
  `seL4_CapSMC` (15).
- `seL4_ARM_SMC_Call(cap, &args, &response)` takes and returns a
  `seL4_ARM_SMCContext`: eight words, `x0` to `x7`.
- `decodeARMSMCInvocation` in
  [`src/arch/arm/object/smc.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/smc.c)
  checks the badge, and `doSMC` loads the eight registers, executes
  `smc #0`, and copies `x0` to `x7` back into the caller's message
  registers.
- **The badge is the access control.** A capability with badge 0 allows
  any function identifier. Minting a copy with a non-zero badge
  restricts it to calls whose `x0` equals the badge exactly, and a badged
  capability cannot be re-badged (`Arch_updateCapData` in
  [`src/arch/arm/64/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/object/objecttype.c)).
  A driver that needs three functions gets three capabilities.

Microkit exposes this as the `smc` attribute of a protection domain and
`microkit_arm_smc_call`.

### Guests

When the kernel is a hypervisor
([Arm virtualisation](arm-virtualisation.md)), `HCR_EL2` for a guest
includes `HCR_TSC`
([`armv8-a/64/armv/vcpu.h`](https://github.com/seL4/seL4/blob/master/include/arch/arm/armv/armv8-a/64/armv/vcpu.h)),
so a guest's `SMC` traps to the kernel and reaches the virtual machine
monitor (VMM) at user level as a VCPU fault carrying the syndrome
(`handleVCPUFault`; see [Virtualisation support](../sel4/hypervisor.md)).
A guest's `HVC` takes a different path: the vector code in
[`traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S)
sends exception class `HVC64` to the same system-call entry as `SVC`,
so VMMs on seL4 usually advertise `method = "smc"` to their guests
(libvmm's example guest device trees do).
The VMM emulates PSCI itself: `CPU_ON` becomes "resume the thread behind
that virtual CPU at this entry point", `PSCI_VERSION` returns a
constant, and anything it wants the real firmware to do it forwards
through an SMC capability. The guest's device tree, written by the VMM,
names the conduit the VMM expects.

## Gotchas

- **`KernelAllowSMCCalls` weakens the kernel's guarantees**, and the
  option's help text says so: the kernel cannot pre-empt the secure
  monitor, so worst-case execution time is no longer bounded, and
  firmware at EL3 can change anything, so the proofs' assumptions no
  longer hold. An unbadged SMC capability is close to full control of the
  machine (it can call `SYSTEM_RESET` or `CPU_OFF`).
- **`CPU_ON` takes `MPIDR` values, not indices.** Passing 1, 2, 3 works on
  many boards and returns `INVALID_PARAMETERS` on those whose cores are
  numbered `0x100`, `0x200`; Microkit's per-board table exists for this.
- **`ALREADY_ON` after a warm restart.** If a previous system left
  secondary cores running (a reboot into a new image without a reset),
  `CPU_ON` returns -4 and the cores are still executing old code.
- **The elfloader supports only the `SMC` conduit.** A virtual machine
  that advertises `method = "hvc"`, which is what a guest under KVM
  normally sees, cannot start secondary cores with it as it
  stands.
- **Wrong conduit, wrong exception.** `SMC` with no EL3, or with EL3
  refusing it (`SCR_EL3.SMD`), is an undefined-instruction exception in
  the caller, not an error code.
- **A secondary core's entry state is the caller's level.** A loader
  that calls `CPU_ON` from EL2 and then drops the boot core to EL1 must
  drop each secondary too; both loaders run their exception-level code on
  every core.
- **SMC32 return values are 32-bit.** An error such as -1 arrives as
  `0x00000000ffffffff` in `x0` after an SMC32 call; compare it as a
  signed 32-bit value. The elfloader's `psci_func` returns `int` for
  this reason.

## See also

- [Arm boot flow](arm-boot.md): the firmware that answers these calls
- [Multiprocessor bring-up](smp-bringup.md): PSCI beside x86's INIT/SIPI and RISC-V's SBI HSM
- [RISC-V basics](riscv-basics.md): SBI, the RISC-V counterpart
- [AArch64 exceptions](aarch64-exceptions.md): how `SMC` and `HVC` trap
- [Arm virtualisation](arm-virtualisation.md): trapping a guest's `SMC`
- [Elfloader](../sel4/elfloader.md): where the secondary cores are started
- [Virtualisation support](../sel4/hypervisor.md): VMMs that emulate PSCI
- [Device trees](device-tree.md) and [ACPI tables](acpi-tables.md): where the conduit is advertised

## References

- [Arm Power State Coordination Interface, DEN 0022](https://developer.arm.com/documentation/den0022/latest):
  chapter 5 for each function (5.1.5 and 5.7 for `AFFINITY_INFO`),
  section 5.2.2 for return codes, 6.4 "Initial state after CPU_ON,
  CPU_SUSPEND" for core state on entry. *Checked 2026-11-14, issue E,
  read as the [PDF](https://documentation-service.arm.com/static/640f584656ea36189d4e94a4)
  because developer.arm.com refuses scripted fetches.*
- [Arm SMC Calling Convention, DEN 0028](https://developer.arm.com/documentation/den0028/latest):
  section 2.5 for the function identifier layout and conduits, 2.6 and
  2.7 for register use, 5.2 for the unknown-function result, chapter 6
  for owner ranges, 7.1 for return codes. *Checked 2026-11-14, version
  1.5 (issue F), read as the [PDF](https://documentation-service.arm.com/static/662766ae2f51dc4fe7262123)
  for the same reason.*
- [Arm Architecture Reference Manual for A-profile, DDI 0487](https://developer.arm.com/documentation/ddi0487/latest),
  the `SMC` instruction description and the rule on when `SMC` is
  undefined in section D1.4 (no EL3, or `SCR_EL3.SMD` set, and not
  trapped by `HCR_EL2.TSC`). *Checked 2026-11-14, issue M.d, read from a
  [mirror copy](https://kib.kiev.ua/x86docs/ARM/ARMARMv8/DDI0487M_d_a-profile_architecture_reference_manual.pdf)
  because developer.arm.com refuses scripted fetches.*
- [Linux `include/acpi/actbl.h`](https://github.com/torvalds/linux/blob/master/include/acpi/actbl.h):
  the FADT's `arm_boot_flags` field and its `ACPI_FADT_PSCI_COMPLIANT`
  and `ACPI_FADT_PSCI_USE_HVC` bits. *Checked 2026-11-14.*
- [QEMU `hw/arm/virt.c`](https://github.com/qemu/qemu/blob/master/hw/arm/virt.c):
  the `virt` machine's PSCI conduit is `HVC` unless the guest has EL2,
  and must be `HVC` under KVM. *Checked 2026-11-14.*
- [libvmm `examples/simple/board/qemu_virt_aarch64/linux.dts`](https://github.com/au-ts/libvmm/blob/main/examples/simple/board/qemu_virt_aarch64/linux.dts)
  (and the `odroidc4`, `maaxboard` and `zcu102` ones beside it): guest
  device trees with `method = "smc"`. *Checked 2026-11-14.*
- [Linux `include/uapi/linux/psci.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/psci.h):
  function numbers, which have 64-bit variants, return codes, version
  encoding. *Checked 2026-11-14.*
- [Linux `include/linux/arm-smccc.h`](https://github.com/torvalds/linux/blob/master/include/linux/arm-smccc.h):
  bit positions of type, convention and owner, owner values, generic
  return codes, the conduit enum. *Checked 2026-11-14.*
- [Linux device tree binding `arm/psci.yaml`](https://github.com/torvalds/linux/blob/master/Documentation/devicetree/bindings/arm/psci.yaml):
  `compatible` strings, `method`, the legacy function-ID properties.
  *Checked 2026-11-14.*
- [Booting AArch64 Linux](https://docs.kernel.org/arch/arm64/booting.html):
  `enable-method` `psci` and `spin-table` for secondary cores.
  *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/src/arch-arm/psci.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/psci.c)
  and [`drivers/smp-psci.c`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/src/arch-arm/drivers/smp-psci.c):
  the identifiers used and the `CPU_ON` driver. *Checked 2026-11-14.*
- [seL4 `src/arch/arm/object/smc.c`](https://github.com/seL4/seL4/blob/master/src/arch/arm/object/smc.c):
  `decodeARMSMCInvocation`, `doSMC`, the badge check.
  *Checked 2026-11-14.*
- [seL4 `src/arch/arm/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/arm/config.cmake):
  `KernelAllowSMCCalls` and its warning. *Checked 2026-11-14.*
- [seL4 `libsel4/sel4_arch_include/aarch64/interfaces/object-api-sel4-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/aarch64/interfaces/object-api-sel4-arch.xml):
  `seL4_ARM_SMC_Call`. *Checked 2026-11-14.*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md):
  `microkit_arm_smc_call` and the `smc` attribute. *Checked 2026-11-14.*
