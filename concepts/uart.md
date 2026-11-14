# UARTs: 16550 and PL011

> A UART is the serial port: the 16550 on x86 and many RISC-V and Arm boards and the PL011 on Arm are the two seL4 work meets most, and a serial port is the only console a debug kernel or a cloud instance has.

Read first: [I/O ports](io-ports.md), [IRQ](irq.md).

## What it is

A **UART** (universal asynchronous receiver/transmitter) turns bytes into
a timed sequence of bits on one wire and back. "Asynchronous" means there
is no clock wire: both ends agree a **baud rate** (bits per second) in
advance and the receiver resynchronises on each byte's start bit.

```
idle ‾‾‾‾‾|_____|  D0  D1  D2  D3  D4  D5  D6  D7 |‾‾‾‾‾|‾‾‾ idle
          start   least significant bit first      stop
```

That is the **8N1** frame: 8 data bits, no parity bit, 1 stop bit, so 10
bit times per byte and 115200 baud carries 11520 bytes a second. Inside,
the transmitter has a holding register the driver writes and a **shift
register** that clocks the bits out; the receiver has the reverse. Later
UARTs put a **FIFO** (first in, first out queue) of 16 or more bytes in
front of each shift register so the driver need not service every byte.
The bit clock is an input clock divided by a programmable **divisor**;
UARTs sample each bit 16 times, so

    baud = input clock / (16 × divisor)

On a virtual machine there is no wire and no timing: the hypervisor takes
each byte written and appends it to a log or a socket. The divisor is
accepted and ignored. The register interface is all that remains, which
is why it is the simplest device a hypervisor can offer and the first a
kernel port needs.

### The 16550

The PC's serial chip (the 8250, then the 16450, then the 16550A which
added working FIFOs) has eight one-byte registers. On a PC they are
[I/O ports](io-ports.md):

| Port | [ISA](isa.md) IRQ | Name |
|---|---|---|
| `0x3F8` to `0x3FF` | 4 | COM1 |
| `0x2F8` to `0x2FF` | 3 | COM2 |
| `0x3E8` to `0x3EF` | 4 | COM3 |
| `0x2E8` to `0x2EF` | 3 | COM4 |

| Offset | Read | Write | Bits that matter |
|---|---|---|---|
| 0 | RBR, receive buffer | THR, transmit holding | |
| 1 | IER, interrupt enable | | bit 0 received data, bit 1 THR empty |
| 2 | IIR, interrupt identification | FCR, FIFO control | IIR bit 0 = 1 means *no* interrupt pending; FCR bit 0 enable FIFOs, bits 1 and 2 clear them |
| 3 | LCR, line control | | `0x03` = 8N1; bit 7 is **DLAB** |
| 4 | MCR, modem control | | bit 0 DTR, bit 1 RTS, bit 3 OUT2 |
| 5 | LSR, line status | | bit 0 DR (data ready), bit 1 overrun, bit 5 **THRE** (holding register empty), bit 6 TEMT (transmitter wholly idle) |
| 6 | MSR, modem status | | |
| 7 | SCR, scratch | | no function; reads back what was written |

While **DLAB** (divisor latch access bit) is set, offsets 0 and 1 are
instead DLL and DLM, the low and high bytes of the divisor. The PC's
input clock is 1.8432 MHz, so divisor 1 gives 1843200 / 16 = 115200
baud, the fastest standard rate and the usual console setting; divisor
12 gives 9600.

On a PC the UART's interrupt output reaches the interrupt controller only
if MCR's OUT2 bit is set (unchecked: a board wiring convention, not in
the chip).

**Memory-mapped 16550s** are common off the PC ("ns16550a",
"snps,dw-apb-uart" in a [device tree](device-tree.md)). The eight
registers are the same but boards space them differently, described by
two properties: `reg-shift` (register *n* is at byte offset
*n* << shift; 2 is common, giving registers 4 bytes apart) and
`reg-io-width` (1 or 4: whether each must be read and written as a byte
or as a 32-bit word). The input clock, and so the divisor, also varies.

### The PL011

Arm's own UART design (a "PrimeCell"), found in most Arm system-on-chips
and in QEMU's `virt` machine at `0x09000000`. Registers are 32 bits wide
at 4-byte offsets:

| Offset | Name | Use |
|---|---|---|
| `0x00` | UARTDR | data: write to send, read to receive |
| `0x18` | UARTFR | flags: bit 3 BUSY, bit 4 RXFE (receive FIFO empty), bit 5 TXFF (transmit FIFO full), bit 7 TXFE |
| `0x24`, `0x28` | UARTIBRD, UARTFBRD | integer (16 bits) and fractional (6 bits) baud divisor |
| `0x2C` | UARTLCR_H | line control: bits 5-6 = 3 for 8 bits, bit 4 FEN enables the FIFOs |
| `0x30` | UARTCR | control: bit 0 UARTEN, bit 8 TXE, bit 9 RXE |
| `0x38` | UARTIMSC | interrupt mask: bit 4 receive, bit 5 transmit, bit 6 receive timeout |
| `0x3C`, `0x40` | UARTRIS, UARTMIS | raw and masked interrupt status |
| `0x44` | UARTICR | interrupt clear (write 1 to clear) |

