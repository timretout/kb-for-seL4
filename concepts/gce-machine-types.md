# Compute Engine machine types

> How to read a Compute Engine machine type name such as `c4a-standard-2`, and what the series behind it decides for a kernel: architecture, CPU, network card, disk interface and bare-metal availability.

Read first: [Google Compute Engine](gce.md).

## What it is

A **machine type** names the virtual hardware of an instance. The name
has three parts:

```
  c  4  a  - standard - 2
  |  |  |      |        |
  |  |  |      |        +-- vCPUs (hardware threads, usually)
  |  |  |      +-- shape: memory per vCPU
  |  |  +-- vendor letter: none = Intel, d = AMD, a = Arm
  |  +-- generation
  +-- family letter
```

- **Family letter**: E (cheapest), N (general purpose), T (scale-out),
  C (compute, newest CPUs first), M (memory), H (HPC), Z (storage), A
  and G (GPUs).
- **Generation**: a rising number; a higher one means a newer CPU
  platform and, from 3 on, a different device set (below).
- **Vendor letter**: `d` for AMD EPYC and `a` for Arm are inferred from
  the comparison table, which never defines them; no letter is Intel,
  except that E2 may be either Intel or AMD.
- **Series** is the three together: `c4a`, `n2d`, `e2`.
- **Shape**: `standard` (about 4 GiB per vCPU), `highmem` (about 8),
  `highcpu` (about 2) (unchecked: ratios from memory, and they vary a
  little by series); `micro`, `small` and `medium` are the shared-core
  shapes of E2 and N1's `f1-micro`/`g1-small`.
- **Suffixes**: `-lssd` adds local SSDs; `-metal` is a bare-metal type
  with no hypervisor.

So `n2-standard-4` is N family, second generation, Intel, 4 vCPUs;
`c3d-highcpu-8` is C family, third generation, AMD, 8 vCPUs with less
memory; `t2a-standard-1` is the Arm scale-out series with one vCPU;
`e2-micro` is a shared-core E2.

### The series

From Google's machine family comparison table (checked 2026-11-14)
unless marked. "virtio" in the NIC column means virtio-net; the disk
column is the interface of the boot disk.

| Series | Arch | CPU platform | NIC | Disk | Nested virt. | Bare metal |
|---|---|---|---|---|---|---|
| N1 | x86 | Intel Sandy Bridge to Skylake | virtio, gVNIC | SCSI | yes | no |
| E2 | x86 | Intel Broadwell to Skylake, or AMD Rome/Milan | virtio, gVNIC | SCSI | no | no |
| N2 | x86 | Intel Cascade Lake, Ice Lake | virtio, gVNIC | SCSI | yes | no |
| N2D | x86 | AMD EPYC Rome, Milan | virtio, gVNIC | SCSI | no | no |
| T2D | x86 | AMD EPYC Milan | virtio, gVNIC | SCSI | no | no |
| C2 | x86 | Intel Cascade Lake | virtio, gVNIC | SCSI | yes | no |
| C2D | x86 | AMD EPYC Milan | virtio, gVNIC | SCSI | no | no |
| T2A | Arm | Ampere Altra (Neoverse N1) | gVNIC | NVMe | no | no |
| C3 | x86 | Intel Sapphire Rapids | gVNIC, IDPF | NVMe | yes | yes |
| C3D | x86 | AMD EPYC Genoa | gVNIC | NVMe | no | no |
| N4 | x86 | Intel Emerald Rapids | gVNIC | NVMe | yes | no |
| N4D | x86 | AMD EPYC Turin | gVNIC | NVMe | yes | no |
| N4A | Arm | Google Axion (Neoverse N3, observed) | gVNIC | NVMe | (unchecked) | no |
| C4 | x86 | Intel Emerald Rapids, Granite Rapids | gVNIC, IDPF | NVMe | yes | yes |
| C4D | x86 | AMD EPYC Turin | gVNIC, IDPF | NVMe | no | yes |
| C4A | Arm | Google Axion (Neoverse V2, observed) | gVNIC, IDPF | NVMe | no | yes |

The memory (M1 to M4), HPC (H3, H4D), storage (Z3) and GPU series
follow the same rule by generation and are left out.

The rule to remember: **first and second generation x86 series offer
virtio-net and virtio-scsi, with [gVNIC](gvnic.md) as an option; the
third generation and later, and every Arm series, are gVNIC and
[NVMe](nvme.md) only.** IDPF is the NIC of the bare-metal types. All
of them boot with UEFI (observed on N1, E2, N2D, C4, T2A, N4A and C4A,
2026).

**Nested virtualisation** means the guest is given VT-x (the `vmx`
CPUID flag), so that it can itself run VMs; it is an option at instance
creation, on Intel series only in the table above apart from N4D.
An `n2-standard-2` created with it shows `vmx` (observed, 2026). It is
what seL4's VMM support needs on a VM; see
[hypervisor](../sel4/hypervisor.md).

### What differs for a kernel

Observed in 2026 on one instance of each named type:

