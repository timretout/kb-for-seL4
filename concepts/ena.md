# ENA (Elastic Network Adapter)

> Amazon's network card, the only NIC on EC2 Nitro instances: a PCI device with a small register block, an admin queue for management and pairs of submission and completion rings for packets, with MSI-X interrupts.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Cloud platforms](../INDEX.md#cloud-platforms) · ← [Booting a custom kernel on a cloud](cloud-boot-images.md) · [gVNIC](gvnic.md) →

Read first: [PCI](pci.md), [MSI and MSI-X](msi-msix.md), [Amazon EC2 and the Nitro system](ec2.md).

| At a glance | |
|---|---|
| Kind | Network card: a PCI function implemented by a Nitro card |
| Reached through | [PCI](pci.md) BAR 0 (registers, doorbells, MSI-X table); BAR 2 for LLQ |
| Found through | PCI ID `1d0f:ec20` (and `ec21`, `0ec2`, `1ec2`), class `02/00/00` |
| Interrupt | [MSI-X](msi-msix.md) only: vector 0 management, vector 1+n for I/O queue pair n |
| Key numbers | 64-byte admin entries; 16-byte TX and RX descriptors; 8-byte TX completions |
| seL4 code | None upstream: no driver in [sDDF](../sel4/sddf.md) or `libethdrivers` |
| On the clouds | The NIC of every EC2 Nitro instance, virtual or metal |

## What it is

Every network interface of an EC2 Nitro instance, virtual or metal, is
an ENA: a PCI function implemented by a Nitro card. Amazon publishes no
register-level specification; the definition is the header files Amazon
maintains in its drivers (the shared "ena-com" layer in Linux, FreeBSD,
DPDK and iPXE). Names below are from the Linux headers.

Its design will look familiar after [NVMe](nvme.md): a few registers, an
**admin queue** for configuration, and **I/O queues** that are rings of
fixed-size descriptors in guest memory, with a **doorbell** register per
ring and a **phase bit** to mark new completions.

### PCI identity

| | |
|---|---|
| Vendor | `0x1d0f` (Amazon) |
| Device | `0xec20` virtual function, `0xec21` VF with LLQ, `0x0ec2` and `0x1ec2` physical function |
| Class | `02/00/00` Ethernet |
| BAR 0 | registers, doorbells and the MSI-X table (16 KiB on t3.micro) |
| BAR 2 | LLQ memory, only where low-latency queues are offered |
| Interrupts | MSI-X only: vector 0 management, vector 1+n for I/O queue pair n |

A t3.micro showed `1d0f:ec20` at 00:05.0 with BAR 0 only and 9 MSI-X
messages; the 7th and 8th generation types put it behind PCIe bridges
(observed 2026).

### Registers (BAR 0)

All 32 bits wide.

| Offset | Name | Use |
|---|---|---|
| `0x00` | `VERSION` | device interface version, major in bits 15:8 |
| `0x04` | `CONTROLLER_VERSION` | implementation version |
| `0x08` | `CAPS` | reset timeout (bits 5:1), DMA address width (15:8), admin command timeout (19:16) |
| `0x10`, `0x14` | `AQ_BASE_LO/HI` | physical address of the admin submission ring |
| `0x18` | `AQ_CAPS` | its depth (15:0) and entry size (31:16) |
| `0x20`, `0x24`, `0x28` | `ACQ_BASE_LO/HI`, `ACQ_CAPS` | the same for the admin completion ring |
| `0x2c` | `AQ_DB` | admin submission doorbell: write the new tail |
| `0x34` to `0x3c` | `AENQ_CAPS`, `AENQ_BASE_LO/HI` | the event ring |
| `0x40` | `AENQ_HEAD_DB` | how far the driver has read events |
| `0x4c` | `INTR_MASK` | write 0 to unmask the management interrupt |
| `0x54` | `DEV_CTL` | bit 0 reset, bit 1 admin queue restart; reset reason in bits 31:28 |
| `0x58` | `DEV_STS` | bit 0 ready, bit 3 reset in progress, bit 5 fatal error |
| `0x5c` | `MMIO_REG_READ` | request for an indirect register read |
| `0x60`, `0x64` | `MMIO_RESP_LO/HI` | where the device writes the answer |

**Indirect reads.** On devices whose PCI revision has bit 0 clear, the
registers cannot be read directly. The driver gives the device the
address of a small response buffer through `MMIO_RESP_LO/HI`, then
writes `(offset << 16) | sequence number` to `MMIO_REG_READ`; the device
stores the sequence number, offset and value in the buffer, and the
driver polls the buffer until the sequence number matches. The t3.micro
is such a device (observed 2026).

### The admin queues

Three rings in guest memory, each of 64-byte entries:

