# NVMe (NVM Express)

> The standard PCI storage controller interface, and the one EC2 uses for every disk and Compute Engine for its newer machine types: registers in BAR 0, an admin queue, and pairs of submission and completion queues in host memory.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Cloud platforms](../INDEX.md#cloud-platforms) · ← [gVNIC](gvnic.md) · [Capabilities](../sel4/capabilities.md) →

Read first: [PCI](pci.md), [MSI and MSI-X](msi-msix.md).

| At a glance | |
|---|---|
| Kind | Storage controller interface (a public specification) |
| Reached through | [PCI](pci.md) BAR 0 (64-bit memory); doorbells from offset `0x1000` |
| Found through | PCI class code `01/08/02` |
| Interrupt | [MSI-X](msi-msix.md), MSI or a legacy pin; admin CQ on vector 0 |
| Key numbers | 64-byte commands, 16-byte completions; up to 65535 queues of up to 65536 commands |
| seL4 code | [sDDF](../sel4/sddf.md) [`drivers/blk/nvme/`](https://github.com/au-ts/sddf/tree/main/drivers/blk/nvme); none in the kernel |
| seL4 use | sDDF block driver, tested against QEMU only; one I/O queue pair, one namespace |
| On the clouds | Every disk on EC2 Nitro; Compute Engine's T2A and third-generation series |

## What it is

NVM Express is a public specification for talking to solid-state
storage over PCI Express. It replaced AHCI/SATA, which was built for
one slow queue; NVMe has up to 65535 queues of up to 65536 commands. For
a driver writer it is pleasantly small: no negotiation of transport
features as in [virtio](virtio.md), one register block, two fixed-size
structures.

The parts:

- a **controller**: the PCI function, class code `01/08/02` (mass
  storage, non-volatile memory, NVM Express);
- **namespaces**: the disks behind it, numbered from 1 (the namespace
  ID, NSID). Most controllers, and every cloud disk, have exactly one;
- **queues**: rings in host memory. A **submission queue** (SQ) takes
  64-byte commands from the driver; a **completion queue** (CQ) returns
  16-byte results. Queue 0 is the **admin** pair, for management; I/O
  pairs are numbered from 1.

### Registers (BAR 0)

BAR 0 (64-bit memory, with BAR 1 as its upper half) maps the
controller:

| Offset | Name | Contents |
|---|---|---|
| `0x00` | `CAP` (64 bits) | capabilities: `MQES` bits 15:0, largest queue size minus one; `TO` 31:24, ready timeout in 500 ms units; `DSTRD` 35:32, doorbell stride; `MPSMIN` 51:48 and `MPSMAX` 55:52, page sizes |
| `0x08` | `VS` | version, such as `0x00010400` for 1.4 |
| `0x0c`, `0x10` | `INTMS`, `INTMC` | interrupt mask set and clear (pin and MSI only, not MSI-X) |
| `0x14` | `CC` | configuration: `EN` bit 0; `CSS` 6:4, command set (0 = NVM); `MPS` 10:7, page size as 2^(12+MPS); `IOSQES` 19:16 and `IOCQES` 23:20, log2 of the I/O entry sizes (6 and 4) |
| `0x1c` | `CSTS` | status: `RDY` bit 0, `CFS` bit 1 (fatal) |
| `0x24` | `AQA` | admin queue sizes minus one: SQ in bits 11:0, CQ in 27:16 |
| `0x28` | `ASQ` (64 bits) | physical address of the admin SQ |
| `0x30` | `ACQ` (64 bits) | physical address of the admin CQ |
| `0x1000` + | doorbells | one pair per queue |

The **doorbells** are how the driver reports ring movement. For queue
`q`, with stride `4 << DSTRD` bytes:

```
SQ q tail doorbell:  0x1000 + (2q)     * (4 << DSTRD)
CQ q head doorbell:  0x1000 + (2q + 1) * (4 << DSTRD)
```

`DSTRD` is 0 on most devices, giving `0x1000`, `0x1004`, `0x1008`, ...

### Bringing a controller up

1. Enable memory decoding and bus mastering in the PCI command
   register; map BAR 0.
2. Clear `CC.EN` and wait for `CSTS.RDY` to read 0 (up to `CAP.TO`).
3. Allocate the admin SQ and CQ (page-aligned, physically contiguous);
   write `AQA`, `ASQ`, `ACQ`.
4. Write `CC` with `MPS`, `CSS`, `IOSQES` = 6, `IOCQES` = 4 and `EN`;
   wait for `CSTS.RDY` = 1.
5. **Identify** the controller, then the namespace.
6. **Set Features, Number of Queues** to ask how many I/O queues are
   allowed.
7. **Create I/O Completion Queue**, then **Create I/O Submission
   Queue** naming that CQ. Order matters: the CQ must exist first.
8. Issue Read and Write commands on the I/O queue.

### Commands and completions

A submission entry is 64 bytes:

| Bytes | Field |
|---|---|
| 0 to 3 | `CDW0`: opcode (7:0), data pointer type `PSDT` (15:14: 0 = PRP), command ID `CID` (31:16) |
| 4 to 7 | `NSID` |
| 16 to 23 | metadata pointer |
| 24 to 39 | data pointer: `PRP1`, `PRP2` |
| 40 to 63 | `CDW10` to `CDW15`, command-specific |

A completion entry is 16 bytes: a command-specific result (4 bytes),
4 reserved, then `SQHD` (how far the controller has consumed the SQ),
`SQID`, `CID`, and a 16-bit status whose bit 0 is the **phase tag** and
bits 15:1 the status code (0 = success).

The phase tag replaces a "CQ tail" register. The controller inverts it
each time it wraps the CQ, so an entry is new exactly when its phase
differs from what the previous pass left there. The driver reads
entries while the phase matches the expected value, flips its
expectation on wrap, and writes its new head to the CQ head doorbell.
Submitting is: copy the command into the SQ slot at the tail, advance
the tail modulo the queue size, write it to the SQ tail doorbell. A
queue is full when advancing the tail would reach the head last seen in
`SQHD`.

![The driver copies commands into the submission queue and writes the tail to the SQ tail doorbell; the controller writes completions carrying a phase tag into the completion queue; the driver reads them and writes its head to the CQ head doorbell.](../images/nvme-queues.svg)

*One queue pair: the rings are in host memory, and the only
registers touched per command are the two doorbells.*

| Admin opcode | Command | Key fields |
|---|---|---|
| `0x06` | Identify | `CDW10` CNS: 0 namespace, 1 controller, 2 list of active NSIDs; returns 4096 bytes |
| `0x09` | Set Features | feature `0x07`, Number of Queues: `CDW11` = wanted SQs and CQs, each minus one; the result holds what was granted |
| `0x05` | Create I/O CQ | `PRP1` ring address; `CDW10` queue ID and size minus one; `CDW11` contiguous, interrupts enabled, interrupt vector |
| `0x01` | Create I/O SQ | as above; `CDW11` carries the CQ's ID |
| `0x02` | Get Log Page | error and health logs |

(Opcodes `0x01`, `0x02`, `0x05`, `0x06` checked against sDDF's driver;
`0x09` and feature `0x07` against the specification, section 5.1.25.)

| I/O opcode | Command | Key fields |
|---|---|---|
| `0x02` | Read | `CDW10`/`CDW11` starting LBA; `CDW12` bits 15:0 block count minus one |
| `0x01` | Write | the same |
| `0x00` | Flush | none |

Many NVMe counts are "zero-based": the field holds n-1. It is the most
common source of off-by-one bugs.

**Identify** data a driver needs: in the controller structure, the serial number
(bytes 4 to 23), model number (24 to 63), `MDTS` (byte 77: maximum
transfer size as a power of two of the minimum page size, `CAP.MPSMIN`;
0 = no limit), the required
and maximum entry sizes `SQES` and `CQES`, and the number of
namespaces. In the namespace structure, `NSZE` (bytes 0 to 7: size in
logical blocks) and `FLBAS`, whose low bits select one entry of the
**LBA format** table; that entry's `LBADS` field is log2 of the block
size, 9 for 512 bytes or 12 for 4096.

### Data pointers: PRPs

A command addresses its data by **PRP** (physical region page) entries:
64-bit physical addresses of memory pages of the size set in `CC.MPS`.

- `PRP1` points at the first page, and may have an offset into it.
- If the transfer fits in two pages, `PRP2` is the second page.
- If longer, `PRP2` is the address of a **PRP list**: a page holding
  further page addresses (511 per 4 KiB page, the last slot chaining to
  another list).

So I/O is to physical addresses supplied by the guest, with no bounce
buffer needed if the buffers are page-aligned. The alternative, **SGL**
(scatter-gather lists of address and length), is optional for
controllers on PCI and a simple driver can ignore it.

### Interrupts and queue depth

A controller has MSI-X (or MSI, or a legacy pin). The admin CQ uses
vector 0 and each I/O CQ names its vector when created; Linux makes one
queue pair per CPU with a vector each. With MSI-X, masking is done in
the MSI-X table, not `INTMS`. A driver can also create the CQ with
interrupts disabled and poll it, which is the simplest thing that
works. Queue depth is a choice up to `CAP.MQES` + 1; the admin queue is
limited to 4096 entries. Command IDs are the driver's, and must be
unique among outstanding commands on a queue.

### On EC2

Every disk of a Nitro instance is its own NVMe controller with one
namespace: there is one PCI function per EBS volume (`1d0f:8061`,
observed on t3, c5, c7i, 2026) and one per instance store disk, which
is a different device (model "Amazon EC2 NVMe Instance Storage"). See [EC2](ec2.md).

- Linux names them `nvme0n1`, `nvme1n1`, ... in the order they answer,
  which is not the order of the block device mapping and can change
  between boots.
- The identity is in Identify Controller: the **serial number is the
  EBS volume ID** without its hyphen (`vol0123...` for
  `vol-0123...`), the model is `Amazon Elastic Block Store`, and the
  device name requested at attach time (`sdf`, `/dev/sdf`) is in the
  vendor-specific area, bytes 384 onwards. A system with more than one
  volume should find its disks this way.
- An EBS volume is a network disk and a request can stall for a long
  time. Linux's default NVMe timeout is 30 s, after which it fails the
  I/O; AWS recommends setting `nvme_core.io_timeout` to its maximum
  (4294967295 on current kernels) so I/O waits instead, as it did under
  Xen. A new driver should not treat a slow command as a dead device.
- A 2-vCPU instance's EBS controller gave Linux 2 I/O queues (observed
  2026).

### On Compute Engine

Compute Engine chooses the interface per machine series: the Tau T2A
and third-generation series such as M3 present Persistent Disk and
Hyperdisk as NVMe, and all other series as SCSI, which there means
virtio-scsi. Booted instances agreed: NVMe on C4, C4A, N4A and T2A,
virtio-scsi on N1, N2, N2D and E2 (observed 2026).
Confidential VMs use NVMe. Local SSDs can be attached as NVMe or
SCSI. See [Compute Engine](gce.md). A port to both
generations therefore needs both an NVMe and a virtio-scsi (or
virtio-blk, where offered) driver.

## In seL4

The kernel has no storage drivers. In user space,
[sDDF](../sel4/sddf.md) upstream has an NVMe driver,
[`drivers/blk/nvme/`](https://github.com/au-ts/sddf/tree/main/drivers/blk/nvme)
(`nvme.c`, register and structure definitions in `nvme.h`, ring helpers
in `nvme_queue.h`). As it stands on `main`:

- developed and tested against QEMU's emulated controller (x86-64
  first, AArch64 and RISC-V 64 added in March 2026); nothing upstream
  runs it on a cloud;
- one I/O queue pair (ID 1) and one namespace (NSID 1);
- PRP with a single, unchained PRP list per request; an SGL path
  exists;
- the PCI bus, device and function are build-time constants, and it
  writes BAR 0 itself;
- it uses one interrupt (vector 0, pin or single MSI) and an sDDF timer
  client to poll `CSTS` during reset and enable.

It serves the sDDF **block queue** interface
([`include/sddf/blk/queue.h`](https://github.com/au-ts/sddf/blob/main/include/sddf/blk/queue.h)):
a request ring and a response ring shared with the block virtualiser,
where each request is a code (`BLK_REQ_READ`, `BLK_REQ_WRITE`,
`BLK_REQ_FLUSH`, `BLK_REQ_BARRIER`), an offset into a shared data
region, a block number and a count in units of `BLK_TRANSFER_SIZE`
(4096 bytes), and an ID echoed in the response. The driver maps sDDF
request IDs to NVMe command IDs and data-region offsets to physical
addresses for the PRPs. LionsOS uses the same interface for its file
systems ([LionsOS](../sel4/lionsos.md)).

What a cloud needs beyond that: finding the controller by class code
instead of a fixed slot, choosing among several controllers by serial
number, and MSI-X. On x86 the vector comes from
`seL4_IRQControl_GetMSI`; on Arm there are no MSIs without
[ITS](gicv3-its.md) support, so polling
([IRQ handling](../sel4/irq-handling.md)).

## Gotchas

- **Zero-based fields**: queue sizes in `AQA` and Create I/O Queue,
  the block count in Read and Write, the queue counts in Set Features,
  and `CAP.MQES` all hold n-1.
- **Disable before configuring.** Firmware that booted from the disk
  leaves the controller enabled with its own admin queues. Writing
  `ASQ`/`ACQ` while `CC.EN` is 1 is ignored or worse; clear `EN` and
  wait for `RDY` = 0 first.
- **`CAP.TO` can be long.** Cloud controllers may take seconds to
  become ready; honour the timeout instead of a fixed loop count.
- **A 4 KiB transfer unit on a 512-byte namespace.** EBS volumes
  present 512-byte sectors, so sDDF's 4096-byte unit
  is 8 LBAs; the driver must convert, using `LBADS`.
- **`MDTS` limits one command.** A request larger than
  2^`MDTS` pages (of the `CAP.MPSMIN` size) must be split.
- **Device order is not stable on EC2**; identify volumes by serial
  number.
- **EBS latency is not failure**: see the timeout above.
- **Attach and detach are hot-plug.** AWS describes attaching an EBS
  volume as a hot-plug event that presents a new NVMe device to the
  running instance; a static system simply must not have its volumes
  attached or detached while it runs.

## See also

- [Amazon EC2 and the Nitro system](ec2.md) and [Compute Engine](gce.md): where it appears
- [ENA](ena.md): a network card with the same queue design
- [virtio](virtio.md): the other storage interface on Compute Engine
- [PCI](pci.md) and [MSI and MSI-X](msi-msix.md): what it is built on
- [sDDF](../sel4/sddf.md): the block driver model
- [Compute Engine machine types](gce-machine-types.md): how to read a Compute Engine machine type name such as `c4a-standard-2`, and what the series behind it...

## References

- [NVM Express Base Specification, revision 2.1](https://nvmexpress.org/wp-content/uploads/NVM-Express-Base-Specification-Revision-2.1-2024.08.05-Ratified.pdf),
  sections 3.1 (controller architecture; 3.1.4 controller properties),
  3.3 (queue models), 4.1 and 4.2 (submission and completion queue
  entries), 4.3 (data pointer layouts: PRPs and SGLs), 5 (admin command
  set; 5.1.13 Identify with the controller data structure's byte
  offsets, 5.1.25 Set Features): the definition. *Checked 2026-11-14.*
- [NVM Command Set Specification, revision 1.1](https://nvmexpress.org/wp-content/uploads/NVM-Express-NVM-Command-Set-Specification-Revision-1.1-2024.08.05-Ratified.pdf):
  the Identify Namespace data structure (`NSZE`, `FLBAS`, the LBA format
  entries and `LBADS`). *Checked 2026-11-14.*
- [sDDF `drivers/blk/nvme/nvme.h`](https://github.com/au-ts/sddf/blob/main/drivers/blk/nvme/nvme.h):
  register layout, `CAP`/`CC`/`AQA` fields, doorbell formula, opcodes,
  entry formats, each with a specification citation.
  *Checked 2026-11-14.*
- [sDDF `drivers/blk/nvme/nvme.c`](https://github.com/au-ts/sddf/blob/main/drivers/blk/nvme/nvme.c):
  the bring-up sequence and the driver's limits. *Checked 2026-11-14.*
- [sDDF `include/sddf/blk/queue.h`](https://github.com/au-ts/sddf/blob/main/include/sddf/blk/queue.h):
  the block queue interface. *Checked 2026-11-14.*
- [EBS User Guide, "Map Amazon EBS volumes to NVMe device names"](https://docs.aws.amazon.com/ebs/latest/userguide/identify-nvme-ebs-device.html):
  serial number, model string, vendor-specific device name, naming
  order. *Checked 2026-11-14.*
- [EBS User Guide, "NVMe I/O operation timeout for Amazon EBS volumes"](https://docs.aws.amazon.com/ebs/latest/userguide/timeout-nvme-ebs-volumes.html):
  the 30 s default and the recommended maximum. *Checked 2026-11-14.*
- [Compute Engine documentation, "About Persistent Disk"](https://docs.cloud.google.com/compute/docs/disks/persistent-disks):
  which machine series use NVMe and which SCSI. *Checked 2026-11-14.*
- [EBS User Guide, "Amazon EBS volume constraints"](https://docs.aws.amazon.com/ebs/latest/userguide/volume_constraints.html):
  an attached volume appears as a disk with 512-byte sectors.
  *Checked 2026-11-14.*
- [amazon-ec2-utils `70-ec2-nvme-devices.rules`](https://github.com/amazonlinux/amazon-ec2-utils/blob/main/70-ec2-nvme-devices.rules):
  the model strings "Amazon Elastic Block Store" and "Amazon EC2 NVMe
  Instance Storage". *Checked 2026-11-14.*
- [The Security Design of the AWS Nitro System, "Putting the pieces together: EBS volume attachment"](https://docs.aws.amazon.com/whitepapers/latest/security-design-of-aws-nitro-system/putting-the-pieces-together-ebs-volume-attachment.html):
  attachment as a hot-plug event of an NVMe device. *Checked 2026-11-14.*
- [Compute Engine documentation, "About Local SSD disks"](https://docs.cloud.google.com/compute/docs/disks/local-ssd):
  Local SSD by the NVMe or SCSI interface. *Checked 2026-11-14.*
- [OSDev wiki, "NVMe"](https://wiki.osdev.org/NVMe): a short driver
  writer's summary. *Checked 2026-11-14 (through the Internet Archive's
  copy; the site itself refuses scripted fetches).*
