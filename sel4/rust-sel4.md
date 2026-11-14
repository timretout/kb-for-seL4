# rust-sel4

> `seL4/rust-sel4` is the Rust support for seL4 user level: the `sel4` crate of typed bindings generated from the kernel's own interface files, runtimes for root tasks and Microkit protection domains, the capDL initialiser Microkit boots with, a kernel loader, and target specifications; the kernel itself stays in C.

Read first: [libsel4 and the runtime](libsel4.md), [Microkit](microkit.md).

## What it is

Rust on seL4 means Rust at *user level*. The kernel is C and
assembly, tied to its proofs ([verified C subset](verified-c-subset.md)),
and nobody proposes changing that. What rust-sel4 provides is
everything [libsel4](libsel4.md), `sel4runtime` and `libmicrokit`
provide for C, as `no_std` Rust crates, plus a few complete programs.
It began at Colias Group (Nick Spinale) and is now a seL4 Foundation
repository, funded by the Foundation and BSD 2-clause licensed. Its
README lists the versions it works with: at the time of writing, seL4
17.0.0 and Microkit 2.4.0 or later.

The crates are not on crates.io: projects use them as Git
dependencies.

### The binding crates

| Crate | Path | What it is |
|---|---|---|
| `sel4-sys` | `crates/sel4/sys` | Raw bindings, *generated at build time* from the same sources libsel4 is: C headers through bindgen (`build/c.rs`), the bitfield files (`build/bf`), and the invocation XML (`build/xml`), with the stubs reimplemented in Rust. Not for direct use. |
| `sel4-config` | `crates/sel4/config` | The kernel configuration as Rust: reads `kernel/gen_config.json` and `sel4/gen_config.json` from the libsel4 include directories and offers `sel4_cfg!`-family macros (`#[sel4_cfg(KERNEL_MCS)]`, `sel4_cfg_bool!`, `sel4_cfg_usize!`), usable in build scripts too. |
| `sel4` | `crates/sel4` | The safe, typed API on top. |
| `sel4-platform-info` | | Constants from the kernel's generated `platform_info.h`, where it exists. |

In the `sel4` crate a capability in the current thread's
[CSpace](cspace.md) is `Cap<T>`, a `CPtr` (a word) tagged with a type:
`Cap<cap_type::Tcb>`, `Cap<cap_type::Endpoint>`, `Cap<cap_type::Untyped>`
and so on, with aliases under `sel4::cap::`. Invocations are methods
on the right type only, returning `Result<_, sel4::Error>`, so calling
a TCB method on an endpoint capability is a compile error where C's
`seL4_CPtr` would let it through:

```rust
let untyped: sel4::cap::Untyped = ...;
untyped.untyped_retype(&blueprint, &cnode.absolute_cptr_for_self(), slot, 1)?;
endpoint.send(sel4::MessageInfoBuilder::default().length(1).build());
```

(`untyped_retype` and `send` exist in `invocations.rs` and
`syscalls.rs`; the argument forms shown are from memory, unchecked.)
`IpcBuffer` wraps `seL4_IPCBuffer`; by default (feature `state`) the
crate keeps the current thread's buffer pointer itself and
`with_ipc_buffer` gives access, replacing C's `__sel4_ipc_buffer`.
`sel4::init_thread` has the [root task](bootinfo-and-root-task.md)'s
initial slots as typed constants, and `sel4::BootInfo` the BootInfo
frame.

**The kernel configuration follows through the types.** Because
`sel4-sys` and `sel4-config` are generated from one kernel build's
headers and JSON, the API changes shape with it: on an
[MCS](mcs.md) kernel `SchedContext` capabilities and reply objects
exist and `recv` takes a reply capability; x86-only invocations exist
only for x86. This is done with `sel4_cfg` attributes, not Cargo
features, so there is nothing to keep in sync by hand, and a crate
compiled against one configuration must not be linked into a system
running another.