- **AQ** (admin queue): commands from driver to device. Linux uses a
  depth of 32.
- **ACQ** (admin completion queue): one response per command, matched
  by a 12-bit command ID. Each entry has a phase bit that the device
  flips every time it wraps the ring; the driver consumes entries while
  the phase matches the one it expects.
- **AENQ** (asynchronous event notification queue): events the device
  raises on its own. Linux uses a depth of 16.

Commands (opcode in the common header):

| Opcode | Command |
|---|---|
| 1, 2 | `CREATE_SQ`, `DESTROY_SQ` |
| 3, 4 | `CREATE_CQ`, `DESTROY_CQ` |
| 8, 9 | `GET_FEATURE`, `SET_FEATURE` |
| 11 | `GET_STATS` |

Features worth knowing by number: `DEVICE_ATTRIBUTES` (1: MAC address,
maximum MTU, supported features, address width), `MAX_QUEUES_NUM` (2)
and `MAX_QUEUES_EXT` (7: how many queues and how deep), `LLQ` (4),
`STATELESS_OFFLOAD_CONFIG` (11), `MTU` (14), `AENQ_CONFIG` (26: which
event groups to deliver), `HOST_ATTR_CONFIG` (28: the driver describes
its OS to the device).

AENQ event groups: link change (0), fatal error (1), warning (2),
notification (3), **keep-alive** (4). The device sends a keep-alive
about once a second. Linux runs a watchdog on it and resets the device
if they stop; nothing forces a simple driver to do the same, but a
driver must keep acknowledging events through `AENQ_HEAD_DB` or the ring
fills.

The ACQ and AENQ share MSI-X vector 0. A driver can ignore the vector
and poll the ACQ after each command, which is how Linux runs the admin
queue during initialisation.

### I/O queues

A queue pair is one **submission queue** (SQ) and one **completion
queue** (CQ), and they come in two directions, so a minimal driver has
four rings: TX SQ, TX CQ, RX SQ, RX CQ.

![A minimal ENA driver has four rings in guest memory: the driver fills the TX SQ and RX SQ, the device answers in the TX CQ and RX CQ, and the driver writes each SQ's doorbell and the interrupt unmask register in BAR 0.](../images/ena-io-queues.svg)

*Submission rings flow from driver to device and completion rings
back; the paragraphs below give what each entry holds.*

- `CREATE_CQ` takes the ring's address, depth, entry size and MSI-X
  vector, and returns the CQ's index and the BAR 0 offsets of its
  **interrupt unmask register** and head doorbell.
- `CREATE_SQ` takes the direction (1 TX, 2 RX), the CQ index, the
  ring's address and depth, and where descriptors live (host memory, or
  the device for LLQ). It returns the SQ's index and the BAR 0 offset of
  its **doorbell**.

The offsets are per device and must be taken from the responses. On the
t3.micro they were `0x100` (TX doorbell), `0x300` (RX doorbell) and
`0x504` (unmask), with rings of up to 1024 entries (observed 2026).

**Transmit.** Each buffer of a packet is one 16-byte
`ena_eth_io_tx_desc`: length, `first` and `last` flags, the phase bit, a
`comp_req` flag asking for a completion, a 10-bit request ID chosen by
the driver, the buffer's physical address (48 bits) and, in the first
descriptor, the header length and offload flags (`l3_csum_en`,
`l4_csum_en`, `tso_en`). An optional metadata descriptor carries the MSS
and header offsets for TSO. The driver writes the descriptors, then the
new tail to the SQ doorbell. The device answers with an 8-byte
`ena_eth_io_tx_cdesc` in the TX CQ: the request ID, a phase bit, and the
SQ head, which tells the driver which descriptors are free again.

**Receive.** The driver fills the RX SQ with 16-byte
`ena_eth_io_rx_desc` entries, each an empty buffer: length, physical
address and a request ID. For each packet the device writes one
completion descriptor per buffer used into the RX CQ, with the request
ID, the length received, `first`/`last` flags, the phase bit, and
checksum results (`l3_csum_err`, `l4_csum_err`, the L3 and L4 protocol
indexes). The driver hands the buffer up and posts a fresh one.

**Interrupts.** A queue's vector is masked automatically when it fires.
After draining the CQs the driver writes the unmask register (the same
write can set interrupt moderation delays). A polling driver never
unmasks and simply reads the CQs.

### LLQ (low-latency queue)

In the regular mode above the device fetches TX descriptors and packet
data from guest memory. In **LLQ** mode, also called push mode, the
driver instead writes each packet's descriptors and its first 96 bytes
(the headers) straight into device memory through BAR 2, mapped
write-combining, so the device can start forwarding without a DMA read.
It applies to transmit only; receive always uses host memory. LLQ is
negotiated through feature 4: the device states the entry sizes (128,
192 or 256 bytes) and layouts it accepts. "Large LLQ" is the 256-byte
entry, for longer headers.

