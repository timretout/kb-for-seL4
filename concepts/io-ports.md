# I/O ports (port-mapped I/O)

> x86's separate 16-bit address space for device registers, reached with the `in` and `out` instructions; seL4 keeps user threads away from the instructions and hands out ranges of ports as IOPort capabilities.

[Index](../INDEX.md) › [Part 2: Processor fundamentals](../INDEX.md#part-2-processor-fundamentals) › [x86-64](../INDEX.md#x86-64) · ← [x86-64 exceptions and system calls](x86-exceptions-syscalls.md) · [x86 boot: BIOS, GRUB and Multiboot](x86-boot.md) →

Read first: [x86-64 basics](x86-64-basics.md).

| At a glance | |
|---|---|
| Kind | Address space for device registers (port-mapped I/O), set against MMIO |
| Architecture | x86 |
| Reached through | The `in` and `out` instructions |
| Key numbers | 65536 ports (16-bit numbers); `seL4_CapIOPortControl` is slot 7 |
| seL4 code | [`src/arch/x86/object/ioport.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/ioport.c) |
| seL4 use | User threads cannot run `in` or `out`; port ranges are IOPort capabilities and each access is a system call |
| On the clouds | Usually COM1 and PCI configuration ports; PIT, PIC or keyboard controller may be absent |

## What it is

A device is controlled through registers. There are two ways for a
CPU to reach them:

- **Memory-mapped I/O (MMIO)**: the registers appear at physical
  addresses, and ordinary loads and stores reach them. This is the
  only way on Arm and RISC-V, and the way of every modern x86 device
  ([APIC](apic.md), [HPET](hpet.md), PCI device BARs).
- **Port-mapped I/O**: x86 also has a second, tiny address space of
  65536 **ports** (16-bit numbers), with its own instructions. It
  dates from the 8080 and survives because the PC's original devices
  live there.

The architecture facts here are from the Intel manual, not opened
today (unchecked); port numbers quoted from seL4 are checked.

### The instructions

`in` reads 1, 2 or 4 bytes from a port into `al`, `ax` or `eax`; `out`
writes them. The port number is an 8-bit immediate or the value of
`dx`:

```
    movw $0x3f8, %dx
    outb %al, %dx        # write AL to port 0x3f8 (COM1 data)
    inb  %dx, %al        # read it back
```

There are string forms (`ins`, `outs`) for block transfers. Ports are
not paged, not cached, and each access is a serialising, slow
operation, on the order of a microsecond on real hardware and a VM
exit under a hypervisor (unchecked).

### Who may use them

Two mechanisms decide whether `in`/`out` faults with #GP in ring 3:

1. **IOPL**, bits 12 and 13 of `RFLAGS`: if the current ring number is
   less than or equal to IOPL, all ports are allowed. A kernel leaves
   IOPL at 0, so that is ring 0 only.
2. Otherwise the CPU consults the **I/O permission bitmap** in the
   TSS: one bit per port, 0 = allowed, located by the TSS's "I/O map
   base" field. A full bitmap is 8192 bytes. A base at or beyond the
   TSS limit means "no ports".

Linux's `ioperm()` and `iopl()` are these two knobs.

### What lives at ports

| Ports | Device |
|---|---|
| `0x20`-`0x21`, `0xA0`-`0xA1` | [8259 PICs](pic-8259.md) |
| `0x40`-`0x43` | [PIT](pit.md): channel 0 at `0x40`, mode register at `0x43` |
| `0x60`, `0x64` | keyboard controller |
| `0x70`-`0x71` | CMOS real-time clock |
| `0x3F8` (COM1), `0x2F8` (COM2) | 16550 [UARTs](uart.md), 8 ports each |
| `0xCF8`, `0xCFC` | [PCI](pci.md) configuration: address and data |

Most are [ISA](isa.md)-era devices at fixed addresses. PCI devices can
also claim port ranges through I/O BARs (legacy virtio does), assigned
by firmware. PCI configuration access works by writing a
bus/device/function/register address to `0xCF8` and reading or writing
`0xCFC`; PCI Express replaces it with a memory-mapped region (ECAM).

### MMIO by contrast

MMIO needs no special instruction but does need care that RAM does
not:

- the mapping must be **uncached** (or write-combining for frame
  buffers), set through page attributes ([PAT](x86-paging.md) on
  x86), or a read may come from the cache and a write may never
  leave it;
- every access must really happen, in order and at the stated width:
  in C that means `volatile` accesses, or the compiler may merge,
  reorder or drop them;
- reads can have side effects (clearing an interrupt, popping a
  FIFO), so a debugger or a speculative read is not harmless.

## In seL4

**User threads cannot execute `in` or `out`.** Threads run with IOPL
0 (`FLAGS_USER_DEFAULT`), and `init_tss()` fills the TSS's `io_map`
with ones "to block user IN/OUT instructions"
([`src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c)).
Port access is instead a kernel service guarded by capabilities, in
[`src/arch/x86/object/ioport.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/ioport.c):

- The root task receives one **IOPortControl** capability in slot
  `seL4_CapIOPortControl` (7) of its [CSpace](../sel4/cspace.md).
- `seL4_X86_IOPortControl_Issue(control, first_port, last_port, root,
  index, depth)` creates an **IOPort** capability covering that
  inclusive range. The kernel records issued ports in a global bitmap,
  `x86KSAllocatedIOPorts` (one bit for each of `NUM_IO_PORTS` = 65536
  ports); `isIOPortRangeFree()` makes `Issue` fail if any port in the
  range is already covered, and `freeIOPortRange()` clears the bits
  when the last capability to the range is deleted. So a port belongs
  to at most one issued range, though that capability can be copied.
- `seL4_X86_IOPort_In8`, `In16`, `In32`, `Out8`, `Out16`, `Out32`
  each make a system call; `decodeX86PortInvocation()` checks with
  `ensurePortOperationAllowed()` that every byte of the access is
  within the capability's range (else `seL4_IllegalOperation`), and
  the kernel executes the instruction and returns the value in a
  message register.

Each access costs a full system call, which is acceptable for the slow
legacy devices that need it. With `KernelVTX` the same capabilities
also say which ports a guest may touch directly: `setIOPortMask()`
edits a VCPU's I/O bitmap.

**The kernel's own use.** `in8()`/`out8()` and wider variants in
`include/plat/pc99/plat/machine/io.h` wrap the instructions. The kernel
uses them for:

- the serial console and debug port: `cmdline.c` takes the port from
  the BIOS data area or defaults to `0x3f8`, overridable with
  `console_port=` and `debug_port=` on the kernel command line, and
  `src/plat/pc99/machine/io.c` drives the UART;
- the PIT, to calibrate the TSC and APIC timer
  (`src/plat/pc99/machine/pit.c`, ports `0x40` and `0x43`);
- masking the legacy PICs.

The kernel does not reserve those ports in the bitmap for itself in
any way I confirmed (unchecked), so the root task can issue a
capability for `0x3f8` and share the UART with kernel debug output.
[Microkit](../sel4/microkit.md) system descriptions declare I/O port
ranges for a protection domain on x86 (unchecked).

**Other architectures.** There is no IOPort object on Arm or RISC-V.
All device access is MMIO: device memory is handed to the root task
as device [untypeds](../sel4/untyped-memory.md), retyped into frames
and mapped into a driver's [VSpace](../sel4/vspace.md); x86 MMIO
devices work the same way.

![Two routes from user level to a device in seL4: a port access is a system call on an IOPort capability and the kernel executes in or out, while a memory-mapped device is reached by loads and stores to a frame mapped in the driver's VSpace.](../images/io-ports-sel4-access.svg)

*The kernel sits on the path of every port access and of no MMIO access.*

## Gotchas

- **A port access from user level is a system call, not an
  instruction.** Driver code ported from Linux that uses `inb`/`outb`
  directly takes a #GP, delivered as a user exception fault.
- **`Issue` fails on overlap**, even partial. Two drivers that need
  neighbouring ports of one device (a UART's eight) should get one
  range, or carefully disjoint ones.
- **Clouds have few port devices.** A VM usually still has COM1 and
  PCI configuration ports, but the PIT, PIC or keyboard controller may
  be absent or only partly emulated, and reads of a missing port
  return all ones rather than faulting. See [Cloud VMs](cloud-vms.md).
- **An x86 kernel built for a machine with no UART at `0x3f8` still
  writes to it** unless `console_port=0` is given; harmless, but the
  early `head.S` messages are lost.
- **MMIO through a cached mapping appears to work in an emulator and
  fails on hardware.** When mapping device frames, pass the
  uncached attribute for the architecture.

## See also

- [ISA](isa.md): the legacy devices and their fixed ports and IRQs
- [PCI](pci.md): configuration through `0xCF8`/`0xCFC`, and I/O BARs
- [UART](uart.md) and [PIT](pit.md): the two port devices the kernel itself drives
- [x86-64 basics](x86-64-basics.md): `RFLAGS.IOPL` and the TSS
- [Untyped memory](../sel4/untyped-memory.md): device untypeds, the MMIO route on every architecture
- [Capabilities](../sel4/capabilities.md): the model IOPort capabilities fit into
- [x86 virtualisation](x86-virtualisation.md): I/O bitmaps for guests
- [virtio](virtio.md): virtio is the standard family of paravirtual devices
- [Virtual memory](virtual-memory.md): how an MMU translates the addresses programs use into physical ones through multi-level page tables, with...

## References

- [seL4 `src/arch/x86/object/ioport.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/object/ioport.c):
  `decodeX86PortControlInvocation()`, `isIOPortRangeFree()`,
  `freeIOPortRange()`, `ensurePortOperationAllowed()`,
  `setIOPortMask()`. *Checked 2026-11-14.*
