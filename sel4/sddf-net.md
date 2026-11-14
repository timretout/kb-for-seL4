# sDDF networking

> The network class of sDDF in detail: free and active queues of buffer descriptors between driver, RX and TX virtualisers, per-client copiers and clients, who owns a buffer at each step, and what a NIC driver has to implement.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [sDDF](sddf.md) · [LionsOS and libvmm](lionsos.md) →

Read first: [sDDF](sddf.md), [Microkit](microkit.md).

| At a glance | |
|---|---|
| Kind | Framework subsystem: the network class of sDDF |
| Repository | The [sDDF](sddf.md) repository |
| Key source | `include/sddf/network/queue.h`, `network/components/`, `drivers/network/<nic>/` |
| API | `net_enqueue_free`, `net_enqueue_active`, `net_dequeue_free`, `net_dequeue_active`, `net_request_signal_*`, `net_require_signal_*` |
| Built on | [sDDF](sddf.md) queues and signalling, [Microkit](microkit.md) PDs |
| Used by | lwIP clients, the `echo_server` example, [LionsOS and libvmm](lionsos.md) |

## What it is

sDDF's network subsystem moves Ethernet frames between one network
card (NIC) and several clients, each a separate
[Microkit](microkit.md) protection domain (PD). It is the most mature
[sDDF](sddf.md) class and the template for the others.

### Components

```
                +---------+        +--------+
            +-->| copier0 |------->|        |
            |   +---------+  RX    | client0|  (lwIP + application)
 +------+   |                 +----|        |
 |      |-->+-- virt_rx       | TX +--------+
 | NIC  |   |   +---------+   |    +--------+
 |driver|   +-->| copier1 |---|--->|        |
 |      |       +---------+   |    | client1|
 |      |<----- virt_tx <-----+----|        |
 +------+                          +--------+
    ^
    | registers, IRQ, DMA
  device
```

Every arrow is a **connection**: a pair of queues in shared memory plus
a Microkit channel. Data regions are separate:

| Region | Mapped into | Purpose |
|---|---|---|
| RX DMA region | virt_rx (read-write), every copier (read-only); the driver does not need it mapped | buffers the NIC receives into |
| client RX region, one per client | that client and its copier | where the copier puts the client's packets |
| client TX region, one per client | that client and virt_tx; the device can DMA from it | where the client builds outgoing packets |

### Descriptors and queues

From `include/sddf/network/queue.h`:

```c
typedef struct net_buff_desc {
    uint64_t io_or_offset;  /* offset in a data region, or device (DMA) address */
    uint16_t len;           /* bytes of packet data */
    uint8_t  oid : 6;       /* which region; only used with the vswitch */
} net_buff_desc_t;

typedef struct net_queue {
    uint16_t tail;                /* producer inserts here */
    uint16_t head;                /* consumer removes here */
    uint32_t consumer_signalled;  /* 0: consumer wants a notification */
    net_buff_desc_t buffers[];
} net_queue_t;

typedef struct net_queue_handle {
    net_queue_t *free;    /* empty buffers */
    net_queue_t *active;  /* buffers holding a packet */
    uint32_t capacity;
} net_queue_handle_t;
```

A buffer is `NET_BUFFER_SIZE` = 2048 bytes, so one frame is always one
buffer. `head` and `tail` are free-running 16-bit counters; the slot is
`index % capacity` and the length `tail - head`. The capacity is not in
shared memory: each side takes it from its own configuration, so a
neighbour cannot change it. `io_or_offset` means a **device address**
on the driver's side of the virtualisers and an **offset into a data
region** on the client's side: a client never sees a physical address,
and a virtualiser never dereferences a pointer a client chose.

Operations: `net_enqueue_free`, `net_enqueue_active`,
`net_dequeue_free`, `net_dequeue_active` (return -1 when full or
empty), `net_queue_empty_*`, `net_queue_full_*`, `net_queue_length`,
`net_queue_init` and `net_buffers_init` (fills a free queue with
offsets 0, 2048, 4096, ...).

A descriptor is in exactly one place at a time, and whoever dequeued it
owns the buffer until it enqueues it again.

### Receive path

1. **virt_rx** owns the RX DMA buffers at start and puts their device
   addresses on the driver's *free* queue (`rx_provide`).