Whether a device insists on LLQ varies. The t3.micro does not offer it
at all; Linux uses it wherever offered and falls back to regular mode
otherwise. Amazon's best-practices notes call LLQ the default mode of
operation on the majority of instance types since version 2.0 of its
driver, so a driver meant for more than one generation should implement
it.

### MTU and offloads

The maximum MTU comes from `DEVICE_ATTRIBUTES` and the driver sets the
one in use with `SET_FEATURE(MTU)`; EC2's jumbo frames are an MTU of
9001, usable inside a VPC and cut to 1500 across an internet gateway.
Offloads are optional and discoverable: IPv4 header and
TCP/UDP checksum in both directions, TSO, and RSS (receive-side scaling:
spreading flows over queues with a Toeplitz or CRC32 hash). A minimal
driver uses none.

### Reset reasons

To reset, the driver writes `DEV_CTL` with bit 0 set and a reason in
bits 31:28, waits for `DEV_STS` "reset in progress" to rise, clears
`DEV_CTL`, and waits for it to fall. The reason is only a report to
Amazon. Values: 0 normal, 1 keep-alive timeout, 2 admin timeout,
3 missed TX completion, 4 and 5 invalid RX or TX request ID, 6 too many
RX descriptors, 7 initialisation error, 8 driver in invalid state,
9 OS trigger, 10 OS watchdog, 11 shutdown, 12 user trigger, 13 generic,
14 missed interrupt, 15 suspected poll starvation, 16 malformed RX
descriptor. The field is four bits wide, so 16 does not fit: mainline
Linux masks it to 0, and Amazon's own tree puts the upper bits in a
second field (bits 27:24) when the device advertises the
`ENA_ADMIN_EXTENDED_RESET_REASONS` capability, and reports 13 (generic)
when it does not.

### A minimal driver, step by step

1. Find the device, enable memory decoding and bus mastering, map
   BAR 0. Note the PCI revision: bit 0 clear means indirect reads.
2. If reads are indirect, allocate the response buffer and write its
   address to `MMIO_RESP_LO/HI`.
3. Read `DEV_STS`, check `ready`; reset the device and wait.
4. Read `VERSION` and `CAPS`.
5. Allocate the AQ, ACQ and AENQ; write their addresses and
   `depth | entry size << 16` to the base and caps registers; write the
   AENQ depth to `AENQ_HEAD_DB`.
6. `GET_FEATURE(DEVICE_ATTRIBUTES)`: MAC address, MTU, feature bits.
   `GET_FEATURE(MAX_QUEUES_EXT)` or `MAX_QUEUES_NUM`: ring size limits.
7. `SET_FEATURE(AENQ_CONFIG)` with the wanted event groups;
   optionally `SET_FEATURE(HOST_ATTR_CONFIG)`.
8. Set up MSI-X (or decide to poll). Write 0 to `INTR_MASK`.
9. `CREATE_CQ` then `CREATE_SQ` for TX, and again for RX; keep the
   doorbell and unmask offsets.
10. Post RX buffers and ring the RX doorbell. The link is up when a
    link-change event says so.
11. Loop: on interrupt or poll, drain the RX CQ and TX CQ, repost
    buffers, read the AENQ and advance its head doorbell, unmask.

## In seL4

