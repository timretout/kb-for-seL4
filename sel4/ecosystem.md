# Ecosystem and repositories

> seL4 is some thirty repositories in two GitHub organisations: the kernel and its proofs, an older user-level world of CMake libraries and CAmkES, and a newer one of Microkit, sDDF and LionsOS; this page maps them and how they depend on each other.

[Index](../INDEX.md) › [Part 1: Orientation](../INDEX.md#part-1-orientation) · ← [seL4 overview](overview.md) · [History and key papers](history-and-papers.md) →

Read first: [seL4 overview](overview.md).

| At a glance | |
|---|---|
| Kind | Survey of some thirty repositories |
| Organisations | [github.com/seL4](https://github.com/seL4) (the Foundation), [github.com/au-ts](https://github.com/au-ts) (Trustworthy Systems) |
| Kernel and proofs | [seL4/seL4](https://github.com/seL4/seL4), [seL4/l4v](https://github.com/seL4/l4v) |
| Generation 1 | `repo` manifest, CMake, seL4_libs, sel4test, CAmkES |
| Generation 2 | Microkit SDK, sDDF, LionsOS, rust-sel4 |
| Use for new systems | Generation 2; generation 1 stays necessary for kernel work |
| Newest kernel release | 17.0.0, October 2026 |
| Where to ask | [Discourse](https://sel4.discourse.group/), `devel` list, Mattermost |

## What it is

The kernel is deliberately small, so almost everything a system needs
lives outside it, in separate repositories with separate maintainers,
branches and release habits. A change to the kernel often needs
matching changes in two or three of them, and a new contributor's first
difficulty is knowing which repository a file belongs to. Two
organisations matter:

- **[github.com/seL4](https://github.com/seL4)**: the seL4 Foundation's
  repositories. The kernel, the proofs, the official libraries, tools
  and frameworks, the documentation and the [RFCs](governance.md).
- **[github.com/au-ts](https://github.com/au-ts)**: Trustworthy Systems
  at UNSW Sydney, the research group seL4 came from. sDDF, libvmm,
  LionsOS and their tooling are developed here.

### The map

Default branches are `master` unless noted.

**Kernel and proofs**

| Repository | What it is |
|---|---|
| [seL4/seL4](https://github.com/seL4/seL4) | The kernel, and `libsel4`, the system-call library generated with it ([Source layout](source-layout.md), [libsel4](libsel4.md)) |
| [seL4/l4v](https://github.com/seL4/l4v) | The specifications and Isabelle/HOL proofs ([l4v and Isabelle](l4v.md)) |
| [seL4/isabelle](https://github.com/seL4/isabelle) | Mirror of the Isabelle theorem prover at the version l4v uses |

**Build and boot tools**

| Repository | What it is |
|---|---|
| [seL4/seL4_tools](https://github.com/seL4/seL4_tools) | `cmake-tool` (the CMake framework and `init-build.sh` for multi-repository projects, [Build system](build-system.md)) and `elfloader-tool` (the Arm and RISC-V boot stage, [Elfloader](elfloader.md)) |
| [seL4/seL4-CAmkES-L4v-dockerfiles](https://github.com/seL4/seL4-CAmkES-L4v-dockerfiles) | Docker images with the build dependencies for the kernel, CAmkES and the proofs |

**First-generation user level: libraries, tests, CAmkES**

| Repository | What it is |
|---|---|
| [seL4/sel4runtime](https://github.com/seL4/sel4runtime) | Minimal C runtime: `_start`, thread-local storage, process start-up |
| [seL4/musllibc](https://github.com/seL4/musllibc) | A fork of the musl C library (branch `sel4`) whose system calls are redirected to user-supplied handlers |
| [seL4/util_libs](https://github.com/seL4/util_libs) | OS-independent libraries: `libplatsupport` (serial, timer and clock drivers per platform), `libutils`, `libelf`, `libcpio`, `libfdt`, `libethdrivers`, `libpci` |
| [seL4/seL4_libs](https://github.com/seL4/seL4_libs) | seL4-specific "no-assurance libraries for rapid prototyping": allocators (`libsel4allocman`, `libsel4vka`), address-space and thread helpers (`libsel4vspace`, `libsel4utils`), `libsel4platsupport` ([seL4_libs and util_libs](sel4-libs.md)) |
| [seL4/seL4_projects_libs](https://github.com/seL4/seL4_projects_libs) | Further libraries on seL4_libs, notably the VMM libraries `libsel4vm` and `libsel4vmmplatsupport` ([Virtualisation support](hypervisor.md)) |
| [seL4/sel4test](https://github.com/seL4/sel4test) | The kernel's test suite: a root task that runs several hundred tests ([sel4test and sel4bench](sel4test.md)) |
| [seL4/sel4test-manifest](https://github.com/seL4/sel4test-manifest) | The `repo` manifest that checks out the kernel, seL4_tools, sel4runtime, musllibc, seL4_libs, util_libs, sel4test, seL4_projects_libs, OpenSBI and nanopb side by side |
| [seL4/sel4bench](https://github.com/seL4/sel4bench), [sel4bench-manifest](https://github.com/seL4/sel4bench-manifest) | Microbenchmarks (IPC, interrupt latency, scheduling) and their manifest |
| [seL4/sel4-tutorials](https://github.com/seL4/sel4-tutorials), [sel4-tutorials-manifest](https://github.com/seL4/sel4-tutorials-manifest) | The hands-on tutorials rendered on the documentation site |
| [seL4/capdl](https://github.com/seL4/capdl) | The Capability Distribution Language: a text description of every object and capability in a system, a translator, and a loader root task that creates them |
| [seL4/camkes-tool](https://github.com/seL4/camkes-tool) | CAmkES, the component framework: an architecture description language and code generator producing glue code and a capDL specification ([CAmkES and capDL](camkes-capdl.md)) |
| [seL4/camkes](https://github.com/seL4/camkes), [camkes-manifest](https://github.com/seL4/camkes-manifest) | CAmkES example applications and tests, and the manifest |
| [seL4/camkes-vm](https://github.com/seL4/camkes-vm) | A virtual machine monitor built as a CAmkES component |

**Second-generation user level: Microkit, sDDF, LionsOS**

| Repository | What it is |
|---|---|
| [seL4/microkit](https://github.com/seL4/microkit) (`main`) | A small framework and SDK: protection domains, channels and memory regions declared in one XML file, with a prebuilt kernel per board ([Microkit](microkit.md)) |
| [seL4/rust-sel4](https://github.com/seL4/rust-sel4) (`main`) | Rust crates for seL4 user level: bindings, runtimes for root tasks and Microkit protection domains, a capDL loader ([rust-sel4](rust-sel4.md)) |
| [seL4/rust-microkit-demo](https://github.com/seL4/rust-microkit-demo) (`main`) | A small example of the Rust crates under Microkit |
| [au-ts/sddf](https://github.com/au-ts/sddf) (`main`) | The seL4 Device Driver Framework: driver interfaces, shared-memory queue protocols, virtualiser components and drivers ([sDDF](sddf.md), [sDDF networking](sddf-net.md)) |
| [au-ts/libvmm](https://github.com/au-ts/libvmm) (`main`) | A virtual machine monitor library for Microkit systems, depending on sDDF |
| [au-ts/lionsos](https://github.com/au-ts/lionsos) (`main`) | An operating system assembled from Microkit, sDDF and libvmm components: file systems, network stack, language runtimes ([LionsOS and libvmm](lionsos.md)) |
| [au-ts/microkit_sdf_gen](https://github.com/au-ts/microkit_sdf_gen) (`main`) | Tooling that generates Microkit system descriptions from a higher-level program |

**Project infrastructure**

| Repository | What it is |
|---|---|
| [seL4/ci-actions](https://github.com/seL4/ci-actions) | The GitHub Actions every seL4 repository's CI uses: style and licence checks, builds, simulation and hardware test runs, proof runs ([Upstream CI](ci.md)) |
| [seL4/machine_queue](https://github.com/seL4/machine_queue) | Scripts for queueing jobs on the pool of real boards CI tests on |
| [seL4/docs](https://github.com/seL4/docs) | Source of [docs.sel4.systems](https://docs.sel4.systems/) |
| [seL4/website](https://github.com/seL4/website) | Source of [sel4.systems](https://sel4.systems/) |
| [seL4/rfcs](https://github.com/seL4/rfcs) (`main`) | Requests for comments: proposed and accepted design changes ([Governance and RFCs](governance.md)) |
| [seL4/whitepaper](https://github.com/seL4/whitepaper) | Source of the seL4 whitepaper ([History and key papers](history-and-papers.md)) |

### How they depend on each other

```
                           l4v (proofs)
                             | verifies the C of
                             v
  +--------------------- seL4 kernel + libsel4 ----------------------+
  |                                                                  |
  |  generation 1: repo manifest + CMake      generation 2: SDK      |
  |                                                                  |
  |  seL4_tools (cmake-tool, elfloader)       microkit (tool, loader,|
  |      |                                      monitor, libmicrokit;|
  |  sel4runtime, musllibc                      pins a kernel commit)|
  |      |                                         |          |      |
  |  util_libs  (libplatsupport, ...)            sddf     rust-sel4  |
  |      |                                         |     (also gen 1)|
  |  seL4_libs  (allocman, vka, vspace, utils)   libvmm              |
  |      |          \                              |                 |
  |  sel4test    seL4_projects_libs (libsel4vm)  lionsos             |
  |  sel4bench      |                                                |
  |              capdl <-- camkes-tool <-- camkes, camkes-vm         |
  +------------------------------------------------------------------+
   ci-actions + machine_queue test all of it; docs documents it
```

Read downwards as "is used by". Things worth knowing from the picture:

- Everything depends on the kernel's `libsel4`, which is generated from
  XML in the kernel repository ([Generated code](generated-code.md)).
  A change to a system call or an invocation ripples into every box.
- The two generations share the kernel and nothing else by necessity.
  sDDF has its own drivers and does not use `libplatsupport`; Microkit
  has its own loader and does not use the elfloader.
- `capdl` sits under CAmkES but is independent of it; rust-sel4 has its
  own capDL loader, and Microkit's tool now embeds a capDL
  specification that the initial task, a capDL initialiser built on
  rust-sel4's `sel4_capdl_initializer`, turns into the running system.
- `sel4test` is the kernel's test suite but lives in generation 1, so
  a kernel port or feature must keep `seL4_tools`, `util_libs` and
  `seL4_libs` working even if the system you care about is a Microkit
  one ([Platform ports](platform-port.md)).

### Two generations, and which to use

**Generation 1** is a workspace of many repositories at matching
revisions, fetched with Google's `repo` tool from a *manifest*
repository (`repo init -u https://github.com/seL4/sel4test-manifest.git`),
and built together by CMake and Ninja through `init-build.sh`. The
kernel is compiled as part of your project with your options. On top
sit either the libraries directly (a hand-written root task that
allocates with `libsel4allocman`, as sel4test does) or CAmkES, which
generates a static system from a component description. It is
flexible, dynamic where you want it, and has the widest platform
support; it is also large, loosely specified and "no-assurance".

**Generation 2** starts from a prebuilt **SDK**. Microkit fixes the
system's shape (a static set of protection domains with fixed
communication channels), ships a compiled kernel per board and
configuration, and needs only a compiler and `make` (or any build
system) from the user. sDDF and LionsOS build on its abstractions.
It is much easier to learn and to reason about, and is where the
Foundation's and Trustworthy Systems' new development goes.

For new systems work, device drivers included, prefer generation 2:
Microkit with sDDF, in C or with rust-sel4. Generation 1 remains
necessary for kernel work, because sel4test and sel4bench are how a
kernel change is tested and what upstream CI runs, and CAmkES systems
remain in production use and maintained.

### Releases and version coupling

- The **kernel** has numbered releases (17.0.0 is the newest tag in
  the repository, October 2026); the major number changes when the API
  or ABI does.
- **l4v** `master` tracks kernel `master` commit for commit: CI checks
  that proofs still hold, and a kernel change with proof impact merges
  together with its proof update ([Proof impact of a change](proof-impact.md)).
  l4v tags releases as `seL4-<version>`.
- The generation 1 libraries and tools mostly have no version numbers
  of their own. What defines a consistent set is a **manifest**: in
  `sel4test-manifest`, `master.xml` follows every repository's tip,
  `default.xml` pins the revisions last tested together, and each
  kernel release is a tag of the manifest repository (`17.0.0`).
- **CAmkES** has its own release tags (`camkes-3.13.1`), one made for
  each kernel release; **capDL** has its own version tags (`0.6.1`).
- **Microkit** has its own versions (2.x) and names the kernel commit
  it supports in a manifest (`seL4/microkit-manifest`); its
  `DEVELOPER.md` says other kernel commits generally work but only the
  manifest's is tested. An SDK therefore lags kernel `master`, and a
  kernel fix reaches Microkit users when Microkit moves its pin.
- **sDDF**, **libvmm** and **LionsOS** make occasional tagged releases
  and each names the Microkit SDK version it builds against; LionsOS
  takes sDDF and libvmm as git submodules under `dep/`, and libvmm
  takes sDDF the same way.
- **rust-sel4** has its own version tags (`v6.0.0` is the newest), and
  its README names the kernel and Microkit versions it is known to work
  with (seL4 17.0.0 and Microkit 2.4.0 now).

### Where to ask

From the Foundation's [support page](https://sel4.systems/support.html):
the Discourse forum at [sel4.discourse.group](https://sel4.discourse.group/),
the `devel` mailing list
([lists.sel4.systems](https://lists.sel4.systems/postorius/lists/devel.sel4.systems/)),
the Mattermost chat at
[mattermost.trustworthy.systems/sel4-external](https://mattermost.trustworthy.systems/sel4-external/),
and a fortnightly open video hangout. Bugs and patches go to the
repository concerned as GitHub issues and pull requests
([Contributing a patch](contributing.md)). The **seL4 Summit** is the
annual conference (the Foundation's summit page lists those from 2022
on); talks are published and are a good
way to see who works on what.

## In seL4

Where each repository lands in a generation 1 checkout made from
`sel4test-manifest` (paths from its `common.xml`):

| Path | Repository |
|---|---|
| `kernel/` | seL4 |
| `tools/seL4/` | seL4_tools (`cmake-tool/`, `elfloader-tool/`) |
| `projects/sel4runtime/`, `projects/musllibc/` | sel4runtime, musllibc |
| `projects/util_libs/`, `projects/seL4_libs/` | util_libs, seL4_libs |
| `projects/sel4_projects_libs/` | seL4_projects_libs |
| `projects/sel4test/` | sel4test |
| `tools/opensbi/`, `tools/nanopb/` | Third-party: RISC-V firmware, protocol buffers |

`init-build.sh` and `griddle` in the top directory are links into
`tools/seL4/cmake-tool/`.

A Microkit checkout is two repositories (`microkit/` and `seL4/`),
and its SDK is a directory of `bin/microkit` plus
`board/<board>/<config>/` holding a prebuilt kernel, loader, monitor
and `libmicrokit` for each combination.

## Gotchas

- **A pull request to one repository is tested against the tips of the
  others.** A kernel change that needs a library change must be
  coordinated; `ci-actions` reads a line of the form
  `Test with: seL4/seL4_tools#123` in the pull request description and
  tests against that pull request (a branch or commit works too, as
  `org/repo@ref`).
- **`seL4_libs` says of itself that it has no assurance.** Verified
  kernel, unverified everything else: do not read the kernel's proofs
  as covering the libraries, the elfloader, CAmkES glue or Microkit's
  monitor.
- **Same name, different thing.** `libsel4` (in the kernel repository,
  the system-call bindings) is not `seL4_libs`; `libplatsupport`
  (util_libs) is not `libsel4platsupport` (seL4_libs, its seL4 glue);
  `camkes` is the examples repository and `camkes-tool` the tool.
- **`musllibc` is a fork, not upstream musl.** Its `sel4` branch is at
  musl 1.2.5 (its `VERSION` file), and its system calls go through a
  table of handlers in `libsel4muslcsys` (seL4_libs), not to a kernel.
- **Not everything in `au-ts` is upstream seL4.** Those repositories
  are a research group's, with their own review and stability
  standards; libvmm's README calls itself not ready for production.
- **Documentation lags the repositories.** docs.sel4.systems is built
  from `seL4/docs` plus files pulled from the project repositories;
  when a page and a README disagree, the README at the commit you
  build is right.

## See also

- [seL4 overview](overview.md): what the kernel itself is
- [History and key papers](history-and-papers.md): where the pieces came from
- [Source layout](source-layout.md): inside the kernel repository
- [Build system and configuration](build-system.md): how a generation 1 project is built
- [Microkit](microkit.md), [sDDF](sddf.md), [LionsOS and libvmm](lionsos.md): generation 2
- [seL4_libs and util_libs](sel4-libs.md), [CAmkES and capDL](camkes-capdl.md): generation 1
- [Governance and RFCs](governance.md): who decides what goes where
- [Upstream CI](ci.md): how the repositories are tested together

## References

- GitHub repository descriptions and default branches for every
  repository in the tables, read through the
  [GitHub API](https://docs.github.com/en/rest/repos/repos) for
  [github.com/seL4](https://github.com/seL4) and
  [github.com/au-ts](https://github.com/au-ts). *Checked 2026-11-14.*
- [sel4test-manifest `common.xml`](https://github.com/seL4/sel4test-manifest/blob/master/common.xml):
  the repositories and paths of a generation 1 checkout.
  *Checked 2026-11-14.*
- [Microkit `DEVELOPER.md`](https://github.com/seL4/microkit/blob/main/DEVELOPER.md):
  the manifest and the supported kernel version. *Checked 2026-11-14.*
- [libvmm README](https://github.com/au-ts/libvmm): dependencies on
  Microkit and sDDF, maturity statement. *Checked 2026-11-14.*
- [seL4 support page](https://sel4.systems/support.html): forum,
  mailing list, chat, hangout, summit. *Checked 2026-11-14.*
- [seL4 releases](https://docs.sel4.systems/releases/seL4.html) and
  [CAmkES releases](https://docs.sel4.systems/releases/camkes.html) on
  the documentation site: one CAmkES release for each kernel release.
  *Checked 2026-11-14.*
- [sel4test-manifest](https://github.com/seL4/sel4test-manifest):
  `default.xml` (pinned revisions), `master.xml` (tips) and the release
  tags; tags of [camkes-tool](https://github.com/seL4/camkes-tool/tags),
  [capdl](https://github.com/seL4/capdl/tags) and
  [rust-sel4](https://github.com/seL4/rust-sel4/tags), read with
  `git ls-remote`. *Checked 2026-11-14.*
- [Microkit manual](https://github.com/seL4/microkit/blob/main/docs/manual.md),
  "capDL Initialiser", and
  [`initialiser/src/main.rs`](https://github.com/seL4/microkit/blob/main/initialiser/src/main.rs):
  the capDL specification and the initial task. *Checked 2026-11-14.*
- [rust-sel4 README](https://github.com/seL4/rust-sel4/blob/main/README.md),
  "Compatible versions of related seL4 Foundation projects".
  *Checked 2026-11-14.*
- [LionsOS `.gitmodules`](https://github.com/au-ts/lionsos/blob/main/.gitmodules):
  sDDF and libvmm under `dep/`. *Checked 2026-11-14.*
- [`ci-actions/scripts/get-prs`](https://github.com/seL4/ci-actions/blob/master/scripts/get-prs):
  the `Test with:` syntax. *Checked 2026-11-14.*
- [musllibc `VERSION`](https://github.com/seL4/musllibc/blob/sel4/VERSION)
  and [`libsel4muslcsys/src/vsyscall.c`](https://github.com/seL4/seL4_libs/blob/master/libsel4muslcsys/src/vsyscall.c):
  the musl version and the system call table. *Checked 2026-11-14.*
- [seL4 Summit](https://sel4.systems/Summit/): annual, summits listed
  from 2022. *Checked 2026-11-14.*
