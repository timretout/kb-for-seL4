# A Linux personality on seL4

> A Linux personality is a user-level server that makes unmodified Linux programs run on seL4 by answering their system calls, which arrive as faults; this page sketches the design, what the kernel already provides for it and what stands in the way, as a way to see where seL4 ends and an operating system begins.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [Multiserver operating systems](multiserver-systems.md) · [Neptune OS](neptune-os.md) →

Read first: [Faults and fault handlers](faults.md), [Trapping foreign system calls](foreign-syscalls.md), [Multiserver operating systems](multiserver-systems.md).

| At a glance | |
|---|---|
| Kind | Design sketch; no such server ships with seL4 |
| API | The `UnknownSyscall` and VM faults, answered by IPC reply |
| Built on | [Faults](faults.md), [untyped memory](untyped-memory.md), [address spaces](vspace.md) |
| Blocked by | [seL4 issue 477](foreign-syscalls.md): some foreign calls do not fault |
| Prior art | gVisor, Starnix on Fuchsia, FreeBSD's Linuxulator, WSL 1 |
| Verified | Nothing above the kernel; the kernel's proofs are unchanged by what runs on it |

## What it is

seL4 is a kernel, not an operating system. It has no files, processes,
users, pipes or sockets: only threads, address spaces, capabilities and
message passing. A program compiled for Linux expects all of the
former, and asks for them through Linux system calls.

An **OS personality** is a layer that presents one operating system's
interface on top of another kernel. A **Linux personality** presents the
Linux system call interface, so that the same binary files that run on
Linux run here. Nothing is recompiled. The alternative, porting a C
library so that programs can be rebuilt for the new system, is compared
on the [multiserver operating systems](multiserver-systems.md) page.

This is not a virtual machine. A [virtual machine monitor](hypervisor.md)
runs a whole Linux kernel as a guest and needs the processor's
virtualisation support. A personality runs no Linux kernel at all: it
*is* the kernel as far as the programs can tell.

### One system call

The design rests on one seL4 mechanism. When a thread executes a
system call instruction with a number seL4 does not know, the kernel
raises an [`UnknownSyscall` fault](faults.md): it sends the thread's
registers as a message to the thread's fault endpoint and blocks the
thread until a reply comes.

Make the personality server the fault handler of every Linux process
and each Linux system call becomes a round trip:

![A Linux process traps to the seL4 kernel, which sends its registers to the personality server; the server does the work and replies with new registers, and the kernel resumes the process.](../images/linux-personality-syscall-path.svg)

*Steps 2 and 4 are ordinary seL4 IPC. The server never runs inside the
process; it only reads and writes its registers and memory.*

The server finds the Linux call number and arguments in the registers,
by Linux's convention. It replies with the result in Linux's return
register and with the instruction pointer moved past the call, because
a fault otherwise restarts at the instruction that raised it.

### What the server has to be

Answering system calls means implementing what they mean. The server,
alone or with helpers, has to supply:

| Linux idea | What the server does on seL4 |
|---|---|
| Process | Creates a thread and an address space from spare memory, loads an ELF file into it |
| `fork` | Builds a second address space with the same contents; copy-on-write is done by mapping pages read-only and handling the VM faults |
| `mmap`, `brk` | Keeps each process's memory map and maps or unmaps frames |
| File descriptors | A table per process, each entry naming a file, pipe, socket or terminal |
| Files | Requests to a file system server |
| Sockets | Requests to a network stack |
| Signals, `wait` | Bookkeeping in the server, which can stop and resume any process |

*(This list is drawn from general knowledge of Linux and is not a
measured trace of any program: unchecked.)*

Page faults reach the same handler as system calls, as VM faults, which
is what makes demand paging and copy-on-write possible without kernel
support for either.

The Linux process itself needs no authority. It holds no capabilities
it can use: everything it can affect, it affects by faulting to the
server. That is a strong starting point for confinement, because the
server sees every request.

### Where it sits in a system

A shell needs processes that come and go. That is a **dynamic** system,
where [Microkit](microkit.md) and [sDDF](sddf.md) build **static**
ones whose components are fixed when the system is built. The two can
be combined by keeping the dynamism in one place:

![A static group of drivers, network stack and file system beside a dynamic compartment holding the personality server and the Linux processes it creates, both above the seL4 kernel.](../images/linux-personality-system.svg)

*The dashed box is the only part of the system whose contents change at
run time.*

The personality server is given the spare memory and creates processes
from it. The drivers, network stack and file system stay as separate
protection domains, each with only the capabilities its job needs, and
the server reaches the file system and network stack by IPC. All of it
runs above the seL4 kernel, on hardware or under a hypervisor. Seen from the rest of the
system the whole dashed box is one untrusted component, in the position
a Linux guest occupies in a system built around a virtual machine.

### Why the Linux interface and not a port

Matching Linux's system calls exactly buys an existing body of
software. A distribution's packages are built for a kernel interface as
much as for a processor: Debian names its architectures by instruction
set, operating system (meaning system call interface) and ABI, so
`amd64` is `x86_64-linux-gnu`, while the Hurd and FreeBSD-kernel ports
are separate architectures with their own packages. A kernel that
speaks the Linux interface falls under the existing name and can run
the existing packages.

