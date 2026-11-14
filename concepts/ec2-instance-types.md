# EC2 instance types

> How to read an EC2 instance type name (`m7g.large`, `c5n.metal`) and what it implies for a kernel: CPU vendor and generation, hypervisor, boot modes, and whether it is bare metal.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Cloud platforms](../INDEX.md#cloud-platforms) · ← [Amazon EC2 and the Nitro system](ec2.md) · [Google Compute Engine](gce.md) →

Read first: [Amazon EC2 and the Nitro system](ec2.md).

| At a glance | |
|---|---|
| Kind | Naming scheme for EC2 machine configurations |
| Name parts | Series, generation, options, size: `c7gn.xlarge` |
| Architecture | x86 (Intel, AMD) and Arm (Graviton, option `g`) |
| Hypervisor | Nitro; Xen on `t2`, `m4`, `c4`, `r4`; none on `metal` |
| Boot modes | Both on virtual x86 Nitro types; `uefi` on Graviton; `legacy-bios` only on Xen and the x86 metal types tried |
| Look up with | `aws ec2 describe-instance-types` |
| seL4 config | `KernelLAPICMode=X2APIC` and a larger `KernelMaxNumIOAPIC` on metal ([`config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake)) |
| seL4 use | `pc99` for all x86 types; no upstream platform for Graviton |

## What it is

An instance type is EC2's name for one machine configuration. The name
is the only handle a porter has on "which hardware will my kernel
meet", so it is worth decoding exactly.

### Reading a name

```
   c   7   g n  .  xlarge
   |   |   | |       |
series | options    size
   generation
```

- **Series**: what the machine is shaped for. `T` burstable, `M` general
  purpose, `C` compute optimised (less memory per vCPU), `R` memory
  optimised, `I` storage optimised (big local NVMe), `X`/`U`/`Z` high
  memory, `G`/`P` GPU, `A` the first Graviton. The series changes the
  memory and devices, not the kind of machine a kernel sees.
- **Generation**: a number that rises with each new host design. It is
  the main clue to the CPU model, and it is per series and vendor: a
  `c7i` and a `c7a` are different servers.
- **Options**, any combination:

  | Letter | Meaning | Matters to a kernel because |
  |---|---|---|
  | `a` | AMD processor | CPU features, timer behaviour (below) |
  | `g` | AWS Graviton (Arm) processor | a different architecture |
  | `i` | Intel processor (none of the three in old names means Intel) | |
  | `d` | instance store volumes | extra [NVMe](nvme.md) controllers |
  | `n` | network and EBS optimised | same [ENA](ena.md), more bandwidth and queues |
  | `b` | block storage optimised | |
  | `e` | extra storage or memory | |
  | `z` | high CPU frequency | |
  | `flex` | Flex: cheaper, not always full CPU performance | shared CPU, like `T` |

- **Size**: `nano`, `micro`, `small`, `medium`, `large`, `xlarge`,
  `2xlarge` ... A `large` is 2 vCPUs, and each step doubles. A vCPU is
  a hardware thread on most Intel and older AMD types, so `large` is one
  core with two threads; on Graviton and on `m7a` and later AMD types a
  vCPU is a whole core. `metal` means the whole server with
  no hypervisor; newer families also have sized metal (`metal-24xl`).

So `m6id.xlarge` is general purpose, 6th generation, Intel, with local
NVMe, 4 vCPUs; `c5n.metal` is a compute-optimised 5th-generation Intel
server with fast networking, bare.

### Generations that matter

Marks: **obs** = seen on a booted instance of the type in brackets,
2026; **doc** = from AWS's specification tables and hypervisor and
boot mode lists (References), not booted.

| Types | CPU | Hypervisor | Boot modes | Mark |
|---|---|---|---|---|
| `t2`, `m4`, `c4`, `r4` | Intel Xeon E5 v3 (`m4`, `c4`) or v4 (Broadwell: `r4`, `t2.medium`) | Xen | `legacy-bios` only | obs (t2.micro: Xen, BIOS only); CPU doc |
| `t3`, `m5`, `c5`, `r5` | Intel Skylake or Cascade Lake Xeon (8259CL, 8275CL) | Nitro | both | obs (t3.micro, c5.large) |
| `m6i`, `c6i`, `r6i` | Intel Ice Lake | Nitro | both | doc |
| `m7i`, `c7i`, `r7i` | Intel Sapphire Rapids (8488C) | Nitro | both | obs (c7i.large) |
| `m8i`, `c8i`, `r8i` | Intel Granite Rapids (6975P-C) | Nitro | both | obs (m8i.large) |
| `t3a`, `m5a`, `c5a` | AMD EPYC Zen 1 (7571); `c5a` second-generation EPYC (7R32; doc) | Nitro | both | obs (t3a.micro) |
| `m6a`, `c6a`, `r6a` | AMD EPYC Zen 3 (7R13) | Nitro | both | obs (m6a.large) |
| `m7a`, `c7a`, `r7a` | AMD EPYC Zen 4 (9R14) | Nitro | both | obs (m7a.medium) |
| `m8a`, `c8a` | AMD EPYC, 5th generation (9R45) | Nitro | both | doc |
| `a1` | Graviton (1): 16 Cortex-A72 cores | Nitro | `uefi` | doc |
| `t4g`, `m6g`, `c6g`, `r6g` | Graviton2: Neoverse N1 | Nitro | `uefi` | obs (t4g.small) |
| `m7g`, `c7g`, `r7g` | Graviton3: Neoverse V1, SVE 256-bit | Nitro | `uefi` | obs (c7g.medium) |
| `m8g`, `c8g`, `r8g` | Graviton4: Neoverse V2, SVE 128-bit | Nitro | `uefi` | obs (c8g.medium) |
| `m9g` | Graviton5, SVE | Nitro | `uefi` | obs (m9g.medium) |

AWS documents that Graviton types default to UEFI and Intel and AMD
types to legacy BIOS (the boot modes page in References); the supported
modes per type come from `describe-instance-types`. `.metal` exists for
most `m`, `c`, `r` and `i` families from the 5th generation on, not for
`t` types, and not for every AMD family (`m5a`, `c5a` and `r5a` have
none). The x86 metal types
tried (`c5n.metal`, `c7i.metal-24xl`) offered `legacy-bios` only
(observed 2026).

### What differs for a kernel

**Intel or AMD.** The virtual machine around the CPU is the same (see
the table in [EC2](ec2.md)); the CPU features are not.

- The Intel types have TSC-deadline mode for the
  [local APIC timer](lapic-timer.md); `t3a`, `m6a` and `m7a` do not, so
  a kernel that sets deadlines must convert to APIC timer ticks at a
  measured ratio (observed 2026).
- `t3a` (Zen 1) lacks PCID and does not advertise x2APIC; the later AMD
  types have both (observed 2026).
- All have an invariant [TSC](tsc.md) and publish its frequency in
  CPUID leaf `0x40000010`
  ([Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md)).
- Nested virtualisation (VT-x visible to the guest) is offered only on
  the 7th and 8th generation Intel types, as a launch option (observed
  on m8i.large, 2026). Elsewhere a virtual instance has no VT-x or SVM.

**Virtual or metal.** A `metal` type is the physical server:

| | Virtual | Metal |
|---|---|---|
| Hypervisor CPUID leaves, kvm-clock | present | absent |
| CPUs | 1 to a few vCPUs | all of them: 72 threads on c5n.metal, 192 cores on m9g.metal-48xl |
| Virtualisation | none (or nested, above) | VT-x on x86; entry at EL2 on Graviton |
| x86 local APICs | xAPIC at entry | x2APIC already enabled by firmware |
| x86 I/O APICs | 1 | 9 on c5n.metal |
| IOMMU | none | VT-d on c5n.metal |
| Console | COM1 on x86 | memory-mapped PCI 16550, address in `SPCR` |
| Graviton [PSCI](psci-smccc.md) conduit | `hvc` | `smc` |
| Graviton GIC | v3, 96 SPIs, one ITS | v3 on m6g.metal, v4 or v4.1 later; 960 SPIs; up to 6 ITSs |
| Boot time | seconds | several minutes of firmware |

(All observed 2026 on c5n.metal, m6g.metal, m7g.metal, m8g.metal-24xl
and m9g.metal-48xl.) Metal ACPI tables are also much larger: the DSDT of
c5n.metal is over 3 MiB.

**Burstable `T` types.** A `t` instance earns CPU credits while idle and
spends them when busy; with none left it is held to its baseline share
of the CPU, or billed extra in "unlimited" mode. The hardware seen is that of the
matching `m` generation (`t3` like `m5`, `t3a` like `m5a`, `t4g` like
`m6g`). The practical effect on a kernel is noise: time taken from the
vCPU during a calibration loop gives a wrong answer. A t3a.micro
measured its TSC 1% high against the [PIT](pit.md) (observed 2026).

**Graviton generations.** Besides the core, they differ in generic
timer frequency (121.87 MHz, 1050 MHz, 1000 MHz, 1000 MHz for
Graviton2 to 5), in SVE (none on Graviton2; a kernel that saves FPU
state must know the vector length, see [FPU state](fpu-state.md)), and
in device addresses: Graviton2 and 3 virtual instances share one memory
layout, Graviton4 and 5 another (observed 2026).

### Types for bring-up

Small, cheap and each covering a different case (prices vary by region:
look them up):

- `t3.micro`: Intel, Nitro, both boot modes. 1 GiB of RAM, so no 1 GiB
  page can be mapped.
- `t3a.micro`: the same on AMD without TSC-deadline, PCID or x2APIC:
  the best test of fallback paths.
- `c7i.large` or `m8i.large`: current Intel, a PCIe hierarchy, nested
  virtualisation on request.
- `m7a.medium`: current AMD with a single vCPU.
- `t4g.small`, `c7g.medium`, `c8g.medium`: Graviton2, 3 and 4.
- `t2.micro`: only to check Xen.
- Metal: use spot pricing and expect capacity to be missing on some
  days; smaller sized metal (`metal-24xl`) is cheaper than `.metal`.

### Looking facts up

`aws ec2 describe-instance-types --instance-types t3.micro` returns a
record per type. The fields that answer a porter's questions:

| Field | Tells you |
|---|---|
| `Hypervisor` | `nitro` or `xen` |
| `BareMetal` | true for metal types |
| `SupportedBootModes` | `legacy-bios`, `uefi` |
| `ProcessorInfo` | `SupportedArchitectures`, `Manufacturer`, clock speed |
| `VCpuInfo` | default vCPUs, cores, threads per core |
| `NetworkInfo.EnaSupport` | whether the NIC is an ENA |
| `EbsInfo.NvmeSupport`, `InstanceStorageInfo` | NVMe for EBS; local disks |
| `NitroTpmSupport`, `BurstablePerformanceSupported` | TPM; credit model |

`describe-instance-type-offerings` says which zones have a type.

## In seL4

Nothing in seL4 knows about instance types; what matters is which
kernel configuration each needs.

- All x86 types use the `pc99` platform. Virtual types boot with the
  defaults. Single-vCPU types need a one-core build, and types with
  1 GiB of RAM cannot pass tests that want a 1 GiB frame. Metal needs
  `KernelLAPICMode=X2APIC` and a larger `KernelMaxNumIOAPIC`
  ([`src/arch/x86/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake)),
  and can use `KernelVTX` and the IOMMU support, which virtual types
  cannot.
- With the [MCS](../sel4/mcs.md) kernel, AMD types exercise the APIC
  timer ratio path and Intel types the TSC-deadline path: see
  [Timer calibration](timer-calibration.md).
- Graviton types have no upstream platform. A port fixes memory map,
  GIC and UART addresses and timer frequency at build time, so one
  kernel image fits one layout: see
  [Porting to a platform](../sel4/platform-port.md).

## Gotchas

- **The generation number does not align across vendors.** `m7i`,
  `m7a` and `m7g` share nothing but the 7.
- **A missing processor letter means Intel** in older names (`m5`,
  `c5`), and `m5a` is AMD; from the 6th generation Intel types say `i`.
- **`g` is overloaded**: `m7g` is Graviton, but the `G` series (`g5`)
  is GPU, and `g5g` is a GPU type on Graviton.
- **Two instances of one type can have different CPUs.** `t3` and `m5`
  are either Skylake or Cascade Lake; do not hard-code a
  frequency for a type.
- **Metal types of one family are not alike.** No two Graviton metal
  generations shared a memory layout or GIC version (observed 2026).
- **vCPU limits are per account, per region and per family group**,
  and the default is small (5 vCPUs for the standard families); a
  96-vCPU metal type needs a quota increase first.

## See also

- [Amazon EC2 and the Nitro system](ec2.md): the machine itself
- [Compute Engine machine types](gce-machine-types.md): Google's naming
- [Hypervisor CPUID leaves](hypervisor-cpuid-leaves.md): telling virtual from metal at run time
- [Timer calibration](timer-calibration.md): why Intel and AMD types differ
- [x86 paging](x86-paging.md): PCID, which `t3a` lacks
- [GICv3 and the ITS](gicv3-its.md): the Graviton interrupt controller

## References

- [EC2 instance types guide, "Amazon EC2 instance type naming conventions"](https://docs.aws.amazon.com/ec2/latest/instancetypes/instance-type-names.html):
  the series and option letters. *Checked 2026-11-14.*
- [EC2 User Guide, "Instance launch behavior with Amazon EC2 boot modes"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ami-boot.html):
  default boot mode per processor family. *Checked 2026-11-14.*
- [EC2 User Guide, "Prerequisites for the EC2 Serial Console"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-serial-console-prerequisites.html):
  that bare metal types are a documented category with exceptions.
  *Checked 2026-11-14.*
- [AWS CLI reference, `describe-instance-types`](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instance-types.html):
  the fields of the record and their values. *Checked 2026-11-14.*
- EC2 instance types guide, specifications for
  [general purpose](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html),
  [compute optimized](https://docs.aws.amazon.com/ec2/latest/instancetypes/co.html),
  [memory optimized](https://docs.aws.amazon.com/ec2/latest/instancetypes/mo.html)
  and [previous generation](https://docs.aws.amazon.com/ec2/latest/instancetypes/pg.html)
  instances: the processor of each type, and which families have
  `metal` sizes. *Checked 2026-11-14.*
- Amazon EC2 instance type pages for
  [T3](https://aws.amazon.com/ec2/instance-types/t3/),
  [M5](https://aws.amazon.com/ec2/instance-types/m5/) and
  [M8a](https://aws.amazon.com/ec2/instance-types/m8a/): Skylake or
  Cascade Lake on `t3` and `m5`; 5th-generation EPYC on `m8a`.
  *Checked 2026-11-14.*
- [EC2 User Guide, "Supported CPU options for Amazon EC2 instance types"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/cpu-options-supported-instances-values.html):
  threads per core of each type. *Checked 2026-11-14.*
- [EC2 User Guide, "Amazon EC2 instance types"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-types.html),
  "Hypervisor type", and
  ["Requirements to launch an EC2 instance in UEFI boot mode"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/launch-instance-boot-mode.html):
  the Xen and Nitro families; both boot modes on Nitro types except
  bare metal and a few others. *Checked 2026-11-14.*
- EC2 User Guide, ["Key concepts for burstable performance instances"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html)
  and ["Unlimited mode"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode.html):
  CPU credits, the baseline, and the surplus charge.
  *Checked 2026-11-14.*
- [EC2 User Guide, "Purchasing On-Demand Instances for Amazon EC2"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-on-demand-instances.html),
  "On-Demand Instance quotas": vCPU quotas per account, region and
  family group. *Checked 2026-11-14.*
- [Wikipedia, "AWS Graviton"](https://en.wikipedia.org/wiki/AWS_Graviton):
  the 16 Cortex-A72 cores of the first Graviton. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/config.cmake`](https://github.com/seL4/seL4/blob/master/src/arch/x86/config.cmake):
  `KernelLAPICMode`, `KernelMaxNumIOAPIC`. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
