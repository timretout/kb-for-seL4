# CAmkES and capDL

> capDL is a language that describes a complete system as kernel objects and the capabilities between them, with a root task (the capDL loader or initialiser) that builds that system at boot; CAmkES is the older component framework that generates glue code and a capDL specification from an architecture description, now alongside Microkit, which uses capDL too.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [LionsOS and libvmm](lionsos.md) · [rust-sel4](rust-sel4.md) →

Read first: [Capabilities](capabilities.md), [BootInfo and the root task](bootinfo-and-root-task.md), [seL4_libs and util_libs](sel4-libs.md).

| At a glance | |
|---|---|
| Kind | Language with an initialiser root task (capDL); component framework (CAmkES) |
| Repository | [`seL4/capdl`](https://github.com/seL4/capdl), [`seL4/camkes-tool`](https://github.com/seL4/camkes-tool) |
| Key source | `capDL-tool/`, `python-capdl-tool/`, `capdl-loader-app/`; `camkes/templates`, `libsel4camkes/` |
| Built on | CAmkES: [seL4_libs](sel4-libs.md), util_libs, musllibc |
| Used by | capDL: CAmkES and [Microkit](microkit.md) |
| Verified | `sys-init` proves a formal initialiser algorithm, on Arm; the C and Rust initialisers are not verified |

## What it is

After boot the kernel has made one thread, the
[root task](bootinfo-and-root-task.md), holding every capability. A
*static* system, one whose set of components is fixed at build time,
needs that root task to do one job: create all the objects, hand out
the capabilities, start the threads, and get out of the way. Writing
that by hand per system is error-prone and unanalysable. The seL4
answer has two layers:

```
 CAmkES: components + connections (.camkes)      Microkit: system
   |  camkes-tool: parse, render templates          description (.system)
   v                                                   |  microkit tool
 glue C code per component  +  capDL specification  <--+  (capDL in memory)
                                    |
                                    v
                    capDL initialiser = the root task
                    (capdl-loader-app in C, or
                     sel4-capdl-initializer in Rust)
```

### capDL

**capDL**, the capability distribution language, describes a system
state at the level the kernel sees: a list of objects (TCBs,
endpoints, notifications, CNodes, frames, page tables, untypeds,
IRQ handlers, scheduling contexts), and for every capability-holding
object, which slot holds a capability to which object with which
rights, badge or mapping attributes. A specification therefore fixes
each thread's [CSpace](cspace.md) and [VSpace](vspace.md), which
interrupts go to which notification, and each TCB's entry point,
stack pointer, priority and IPC buffer. In the text form:

```
arch aarch64

objects {
  ep      = ep
  tcb_a   = tcb (addr: 0x5000, ip: 0x400000, sp: 0x7000, prio: 100)
  cnode_a = cnode (4 bits)
  ...
}
caps {
  cnode_a { 1: ep (W, badge: 7) }
  tcb_a   { cspace: cnode_a (guard_size: 60); vspace: pgd_a; ... }
}
```

(a sketch in the syntax of the example specifications shipped with
`capDL-tool`; the capDL documentation has the grammar.)

Because the description is complete, "can A ever affect B?" becomes a
question about a graph, which is what the access-control and
information-flow proofs reason over ([verification](verification.md)).

The pieces, in `seL4/capdl`:

| Piece | What it is |
|---|---|
| `capDL-tool` | The "capDL translator", in Haskell: parses and checks a text specification and emits a C data structure to link into the loader, a graphviz dot file, XML, or an Isabelle theory of the same system for proofs. |
| `python-capdl-tool` | A Python module (`capdl`) for *building* specifications in programs: object and capability classes, allocators for objects and slots, ELF handling that creates the frames and page tables for a program image. camkes-tool uses it. |
| `capdl-loader-app` | The classic initialiser, in C: a root task linked with the generated specification and a CPIO archive of the component ELF files. It walks the specification: retype untypeds into every object, load ELF contents into frames, map frames, fill CNodes (copying, minting with badges, or moving capabilities), configure TCBs, bind IRQs, then resume the threads and sleep forever. |
| `cdl_utils`, `object_sizes` | Helper scripts and the per-architecture object size tables. |

In Isabelle, [l4v](l4v.md) has the capDL kernel model (`spec/capDL`),
a proof that it is refined by the abstract specification
(`proof/drefine`), and `sys-init`: a formal initialiser algorithm
proved to produce the state its capDL specification describes
(Boyton et al., "Formally Verified System Initialisation", ICFEM
2013). That proof is about the formal algorithm, on Arm; the C loader
follows it but is not itself verified.

**The Rust initialiser.** [rust-sel4](rust-sel4.md) has a second
implementation, the `sel4-capdl-initializer` crate, which reads a
serialised specification appended to its own image instead of being
recompiled per system. Microkit has used it since release 2.1.0
("Transition to using capDL for system initialisation"): the
`microkit` tool builds a capDL specification from the system
description (`tool/microkit/src/capdl/`) and the SDK ships the
initialiser (`initialiser/` in the Microkit repository, a thin
wrapper around the crate). Before that the tool emitted a list of
kernel invocations replayed by a small monitor, which needed kernel
patches. So capDL outlives CAmkES: it is the common way a static seL4
system is brought up. See
[Microkit internals](microkit-internals.md).

### CAmkES

**CAmkES** (component architecture for microkernel-based embedded
systems) lets a system be written as components with typed
interfaces, and generates everything between them. Its concepts:

| Term | Meaning |
|---|---|
| Component | A unit of code with its own address space and CSpace. A `control` component has a main thread running `run()`; others are passive and only respond. |
| Interface | What a component offers or needs, of three kinds: a **procedure** (functions declared in an IDL; `provides`/`uses`), an **event** (a signal with no data; `emits`/`consumes`), a **dataport** (shared memory; `dataport Buf name`). |
| Connector | The mechanism that implements a connection between interfaces. Standard ones: `seL4RPCCall` (procedure over an [endpoint](ipc.md) with `seL4_Call`), `seL4Notification` (event over a [notification](notifications.md)), `seL4SharedData` (dataport as shared frames), `seL4HardwareMMIO` and `seL4HardwareInterrupt` (device memory and IRQs for driver components). |
| Assembly | The system: a `composition` instantiating components and connecting them, and a `configuration` assigning attributes (priorities, stack sizes, device addresses). |
| ADL | The architecture description language all of this is written in (`.camkes` files); procedures are in `.idl4` files. |

The canonical example, from the CAmkES manual:

```camkes
import <std_connector.camkes>;
import "components/Hello/Hello.camkes";
import "components/Client/Client.camkes";

assembly {
  composition {
    component Hello h;
    component Client c;
    connection seL4RPCCall conn(from c.iface, to h.inf);
  }
}
```

`camkes-tool` (Python) parses the ADL into an AST
(`camkes/parser`, `camkes/ast`), then renders Jinja2 **templates**
(`camkes/templates/`): for each connection end a C file from, say,
`seL4RPCCall-from.template.c` (marshal arguments, `seL4_Call`) and
`seL4RPCCall-to.template.c` (receive loop, unmarshal, call the user's
function); for each component a `component.template.c` with its
threads, stacks and `main`; and one `capdl-spec.cdl`. While rendering,
templates *allocate* the objects and capabilities they need through
python-capdl-tool, so the capDL specification is a by-product of
generating the code. The component runtime, `libsel4camkes`, sits on
[seL4_libs](sel4-libs.md) (`sel4utils`, `vka`, `sel4sync`,
`platsupport`), and the whole build is driven by the kernel's
[CMake system](build-system.md) through `camkes.cmake`.

Around it:

- **global-components** (`seL4/global-components`): reusable
  components and connectors, such as serial and timer servers,
  Ethernet drivers and a pico-TCP stack.
- **The CAmkES VM** (`seL4/camkes-vm`, examples in
  `seL4/camkes-vm-examples`): a virtual machine monitor packaged as a
  CAmkES component, running Linux guests on x86 (VT-x) and Arm; see
  [the hypervisor page](hypervisor.md). Example applications include
  `apps/Arm/vm_minimal`, `vm_multi`, `vm_virtio_net` and
  `apps/x86/minimal_64`.
- l4v's `camkes/` directory: formal semantics of the ADL and proofs
  about generated glue code and the generated capDL.

### Status relative to Microkit

Both frameworks are seL4 Foundation projects, and the seL4 website's
tools page lists them side by side: CAmkES as a "development and
runtime component framework for microkernel-based embedded static
systems". Nothing on docs.sel4.systems read today calls CAmkES
deprecated. In practice (a reading of activity, not a
statement by the Foundation) new work goes to
[Microkit](microkit.md), [sDDF](sddf.md) and [LionsOS](lionsos.md);
camkes-tool's last upstream commits before today were the
maintenance release 3.13.1 in October 2026. The differences that matter:

| | CAmkES | Microkit |
|---|---|---|
| Unit | component, any number of threads | protection domain, one thread, event loop |
| Communication | generated RPC stubs from an IDL, events, dataports; many connector types | fixed: notifications, protected procedure calls, shared memory regions |
| Libraries underneath | seL4_libs, util_libs, musllibc | libmicrokit only |
| Kernel | classic or MCS | MCS |
| Build | CMake inside the kernel build system, Python and Haskell tools | a prebuilt SDK and one tool |
| Bring-up | capDL loader | capDL initialiser (Rust) |

A kernel contributor still meets CAmkES in three places: the VM
examples, which are the most complete users of the kernel's x86 and
Arm [virtualisation](hypervisor.md) support; CAmkES test suites that
run in the CAmkES repositories' own CI (camkes-tool's `test.yml` and
`vm-test.yml`, on its pull requests) against kernel `master`, which
the CAmkES manifest tracks, so a
kernel API change can break them after merge (the kernel repository's
own workflows do not mention CAmkES); and existing deployed
systems and papers, which describe seL4 systems in CAmkES terms.

