# Neptune OS

> Neptune OS is an independent project that rebuilds the Windows NT Executive as the seL4 root task and serves the NT Native API over seL4 IPC; as of late 2026 it boots to a native command prompt with storage, a FAT file system and Linux drivers running as processes, has no finished Win32 subsystem, and shows an OS personality on seL4 that sidesteps system call trapping.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [A Linux personality on seL4](linux-personality.md) · [Contributing a patch](contributing-a-patch.md) →

Read first: [A Linux personality on seL4](linux-personality.md), [IPC and endpoints](ipc.md), [BootInfo and the root task](bootinfo-and-root-task.md).

| At a glance | |
|---|---|
| Kind | Operating system on seL4; an independent project, state as of November 2026 |
| Repository | [`cl91/NeptuneOS`](https://github.com/cl91/NeptuneOS), GPL-3.0 |
| Key source | `private/ntos` (the Executive), `private/ntdll` (client stubs), `private/rtl/syssvc.xml` (the service list) |
| Config options | Non-MCS kernel, multiple cores, `KernelIOMMU` off, `KernelVerificationBuild` off |
| API | The NT Native API (`Nt*` calls), each a `seL4_Call` to the Executive |
| Built on | [IPC](ipc.md), [faults](faults.md), [the root task](bootinfo-and-root-task.md) |
| Verified | Nothing above the kernel, and the kernel is not built in a verified configuration |

## What it is

Windows NT has two layers of interface. Programs are written against
**Win32** (`kernel32.dll`, `user32.dll`). Those libraries are
implemented on the **NT Native API**, a smaller set of calls with names
like `NtCreateFile`, exported by `ntdll.dll` and served by the kernel
component called the **NT Executive**: the object manager, process
manager, I/O manager, memory manager and so on. Win32 is one
**environment subsystem** over the Native API; NT was designed to carry
others, POSIX among them.

Neptune OS reimplements the lower layer on seL4. Its README states the
design in three parts:

- The Executive is an ordinary user process: the seL4
  [root task](bootinfo-and-root-task.md).
- It offers the Native API to client processes through seL4
  [IPC](ipc.md).
- Device drivers are client processes too, one per driver, where NT
  runs them in the kernel.

The project calls itself "Windows NT-like". It is a new implementation
that borrows drivers from ReactOS and from Microsoft's published
driver samples.

### How a call reaches the Executive

This is the point of contrast with a
[Linux personality](linux-personality.md). A Linux binary's stable
interface is the system call instruction, so a Linux personality has to
catch that instruction as a fault. A Windows binary's stable interface
is the functions `ntdll.dll` exports; what `ntdll.dll` does inside is
private to it.

Neptune OS therefore ships its own `ntdll.dll`. Each `Nt*` function in
it is a generated stub that marshals its arguments into the thread's IPC
buffer and makes a `seL4_Call` on an endpoint capability to the
Executive. The stubs and the matching server code are generated from one
list, `private/rtl/syssvc.xml`, which holds 84 `Nt` services at the time
of writing. The Executive sits in a loop on `seL4_Recv`, runs the
service and answers with `seL4_Reply`.

| | Linux personality | Neptune OS |
|---|---|---|
| Foreign program's stable boundary | The system call instruction | The exports of `ntdll.dll` |
| How a request arrives | An `UnknownSyscall` [fault](faults.md) | An ordinary `seL4_Call` |
| Who makes the seL4 call | The kernel, on the program's behalf | A stub library inside the program |
| Needs [reliable trapping](foreign-syscalls.md) | Yes | No |
| Process holds capabilities | None it can use | At least the Executive's endpoint |

The same endpoint is the fault endpoint of every client thread. A VM
fault goes to the Executive's memory manager; other faults are turned
into NT exceptions and delivered to the thread through
`KiUserExceptionDispatcher`, as Windows does. An `UnknownSyscall` fault
is not emulated: it becomes the exception
`STATUS_INVALID_SYSTEM_SERVICE`. So a Windows program that executes a
raw `syscall` instruction with a Windows service number, bypassing
`ntdll.dll`, does not work.

### What runs today

From the README and changelog at release v0.4 (September 2026):

| Area | State |
|---|---|
| Shell | Session manager `smss.exe` and a native command prompt `ntcmd.exe` |
| Storage | AHCI and NVMe through `storport.sys`, class drivers, partition and mount managers, floppy |
| File systems | FAT12/16/32 (`fatfs.sys`) with read-ahead and write-back caching |
| Buses | ACPI and PCI, ported from ReactOS; power off and reboot |
| Input | PS/2 keyboard |
| Linux drivers | `i915`, `radeon`, `amdgpu` (mode setting only), `e1000e`, `r8169` (packet send and receive), xHCI (port enumeration only) |
| Boot | BIOS and UEFI, with a framebuffer console |

The Linux drivers are the v0.4 addition: a "Linux Driver Subsystem"
that runs unmodified or lightly modified Linux kernel drivers as
unprivileged processes, not in a virtual machine.

What is not there:

- **Win32.** The plan is to port it from ReactOS. On a `win32` branch
  `kernel32.dll`, `csrss.exe` and its server library are marked done;
  `user32.dll` and the window server are not, and the graphics design is
  still a plan. No release includes it.
- **POSIX.** A subsystem directory exists; the stated goal is to port
  musl and run a minimal busybox.
- **A network stack.** The Ethernet drivers pass packets; the README
  lists nothing above them.
- **Architectures other than x86.** Releases build for i386 and amd64.
  The AArch64 port boots as far as the Executive and has no timer
  driver yet; a RISC-V port is proposed.

The developer guide says binary compatibility with native Windows
executables should be possible "in theory", given a faithful enough
Native API, and that complete source compatibility for drivers is not a
goal, because drivers in separate processes cannot call each other
directly as many Windows drivers do.

### Pace

| Release | Date | Main addition |
|---|---|---|
| v0.1 | February 2022 | Native API, shell, keyboard |
| v0.2 | May 2024 | Exceptions, registry, cache manager, FAT, floppy |
| v0.3 | December 2025 | UEFI, ACPI, PCI, AHCI, NVMe |
| v0.4 | September 2026 | Linux Driver Subsystem |

The repository was created in March 2020 and had commits in the
month before this page was written. The README describes the coding as
almost entirely one person's. The list for v0.5 names Win32, POSIX, the
AArch64 port, PCI hotplug and asynchronous I/O.

## In seL4

Neptune OS uses the kernel directly, with none of the seL4 Foundation's
user-level frameworks ([Microkit](microkit.md),
[seL4_libs](sel4-libs.md)).

- **Kernel version.** The kernel is a submodule pointing at the
  project's own fork. In November 2026 that fork was upstream `master`
  shortly after release 17.0.0 plus one commit, "x86: pass EFI system
  table pointer to root task". Earlier releases tracked 12.1.0 and
  14.0.0.
- **Configuration**, in `private/ntos/cmake/sel4.cmake`: the fast path
  on, up to 64 cores on amd64 and 32 on i386 and AArch64, `KernelIOMMU`
  off, `KernelVerificationBuild` off. It does not select
  [MCS](mcs.md), and the Executive's use of `seL4_Reply` fits the
  non-MCS API.
- **Dynamic from the root.** The Executive keeps the root task's
  authority and creates every process, thread and address space itself
  from [untyped memory](untyped-memory.md). There is no static system
  description.
- **Where seL4 is visible.** The developer guide confines seL4 calls
  and headers to the `private` directory: the Executive, `ntdll.dll`
  and the driver library `wdm.dll`. Code elsewhere sees only NT
  interfaces.
- **LPC ports.** NT's local procedure call ports are described as a
  thin wrapper over seL4 endpoints.
- **Toolchain.** Clang and LLD build both ELF and PE (Windows format)
  binaries; GCC is not supported.

## Gotchas

- **It does not run Windows applications.** Without Win32 the programs
  it runs are native NT ones built in its own tree. "NT personality"
  describes the direction more than the present.
- **It is not evidence that foreign system calls trap well.** The
  design avoids the question by replacing `ntdll.dll`. The kernel gap
  described in [Trapping foreign system calls](foreign-syscalls.md)
  would still face a Linux personality, or a Windows one that had to
  honour raw system calls.
- **Isolated drivers, without an IOMMU.** Each driver is its own
  process, so a crash stays local, which is the project's stated
  advantage over NT. With `KernelIOMMU` off, a driver for a
  bus-mastering device can still direct the device at any memory; see
  [IOMMUs](../concepts/iommu.md).
- **No proof carries over.** The build turns verification settings off
  and uses several cores; see [the seL4 proofs](verification.md) for
  which configurations the proofs cover. Everything above the kernel is
  unverified, as in any system on seL4.
- **A forked kernel.** The extra commit changes what the kernel hands
  the root task at boot on x86, so the Executive expects that fork and
  not an upstream release.
- **Status pages age.** Everything under "What runs today" was read on
  the date in the references; check the repository before relying on
  it.

## See also

- [A Linux personality on seL4](linux-personality.md): the trap-based design this contrasts with
- [Trapping foreign system calls](foreign-syscalls.md): the kernel gap the stub library avoids
- [Multiserver operating systems](multiserver-systems.md): other general-purpose systems above a microkernel
- [BootInfo and the root task](bootinfo-and-root-task.md): the position the Executive occupies
- [Faults and fault handlers](faults.md): how exceptions and page faults reach the Executive
- [LionsOS and libvmm](lionsos.md): a static system on seL4, for comparison

## References

- [Neptune OS `readme.md`](https://github.com/cl91/NeptuneOS/blob/master/readme.md):
  the design, "Project Status", system requirements and toolchain.
  *Checked 2026-11-15.*
- [Neptune OS `CHANGELOG`](https://github.com/cl91/NeptuneOS/blob/master/CHANGELOG)
  and [releases](https://github.com/cl91/NeptuneOS/releases): what each
  release added, the seL4 versions tracked, and the dates.
  *Checked 2026-11-15.*
- [Neptune OS `docs/Developer-Guide.md`](https://github.com/cl91/NeptuneOS/blob/master/docs/Developer-Guide.md),
  "Compatibility with Windows and ReactOS", "Source Directory
  Organization" and "LPC (Local Procedure Call) Port Objects".
  *Checked 2026-11-15.*
- [Neptune OS `private/rtl/syssvc-gen.py`](https://github.com/cl91/NeptuneOS/blob/master/private/rtl/syssvc-gen.py)
  and [`syssvc.xml`](https://github.com/cl91/NeptuneOS/blob/master/private/rtl/syssvc.xml):
  the generated client stub ending in `seL4_Call`, and the list of
  services. *Checked 2026-11-15.*
- [Neptune OS `private/ntos/src/ke/services.c`](https://github.com/cl91/NeptuneOS/blob/master/private/ntos/src/ke/services.c):
  the service loop and the handling of each fault type.
  *Checked 2026-11-15.*
- [Neptune OS `private/ntos/cmake/sel4.cmake`](https://github.com/cl91/NeptuneOS/blob/master/private/ntos/cmake/sel4.cmake):
  the kernel configuration. *Checked 2026-11-15.*
- [`cl91/seL4`](https://github.com/cl91/seL4): the kernel fork, compared
  with upstream `master` through GitHub. *Checked 2026-11-15.*
- Neptune OS issues [52, "Win32 Subsystem Issue Tracker"](https://github.com/cl91/NeptuneOS/issues/52),
  [50, "POSIX subsystem Issue Tracker"](https://github.com/cl91/NeptuneOS/issues/50),
  [18, "ARM64 Port"](https://github.com/cl91/NeptuneOS/issues/18),
  [54, "RISCV64 Port"](https://github.com/cl91/NeptuneOS/issues/54) and
  [49, "Release v0.5 work items"](https://github.com/cl91/NeptuneOS/issues/49):
  what is unfinished and planned. *Checked 2026-11-15.*