There is no ENA driver in upstream [sDDF](../sel4/sddf.md):
[`drivers/network/`](https://github.com/au-ts/sddf/tree/main/drivers/network)
holds virtio-net and SoC Ethernet drivers only. Nor is there one in
util_libs' `libethdrivers`. So no seL4 system has networking on EC2 with
upstream code alone.

What a driver in the [sDDF network model](../sel4/sddf-net.md) would
need:

- **Buffers by physical address.** ENA descriptors hold the physical
  addresses of packet buffers, which is what sDDF's network queues pass
  around, so a driver in regular mode needs no copy and no mapping of
  the data region. LLQ needs the headers copied into BAR 2.
- **Interrupts.** The device has MSI-X and no legacy pin. On x86 the
  kernel delivers an MSI as a vector obtained with
  `seL4_IRQControl_GetMSI`
  ([`object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml));
  the driver then programs the MSI-X table itself. On Arm an MSI needs
  the [ITS](gicv3-its.md), which the upstream kernel does not drive, so
  a Graviton driver has to poll. See
  [IRQ handling](../sel4/irq-handling.md).
- **PCI configuration access** to enable the device and find BAR 0,
  whose address depends on the firmware and boot mode.
- **A clock**, if it wants admin command time-outs or a keep-alive
  watchdog.

Implementations to read, smallest first: iPXE's `ena.c` (one file,
polling, LLQ with 128-byte entries where offered), FreeBSD's `if_ena`, DPDK's `net/ena`, and
Linux's `ena_netdev.c`. All but iPXE sit on the shared `ena_com` layer
from `amzn-drivers`, so reading `ena_com.c` once covers three of them.

## Gotchas

- **Registers may be unreadable.** A driver that reads `DEV_STS`
  directly on a revision-0 device gets nonsense. The t3.micro needs
  indirect reads (observed 2026).
- **Host attributes can be refused.** The t3.micro rejected
  `HOST_ATTR_CONFIG` with status 5 (illegal parameter) when the OS type
  was 0; nothing else depended on it (observed 2026). Known OS types
  are 1 Linux, 2 Windows, 3 DPDK, 4 FreeBSD, 5 iPXE.
- **BAR 0 is not where Linux reports it** if Linux booted with other
  firmware: `0xfebf4000` under BIOS, `0x80400000` under UEFI on the same
  type (observed on t3.micro, 2026).
- **The MAC address belongs to the network interface**, an EC2 object
  that can outlive instances; read it from `DEVICE_ATTRIBUTES` instead
  of configuring it.
- **Unacknowledged AENQ events** stop arriving once the ring is full,
  and the keep-alives with them.
- **Request IDs are the driver's.** The device echoes them; a
  completion with an ID the driver never issued is reset reason 4 or 5
  in Linux, and a sign of a ring-index bug.
- **Rate limits are silent.** EC2 drops packets over an instance's
  bandwidth, packet-rate or connection-tracking allowance; the only
  trace is in the `GET_STATS` ENI counters (`bw_in_allowance_exceeded`
  and friends).

## See also

- [Amazon EC2 and the Nitro system](ec2.md): the machine it sits in
- [NVMe](nvme.md): the same queue design, with a public specification
- [gVNIC](gvnic.md): Compute Engine's counterpart
- [virtio](virtio.md): the device model EC2 does not offer
- [MSI and MSI-X](msi-msix.md): its only interrupt mechanism
- [sDDF networking](../sel4/sddf-net.md): where a driver would plug in

## References

- [Linux kernel documentation, "Linux kernel driver for Elastic Network Adapter (ENA) family"](https://docs.kernel.org/networking/device_drivers/ethernet/amazon/ena.html):
  the management queues, keep-alive, LLQ, MSI-X use, and data path.
  *Checked 2026-11-14.*
- [Linux `ena_regs_defs.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_regs_defs.h):
  register offsets, bit fields and reset reasons. *Checked 2026-11-14.*
- [Linux `ena_admin_defs.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_admin_defs.h):
  admin opcodes, feature numbers, AENQ groups, create-queue responses.
  *Checked 2026-11-14.*
- [Linux `ena_eth_io_defs.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_eth_io_defs.h):
  the TX and RX descriptor layouts. *Checked 2026-11-14.*
- [Linux `ena_pci_id_tbl.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_pci_id_tbl.h)
  and [`ena_netdev.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_netdev.h):
  PCI IDs; BAR numbers and vector indexes. *Checked 2026-11-14.*
- [amzn-drivers](https://github.com/amzn/amzn-drivers): Amazon's own
  tree of the Linux, FreeBSD and DPDK drivers. Its
  [`ENA_Linux_Best_Practices.rst`](https://github.com/amzn/amzn-drivers/blob/master/kernel/linux/ena/ENA_Linux_Best_Practices.rst)
  says where LLQ is the default, and its
  [`ena_com.c`](https://github.com/amzn/amzn-drivers/blob/master/kernel/linux/common/ena_com/ena_com.c)
  (`ena_com_dev_reset`) has the extended reset reason.
  *Checked 2026-11-14.*
- [Linux `ena_com.c`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/amazon/ena/ena_com.c),
  `ena_com_dev_reset`: the reset sequence, with the reason masked to
  four bits. *Checked 2026-11-14.*
- [iPXE `drivers/net/ena.c`](https://github.com/ipxe/ipxe/blob/master/src/drivers/net/ena.c):
  the smallest complete driver; no MSI-X vector on its queues, LLQ
  configured where offered. *Checked 2026-11-14.*
- [EC2 User Guide, "Network maximum transmission unit (MTU) for your EC2 instance"](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/network_mtu.html):
  jumbo frames of 9001 and where they stop. *Checked 2026-11-14.*
- [seL4 `object-api-arch.xml` for x86](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml):
  `seL4_IRQControl_GetMSI`. *Checked 2026-11-14.*
- [sDDF `drivers/network/`](https://github.com/au-ts/sddf/tree/main/drivers/network):
  no ENA driver. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