Finding the kernel: the build scripts read **`SEL4_INCLUDE_DIRS`** (a
list of directories containing libsel4's headers and the generated
configuration), or failing that **`SEL4_PREFIX`**, the install prefix
of a kernel build (`cmake --install`), using
`$SEL4_PREFIX/libsel4/include`. Neither set is a build-script panic:
"SEL4_INCLUDE_DIRS or SEL4_PREFIX must be set".

### Runtimes

- **`sel4-root-task`**: a runtime for a Rust root task: entry point,
  stack, thread-local storage, optional unwinding, a global allocator
  over a static heap, and panics that print through
  `seL4_DebugPutChar`. The program supplies

  ```rust
  #[root_task]
  fn main(bootinfo: &sel4::BootInfoPtr) -> ! { ... }
  ```

  (the return type may be anything implementing the crate's
  `Termination` trait, such as `sel4::Result<!>`).

- **`sel4-microkit`**: a runtime for a
  [Microkit protection domain](microkit.md), including a Rust
  reimplementation of `libmicrokit`. The program supplies

  ```rust
  #[protection_domain]
  fn init() -> impl Handler { ... }
  ```

  and implements the `Handler` trait, whose methods mirror
  libmicrokit's entry points: `notified(&mut self, channels: ChannelSet)`,
  `protected(...)` for protected procedure calls, `fault(...)` for a
  child's fault, each returning `Result<_, Self::Error>`, plus
  `take_deferred_action`. A `Channel` has `notify()`, `pp_call(msg)`
  and `irq_ack()`. Memory regions the system description maps into the
  domain are reached with `memory_region_symbol!(name: *mut T)`, which
  reads the variable the `microkit` tool patches with the region's
  address (`setvar_vaddr`).

### Complete programs

- **`sel4-capdl-initializer`**: a root task that builds a whole
  system from a capDL specification embedded in its image (a tool,
  `add-spec`, appends the serialised specification to the ELF).
  Microkit uses it as its initial task since 2.1.0; see
  [CAmkES and capDL](camkes-capdl.md) and
  [Microkit internals](microkit-internals.md).
- **`sel4-kernel-loader`**: a loader for Arm (AArch32, AArch64) and
  RISC-V that carries the kernel and root task and starts the kernel,
  "similar in purpose to elfloader" ([elfloader](elfloader.md)). There
  is no x86 variant: on x86 the kernel is started by a multiboot boot
  loader ([x86 boot](../concepts/x86-boot.md)).

### Supporting crates, in outline

- Small building blocks used by the runtimes: `sel4-panicking`,
  `sel4-dlmalloc`, `sel4-initialize-tls`, `sel4-stack`,
  `sel4-ctors-dtors`, `sel4-runtime-common`, `sel4-logging` (a `log`
  backend), `sel4-sync` (notification-based mutexes),
  `sel4-shared-memory` (safe access to memory another party can
  change under you).
- Drivers, `crates/drivers/`: PL011 and BCM2835 auxiliary UARTs, the
  PL031 real-time clock, the SP804 timer, and virtio (block, net)
  wrappers. These are Arm and QEMU devices; there are no x86 or cloud
  NIC drivers here.
- `crates/experimental/sel4-async` and friends: an async executor and
  adapters (network with smoltcp, block I/O, timers) used by the
  Microkit HTTP server demo.
- `sel4-generate-target-specs`: generates the target JSON files.

### Targets and toolchain

seL4 user level is not a target rustc knows, so `support/targets/`
has custom **target specifications**, JSON files derived from the
bare-metal targets: `aarch64-sel4`, `armv7a-sel4`, `x86_64-sel4`,
`riscv64imac-sel4`, `riscv64gc-sel4`, `riscv32imac-sel4`,
`riscv32imafc-sel4`, each with variants:

| Suffix | Difference |
|---|---|
| `-minimal` | no thread-local storage (`"has-thread-local": false`) |
| `-unwind` | `panic = "unwind"` instead of abort |
| `-musl` | built against a musl C library environment |
| `-roottask` | linker arguments suited to a root task image, which is mapped entirely read-write |
| `-microkit` | adds a linker script fragment defining `__sel4_ipc_buffer_obj`, the symbol the `microkit` tool looks for |