| | N1 | E2, N2D | C4 | T2A | C4A, N4A |
|---|---|---|---|---|---|
| CPU seen | Xeon 2.0 GHz (Skylake family) | Xeon 2.2 GHz; EPYC 7B13 (Zen 3) | Xeon 8581C | Neoverse N1 | Neoverse V2; N3 |
| PCI layout | flat bus 0 | flat bus 0 | PCIe bridges, `MCFG` table | ECAM | ECAM |
| Default NIC | virtio-net, legacy | virtio-net, legacy | gVNIC | gVNIC | gVNIC |
| gVNIC queue format | GQI QPL | not probed | DQO RDA | GQI QPL | DQO RDA; DQO QPL on N4A |
| Boot disk | virtio-scsi | virtio-scsi | NVMe | NVMe | NVMe |
| Boot disk type | Persistent Disk | Persistent Disk | Hyperdisk | Persistent Disk | Hyperdisk |
| Timer frequency | TSC 2000 MHz | 2200 MHz; (not noted) | 2300 MHz | `CNTFRQ` 25 MHz | `CNTFRQ` 1 GHz |

Common to all the x86 types probed: no [HPET](hpet.md); a
[PIT](pit.md) on I/O APIC pin 0; a [TSC](tsc.md) that Linux flags
`constant_tsc`, `nonstop_tsc` and `tsc_known_freq`; x2APIC and PCID
available; no TSC-deadline mode for the
[local APIC timer](lapic-timer.md) advertised in CPUID. Whether the
KVM timing leaf `0x40000010` is offered was not recorded; see
[hypervisor CPUID leaves](hypervisor-cpuid-leaves.md).

Common to the Arm types: one machine model with fixed addresses (see
[Google Compute Engine](gce.md)); only the CPU core, `CNTFRQ_EL0` and
small ACPI details change. One behavioural difference was seen: a
cache-maintenance instruction on an address with no stage 2 mapping
aborts on N4A and not on C4A or T2A.

### E2 and shared cores

E2 is the cheap series, and unusual in two ways. Google places an E2
instance on whichever host platform has room, Intel or AMD, and may
choose differently at each start, so a kernel cannot be built for one
CPU vendor (unchecked: from Google's E2 description, not opened today).
Its `e2-micro`, `e2-small` and `e2-medium` shapes are *shared-core*:
they show 2 vCPUs but are entitled to a fraction of that CPU time, with
bursting, so timing measurements on them are noisy.

### Bare metal

`-metal` types (C3, C4, C4D, C4A, Z3) give the whole server, with no
hypervisor. Nothing above applies: on `c4a-highmem-96-metal` the PCI
tree is Google bridges with an Intel IDPF NIC (`8086:1452`) and NVMe
function, the UART is a PL011 at `0x28010000`, and the
[GIC](gicv3-its.md) has several ITSes (observed, 2026). They exist only
in large, expensive sizes.

### Choosing a type for bring-up

- x86, legacy virtio devices: `n1-standard-1` (one vCPU; nested
  virtualisation available) or `e2-medium`.
- x86, gVNIC and NVMe: `c4-standard-2`, or an N1 created with
  `nic-type=GVNIC` to test the gVNIC driver alone.
- Arm: `t2a-standard-1` or `c4a-standard-1` (one vCPU each). T2A is
  offered in few regions.

### Looking facts up

- `gcloud compute machine-types describe c4a-standard-2 --zone=ZONE`:
  vCPUs, memory, architecture.
- `gcloud compute machine-types list --filter="zone:ZONE"`: what a zone
  offers.
- The machine family comparison page (References) for NIC, disk and
  feature support; the per-family pages for CPU models.

## In seL4

Not used: no seL4 code knows machine type names. They matter in
choosing what to test on, and because seL4 fixes hardware facts at
build time: an x86 image built for the oldest CPU feature set of the
types to be supported (`KernelSupportPCID`, `KernelHugePage`, FSGSBASE
options in the kernel's x86 configuration), and an Arm image with a
device tree and timer frequency that match the series. See
[platform port](../sel4/platform-port.md) and
[timer calibration](timer-calibration.md).

## Gotchas

- **gVNIC is not one device.** The queue format it requires differs by
  series; a driver that handles only one format works on some types and
  fails on others. See [gVNIC](gvnic.md).
- **Same series name, different CPU**: N1, N2, E2 and C4 each span
  several CPU platforms; `--min-cpu-platform` pins one where it matters.
- **`CNTFRQ_EL0` differs between Arm series**, 25 MHz on T2A against
  1 GHz on the Axion types, so one Arm image with a fixed timer
  frequency cannot be right on both.
- **vCPU usually means a hardware thread**, so 2 vCPUs are often one
  core; T2D, T2A and the Axion types give a whole core per vCPU
  (unchecked).
- **Availability is per zone**, and the newest series may need quota.

## See also

- [Google Compute Engine](gce.md): the machine a guest sees
- [EC2 instance types](ec2-instance-types.md): the same decoding for the other cloud
- [gVNIC](gvnic.md), [virtio](virtio.md), [NVMe](nvme.md): the devices the table names
- [Cloud virtual machines](cloud-vms.md): the cross-cloud view

## References

- [Machine families resource and comparison guide](https://docs.cloud.google.com/compute/docs/machine-resource):
  the series table (CPU platform, network interfaces, disk interface,
  nested virtualisation, bare metal) and the `-lssd` and `-metal`
  suffixes. It does not define the family or vendor letters. *Checked 2026-11-14.*
- [General-purpose machine family](https://docs.cloud.google.com/compute/docs/general-purpose-machines):
  E2's host placement and shared-core shapes, memory ratios. *Unchecked.* Not opened.
- [Create custom images](https://docs.cloud.google.com/compute/docs/images/create-custom):
  the `GVNIC` and `IDPF` image flags a series may need. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
