# Multiserver operating systems

> A multiserver operating system builds files, processes and networking from separate user-level servers above a microkernel; the GNU Hurd is the long-running example, Djawula is the research effort to build a provably secure one on seL4, and comparing them shows the design choices any general-purpose system on seL4 has to make.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [rust-sel4](rust-sel4.md) · [A Linux personality on seL4](linux-personality.md) →

Read first: [seL4 overview](overview.md), [IPC and endpoints](ipc.md), [Capabilities](capabilities.md).

| At a glance | |
|---|---|
| Kind | Survey |
| On seL4 | Djawula (dynamic, early stage), [LionsOS](lionsos.md) (static), Genode (seL4 as one of its kernels) |
| Elsewhere | The GNU Hurd, on Mach |
| Central questions | Where POSIX lives; who accounts for resources; who decides access |
| Verified | No multiserver system is; Djawula's stated goal is verified core servers |

## What it is

A **monolithic** kernel such as Linux implements file systems, the
network stack, process management and drivers inside the kernel, all in
one address space with full privilege. A **microkernel** such as seL4
implements almost none of that. A **multiserver** operating system
supplies the missing parts as separate user-level programs, *servers*,
each in its own address space, that talk by the kernel's
[IPC](ipc.md). A fault in the file system server is then a fault in
one program, not in the kernel.

The reason to care in seL4 work: seL4's proofs are about the kernel,
and its isolation only pays off if what runs above is divided into
parts that need not trust each other. How to divide a general-purpose
system that way is the question these projects answer differently.

### The GNU Hurd

The Hurd is the GNU project's kernel replacement: a set of servers
that "run on top of the Mach microkernel and use Mach's IPC mechanism"
to implement file systems, network protocols and authentication.

- **Translators.** A Hurd server is usually a *translator*: "a normal
  program acting as an object server" that is attached to a node in the
  file system. Most export a file system; `auth`, `proc` and the network
  server `pfinet` are translators that do not. Translators need no
  special privilege, and typically a node's owner can attach one, which
  is unlike Unix, where file systems live in the kernel.
- **POSIX in the C library.** The Hurd reaches Unix compatibility
  through glibc, so that programs compile against the standard
  interfaces. The C library inside each program turns POSIX calls into
  messages to the servers. File descriptor tables, path name lookup and
  `fork` are implemented there and not in any server (unchecked).
- **A separate architecture.** Because its system call interface is
  not Linux's, Debian's Hurd ports are their own architectures
  (`hurd-i386`, `hurd-amd64`) with their own builds of every package.

The Hurd's own history records its weak points. Its developers tried
from 2002 to move from Mach to an L4 kernel, and stopped in 2005: a
straightforward port no longer looked feasible, and the work had
exposed flaws in the original design, with resource management and
translators named as the motives for looking further. A later look at
Coyotos, an object-capability kernel, ended before any code over
differences in design philosophy, and the experimental Viengoos kernel
that followed is on hold. The lesson the project draws is that
"microkernel design and system design are interconnected in very
intricate ways". The project's page on translators still links open
issues about trusting translators set up by other users.

### Djawula

Djawula is Trustworthy Systems' project to show that an operating
system can be provably secure and still scale to the functionality of
a mainstream system. Its page sets it against [LionsOS](lionsos.md),
which applies verification to a complete operating system with a
*static* architecture, all components known at build time; Djawula is
the dynamic counterpart. The page describes:

- **Three core servers.** A *security server* holds the security
  policy and state and is consulted on every security-relevant
  operation. A *resource manager* handles isolating and sharing
  resources. A *connection server* sets up and removes connections
  between active entities; every task starts with a connection to it
  and reaches every other service through it. The aim is to verify
  these three.
- **Resource containers.** Amounts of a resource, memory or storage
  at first, are held in container objects. Tasks, threads and
  connections are allocated from containers, and containers nest. A
  client can lend memory to a server, and revocation can take it back,
  destroying what was built from it.
- **Policy separate from enforcement.** Each object server has a
  policy-free *policy enforcement module* that asks the security
  server for decisions.

The page calls the project early-stage: the team is building the
framework so that it can reason informally about security and assess
performance. It says nothing about POSIX or Linux compatibility.

Read against the Hurd, the design answers the same weak points:
containers are an answer to resource accounting, and a single point of
decision is an answer to each server deciding for itself.

### Others on seL4

- **[LionsOS](lionsos.md)** is a multiserver system in the static
  sense: file systems, a network stack and drivers as
  [Microkit](microkit.md) protection domains.