Others have built this on other kernels:

- **gVisor** is "an application kernel" in Go that implements a
  Linux-like interface in user space for containers.
- **Starnix** runs unmodified Linux binaries on Fuchsia from a
  user-space component written in Rust. Its first design caught Linux
  system calls as exceptions, the same shape as the design here.
- **FreeBSD's Linuxulator** runs unmodified Linux binaries on the
  FreeBSD kernel, to the point of a `debootstrap` installation of
  Debian or Ubuntu in a `chroot`.
- **WSL 1** implemented the Linux interface in the Windows NT kernel;
  its successor runs a Linux kernel in a virtual machine instead.

## In seL4

What the kernel provides:

- **Faults as messages.** `UnknownSyscall` carries the general
  registers, instruction pointer, stack pointer and flags, and the reply
  writes them back. VM faults carry the address and cause. See
  [Faults and fault handlers](faults.md).
- **The fault endpoint.** On the [MCS](mcs.md) kernel it is a capability
  held in the thread's TCB, so the thread's own CSpace can be empty.
  Without MCS it is looked up in the faulting thread's CSpace, which
  must then contain at least that one capability.
- **Making processes.** A server holding [untyped memory](untyped-memory.md)
  can retype it into TCBs, page tables and frames, and assemble an
  [address space](vspace.md). The classic libraries in
  [seL4_libs](sel4-libs.md) do this for native programs.

What is missing:

- **Reliable trapping.** On x86-64 and AArch64 a few foreign calls are
  run as seL4 calls and never reach the handler, and on x86-64 the
  user's stack pointer is not preserved across the `syscall`
  instruction. Both are open upstream; see
  [Trapping foreign system calls](foreign-syscalls.md).
- **The server.** No seL4 Foundation repository contains a Linux
  personality (unchecked).
- **A home in the static frameworks.** A Microkit system is fixed at
  build time, and creating processes at run time is outside what it
  describes.

## Gotchas

- **A fault per system call is slow.** Each call costs two IPC
  messages and two address space switches. The Starnix design document
  expected its exception-based approach to be too slow and planned to
  replace it.
- **The proofs do not rise with the software.** seL4's proofs cover the
  kernel in a few configurations (see [the seL4 proofs](verification.md)).
  A personality server is ordinary unverified code. What the design
  keeps is isolation *around* the compartment, not correctness inside
  it.
- **The long tail is long.** FreeBSD's handbook, after years of work
  on the Linuxulator, still lists cgroups and namespaces as unsupported
  and says systemd does not work in a `chroot`.
- **User-level drivers are only as isolated as the IOMMU makes them.**
  On machines without one, cloud guests included, a driver can direct
  its device to read or write any memory; see
  [IOMMUs](../concepts/iommu.md).
- **Empty CSpace is not enough.** It is tempting to conclude that a
  thread with no capabilities can only fault. `Yield` and the
  non-blocking sends still succeed silently.

## See also

- [Trapping foreign system calls](foreign-syscalls.md): the kernel gap in detail
- [Neptune OS](neptune-os.md): a Windows NT personality on seL4 that replaces the stub library and so needs no trapping
- [Faults and fault handlers](faults.md): the mechanism the design rests on
- [Multiserver operating systems](multiserver-systems.md): the Hurd, Djawula and where POSIX can live
- [Virtualisation support](hypervisor.md): the other way to run Linux software, as a guest
- [LionsOS and libvmm](lionsos.md): a static operating system on the same foundations
- [seL4_libs and util_libs](sel4-libs.md): process creation for native seL4 programs

## References

- [seL4 issue 477, "Linux syscall emulation not possible on aarch64 or x86_64"](https://github.com/seL4/seL4/issues/477):
  the use case and the kernel gap. *Checked 2026-11-15.*
- [syscall(2), Linux man-pages](https://man7.org/linux/man-pages/man2/syscall.2.html),
  "Architecture calling conventions": where Linux puts the number,
  arguments and return value. *Checked 2026-11-15.*
- [gVisor documentation, "What is gVisor?"](https://gvisor.dev/docs/):
  an application kernel implementing a Linux-like interface, written in
  Go. *Checked 2026-11-15.*
- [Fuchsia RFC-0082, "Running unmodified Linux programs on Fuchsia"](https://fuchsia.dev/fuchsia-src/contribute/governance/rfcs/0082_starnix):
  Starnix's design, its exception-based first version and expected
  cost, and the comparison with WSL 1. *Checked 2026-11-15.*
- [FreeBSD Handbook, "Linux Binary Compatibility"](https://docs.freebsd.org/en/books/handbook/linuxemu/):
  the Linuxulator, `debootstrap` userlands and stated limits.
  *Checked 2026-11-15.*
- [Debian wiki, "Multiarch/Tuples"](https://wiki.debian.org/Multiarch/Tuples):
  architectures named by instruction set, operating system and ABI.
  *Checked 2026-11-15.*