The divisor is clock / (16 × baud) as a fixed-point number; a write to
UARTIBRD or UARTFBRD takes effect only on the next write to UARTLCR_H
(unchecked: from the PL011 manual, not opened today).

The senses are the opposite of the 16550's and worth memorising: a 16550
may be written when LSR **THRE is 1**; a PL011 may be written when UARTFR
**TXFF is 0**.

Arm's server specification (SBSA) defines a **generic UART**: the PL011
subset UARTDR, UARTFR, UARTRIS/MIS/IMSC and UARTICR, with baud rate and
enabling done by firmware beforehand. A driver that only polls UARTFR and
writes UARTDR, as seL4's does, works on either (unchecked: the subset's
exact register list is from memory).

### Polling and interrupts

A **polled** driver spins on the status register before each byte. It
needs no interrupt and works with interrupts off, which is what a kernel
wants for debug output. An **interrupt-driven** driver enables the
receive interrupt (and the transmit interrupt only while it has data
queued), and on interrupt drains the receive FIFO until it is empty.

### How a console is advertised

- **Device tree**: `/chosen/stdout-path` names the UART's node.
- **ACPI**: the **SPCR** (serial port console redirection) table gives
  the console's interface type (16550, PL011, SBSA generic and others),
  its address (I/O port or MMIO), interrupt and baud rate. **DBG2**
  lists debug ports in the same manner. See [ACPI tables](acpi-tables.md).
- **PC BIOS**: the BIOS data area holds the port bases it found, as
  16-bit words from physical address `0x400`.

## In seL4

**The kernel uses a UART only to print, and only in debug builds.**
`KernelPrinting` (`CONFIG_PRINTING`) defaults to the value of
`KernelDebugBuild` and is unavailable in verification builds; with it off
there is no `printf`, no serial driver and no console at all in the
kernel, which is the release configuration. With `KernelDebugBuild` user
level can print through the kernel with the `seL4_DebugPutChar` system
call, which is how early root-task output usually appears. See
[Debugging](../sel4/debugging.md).

