# gVNIC (Google Virtual NIC, gve)

> Compute Engine's own paravirtual network card, the only NIC on third-generation and later machine series and on Arm: a PCI device with a big-endian register block, an admin queue, and two unrelated descriptor formats (GQI and DQO).

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Cloud platforms](../INDEX.md#cloud-platforms) · ← [ENA](ena.md) · [NVMe](nvme.md) →

Read first: [PCI](pci.md), [MSI and MSI-X](msi-msix.md), [Google Compute Engine](gce.md).

| At a glance | |
|---|---|
| Kind | Paravirtual network card (PCI device) |
| Reached through | Three 32-bit memory BARs: 0 registers (big-endian), 1 MSI-X table, 2 doorbells |
| Found through | PCI ID `1ae0:0042`, class `0x0200` |
| Interrupt | [MSI-X](msi-msix.md) only: one management vector, the rest for notification blocks |
| Key numbers | 64-byte admin commands in one page; four queue formats (GQI or DQO, RDA or QPL) |
| seL4 code | None upstream: no driver in [sDDF](../sel4/sddf.md) |
| On the clouds | Only NIC on Compute Engine's third-generation and later series and on Arm |

## What it is

gVNIC is the network device Google designed for
[Compute Engine](gce.md) to replace virtio-net. Linux calls its driver
`gve` (Google Virtual Ethernet). Google publishes no register-level
specification: the Linux kernel's driver document and the open-source
drivers are the description, and this page follows them.

### PCI identity and BARs

| | |
|---|---|
| Vendor : device | `1ae0:0042` (Google) |
| Subsystem | `1ae0:0058` |
| Class | `0x0200`, Ethernet |
| Revision | 0 on the instances observed in 2026 |

Three 32-bit memory BARs:

| BAR | Holds |
|---|---|
| 0 | Configuration and status registers |
| 1 | The MSI-X table (starting 8 bytes in, observed) |
| 2 | Doorbells: one 32-bit word per interrupt block and per queue; 1 MiB (observed) |

### Registers (BAR 0)

All big-endian, so an x86 or little-endian Arm driver byte-swaps every
access. From `struct gve_registers` in Linux's `gve_register.h`:

| Offset | Register | Use |
|---|---|---|
| `0x00` | `device_status` | bit 1 reset requested, bit 2 link up, bit 3 report stats, bit 4 device is reset |
| `0x04` | `driver_status` | bit 0 run, bit 1 reset |
| `0x08` | `max_tx_queues` | |
| `0x0c` | `max_rx_queues` | |
| `0x10` | `adminq_pfn` | page frame number of the admin queue; writing 0 resets the device |
| `0x14` | `adminq_doorbell` | count of commands submitted |
| `0x18` | `adminq_event_counter` | count of commands the device has completed |
| `0x1f` | `driver_version` | one byte |
| `0x20`, `0x24` | `adminq_base_address_hi`, `_lo` | full address of the admin queue (newer revisions) |
| `0x28` | `adminq_length` | 16 bits |

On PCI revision 0 the admin queue is announced by its page frame
number in `adminq_pfn`; later revisions use the base address and length
registers instead (`gve_adminq_alloc` in Linux's `gve_adminq.c`; both
observed instances were revision 0).

### The admin queue

One page of guest memory, treated as an array of 64-byte commands (all
fields big-endian). To issue one, the driver writes it into the next
slot, increments its own counter, writes the counter to
`adminq_doorbell`, and polls `adminq_event_counter` until it matches.
The device fills in the command's status word: 1 is
`GVE_ADMINQ_COMMAND_PASSED`, values from `0xfffffff0` up are errors.
There is no completion interrupt.

![The driver writes a 64-byte command into the next slot of the admin queue page, writes its command count to adminq_doorbell in BAR 0, and polls adminq_event_counter until the device, which fills in the status word, has caught up.](../images/gvnic-admin-queue.svg)

*One admin command: two counters, one written by the driver and one
by the device, take the place of a completion ring.*

| Opcode | Command | What it does |
|---|---|---|
| `0x1` | `DESCRIBE_DEVICE` | Fills a driver-supplied page with the device descriptor: MAC, MTU, ring sizes, default queue count, pages per QPL, then a list of *device options* |
| `0x2` | `CONFIGURE_DEVICE_RESOURCES` | Gives the device the event counter array, the interrupt doorbell array (`irq_db_addr`, count, stride), the first MSI-X vector for queues, and the chosen `queue_format` |
| `0x3`, `0x4` | `REGISTER_PAGE_LIST`, `UNREGISTER_` | Registers a queue page list: an id and an array of page addresses |
| `0x5`, `0x6` | `CREATE_TX_QUEUE`, `CREATE_RX_QUEUE` | Ring addresses and sizes, the page list id, the notification block (`ntfy_id`), and a `queue_resources` page in which the device returns the queue's doorbell index |
| `0x7`, `0x8` | `DESTROY_TX_QUEUE`, `DESTROY_RX_QUEUE` | |
| `0x9` | `DECONFIGURE_DEVICE_RESOURCES` | |
| `0xb` | `SET_DRIVER_PARAMETER` | Parameter 1 is the MTU |
| `0xd` | `REPORT_LINK_SPEED` | |
| `0xf` | `VERIFY_DRIVER_COMPATIBILITY` | Passes a `gve_driver_info` block: OS type, driver version, capability flags |

The device options after the descriptor say which queue formats this
instance offers: option ids `0x2` GQI RDA, `0x3` GQI QPL, `0x4` DQO
RDA, `0x7` DQO QPL, plus `0x8` jumbo frames and others. Each has a
length, so unknown options can be skipped.

### Queue formats

Two independent choices give four formats:

- **Descriptor format.** **GQI** is the original: big-endian, one
  descriptor ring per queue consumed strictly in order; the driver
  advances the head by writing a big-endian count to the queue's
  doorbell in BAR 2, and the device reports progress in a big-endian
  event counter (transmit) or by sequence numbers in the descriptors
  (receive). **DQO** is the newer one, modelled on Intel's data-path
  NICs: little-endian, with separate rings in each direction. The
  driver posts to a transmit descriptor ring and a receive *buffer*
  ring and rings a doorbell; the device answers on a transmit
  *completion* ring and a receive completion ring. Completions can come
  out of order and are matched by a 16-bit `completion_tag` (transmit)
  or `buffer_id` (receive). A completion entry is new when its
  generation bit differs from the current generation, which flips on
  every wrap of the ring.
- **Addressing mode.** **RDA** (raw DMA addressing): descriptors carry
  guest-physical addresses, and a packet may lie anywhere. **QPL**
  (queue page list): the driver registers a fixed set of pages for each
  queue beforehand, and descriptors refer to offsets within it; Linux
  copies packets into and out of those pages.

Which formats a machine type offers (observed in 2026; a driver must
read the device options, not assume):

| Machine type | Offered | Linux uses |
|---|---|---|
| `n1-standard-1`, `t2a-standard-1` | GQI QPL | GQI QPL |
| `c4-standard-2`, `c4a-standard-1` | GQI QPL, DQO RDA | DQO RDA |
| `n4a-standard-1` | DQO QPL at least | DQO QPL |

GQI RDA exists in the drivers, but DPDK's documentation calls it
deprecated and says it was not released in production.

Descriptor layouts in outline (from the Linux headers `gve_desc.h` and
`gve_desc_dqo.h`):

- GQI transmit: 16-byte descriptors; a packet descriptor (flags,
  checksum offsets, descriptor count, total length, segment length,
  segment address or QPL offset) followed by segment descriptors.
- GQI receive: a ring of 64-byte descriptors written by the device
  (length, flags with a 3-bit sequence number, RSS hash) beside a
  *data ring* of 8-byte slots written by the driver (buffer address or
  QPL offset). Frames start 2 bytes into the buffer, so that the IP
  header is aligned.
- DQO: 16-byte transmit descriptors (address, tag, length, end-of-packet
  bit), 8-byte transmit completions, 32-byte receive buffer and
  completion descriptors.

### Interrupts and doorbells

The device uses [MSI-X](msi-msix.md) only. One vector is the
**management interrupt**: it tells the driver to read `device_status`
(link change, reset request). The rest belong to **notification
blocks**, one per queue or per queue pair; `ntfy_blk_msix_base_idx`
says where they start. Each block has an interrupt doorbell word in
BAR 2 (index taken from the `irq_db` array the driver supplied), which
the driver writes to acknowledge, mask and unmask that interrupt. A
`c4-standard-2` offered 5 vectors and an `n1-standard-1` 3 (observed).

### What a minimal driver does

1. Find `1ae0:0042`, enable memory decoding and bus mastering, map the
   three BARs.
2. Reset: write 0 to `adminq_pfn`; then allocate a page and write its
   frame number there.
3. `DESCRIBE_DEVICE`: read the MAC, MTU, ring sizes and options; pick a
   queue format that is offered. Optionally
   `VERIFY_DRIVER_COMPATIBILITY`.
4. Set up MSI-X, then `CONFIGURE_DEVICE_RESOURCES` with the counter and
   interrupt doorbell arrays and the format.
5. For a QPL format, `REGISTER_PAGE_LIST` for each queue.
6. `CREATE_TX_QUEUE` and `CREATE_RX_QUEUE`; read each queue's doorbell
   index from its `queue_resources` page.
7. Post receive buffers, ring the doorbell, set `driver_status` run.
8. On interrupt or poll: process completions, refill, write the
   interrupt doorbell to re-arm.

One queue in each direction on one notification block is enough, and
a driver can poll in place of handling interrupts.

## In seL4

The kernel has no network drivers, and upstream
[sDDF](../sel4/sddf.md) has no gVNIC driver: its
[`drivers/network/`](https://github.com/au-ts/sddf/tree/main/drivers/network)
holds `virtio` and five drivers for Arm system-on-chip Ethernet. So on
C3, C4, N4 and every Arm series there is no network without writing
one, as an sDDF driver behind the usual queues
([sddf-net](../sel4/sddf-net.md)).

What such a driver needs from the system:

- **The BARs mapped**, at addresses known when the system is described,
  since Microkit systems are static. Firmware places them differently
  per machine type (registers at `0xc0102000` on an N1, `0xd1202000` on
  a C4, observed).
- **An interrupt.** The device has no INTx fallback worth relying on,
  so this means MSI-X: on x86 an MSI vector from the kernel's
  `X86IRQControl`, on Arm an LPI through the
  [GICv3 ITS](gicv3-its.md), which upstream seL4 does not yet drive.
  Polling avoids the question. See
  [IRQ handling](../sel4/irq-handling.md).
- **DMA-able memory with known physical addresses**, which sDDF's data
  regions already are. For QPL formats, sDDF's own receive and transmit
  data regions can be registered as the page lists, avoiding the copy
  that Linux makes (observed to work on N1, 2026).

Reference implementations: Linux
(`drivers/net/ethernet/google/gve/`, the fullest), FreeBSD
(`sys/dev/gve/`), DPDK (`drivers/net/gve/`), and iPXE
(`src/drivers/net/gve.c`, the smallest; it handles all four formats).

## Gotchas

- **Endianness changes with the format**: registers, admin queue and
  GQI are big-endian; DQO descriptors and doorbells are little-endian.
- **A driver for one format is not a gVNIC driver.** N1 and T2A need
  GQI QPL; N4A needs DQO QPL; C4 and C4A prefer DQO RDA.
- **GQI's 2-byte receive pad**: the frame does not start at the start
  of the buffer, which a buffer-queue interface with no offset field
  cannot express without moving the data.
- **Moving the BARs fails on N1**: after reprogramming them the device
  accepts the new values but does not answer at the new addresses,
  while a C4 does (observed, 2026). Use the firmware's placement.
- **The card can drop its admin queue just after boot.** On a
  `c4-standard-2` (observed 2026-11-16), a driver that started within
  about a second of boot gave the card its admin queue, read
  `adminq_pfn` back as written, and then found it 0 when the next
  command timed out, with `adminq_event_counter` still 0. It struck at
  the first, second or third command in three boots of four. The likely
  cause is a reset begun before the guest's driver ran finishing late
  (unchecked); the usual release step, write 0 to `adminq_pfn` and wait
  for it to read 0, cannot see it, because the register already reads
  0. Linux starts later and does not meet it. A driver that starts early
  should check whether the queue address has gone to 0 when set-up
  fails, and set up again from nothing, a bounded number of times.
- **The firmware leaves memory decoding and bus mastering on**: the
  command register read `0x17` on a `c4-standard-2` (observed
  2026-11-16).
- **Leaving the management vector masked** works, but link changes and
  device-requested resets then go unseen.
- **It needs a flag on the image**: without `GVNIC` in the image's
  guest OS features, an instance with `nic-type=GVNIC` cannot be
  created, and series that offer only gVNIC cannot use the image.
- The device accepted page lists of any size, a whole frame in one GQI
  descriptor, and OS type 0 in the driver information (observed);
  none of that is promised anywhere.

## See also

- [Google Compute Engine](gce.md) and [machine types](gce-machine-types.md): where it appears
- [ENA](ena.md): EC2's counterpart, also built around an admin queue
- [virtio](virtio.md): what the older series offer instead
- [MSI and MSI-X](msi-msix.md), [GICv3 and the ITS](gicv3-its.md): its interrupts
- [sDDF networking](../sel4/sddf-net.md): where a driver would plug in

## References

- [Linux kernel documentation, "Linux kernel driver for Compute Engine Virtual Ethernet (gve)"](https://docs.kernel.org/networking/device_drivers/ethernet/google/gve.html):
  PCI IDs, BARs, endianness, admin queue procedure, interrupts, QPL and
  RDA, GQI and DQO queue behaviour. *Checked 2026-11-14.*
- [Linux `gve_register.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/google/gve/gve_register.h):
  the register block and status bits. *Checked 2026-11-14.*
- [Linux `gve_adminq.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/google/gve/gve_adminq.h):
  opcodes, command structures, device option ids. *Checked 2026-11-14.*
- [Linux `gve_adminq.c`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/google/gve/gve_adminq.c),
  `gve_adminq_alloc`: `adminq_pfn` on revision 0, base address and
  length registers on later revisions. *Checked 2026-11-14.*
- [Linux `gve_desc.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/google/gve/gve_desc.h)
  and [`gve_desc_dqo.h`](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/google/gve/gve_desc_dqo.h):
  descriptor layouts and the 2-byte receive pad. *Checked 2026-11-14.*
- [GoogleCloudPlatform/compute-virtual-ethernet-linux](https://github.com/GoogleCloudPlatform/compute-virtual-ethernet-linux):
  Google's out-of-tree copy of the Linux driver; its README gives the
  PCI IDs. *Checked 2026-11-14.*
- [DPDK GVE poll mode driver](https://github.com/DPDK/dpdk/blob/main/doc/guides/nics/gve.rst)
  (rendered at [doc.dpdk.org](https://doc.dpdk.org/guides/nics/gve.html)):
  GQI RDA deprecated and not released in production. *Checked 2026-11-14.*
- [iPXE `drivers/net/gve.c`](https://github.com/ipxe/ipxe/blob/master/src/drivers/net/gve.c):
  a small driver that selects among GQI or DQO, QPL or RDA from the
  device options. *Checked 2026-11-14.*
- [sDDF `drivers/network`](https://github.com/au-ts/sddf/tree/main/drivers/network):
  no gVNIC driver upstream. *Checked 2026-11-14.*