Custom targets have no prebuilt standard library, so `core` and
`alloc` are compiled from source with Cargo's unstable `-Z build-std`,
which requires a **nightly** toolchain with the `rust-src` component.
The repository pins one in `rust-toolchain.toml`
(`nightly-2026-10-28` at upstream `main` today).

### Building a Rust protection domain

`seL4/rust-microkit-demo` is the model. Its `.cargo/config.toml`:

```toml
[env]
RUST_TARGET_PATH = { value = "support/targets", relative = true }
[build]
target = "aarch64-sel4-microkit"
[unstable]
unstable-options = true
build-std = ["core", "alloc", "compiler_builtins"]
build-std-features = ["compiler-builtins-mem"]
```

and its Makefile points the bindings at the Microkit SDK's copy of
libsel4 for the chosen board and configuration, then hands the
resulting ELF files to the `microkit` tool like any C domain:

```make
sel4_include_dirs := $(MICROKIT_SDK)/board/$(BOARD)/debug/include
SEL4_INCLUDE_DIRS=$(abspath $(sel4_include_dirs)) cargo build --release -p <crate>
$(MICROKIT_SDK)/bin/microkit <system>.system --board $(BOARD) --config debug ...
```

So a Rust domain and a C domain can sit in one system: they share
only the Microkit ABI (channels, shared memory).

### Status

Rust support was accepted through the seL4 RFC process (the "Rust
support for seL4 userspace" RFC; unchecked: number and date not
looked up today) and rust-sel4 is the Foundation's official answer.
It is actively developed: the pinned nightly is two weeks old. Its
weightiest user is Microkit itself, through the capDL initialiser,
which makes rust-sel4 part of the boot path of every Microkit system,
C or Rust. [sDDF](sddf.md) and [LionsOS](lionsos.md) are mostly C
(unchecked).

## In seL4

Not in the kernel repository, with one exception: the kernel carries
`libsel4/tools/syscall_stub_gen_rs.py`, an older Rust stub generator
that rust-sel4 does not use (unchecked: who, if anyone, still does).

In [`seL4/rust-sel4`](https://github.com/seL4/rust-sel4) (default
branch `main`):

- [`crates/sel4/src/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4/src):
  `cptr.rs` (`CPtr`, `Cap<T, C>`), `invocations.rs`, `syscalls.rs`,
  `ipc_buffer.rs`, `bootinfo.rs`, `init_thread.rs`, `object.rs`,
  `fault.rs`, `arch/{arm,riscv,x86}`, `state/` (the IPC buffer
  pointer).
- [`crates/sel4/sys/build/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4/sys/build):
  `main.rs`, `c.rs`, `bf/`, `xml/`: the generators.