- [seL4 `libsel4/arch_include/x86/interfaces/object-api-arch.xml`](https://github.com/seL4/seL4/blob/master/libsel4/arch_include/x86/interfaces/object-api-arch.xml):
  `seL4_X86_IOPortControl_Issue` and the six `seL4_X86_IOPort`
  methods. *Checked 2026-11-14.*
- [seL4 `include/arch/x86/arch/object/ioport.h`](https://github.com/seL4/seL4/blob/master/include/arch/x86/arch/object/ioport.h)
  and [`src/arch/x86/model/statedata.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/model/statedata.c):
  `NUM_IO_PORTS` and `x86KSAllocatedIOPorts`. *Checked 2026-11-14.*
- [seL4 `libsel4/include/sel4/bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h):
  `seL4_CapIOPortControl` is slot 7. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/64/kernel/vspace.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/kernel/vspace.c):
  `init_tss()` setting the I/O map to all ones. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c)
  and [`src/plat/pc99/machine/pit.c`](https://github.com/seL4/seL4/blob/master/src/plat/pc99/machine/pit.c):
  console and debug port selection; PIT ports. *Checked 2026-11-14.*
- [Intel 64 and IA-32 Architectures Software Developer's Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html),
  volume 1 chapter 19 "Input/Output" (I/O address space, IOPL, the I/O
  permission bitmap). *Unchecked (intel.com refuses scripted fetches;
  chapter number from memory).*
- [seL4 reference manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  the x86 I/O port sections of the API reference. *Unchecked (not
  opened today).*
- [OSDev wiki, "I/O Ports"](https://wiki.osdev.org/I/O_Ports): a list
  of the standard PC port assignments. *Unchecked (the site refuses
  scripted fetches).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
