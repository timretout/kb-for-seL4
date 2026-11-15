# CPUID and MSRs (model-specific registers)

> How x86 software discovers what the processor can do (the `cpuid` instruction) and reaches the hundreds of control registers that have no instruction of their own (`rdmsr`/`wrmsr`); seL4 checks features at boot and programs a dozen MSRs.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [x86-64](../INDEX.md#x86-64) · ← [x86-64 basics](x86-64-basics.md) · [x86-64 paging](x86-paging.md) →

Read first: [x86-64 basics](x86-64-basics.md).

| At a glance | |
|---|---|
| Kind | Feature discovery instruction (`cpuid`) and control registers with no instruction of their own (MSRs) |
| Architecture | x86 |
| Reached through | Instructions: `cpuid` in any ring; `rdmsr` and `wrmsr` in ring 0 only |
| Key numbers | Leaf ranges from `0x0`, `0x40000000` and `0x80000000`; an MSR is 64 bits, named by a 32-bit index |
| seL4 code | [`include/arch/x86/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine.h), [`src/arch/x86/machine/cpu_identification.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/machine/cpu_identification.c) |
| seL4 config | `KernelX86MicroArch`, `KernelSyscall`, `KernelFSGSBase`, `KernelSupportPCID` and others |
| seL4 use | Checks features at boot and stops if one is missing; programs a dozen MSRs |
| On the clouds | A hypervisor can hide feature bits and refuse MSRs; VMX is hidden unless nested virtualisation is enabled |

## What it is

x86 grew by accretion, so two processors of the same year can differ
in dozens of features, and a hypervisor can hide more. Software asks
with `cpuid` and then configures what it found, mostly through MSRs.
The architecture facts here are from the Intel manual; MSR numbers and
CPUID bits are also quoted from seL4.

### CPUID

`cpuid` takes a **leaf** number in `eax` and, for some leaves, a
**subleaf** in `ecx`, and returns four 32-bit words in `eax`, `ebx`,
`ecx`, `edx`. It works in any ring. Leaves come in three ranges:

| Range | What | Maximum leaf from |
|---|---|---|
| `0x0` up | basic | leaf `0x0`, EAX |
| `0x40000000` up | hypervisor, software-defined | leaf `0x40000000`, EAX |
| `0x80000000` up | extended (introduced by AMD) | leaf `0x80000000`, EAX |

Leaves worth knowing:

| Leaf | Returns |
|---|---|
| `0x0` | vendor string in EBX, EDX, ECX: `GenuineIntel`, `AuthenticAMD` |
| `0x1` | EAX: family, model, stepping; ECX and EDX: feature bits |
| `0x7`, subleaf 0 | more feature bits (FSGSBASE, SMEP, SMAP, INVPCID, speculation controls) |
| `0xD` | XSAVE state components and sizes ([FPU state](fpu-state.md)) |
| `0x15`, `0x16` | TSC and core frequency, where present ([TSC](tsc.md)) |
| `0x80000001` | AMD-origin features: SYSCALL, NX, 1 GiB pages |
| `0x80000008` | physical and virtual address widths |

Feature bits seL4 reads (leaf, register, bit), with the bit numbers
taken from seL4's source where it tests them directly:

| Feature | Where |
|---|---|
| PAT | leaf 1, EDX bit 16 |
| VMX | leaf 1, ECX bit 5 |
| PCID | leaf 1, ECX bit 17 |
| x2APIC | leaf 1, ECX bit 21 |
| TSC deadline timer | leaf 1, ECX bit 24 (`CPUID_TSC_DEADLINE_BIT`) |
| XSAVE | leaf 1, ECX bit 26 |
| "running under a hypervisor" | leaf 1, ECX bit 31 |
| FSGSBASE, SMEP, INVPCID, SMAP | leaf 7, EBX bits 0, 7, 10, 20 |
| IBRS/IBPB, `IA32_ARCH_CAPABILITIES` present | leaf 7, EDX bits 26, 29 |

The displayed family and model are assembled from base and extended
fields of leaf 1 EAX by a rule that differs slightly between Intel and
AMD. The hypervisor range is covered in
[Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md).

### MSRs

A **model-specific register** is a 64-bit register named by a 32-bit
index. `rdmsr` reads the MSR whose index is in `ecx` into `edx:eax`
(high and low halves); `wrmsr` writes `edx:eax` to it. Both are ring 0
only, and both raise a general protection fault (#GP) if the index does
not exist or a reserved bit is written. Despite the name, many are now
architectural (Intel prefixes those `IA32_`). The ones a kernel meets:

| MSR | Index | Purpose |
|---|---|---|
| `IA32_APIC_BASE` | `0x1B` | local [APIC](apic.md) base address, enable and x2APIC mode bits |
| `IA32_FEATURE_CONTROL` | `0x3A` | firmware's lock on VMX |
| `IA32_SPEC_CTRL` | `0x48` | speculation controls: IBRS (bit 0), STIBP (bit 1) |
| `MSR_PLATFORM_INFO` | `0xCE` | Intel only: bits 15 to 8 give the TSC frequency as a multiple of the bus clock |
| `IA32_ARCH_CAPABILITIES` | `0x10A` | which speculation bugs this CPU lacks, e.g. `RDCL_NO` (no Meltdown) |
| `IA32_SYSENTER_CS/ESP/EIP` | `0x174` to `0x176` | `sysenter` entry point |
| `IA32_PAT` | `0x277` | page attribute table ([paging](x86-paging.md)) |
| `IA32_VMX_*` | `0x480` up | VMX capabilities ([x86 virtualisation](x86-virtualisation.md)) |
| `IA32_TSC_DEADLINE` | `0x6E0` | [LAPIC timer](lapic-timer.md) deadline |
| x2APIC registers | `0x800` up | the local APIC in x2APIC mode |
| `IA32_EFER` | `0xC0000080` | long mode, `syscall` and NX enables |
| `STAR`, `LSTAR`, `CSTAR`, `FMASK` | `0xC0000081` to `84` | `syscall` selectors, 64-bit entry point, compatibility entry point, flag mask |
| `FS_BASE`, `GS_BASE`, `KERNEL_GS_BASE` | `0xC0000100` to `102` | segment bases; the third is what `swapgs` exchanges with `GS_BASE` |

See [x86 exceptions and system calls](x86-exceptions-syscalls.md) for
how the `syscall` MSRs are used.

### Under a hypervisor

In a virtual machine `cpuid` always exits to the hypervisor on Intel,
which answers with whatever it wants the guest to see: it
can clear feature bits (VMX is hidden on a cloud instance unless nested
virtualisation is enabled), cap the maximum leaf, and add the `0x40000000` range. MSR
accesses are filtered through a bitmap: each MSR is either passed
through, emulated, or refused with #GP. So "the CPU model has it" does
not mean "this VM has it", for both features and MSRs.

## In seL4

- **Wrappers.** `x86_cpuid_eax(leaf, subleaf)` and its `ebx`, `ecx`,
  `edx` siblings, and `x86_rdmsr()`/`x86_wrmsr()`, are in
  [`include/arch/x86/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine.h),
  which also defines the MSR indices (`IA32_*_MSR`).
  `x86_rdmsr_safe()` reads an MSR that might not exist: the #GP handler
  recognises it and returns `.success = false`.
- **Identification.**
  [`src/arch/x86/machine/cpu_identification.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/machine/cpu_identification.c):
  `x86_cpuid_initialize()` reads the vendor string and leaf 1, and
  applies the Intel or AMD family/model rule. Only Intel and AMD are
  recognised; any other vendor gets a boot warning, not a failure.
  `is_compiled_for_microarchitecture()` in
  [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c)
  compares the model with the build's `KernelX86MicroArch` (`generic`,
  `nehalem` ... `skylake`, which selects compiler `-march` flags) and
  only warns on a mismatch.
- **Hard requirements, checked before C runs.**
  [`src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S)
  has `huge_page_check`, `pcid_check`, `invpcid_check`, `syscall_check`
  and `fsgsbase_enable`. Each runs `cpuid` for a feature the build was
  configured to use and, if it is missing, prints a line such as
  "PCIDs not supported by the processor" and hangs.
- **Checked in C.** `init_cpu()` in
  [`src/arch/x86/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot.c)
  enables SMEP and SMAP if leaf 7 offers them, sets `CR0.WP`, and
  programs the `syscall` or `sysenter` MSRs and PAT. `boot_sys.c`
  reads `IA32_ARCH_CAPABILITIES`: if the CPU reports it is vulnerable
  to Meltdown and `KernelSkimWindow` is off, the kernel refuses to
  boot. `src/arch/x86/machine/hardware.c` checks IBRS support against
  `KernelX86IBRSMode`; `src/arch/x86/machine/fpu.c` checks XSAVE (leaf
  1 ECX bit 26, then leaf `0xD`); `apic.c` and `x2apic.c` check TSC
  deadline and x2APIC.
- **Build options that assume a feature:**

  | Option | Choices | Needs |
  |---|---|---|
  | `KernelSyscall` | `syscall` (x86_64 only), `sysenter` | SYSCALL in leaf `0x80000001` |
  | `KernelFSGSBase` | `inst` (x86_64), `msr`, `gdt` (ia32) | FSGSBASE for `inst` |
  | `KernelSupportPCID` | on/off | PCID and INVPCID |
  | `KernelHugePage` | on/off | 1 GiB pages |
  | `KernelFPU`, `KernelXSave`, `KernelXSaveFeatureSet`, `KernelXSaveSize` | | XSAVE and the named variant |
  | `KernelX86IBRSMode` | `ibrs_none`, `ibrs_stibp`, `ibrs_basic`, `ibrs_all` | `IA32_SPEC_CTRL` |
  | `KernelLAPICMode` | `XAPIC`, `X2APIC` | x2APIC |
  | `KernelVTX` | on/off | VMX, unlocked in `IA32_FEATURE_CONTROL` |

  These are build-time, not run-time, choices: seL4 does not adapt to
  the CPU, it checks and stops.
- **TSC frequency.** `tsc_init()` in
  [`src/plat/pc99/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c)
  tries `MSR_PLATFORM_INFO` (seL4 calls it `IA32_PLATFORM_INFO_MSR`)
  with `x86_rdmsr_safe()` on a list of known Intel models and
  otherwise measures against the [PIT](pit.md); see
  [timer calibration](timer-calibration.md).
- **User access.** User level can run `cpuid` itself. MSRs are not
  exposed, except through the debugging option `KernelX86DangerousMSR`,
  which adds unchecked `rdmsr`/`wrmsr` system calls and is excluded
  from verification builds.

## Gotchas

- **A missing feature means a hang with one line on the serial port**,
  printed by `head.S` through the legacy [UART](uart.md). On a cloud
  VM with no such UART there is no message at all. The usual culprits
  are `KernelSupportPCID` and `KernelFSGSBase=inst` on older or
  restricted virtual CPUs.
- **MSRs that "should be there" can fault under a hypervisor.** The
  comment in `tsc_init()` records `MSR_PLATFORM_INFO` raising #GP under
  KVM, which is why `x86_rdmsr_safe()` exists. A new MSR read in boot
  code should use it or be guarded by a CPUID bit.
- **`MSR_PLATFORM_INFO` is Intel-only and model-specific.** seL4 reads
  it only for listed Intel models; on AMD and unlisted models it falls
  back to PIT calibration.
- **CPUID leaves above the maximum return junk, not zero** on Intel
  (the data of the highest basic leaf). Check the maximum
  leaf first; seL4's direct reads of leaf 7 assume it exists.
- **The Meltdown check trusts the hypervisor's CPUID.** If a VM hides
  `IA32_ARCH_CAPABILITIES`, seL4 cannot tell and takes the `else`
  branch in `boot_sys.c`.

## See also

- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): the `0x40000000` range and what clouds put there
- [x86-64 basics](x86-64-basics.md): control registers and `EFER`
- [x86 exceptions and system calls](x86-exceptions-syscalls.md): the `syscall` and GS base MSRs in use
- [x86 paging](x86-paging.md): PCID, SMEP, SMAP and PAT
- [TSC](tsc.md) and [timer calibration](timer-calibration.md): finding the TSC frequency
- [APIC](apic.md): `IA32_APIC_BASE` and x2APIC's MSR interface
- [FPU state](fpu-state.md): XSAVE and CPUID leaf `0xD`
- [Cloud VMs](cloud-vms.md): which features each cloud's virtual CPUs show

## References

- [seL4 `include/arch/x86/arch/machine.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/machine.h):
  the MSR indices in the table (PAT's is in `machine/pat.h`) and the
  `x86_cpuid_*` wrappers. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/machine/cpu_identification.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/machine/cpu_identification.c):
  vendor string order (EBX, EDX, ECX), family/model rules, supported
  vendors. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c):
  `is_compiled_for_microarchitecture()` and the Meltdown check.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/64/head.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/head.S):
  the early feature checks and their messages. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot.c),
  [`src/arch/x86/machine/fpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/machine/fpu.c),
  [`src/arch/x86/kernel/x2apic.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/x2apic.c),
  [`src/arch/x86/object/vcpu.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/vcpu.c):
  SMEP/SMAP from leaf 7; XSAVE bit 26, x2APIC bit 21 and VMX bit 5 of
  leaf 1 ECX; PAT bit 16 of leaf 1 EDX is in `src/arch/x86/kernel/vspace.c`.
  *Checked 2026-11-14.*
- [seL4 `src/arch/x86/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake):
  the options in the table and `KernelX86DangerousMSR`.
  *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/hardware.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/hardware.c):
  `tsc_init()`, the platform info ratio field and the KVM comment.
  *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual, combined volumes](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
  ([PDF](https://cdrdv2.intel.com/v1/dl/getContent/671200), September 2026 edition; chapter numbers move between
  editions): volume 1, chapter 21 "Processor Identification and Feature
  Determination" (the leaf ranges, the leaves and feature bits above,
  leaf 1 ECX bit 31 "always 0, allocated for software emulation", what a
  leaf above the maximum returns); volume 2, the `CPUID`, `RDMSR` and
  `WRMSR` instruction references (privilege, #GP, `CPUID` always causing
  a VM exit); volume 4, chapter 2 "Model-Specific Registers (MSRs)",
  section 2.1 "Architectural MSRs" (the `IA32_` prefix, the MSRs in the
  table); volume 3, section 27.6.9 (MSR bitmaps). *Checked 2026-11-14.*
- [Linux `arch/x86/include/asm/cpufeatures.h`](https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/cpufeatures.h):
  the same bit numbers; names leaf 1 ECX bit 31 "Running on a
  hypervisor". *Checked 2026-11-14.*
- [Google Cloud, "About nested virtualization"](https://docs.cloud.google.com/compute/docs/instances/nested-virtualization/overview)
  and [Amazon EC2, "Use nested virtualization"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html):
  VT-x reaches a guest only when nested virtualisation is enabled for
  the instance. *Checked 2026-11-14.*
- [AMD64 Architecture Programmer's Manual, volume 3](https://www.amd.com/en/search/documentation/hub.html),
  appendix E "Obtaining Processor Information Via the CPUID
  Instruction". *Unchecked (amd.com's document pages need a browser).*