## In seL4

Nothing in the kernel is specific to either. The related source:

- [`seL4/capdl`](https://github.com/seL4/capdl): `capDL-tool/`,
  `python-capdl-tool/`, `capdl-loader-app/`.
- [`seL4/camkes-tool`](https://github.com/seL4/camkes-tool):
  `camkes/parser`, `camkes/ast`, `camkes/runner`, `camkes/templates`,
  `libsel4camkes/`, `components/` (built-in serial and timer
  components), `camkes.cmake`, `docs/index.md` (the manual).
- [`seL4/camkes-vm-examples`](https://github.com/seL4/camkes-vm-examples):
  `apps/Arm/`, `apps/x86/`.
- [`rust-sel4/crates/sel4-capdl-initializer`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-capdl-initializer)
  and Microkit's [`tool/microkit/src/capdl/`](https://github.com/seL4/microkit/tree/main/tool/microkit/src/capdl)
  and [`initialiser/`](https://github.com/seL4/microkit/tree/main/initialiser).
- [`l4v/spec/capDL`](https://github.com/seL4/l4v/tree/master/spec/capDL),
  [`l4v/sys-init`](https://github.com/seL4/l4v/tree/master/sys-init),
  [`l4v/camkes`](https://github.com/seL4/l4v/tree/master/camkes).

A CAmkES project is fetched with `repo` from `seL4/camkes-manifest`
(or `camkes-vm-examples-manifest`), like
[sel4test](sel4test.md).

## Gotchas

- **The initialiser must know every object type and invocation.** A
  kernel change that adds an object type, changes object sizes
  (`object_sizes`) or changes how something is configured needs
  matching changes in the capDL tools and both initialisers before a
  CAmkES or Microkit system can use it.
- **A capDL specification is static.** There is no way to say "create
  this later"; dynamic behaviour means giving a component untypeds
  and letting it run its own allocator.
- **"Verified initialisation" is narrower than it sounds.** The
  `sys-init` proof covers a formal algorithm, not the C or Rust
  programs that run.
- **CAmkES errors surface at three levels**: the ADL parser, a Jinja
  template exception (a Python traceback through
  `camkes/templates/`), or a C compile error in generated code under
  the build directory. Read the generated file, not the template,
  first.
- **CAmkES hides scheduling.** Each interface gets its own thread
  inside a component, with priorities set by configuration
  attributes; unexpected priority inversions come from defaults.
- **Two initialisers, two behaviours.** Boot output and failure
  messages differ between `capdl-loader-app` and the Rust
  initialiser (Microkit's changelog notes the boot log changed with
  the transition).

## See also

- [Microkit](microkit.md): the framework new systems use
- [Microkit internals](microkit-internals.md): how its tool produces a capDL specification
- [rust-sel4](rust-sel4.md): home of the Rust capDL initialiser
- [seL4_libs and util_libs](sel4-libs.md): what CAmkES components are built on
- [BootInfo and the root task](bootinfo-and-root-task.md): what any initialiser starts from
- [Untyped memory and retyping](untyped-memory.md): how the initialiser creates objects
- [Hypervisor](hypervisor.md): the kernel side of the CAmkES VM
- [l4v](l4v.md): where the capDL model and proofs live
- [Ecosystem and repositories](ecosystem.md): all the repositories together
- [Verifying user-level software](user-level-verification.md): the initialiser proof and what user level inherits

## References

- [capDL repository `README.md`](https://github.com/seL4/capdl/blob/master/README.md):
  the three tools. *Checked 2026-11-14.*
- [capDL documentation](https://docs.sel4.systems/projects/capdl/):
  the translator's output formats, what the loader does.
  *Checked 2026-11-14.*
- [camkes-tool `docs/index.md`](https://github.com/seL4/camkes-tool/blob/master/docs/index.md):
  the CAmkES manual: terminology, the hello world example, events,
  dataports. *Checked 2026-11-14.*
- [camkes-tool `camkes/templates/`](https://github.com/seL4/camkes-tool/tree/master/camkes/templates):
  connector templates and `capdl-spec.cdl`. *Checked 2026-11-14.*
- [CAmkES documentation](https://docs.sel4.systems/projects/camkes/):
  overview and links (manual, components, virtual machines).
  *Checked 2026-11-14.*
- [seL4 tools and frameworks page](https://sel4.systems/tools.html):
  how the Foundation presents CAmkES and Microkit.
  *Checked 2026-11-14.*
- [Microkit `CHANGES.md`](https://github.com/seL4/microkit/blob/main/CHANGES.md),
  release 2.1.0: the transition to capDL. *Checked 2026-11-14.*
- [l4v `sys-init/README.md`](https://github.com/seL4/l4v/blob/master/sys-init/README.md):
  the verified initialiser and its paper. *Checked 2026-11-14.*
- [Boyton et al., "Formally Verified System Initialisation", ICFEM 2013](https://trustworthy.systems/publications/nictaabstracts/Boyton_ABFGGKLS_13.abstract):
  the initialiser proof (abstract page, with a link to the full
  text). *Checked 2026-11-14.*
- [Kuz et al., "CAmkES: A component model for secure microkernel-based embedded systems", JSS 2007](https://trustworthy.systems/publications/papers/Kuz_LGH_07.pdf):
  the original design. *Checked 2026-11-14.*
- [global-components](https://github.com/seL4/global-components) and
  [camkes-vm](https://github.com/seL4/camkes-vm): the component
  collection and the VMM (their READMEs). *Checked 2026-11-14.*
- [capDL language specification](https://github.com/seL4/capdl/blob/master/capDL-tool/doc/capDL.md)
  and the example [`camkes-adder-arm.cdl`](https://github.com/seL4/capdl/blob/master/capDL-tool/camkes-adder-arm.cdl):
  the grammar, and a generated specification showing the TCB
  parameters. *Checked 2026-11-14.*
- camkes-tool [`.github/workflows/`](https://github.com/seL4/camkes-tool/tree/master/.github/workflows)
  and the [CAmkES manifest](https://github.com/seL4/camkes-manifest/blob/master/master.xml):
  the test workflows, and the kernel revision they build. *Checked 2026-11-14.*