- **Arm and RISC-V**: one small polled driver per UART family in
  [`src/drivers/serial/`](https://github.com/seL4/seL4/tree/master/src/drivers/serial)
  (`pl011.c`, `imx.c`, `tegra_omap3_dwapb.c` for the 16550-like
  DesignWare UART, and others). Each provides `uart_drv_putchar()` and
  under `CONFIG_DEBUG_BUILD` `uart_drv_getchar()`. `pl011.c` is two
  loops: wait while UARTFR has TXFF, write UARTDR. It never initialises
  the device, relying on the boot loader. Which driver and which address
  comes from the device tree: the node listed in `seL4,kernel-devices`
  is matched by `compatible` in `tools/hardware.yml` and mapped at the
  fixed kernel address `UART_PPTR` (see
  [Generated code](../sel4/generated-code.md)). RISC-V kernels
  print through the SBI firmware's console call instead
  (`sbi_console_putchar()` in `src/arch/riscv/machine/io.c`).
- **x86**:
  [`src/plat/pc99/machine/io.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/io.c).
  `serial_init(port)` programs a 16550 through I/O ports: interrupts off,
  DLAB set, divisor 1, LCR `0x03`, MCR `0x0b` (DTR, RTS, OUT2).
  `uart_drv_putchar()` waits for LSR bit `0x20` (THRE) and writes the
  byte. The port comes from the kernel command line, parsed in
  [`src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c):
  `console_port=0x3f8` (for `printf`, under `CONFIG_PRINTING`) and
  `debug_port=0x3f8` (for the debug system calls, under
  `CONFIG_DEBUG_BUILD`). The default for each is the first port in the
  BIOS data area if the BIOS lists any, else `0x3f8`; a value of 0
  disables it. Only I/O-port UARTs are supported.

The kernel hands the UART over like any device: on x86 the root task
makes an I/O port capability for `0x3f8` to `0x3ff`; elsewhere the
registers are device untyped memory. In a debug build the kernel keeps printing to a UART that a
user-level driver also owns; nothing arbitrates between them.

**User level:**

- [`util_libs`](https://github.com/seL4/util_libs/tree/master/libplatsupport)
  `libplatsupport` has a serial driver per platform behind the
  `ps_chardevice` interface (`platsupport/serial.h`), used by sel4test
  and CAmkES systems.
- [sDDF](../sel4/sddf.md) has
  [`drivers/serial/`](https://github.com/au-ts/sddf/tree/main/drivers/serial):
  `arm` (PL011), `ns16550a` (memory-mapped, with a build-time
  `REG_SHIFT` of 0 or 2), `pc99` (I/O-port 16550), `imx`, `meson`,
  `zynqmp` and `virtio` (see [virtio](virtio.md)). They are
  interrupt-driven and sit behind transmit and receive virtualisers that
  multiplex clients.
- The [elfloader](../sel4/elfloader.md) has its own small UART drivers
  for its messages before the kernel starts.

## Gotchas

- **A release kernel is silent.** No output after the boot loader does
  not mean the kernel failed; check `KernelPrinting` first.
- **The console is not always COM1.** seL4's x86 code assumes an
  I/O-port 16550. On [EC2](ec2.md) bare-metal instances the serial port
  is elsewhere, and on Graviton it is a memory-mapped 16550 that is a
  PCI device, not a PL011, with its address given only by SPCR. On
  [Compute Engine](gce.md) x86 has four 16550s at the COM addresses but
  no SPCR; Arm has PL011s where QEMU `virt` has one, on a different
  interrupt.
- **Under UEFI the BIOS data area is meaningless.** The x86 default
  reads port bases from address `0x400`; with no BIOS to fill it in the
  kernel can pick a garbage port or none. Pass `console_port` and
  `debug_port` explicitly.
- **Bytes vanish if THRE is not polled.** Writing THR while it is full
  overwrites the pending byte. Emulated UARTs often accept every byte
  instantly, so a driver that never checks LSR works under QEMU and
  drops characters on hardware (and on hypervisors that model the FIFO).
- **Waiting for the wrong bit hangs.** A missing UART reads as `0xFF`
  on x86, so THRE appears set and output goes nowhere without error; on
  a memory-mapped UART at the wrong address the read faults instead.
- **`reg-shift` mistakes look like a dead UART**: with shift 2 treated
  as 0, LSR is read from offset 5 instead of `0x14`.
- **`\n` alone staircases.** Terminals want `\r\n`; the kernel's
  `uart_console_putchar()` inserts the `\r`, user-level drivers may not.
- **Interrupt-driven transmit needs a kick**: the 16550's THR-empty
  interrupt fires on the transition to empty, so the first byte must be
  written directly (unchecked: behaviour from memory).

## See also

- [I/O ports](io-ports.md): how the x86 16550 is reached
- [ISA](isa.md): IRQ 3 and 4 and the legacy device map
- [Device trees](device-tree.md): `stdout-path`, `reg-shift`
- [ACPI tables](acpi-tables.md): SPCR and DBG2
- [Amazon EC2](ec2.md) and [Google Compute Engine](gce.md): where their serial ports are and how to read them
- [QEMU](qemu.md): `-serial mon:stdio`
- [virtio](virtio.md): the virtio console, a UART without registers
- [Debugging](../sel4/debugging.md): kernel printing and debug system calls
- [Elfloader](../sel4/elfloader.md): its own UART drivers
- [Index](../INDEX.md): the reading order

## References

- [Linux `include/uapi/linux/serial_reg.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/serial_reg.h):
  16550 register offsets and bits. *Checked 2026-11-14.*
- [Linux `include/linux/amba/serial.h`](https://github.com/torvalds/linux/blob/master/include/linux/amba/serial.h):
  PL011 register offsets and bits. *Checked 2026-11-14.*
- [seL4 `src/plat/pc99/machine/io.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/io.c)
  and [`src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c):
  the x86 console. *Checked 2026-11-14.*
- [seL4 `src/drivers/serial/pl011.c`](https://github.com/seL4/seL4/blob/master/src/drivers/serial/pl011.c):
  the Arm polled driver. *Checked 2026-11-14.*
- [seL4 `config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake):
  `KernelPrinting`, `KernelDebugBuild`. *Checked 2026-11-14.*
- [sDDF `drivers/serial/ns16550a/include/uart.h`](https://github.com/au-ts/sddf/blob/main/drivers/serial/ns16550a/include/uart.h):
  `REG_SHIFT`. *Checked 2026-11-14.*
- Texas Instruments, "PC16550D Universal Asynchronous
  Receiver/Transmitter with FIFOs" datasheet: the register reference.
  *Unchecked (not opened; COM port addresses, the 1.8432 MHz clock and
  FIFO depth are from memory).*
- Arm, "PrimeCell UART (PL011) Technical Reference Manual" (DDI 0183),
  chapter 3: registers. *Unchecked (developer.arm.com refuses scripted
  fetches).*
- Arm, "Server Base System Architecture", appendix on the generic UART.
  *Unchecked (developer.arm.com).*
- Microsoft, "Serial Port Console Redirection Table (SPCR)". *Unchecked
  (not opened).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