- [`crates/sel4/build-env/src/lib.rs`](https://github.com/seL4/rust-sel4/blob/main/crates/sel4/build-env/src/lib.rs):
  `SEL4_PREFIX`, `SEL4_INCLUDE_DIRS`.
- [`crates/sel4-microkit/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-microkit):
  `base/src/handler.rs` (`Handler`), `base/src/channel.rs`
  (`Channel`), `base/src/symbols.rs` (`memory_region_symbol!`),
  `macros/` (`#[protection_domain]`).
- [`crates/sel4-root-task/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-root-task),
  [`crates/sel4-capdl-initializer/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-capdl-initializer),
  [`crates/sel4-kernel-loader/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-kernel-loader)
  (`src/arch/{aarch32,aarch64,riscv}`).
- [`support/targets/`](https://github.com/seL4/rust-sel4/tree/main/support/targets):
  the JSON target specifications and a README.
- `hacking/`: Nix and Docker scripts the project's own CI and
  developers use; the repository is Nix-first (`Cargo.nix` files
  generate the `Cargo.toml` files).

## Gotchas

- **Bindings are per kernel build.** Change the board, the
  configuration (debug to release, MCS, SMP) or the kernel version and
  everything must be rebuilt with the new `SEL4_INCLUDE_DIRS`; Cargo
  does not know the environment variable's *contents* changed unless
  the build script says so, so use a separate target directory per
  board and configuration, as the demo does (`build/$(BOARD)/target`).
- **Nightly pins drift apart.** rust-sel4 pins one nightly, the demo
  another (`nightly-2025-10-20` at its `main` today), and a target
  JSON is only valid for the toolchain it was generated for: the
  targets README advises regenerating with
  `sel4-generate-target-specs` when using a different toolchain.
- **The `-microkit` target files are not in `support/targets/` at
  upstream `main` today**, though that directory's README still
  describes them; the demo carries its own `aarch64-sel4-microkit`
  specification under its `support/targets`.
- **No x86 loader, few x86 examples.** `x86_64-sel4` targets and the
  x86 invocations exist, and Microkit has x86-64 support since 2.1.0,
  but the loader and the driver crates are Arm and RISC-V only.
- **`Cap<T>` is not ownership.** A `Cap` is a number in a CSpace: the
  type system checks the kind of object, not that the slot still
  holds that capability or that nobody else revoked it.
- **Debug kernel calls are conditional** here too:
  `sel4::debug_put_char` and friends exist only when the configuration
  has them, so a release configuration fails to compile code that
  prints unconditionally.
- **Upstream changes land fast and the API is not stable**; pin a
  commit of rust-sel4 in `Cargo.toml`, as the demos do (unchecked: the
  demos' exact pins).

## See also

- [libsel4 and the runtime](libsel4.md): the C layer these crates mirror, and the files `sel4-sys` is generated from
- [Generated code](generated-code.md): the XML, bitfield and configuration outputs the build scripts read
- [Microkit](microkit.md): the system model `sel4-microkit` targets
- [Microkit internals](microkit-internals.md): the capDL initialiser in Microkit's boot path
- [CAmkES and capDL](camkes-capdl.md): capDL and the C initialiser
- [Elfloader](elfloader.md): the C counterpart of `sel4-kernel-loader`
- [BootInfo and the root task](bootinfo-and-root-task.md): what `#[root_task]` receives
- [sDDF](sddf.md): the driver framework Rust domains interoperate with
- [Verified C subset](verified-c-subset.md): why the kernel stays in C

## References

- [rust-sel4 `README.md`](https://github.com/seL4/rust-sel4/blob/main/README.md):
  the list of crates, compatible seL4 and Microkit versions, demos,
  funding. *Checked 2026-11-14.*
- [rust-sel4 `support/targets/README.md`](https://github.com/seL4/rust-sel4/blob/main/support/targets/README.md):
  what each target variant changes. *Checked 2026-11-14.*
- [rust-sel4 `crates/sel4/build-env/src/lib.rs`](https://github.com/seL4/rust-sel4/blob/main/crates/sel4/build-env/src/lib.rs)
  and [`crates/sel4/config/data/build.rs`](https://github.com/seL4/rust-sel4/blob/main/crates/sel4/config/data/build.rs):
  the environment variables and `gen_config.json`. *Checked 2026-11-14.*
- [rust-sel4 `crates/sel4-microkit/base/src/`](https://github.com/seL4/rust-sel4/tree/main/crates/sel4-microkit/base/src):
  `handler.rs`, `channel.rs`, `symbols.rs`. *Checked 2026-11-14.*
- [rust-sel4 `rust-toolchain.toml`](https://github.com/seL4/rust-sel4/blob/main/rust-toolchain.toml):
  the pinned nightly and components. *Checked 2026-11-14.*
- [rust-microkit-demo](https://github.com/seL4/rust-microkit-demo):
  `Makefile`, `.cargo/config.toml`, `rust-toolchain.toml`.
  *Checked 2026-11-14.*
- [Rendered rustdoc](https://sel4.github.io/rust-sel4/): API
  documentation per configuration. *Unchecked: not opened today.*
- [seL4 RFCs](https://sel4.dev/rfcs/): the Rust support RFC.
  *Unchecked: not opened today.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
