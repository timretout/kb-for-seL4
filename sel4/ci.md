# Upstream CI

> The GitHub Actions checks a seL4 pull request meets (lint, style, licences, compile matrix, sel4test in simulation, the preprocess check) and the ones only a maintainer's label or a merge starts (hardware runs, proofs, manifest deployment).

Read first: [Contributing a patch](contributing.md).

## What it is

Every repository in the `seL4` organisation keeps a few short workflow
files in `.github/workflows/`. Almost all of them delegate to one shared
repository, [`seL4/ci-actions`](https://github.com/seL4/ci-actions),
which holds both reusable workflows (`.github/workflows/pr.yml`,
`push.yml`, `sel4test-sim.yml`, `sel4test-hw.yml`) and one directory per
action (`gitlint`, `style`, `license-check`, `preprocess`,
`standalone-kernel`, `sel4test-sim`, `aws-proofs`, ...). Most actions are
a `steps.sh` script run inside the Foundation's Docker images. To learn
what a check really does, read its `steps.sh`.

Three GitHub trigger types matter, because they decide what a pull
request from a fork can run:

| Trigger | Runs with | Used for |
|---|---|---|
| `pull_request` | the fork's code, no secrets | everything that only needs a hosted runner |
| `pull_request_target` | the base repository's workflow and secrets | hardware runs and proofs; gated on a label that only maintainers can add |
| `push` to `master` | secrets | post-merge testing and "deploy" jobs that update manifests |

### Workflows of `seL4/seL4`

| File (name shown on GitHub) | When | What it runs |
|---|---|---|
| `pr.yml` (PR / Checks) | pull request | shared `pr.yml`: **Gitlint** (commit messages), **Trailing Whitespace** (`git diff --check`), **Portable Shell** (bashisms in shell scripts), **Style** (the `seL4_tools` style scripts on changed files) |
| `pr.yml` (PR / Preprocess) | pull request | the **preprocess check** for `L4V_ARCH` in ARM, ARM_HYP, AARCH64, RISCV64, X64, and with `L4V_FEATURES=MCS` for ARM and RISCV64 |
| `push.yml` (CI) | pull request, push | shared `push.yml`: **License Check** (REUSE/SPDX) and **Links** (a link checker over documentation) |
| `compilation-checks.yml` (Compile) | pull request, push | `standalone-kernel`: builds the kernel alone for the five architectures with `gcc` and `llvm` |
| `cparser.yml` (C Parser) | pull request, push | `cparser-run`: runs the Isabelle C parser over the kernel, so a construct outside the [verified C subset](verified-c-subset.md) fails early |
| `sel4test-sim.yml` (seL4Test / Sim) | pull request, except changes only to `manual/`, `LICENSES/` or top-level `*.md` | builds and runs [sel4test](sel4test.md) in QEMU for `armv7a`, `armv8a`, `nehalem` (x86), `rv32imac`, `rv64imac`, each with `gcc` and `clang` |
| `manual.yml` (RefMan) | pull request, push | builds the reference manual PDF and uploads it as an artifact |
| `xml_lint.yml` (XML) | when the API XML under `libsel4/` changes | `xmllint` of the object and system call API files against their schemas |
| `hw-tests.yml` (HW) | `pull_request_target`, on label or new push | shared `sel4test-hw.yml` and `sel4bench-hw.yml`; they run only if the pull request carries `hw-build` or `hw-test` (and `hw-bench` for benchmarks) |
| `proof.yml` (Proofs) | `pull_request_target`, on label or new push | only with the label `proof-test`: runs the C refinement proof sessions (`CRefine`, plus `SimplExportAndRefine` for ARM and RISCV64) for each verified architecture on AWS machines, and uploads logs |
| `preprocess-deploy.yml` (Proof Sync) | push to `master` | preprocess check against the `devel.xml` manifest of `seL4/verification-manifest`; if verified code is unchanged, advances the manifest to the new kernel commit without running proofs |
| `sel4test-deploy.yml` (Deploy) | push to `master` (not for `*.md` only), or a dispatch from another repository | simulation, hardware builds for every platform, runs on the boards, then records the tested set of revisions in `seL4/sel4test-manifest` |
| `trigger.yml` (Trigger) | push to `master` | sends a `repository_dispatch` so dependent repositories rerun their tests |

The **preprocess check** is the one specific to seL4. For a verified
configuration it preprocesses the kernel into a single C file, once for
the pull request's base and once for its head, and compares the two
(file contents and symbol names). No difference means the proofs cannot
be affected. A difference means only that the proofs must be run to find
out; [Proof impact](proof-impact.md) says how to read it.

Hardware runs use the **machine queue**
([`seL4/machine_queue`](https://github.com/seL4/machine_queue)): scripts
that take a lock on a board in the Foundation's test rack, load the image
over the network, and capture the serial console. Builds happen on hosted
runners; only the run step needs the `HW_SSH` secret.

### Other repositories, briefly

| Repository | Workflows |
|---|---|
| `sel4test`, `seL4_tools` | the same `PR`, `CI`, `seL4Test` simulation, label-gated `HW`, and `Trigger`; a change in either is tested with the kernel's `master` |
| `l4v` | `PR` and `CI` as above; `Lint` (`thylint` on theory files); `Proof PR` and `MCS Proof PR` (proofs for a pull request, via `pull_request_target`); `Proofs` on push or dispatch, which runs all proofs and then deploys `verification-manifest`; a weekly clean rebuild and a twice-monthly `External` run |
| `microkit` | shared `PR` and `CI` checks; `cargo clippy` and `cargo fmt --check` for the Rust tool; an SDK build inside the repository's Nix shell; `Deploy` on push builds and runs on hardware |
| `sddf` | its own `PR` (whitespace, C and Python style) and licence check; `Examples` builds every example against a Microkit SDK, on pull request, push and weekly; model-checking jobs (`genmc`, `spin-models`); the design document build |

## In seL4

Reproducing the main checks before sending a pull request:

- **Style.** From a checkout of `seL4_tools`:
  `misc/style.sh <files>` reformats in place, and
  `misc/style-changed.sh` does the same for every modified or untracked
  file of the working tree (`git ls-files -mo`). `git diff` afterwards
  should show only what you meant. Needs `astyle`, and Python's `guardonce`, `autopep8` and
  `cmake-format` for the other file types (unchecked list).
- **Gitlint.**
  `gitlint --config <seL4_tools>/misc/.gitlint --commits upstream/master..HEAD lint`,
  the command the action runs.
- **Whitespace.** `git diff --check upstream/master..HEAD`.
- **Licences.** `reuse lint` at the top of the repository (the action
  wraps the REUSE tool; its exact options are unchecked).
- **Compile matrix.** Build the kernel alone from a verified
  configuration, for example
  `cmake -G Ninja -B build -DCMAKE_TOOLCHAIN_FILE=gcc.cmake -C configs/X64_verified.cmake && ninja -C build kernel.elf`
  (the action's `compile_kernel.sh` does this for
  `configs/<ARCH>_verified.cmake` and, where one exists,
  `configs/<ARCH>_MCS_verified.cmake`; the exact remaining flags are
  unchecked; see [Build system](build-system.md)).
- **sel4test in simulation.** In a sel4test tree:
  `../init-build.sh -DPLATFORM=x86_64 -DSIMULATION=TRUE`, `ninja`,
  `./simulate`; success prints `All is well in the universe`
  (unchecked today; see [sel4test](sel4test.md)).
- **Preprocess.** `ci-actions/preprocess/test_munge.sh` compares two git
  revisions of the kernel for one `L4V_ARCH`; it needs an `l4v` checkout
  because the preprocessing rule lives in `l4v/spec/cspec/c/`
  ([l4v](l4v.md)). The quick approximation is in
  [Proof impact](proof-impact.md).

The Docker images the actions use are published from
[`seL4/seL4-CAmkES-L4v-dockerfiles`](https://github.com/seL4/seL4-CAmkES-L4v-dockerfiles)
(unchecked today), which is the easiest way to get the same compiler
versions.

## Gotchas

- **A green pull request has not been on hardware.** Without `hw-test`
  the only execution is QEMU, and QEMU's x86 machine is the only x86
  tested before merge.
- **Labels are a maintainer's to add.** A contributor asks for
  `hw-test` or `proof-test` in a comment. Both rerun on each new push
  while the label stays on.
- **`pull_request_target` uses the base branch's workflow file.** A pull
  request that edits a label-gated workflow does not test its own edit.
- **A failing preprocess check is information.** It is expected whenever
  verified code changes; the pull request then needs a proof run, not a
  fix to make the check pass.
- **The compile matrix is small.** It covers the verified configurations
  (`configs/*_verified.cmake`) with two compilers, so an
  unusual option combination can break without CI noticing; the hardware
  build matrix after merge is much wider.
- **Link check failures can be someone else's.** The link checker fetches
  external URLs, so an unrelated dead link can fail a pull request
  (unchecked how often).
- **Jobs guarded by `github.repository_owner == 'seL4'` are skipped in a
  fork.** Running the workflows in your own fork gives the hosted-runner
  checks only.

## See also

- [Contributing a patch](contributing.md): the rules these checks enforce
- [Proof impact](proof-impact.md): reading the preprocess result
- [sel4test](sel4test.md): the test suite the simulation and hardware jobs run
- [l4v](l4v.md): the proofs and the verification manifest
- [Build system](build-system.md): configurations and standalone kernel builds

## References

- [`seL4/seL4` `.github/workflows/`](https://github.com/seL4/seL4/tree/master/.github/workflows):
  all twelve kernel workflows, triggers and matrices as tabulated.
  *Checked 2026-11-14.*
- [`ci-actions` shared workflows](https://github.com/seL4/ci-actions/tree/master/.github/workflows):
  `pr.yml` (gitlint, whitespace, shell, style), `push.yml` (licence,
  links), `sel4test-sim.yml` (matrix), `sel4test-hw.yml` (label
  condition). *Checked 2026-11-14.*
- [`ci-actions/preprocess`](https://github.com/seL4/ci-actions/tree/master/preprocess):
  README and `test_munge.sh`: what the check compares and what a failure
  means. *Checked 2026-11-14.*
- [`ci-actions/standalone-kernel/compile_kernel.sh`](https://github.com/seL4/ci-actions/blob/master/standalone-kernel/compile_kernel.sh):
  which configurations the compile check builds. *Checked 2026-11-14.*
- [`ci-actions/gitlint/steps.sh`](https://github.com/seL4/ci-actions/blob/master/gitlint/steps.sh):
  the gitlint command line. *Checked 2026-11-14.*
- Workflow directories of
  [`sel4test`](https://github.com/seL4/sel4test/tree/master/.github/workflows),
  [`seL4_tools`](https://github.com/seL4/seL4_tools/tree/master/.github/workflows),
  [`l4v`](https://github.com/seL4/l4v/tree/master/.github/workflows),
  [`microkit`](https://github.com/seL4/microkit/tree/main/.github/workflows) and
  [`sddf`](https://github.com/au-ts/sddf/tree/main/.github/workflows):
  job names and triggers. *Checked 2026-11-14.*
- [Pull requests](https://sel4.systems/Contribute/pull-requests.html),
  "Tests": the required checks and who adds the labels.
  *Checked 2026-11-14.*
- [GitHub Actions: events that trigger workflows](https://docs.github.com/en/actions/reference/events-that-trigger-workflows):
  `pull_request` against `pull_request_target`. *Unchecked: from memory.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