- **Genode** is an operating system framework that runs on several
  kernels. Its 16.08 release ran interactive, dynamic workloads on
  seL4, then on 32-bit x86 only and without multiprocessor, IOMMU or
  virtual machine support.

### Where POSIX lives

A program written for Unix expects POSIX. Above a microkernel there
are two places to put it:

![Two arrangements above a microkernel: the Hurd's, where the C library in each program sends messages to several servers, and a personality server's, where unchanged programs trap to one server that sends the messages.](../images/multiserver-systems-posix.svg)

*Red marks where POSIX is implemented. On the left it is a library
convention; on the right it is a server.*

| | In the C library | In a personality server |
|---|---|---|
| Programs | Rebuilt against the new C library | Existing binaries, unchanged |
| A distribution | A new architecture | The existing one |
| Confining a program | Give it fewer servers to reach | Policy inside the server |
| Single point every call passes | None | The personality server |
| Kernel support needed | IPC only | Reliable [trapping of foreign system calls](foreign-syscalls.md) |

The second arrangement is the subject of
[A Linux personality on seL4](linux-personality.md).

## In seL4

Not used: the kernel has no notion of a server, and no multiserver
system is part of it. What it supplies is the material:

- [Endpoints](ipc.md) for the messages, with badges to tell clients
  apart.
- [Capabilities](capabilities.md) to say which servers a program can
  reach, with revocation to take access back.
- [Untyped memory](untyped-memory.md) as the one resource from which
  everything is made, which is what makes resource accounting at user
  level possible at all.
- [Faults as messages](faults.md), so that paging and system call
  emulation are servers too.

The frameworks in the seL4 repositories ([Microkit](microkit.md),
[CAmkES](camkes-capdl.md)) build static systems. The dynamic
libraries in [seL4_libs](sel4-libs.md) can create processes but
define no servers or protocols.

## Gotchas

- **"Multiserver" does not mean "dynamic".** LionsOS is multiserver
  and static. What a general-purpose system adds is creating and
  destroying components at run time, and that is where the unsolved
  problems are.
- **Mach's ports and seL4's capabilities look alike and are not.** The
  Hurd's port away from Mach failed on design, not on effort; its
  developers concluded that a system's design and its kernel cannot be
  separated cleanly.
- **A proof of the kernel says nothing about the servers.** A file
  system server above seL4 is as trustworthy as its own code.
- **A project page is not a release.** Djawula's page describes a
  design and a direction; it lists no released software.

## See also

- [A Linux personality on seL4](linux-personality.md): the personality server arrangement in detail
- [Neptune OS](neptune-os.md): a general-purpose system on seL4 with one central server and drivers as processes
- [Trapping foreign system calls](foreign-syscalls.md): the kernel support it needs
- [LionsOS and libvmm](lionsos.md): the static multiserver system on seL4
- [seL4_libs and util_libs](sel4-libs.md): building dynamic systems by hand
- [History and key papers](history-and-papers.md): the L4 family the Hurd once tried to move to
- [The seL4 proofs](verification.md): what is and is not proved

## References

- [Djawula project page, Trustworthy Systems](https://trustworthy.systems/projects/Djawula):
  aim, relation to LionsOS, the three core servers, resource
  containers, policy enforcement modules, status. *Checked 2026-11-15.*
- [GNU Hurd, "What is the GNU Hurd?"](https://www.gnu.org/software/hurd/hurd/what_is_the_gnu_hurd.html):
  servers on Mach, glibc as the compatibility layer.
  *Checked 2026-11-15.*
- [GNU Hurd, "translator"](https://www.gnu.org/software/hurd/hurd/translator.html):
  definition, privilege, attachment, the linked open issues on trust.
  *Checked 2026-11-15.*
- [GNU Hurd, "Port to another microkernel"](https://www.gnu.org/software/hurd/history/port_to_another_microkernel.html):
  the L4, Coyotos and Viengoos history and the lesson drawn.
  *Checked 2026-11-15.*
- [GNU Hurd, glibc "fork"](https://www.gnu.org/software/hurd/glibc/fork.html):
  `fork` in the C library. *Unchecked: the site refused the fetch.*
- [Debian wiki, "Multiarch/Tuples"](https://wiki.debian.org/Multiarch/Tuples):
  `hurd-i386` and `hurd-amd64` as architectures. *Checked 2026-11-15.*
- [Genode release notes 16.08](https://genode.org/documentation/release-notes/16.08):
  the state of Genode on seL4 at that release. *Checked 2026-11-15.*
- Walfield and Brinkmann, "A Critique of the GNU Hurd Multi-server
  Operating System", ACM SIGOPS Operating Systems Review, 2007:
  resource accounting and trust in translators. *Unchecked: no copy
  could be opened.*