2. The **driver** dequeues free buffers and hands their addresses to
   the NIC's receive ring. When the NIC reports a frame, the driver
   sets `len` and enqueues the descriptor on its *active* queue, then
   signals virt_rx if asked.
3. **virt_rx** (`rx_return`) dequeues it, subtracts the region's
   `io_addr` to get an offset, invalidates the data cache for the
   buffer, reads the destination MAC address and enqueues the
   descriptor on the *active* queue of the matching client's
   connection. A broadcast frame goes to every client, with a
   reference count per buffer (`buffer_refs`) so it returns to the
   driver only when all have released it. A frame for nobody goes
   straight back to the driver's free queue.
4. The client's **copier** (`copy.c`, `rx_return`) dequeues it,
   takes a buffer from the client's *free* queue, checks the offset the
   client supplied is aligned and in range, `memcpy`s the packet into
   the client's own region, enqueues that descriptor on the client's
   *active* queue, and returns the DMA buffer on virt_rx's *free*
   queue. If the client has supplied no free buffer the packet is
   dropped, and the DMA buffer still goes back.
5. The **client** dequeues the packet, processes it and puts the buffer
   back on its *free* queue.
6. virt_rx turns returned offsets back into device addresses and
   refills the driver's free queue.

![On the receive path full buffers travel on active queues from driver to virt_rx to copier to client and empty ones return on free queues; the copier copies each packet from the RX DMA region into the client's own region.](../images/sddf-net-rx-path.svg)

*The receive path's queues and data regions. Descriptors hold device addresses between driver and virt_rx and offsets everywhere else, and only the copier touches both regions.*

### Transmit path

1. The **client** takes a buffer of its own TX region from its *free*
   queue, writes the frame, sets `len` and enqueues it on its *active*
   queue to virt_tx.
2. **virt_tx** (`tx_provide`) checks the offset, adds the `io_addr` of
   that client's region (`net_virt_tx_config_t.clients[i]`), flushes
   the cache for the data, and enqueues the descriptor on the driver's
   *active* queue. There is no copy: the NIC transmits straight from
   the client's memory.
3. The **driver** puts the address in the NIC's transmit ring. On
   transmit completion it enqueues the descriptor on its *free* queue.
4. **virt_tx** (`tx_return`) works out from the address which client's
   region the buffer belongs to, converts back to an offset and returns
   it on that client's *free* queue.

### Why a copier, and when not

Without it, received packets for all clients sit in one DMA region that
every client would need mapped, so client A could read B's traffic, and
a client that never returned buffers would starve the NIC for everyone.
The copier confines each client to its private region and makes "client
is slow" mean only "client's packets are dropped". Transmit needs no
copier because each client's TX region is already private. A system
with one client, or clients that trust each other, can connect the
client directly to virt_rx and save the copy (`docs/network/network.md`
says a client can be connected without a copier, and discusses what
is lost under "Copy components and availability").

Other components in `network/components/`: `arp.c` (answers ARP on
behalf of clients) and `vswitch.c` (a virtual switch so clients can
reach each other; it is why descriptors carry `oid`).

### Signalling

`consumer_signalled == 0` means the consumer wants a notification. Per
queue of a handle:

| Function | Effect |
|---|---|
| `net_request_signal_free/active(q)` | consumer: clear the flag ("wake me") |
| `net_cancel_signal_free/active(q)` | set the flag ("no need"); the producer does this just before notifying |
| `net_require_signal_free/active(q)` | producer: is the flag clear? |

The consumer loop is the "drain, request, re-check" idiom explained in
[sDDF](sddf.md); the producer side is

```c
if (enqueued && net_require_signal_active(&q)) {
    net_cancel_signal_active(&q);
    sddf_notify(config.client.id);    /* or sddf_deferred_notify */
}
```

### Configuration structs

`include/sddf/network/config.h` defines one struct per component,
filled in at build time by the metaprogram and placed in an ELF
section: `net_driver_config_t` (`virt_rx`, `virt_tx`),
`net_virt_rx_config_t` (driver connection, DMA `data` region,
`buffer_metadata`, per client a connection and MAC addresses),
`net_virt_tx_config_t` (driver connection, per client a connection and
its data regions with `io_addr`), `net_copy_config_t`,
`net_client_config_t` (RX and TX connections and data regions,
`mac_addr`) and `net_vswitch_config_t`. The building block is

```c
typedef struct net_connection_resource {
    region_resource_t free_queue;    /* .vaddr, .size */
    region_resource_t active_queue;
    uint16_t num_buffers;            /* queue capacity */
    uint8_t id;                      /* Microkit channel */
} net_connection_resource_t;
```

At most `SDDF_NET_MAX_CLIENTS` = 64 clients. The driver also has the
generic `device_resources_t` (register and DMA regions, IRQ channel).

### What a NIC driver implements

The virtio-net driver, `drivers/network/virtio/common/ethernet.c`
(about 470 lines), shows the whole shape. See
[virtio](../concepts/virtio.md) for virtqueues.

| Function | Job |
|---|---|
| `init` | check config magic; `net_queue_init` for `rx_queue` and `tx_queue`; `eth_setup`: reset the device, negotiate features, read the MAC address, set up the RX and TX rings in DMA memory, enable; acknowledge the IRQ once |
| `rx_provide` | move buffers from the sDDF RX *free* queue into the device's receive ring (for virtio: a header descriptor chained to a buffer descriptor, then `avail->idx++` after a write barrier) |
| `rx_return` | for each completed receive: set `len`, enqueue on RX *active*; then signal virt_rx if required |
| `tx_provide` | move descriptors from the sDDF TX *active* queue into the device's transmit ring, then kick the device |
| `tx_return` | for each completed transmit: enqueue the buffer on TX *free*; signal virt_tx if required |
| `handle_irq` | read and clear the interrupt status, then `tx_return`, `tx_provide`, `rx_return` |
| `notified(ch)` | IRQ channel: `handle_irq` then `sddf_deferred_irq_ack(ch)`; virt_rx channel: `rx_provide`; virt_tx channel: `tx_provide` |

The driver keeps a small table from ring slot to sDDF descriptor so a
completion can be turned back into a `net_buff_desc_t`, and uses
`ialloc` (an index allocator from `util/`) for virtio descriptor
numbers. It never touches packet contents, so it does not map the data
regions.

Other NIC drivers upstream: `imx` (i.MX8 FEC), `meson`, `dwmac-5.10a`
(Synopsys DWMAC, several SoCs), `genet` (Raspberry Pi 4) and
`zynqmp-gem`. An Intel `ixgbe` driver exists only on branches. Nothing
exists for [ENA](../concepts/ena.md) or
[gVNIC](../concepts/gvnic.md): a cloud port must write those, and both
need PCI and MSI-X, admin queues and multi-buffer or larger-MTU
handling the virtio driver never meets.

### Clients, the echo server and benchmarking

The usual client stack is **lwIP**, vendored in `network/ipstacks/lwip`
with glue in `network/lib_sddf_lwip/` that implements lwIP's netif on
the sDDF queues and uses the [timer subsystem](sddf.md) for TCP timers.
`examples/echo_server/` builds two lwIP clients with UDP and TCP echo
sockets, both virtualisers, copiers, a timer driver and a serial
subsystem; it is the standard test for a new NIC driver
(`make MICROKIT_BOARD=<board> MICROKIT_SDK=<sdk>
MICROKIT_CONFIG=debug`). Under `MICROKIT_CONFIG=benchmark` the
`benchmark/` PDs (`benchmark.c`, `idle.c`) measure per-PD CPU
utilisation, reported through `utilization_socket.c` to an external
load generator (ipbench, as the example's README describes).

## In seL4

Not kernel code; see [sDDF](sddf.md) for the repository layout. The
files for this page:

| Path | Contents |
|---|---|
| `include/sddf/network/queue.h` | descriptors, queues, signalling |
| `include/sddf/network/config.h` | config structs |
| `include/sddf/network/constants.h` | `NET_BUFFER_SIZE` |
| `network/components/virt_rx.c`, `virt_tx.c`, `copy.c`, `arp.c`, `vswitch.c` | the generic components |
| `drivers/network/<nic>/` | drivers |
| `acacia_sddf/net.py` | generation of the SDF and config data for a network system |
| `docs/network/network.md` | architecture, safety properties, usage |

Each generic component's time is bounded by its [MCS](mcs.md) budget,
and the driver's interrupt arrives as a
[notification](notifications.md) that stays masked until acknowledged
([IRQ handling](irq-handling.md)).

## Gotchas

- **Queue struct layout changed over time.** Older code and papers show
  `capacity` inside the shared struct and 32-bit indices; on `main` the
  indices are 16-bit and capacity is local. Capacity must stay below
  65536 and, for the `%` arithmetic across wrap-around to work, be a
  power of two (`acacia_sddf/net.py` rejects buffer counts that are
  not).
- **`io_or_offset` changes meaning at the virtualisers.** Driver-side
  code treats it as a device address and never as a pointer; printing
  it as a virtual address while debugging misleads.
- **The driver's addresses are what the device sees.** With an
  [IOMMU](../concepts/iommu.md) enabled (Microkit's x86 default) that
  is an I/O virtual address, not a physical one.
- **Cache maintenance is the virtualisers' job**, not the driver's
  (`cache_clean_and_invalidate` in virt_rx), and only matters on Arm
  and RISC-V with non-coherent DMA.
- **An IRQ handler must look at both directions.** The virtio driver
  runs `tx_return`, `tx_provide` and `rx_return` on every interrupt
  because the status register does not say which queue fired.
- **Ack with the deferred call last.** `sddf_deferred_irq_ack` and
  `sddf_deferred_notify` share Microkit's single deferred slot: a
  handler that needs both must send one of them immediately.
- **x86 builds of the virtio driver hard-code** PCI address 00:02.0,
  channel 16 and ring addresses; see [sDDF](sddf.md).
- **One buffer per frame, 2048 bytes.** No jumbo frames, scatter-gather
  or offloads; a NIC that insists on larger or split receive buffers
  needs driver-side copying.

## See also

- [sDDF](sddf.md): principles, tooling and the other classes
- [virtio](../concepts/virtio.md): the device model of the worked example
- [ENA](../concepts/ena.md) and [gVNIC](../concepts/gvnic.md): the cloud NICs with no sDDF driver yet
- [PCI](../concepts/pci.md) and [MSI and MSI-X](../concepts/msi-msix.md): what an x86 NIC driver needs first
- [LionsOS and libvmm](lionsos.md): systems built on this subsystem
- [Index](../INDEX.md): the reading order

## References

- [`include/sddf/network/queue.h`](https://github.com/au-ts/sddf/blob/main/include/sddf/network/queue.h): descriptor, queue, handle, signalling functions. *Checked 2026-11-14.*
- [`include/sddf/network/config.h`](https://github.com/au-ts/sddf/blob/main/include/sddf/network/config.h): the config structs and `SDDF_NET_MAX_CLIENTS`. *Checked 2026-11-14.*
- [`network/components/copy.c`](https://github.com/au-ts/sddf/blob/main/network/components/copy.c): the copier's loop, offset checks and signalling. *Checked 2026-11-14.*
- [`network/components/virt_rx.c`](https://github.com/au-ts/sddf/blob/main/network/components/virt_rx.c): address translation, cache invalidation, broadcast reference counts. *Checked 2026-11-14.*
- [`network/components/virt_tx.c`](https://github.com/au-ts/sddf/blob/main/network/components/virt_tx.c): `tx_provide`, `tx_return`, the offset checks and translation. *Checked 2026-11-14.*
- [`drivers/network/virtio/common/ethernet.c`](https://github.com/au-ts/sddf/blob/main/drivers/network/virtio/common/ethernet.c): `init`, `notified`, `handle_irq`, `rx_provide`. *Checked 2026-11-14.*
- [`docs/network/network.md`](https://github.com/au-ts/sddf/blob/main/docs/network/network.md): architecture, safety properties, copiers and availability, lwIP, Acacia usage. *Checked 2026-11-14.*
- [`acacia_sddf/net.py`](https://github.com/au-ts/sddf/blob/main/acacia_sddf/net.py): the power-of-two checks on buffer counts. *Checked 2026-11-14.*
- [`examples/echo_server/README.md`](https://github.com/au-ts/sddf/blob/main/examples/echo_server/README.md): supported boards (including `x86_64_generic` on QEMU), build command, benchmarking with ipbench. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
