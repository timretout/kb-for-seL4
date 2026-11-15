# sel4test and sel4bench

> sel4test is the kernel's functional test suite, a root task that runs each test in a fresh process and prints "All is well in the universe" when all pass; it is what upstream CI runs on every kernel pull request and the first thing to get running on a new machine, and sel4bench is its sibling for performance numbers.

[Index](../INDEX.md) › [Part 6: User level](../INDEX.md#part-6-user-level) · ← [seL4_libs and util_libs](sel4-libs.md) · [Microkit](microkit.md) →

Read first: [Build system](build-system.md), [seL4_libs and util_libs](sel4-libs.md).

| At a glance | |
|---|---|
| Kind | Test suite: a root task that runs each test in a fresh process |
| Repository | `seL4/sel4test`, fetched with `repo` from [`sel4test-manifest`](https://github.com/seL4/sel4test-manifest) |
| Key source | [`apps/sel4test-driver/src/main.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/main.c), [`apps/sel4test-tests/src/tests/`](https://github.com/seL4/sel4test/tree/master/apps/sel4test-tests/src/tests) |
| Config options | `PLATFORM`, `SIMULATION`, `MCS`, `SMP`, `RELEASE`, `LibSel4TestPrinterRegex` |
| API | `DEFINE_TEST`, `DEFINE_TEST_BOOTSTRAP`, `test_eq`, `test_assert` |
| Built on | [seL4_libs and util_libs](sel4-libs.md) |
| Used by | [Upstream CI](ci.md) on every kernel pull request; platform ports |

## What it is

**sel4test** is a user-level program that exercises the kernel's API:
about 240 tests of IPC, scheduling, address spaces, capability
operations, interrupts, faults, FPU state and multicore behaviour. The
proofs ([verification](verification.md)) cover the kernel's C on some
configurations; sel4test covers everything else by experiment: the
unverified configurations (SMP, MCS on most platforms, x86
virtualisation), the boot code, assembly, hardware drivers, and the
user-level libraries. A port to a new platform is conventionally
"working" when sel4test passes on it.

### Getting it

sel4test is a multi-repository project fetched with Google's `repo`
tool from **sel4test-manifest**. `default.xml` there follows the
branches' tips; `master.xml` is `common.xml` plus the kernel:

| Path in the checkout | Repository |
|---|---|
| `kernel/` | `seL4` |
| `tools/seL4/` | `seL4_tools` (CMake helpers, [elfloader](elfloader.md)) |
| `projects/sel4test/` | `sel4test` (this page) |
| `projects/seL4_libs/`, `projects/util_libs/` | the [libraries](sel4-libs.md) |
| `projects/sel4runtime/`, `projects/musllibc/` (branch `sel4`) | the [runtime and C library](libsel4.md) |
| `projects/sel4_projects_libs/` | further libraries (VMM support) |
| `tools/opensbi/`, `tools/nanopb/` | RISC-V firmware, protobuf for the RPC library |

### Building and running

```sh
mkdir build && cd build
../init-build.sh -DPLATFORM=x86_64 -DSIMULATION=TRUE
ninja
./simulate
```

`init-build.sh` runs CMake with the project's `settings.cmake`, which
turns a handful of friendly variables (`easy-settings.cmake`) into
kernel and test configuration ([build system](build-system.md)):

| Variable | Effect |
|---|---|
| `PLATFORM` | any kernel platform name or alias: `x86_64`, `qemu-arm-virt`, `spike`, `odroidc4`, ... |
| `KernelSel4Arch` | `aarch32`, `aarch64`, `arm_hyp`, `ia32`, `x86_64`, `riscv32`, `riscv64`, where the platform supports more than one |
| `SIMULATION` | sets `Sel4testSimulation` (drops tests unsuitable for an emulator) and turns `Sel4testHaveCache` off; the common simulation settings it applies force `KernelIOMMU` off, and it is an x86 build without `SIMULATION` that forces `KernelIOMMU` on. Forced on for `qemu-arm-virt`, `qemu-riscv-virt` and `spike`. Generates the `./simulate` script that starts [QEMU](../concepts/qemu.md). |
| `MCS` | `KernelIsMCS` ([MCS](mcs.md)) |
| `SMP`, `NUM_NODES` | `KernelMaxNumNodes` = `NUM_NODES`, default 4 ([SMP](smp.md)) |
| `ARM_HYP` | `KernelArmHypervisorSupport` |
| `DOMAINS` | `KernelNumDomains` = 4 instead of 1 |
| `RELEASE` | optimised, non-debug kernel; `VERIFICATION` restricts to verification-friendly features |
| `BAMBOO` | `LibSel4TestPrintXML`: JUnit-style XML output for CI |
| `LibSel4TestPrinterRegex` | POSIX regular expression choosing which tests run, default `.*` |
| `LibSel4TestPrinterHaltOnTestFailure` | stop at the first failure |

These are forced each time CMake runs unless
`Sel4testAllowSettingsOverride` is set, so setting `KernelIsMCS`
directly does nothing: set `MCS`. The output is in `build/images/`: a
kernel and a user image for x86 (multiboot modules), one combined
elfloader image for Arm and RISC-V.

### Structure

```
 sel4test-driver (root task)          sel4test-tests (one process
   allocman, vspace, serial,            per test, created and
   ltimer from platsupport              destroyed by the driver)
   |                                      |
   | for each BASIC test:                 |  main(): find test by
   |   sel4utils_configure_process  --->  |  name, run it, send the
   |   copy caps + untypeds in            |  result on an endpoint
   |   wait on fault endpoint      <---   |  (or fault)
   |   serve timer requests (RPC)  <--->  |  sel4test_sleep(), ...
   |   destroy process, check          
   |   no memory leaked
```

- **`apps/sel4test-driver`** is the root task. `main.c` bootstraps the
  allocator and vspace from [BootInfo](bootinfo-and-root-task.md),
  sets up serial output (`platsupport_serial_setup_simple`) and the
  timer (`init_timer`: `ltimer_default_init`), then
  `sel4test_run_tests` collects every test linked into the image,
  filters by the regex and runs them by type.
- **`apps/sel4test-tests`** is a second ELF, carried inside the
  driver's image as a CPIO archive. `src/tests/*.c` holds the tests,
  one file per subject; `src/helpers.c` has the utilities tests use:
  `create_helper_thread`, `start_helper`, `wait_for_helper`,
  `create_helper_process`, `sel4test_sleep`, `sleep_busy`.
- **`libsel4testsupport`** and seL4_libs' `libsel4test` are the
  framework: macros, result recording, output.

There are two **test types**:

- **BOOTSTRAP** tests (`DEFINE_TEST_BOOTSTRAP`) run inside the driver
  itself, first. They are the ones in `apps/sel4test-driver/src/tests/`:
  `SYSCALL*` (each system call returns at all), `TIMER0001/2`,
  `SMPIRQ0001`, `SMMU0001`.
- **BASIC** tests (`DEFINE_TEST`) each run in a new process
  (`basic_set_up` in `testtypes.c`), with its own CSpace and VSpace,
  copies of the capabilities a test may need (untypeds, ASID pool,
  domain, scheduling control, the timer notification) and a fault
  endpoint the driver waits on. A test that corrupts its own state
  cannot poison the next.

A test is declared with

```c
DEFINE_TEST(NAME0001, "description", function, enabled)
```

where `function` is `int f(env_t env)` returning `sel4test_get_result()`
and `enabled` is a compile-time condition such as
`config_set(CONFIG_KERNEL_MCS) && config_set(CONFIG_HAVE_TIMER)`. The
macro puts a `testcase_t` in the linker section `_test_case`; there is
no registration list. Tests run sorted by name. Name prefixes say
what is under test:

| Prefix | Subject (file in `sel4test-tests/src/tests/`) |
|---|---|
| `IPC`, `IPCRIGHTS`, `NBWAIT`, `CANCEL_BADGED_SENDS` | [IPC](ipc.md) (`ipc.c`, `ipc_rights.c`, `endpoints.c`) |
| `BIND`, `SYNC` | [notifications](notifications.md) (`binding.c`, `sync.c`) |
| `SCHED`, `SCHED_CONTEXT`, `DOMAINS`, `PREEMPT_REVOKE` | [scheduling](scheduling.md) (`scheduler.c`, `schedcontext.c`, `domains.cxx`, `preempt.c`) |
| `VSPACE`, `PT`, `FRAMEXN`, `FRAMEEXPORTS`, `FRAMEDIPC`, `PAGEFAULT`, `TLB`, `CACHEFLUSH` | [address spaces](vspace.md) and faults (`vspace.c`, `pagetables.c`, `frames.c`, `faults.c`, `tlb.c`, `cache.c`) |
| `CNODEOP`, `CSPACE`, `RETYPE` | [CSpaces](cspace.md) and [untypeds](untyped-memory.md) (`cnodeops.c`, `cspace.c`, `inc_untyped.c`) |
| `INTERRUPT`, `SMPIRQ` | [IRQ handling](irq-handling.md), using the timer as the interrupt source |
| `FPU` | [FPU state](../concepts/fpu-state.md) preserved across threads and cores |
| `MULTICORE` | thread migration and cross-core IPC, when `SMP` |
| `TIMEOUTFAULT` | MCS only |
| `IOPORTS`, `IOPT`, `EPT`, `VCPU`, `SMC`, `SMMU` | architecture features: x86 I/O ports, IOMMU and VT-x page tables, Arm virtual CPUs, SMC forwarding |
| `BREAKPOINT`, `SINGLESTEP`, `BREAK_REQUEST` | hardware debug API |
| `THREADS`, `TLS`, `STACK_ALIGNMENT`, `REGRESSIONS`, `TRIVIAL`, `SERSERV_*` | the libraries and runtime rather than the kernel |

### Output

```
Starting test suite sel4test
Starting test 0: Test that there are tests
Starting test 1: SYSCALL0000
...
Starting test 37: FPU0001
...
Test suite passed. 140 tests passed. 41 tests disabled.
All is well in the universe
```

(numbers illustrative). A test's own `printf` output is buffered and
shown only if the test fails. The framework adds two tests of its own,
"Test that there are tests" first and "Test all tests ran" last. The
last lines decide the run:

| Final output | Meaning |
|---|---|
| `All is well in the universe` | every enabled test ran and passed |
| `Test suite failed. N/M tests passed.` then `*** FAILURES DETECTED ***` | at least one failed assertion |
| `*** ALL tests not run ***` | the run stopped early |
| `Halting on fatal assertion...` | a `test_assert_fatal` failed |
| nothing more | a hang; see below |

Assertions are `test_eq(a, b)`, `test_neq`, `test_assert(cond)`,
`test_check` (records an error, carries on) and `test_assert_fatal`
(stops the whole run); a failure prints the expression, file and line.
CI does not look for these lines: it builds with `BAMBOO` set, which
turns on `LibSel4TestPrintXML`, so the driver prints jUnit-style XML
instead (`<testsuite>`, one `<testcase>` per test); the CI scripts
wait for `</testsuite>` in the serial log, or a timeout, and then
count the failures in the XML.

### Reading failures

- **Assertion failure**: the message names file and line in
  `sel4test-tests`. Read the test; they are short.
- **Fault in a test process**: the driver receives the fault message
  and prints it with `sel4utils_print_fault_message`, then the
  registers of the test's root thread ("may not be the thread that
  faulted"). A user-level [fault](faults.md) at a low address is
  usually a library problem, not a kernel one.
- **Kernel fault or assertion**: a debug kernel prints its own message
  (`seL4 called fail at ...`, or a register dump from a kernel
  exception) and halts. Nothing from sel4test follows. See
  [debugging](debugging.md).
- **Hang**: the last `Starting test` line names the test. A test that
  waits for a timer interrupt that never comes hangs here; so does a
  lost IPI in `MULTICORE*`.
- **Timer-dependent tests.** With `Sel4testHaveTimer`, tests get time
  from the driver by RPC, backed by the `ltimer`
  ([seL4_libs and util_libs](sel4-libs.md)). `TIMER0001/2`,
  the `SCHED*` tests that sleep, `INTERRUPT*`, and on MCS the
  budget and period tests (`SCHED_CONTEXT*`, the scheduler accuracy
  test) compare elapsed time against expectations. If the kernel's
  timer calibration or the user-level TSC calibration is wrong, they
  fail or wait far too long while everything else passes: on x86,
  suspect [timer calibration](../concepts/timer-calibration.md) and
  the [PIT](../concepts/pit.md) before suspecting the scheduler.

### Adding a test

Put a function in the fitting file under
`apps/sel4test-tests/src/tests/` (or a new file; sources are globbed),
include `../helpers.h`, end with a `DEFINE_TEST` using the next free
number for the prefix, and gate it on the configuration it needs. A
kernel pull request that needs a new test has a companion pull
request in `seL4/sel4test`
([Upstream CI](ci.md), [contributing](contributing-a-patch.md)).

### sel4bench

`seL4/sel4bench` (manifest `sel4bench-manifest`) has the same shape: a
driver root task that launches each benchmark application in its own
process and prints the results as JSON. The applications are `ipc`
(hot-cache IPC paths, the number seL4 is known for), `irquser` (IRQ
delivery measured from user level), `scheduler` (scheduling decisions
and `seL4_Yield`), `signal`, `smp` (IPC throughput against core
count), and on AArch64 `vcpu`. Results per board are kept in
`seL4/sel4bench-results` and published on the seL4 website's
performance page. For a kernel change on the IPC fastpath or in interrupt
entry, where before-and-after sel4bench numbers are the evidence,
maintainers can have CI run sel4bench on the pull request with the
`hw-bench` label.

## In seL4

- [`sel4test-manifest`](https://github.com/seL4/sel4test-manifest):
  `default.xml`, `master.xml`, `common.xml`.
- [`sel4test/settings.cmake`](https://github.com/seL4/sel4test/blob/master/settings.cmake)
  and [`easy-settings.cmake`](https://github.com/seL4/sel4test/blob/master/easy-settings.cmake):
  the variables in the table above.
- [`apps/sel4test-driver/src/main.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/main.c):
  `main`, `init_env`, `init_timer`, `sel4test_run_tests`,
  `sel4test_stop_tests` (the final messages).
- [`apps/sel4test-driver/src/testtypes.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/testtypes.c):
  the two test types, `basic_set_up`, `sel4test_driver_wait` (fault
  and timer request handling).
- [`apps/sel4test-driver/src/tests/`](https://github.com/seL4/sel4test/tree/master/apps/sel4test-driver/src/tests):
  bootstrap tests; `plat/` and `arch/` beside it hold per-platform
  driver set-up.
- [`apps/sel4test-tests/src/tests/`](https://github.com/seL4/sel4test/tree/master/apps/sel4test-tests/src/tests):
  the tests.
- [`libsel4test/include/sel4test/test.h`](https://github.com/seL4/seL4_libs/blob/master/libsel4test/include/sel4test/test.h)
  in seL4_libs: `DEFINE_TEST`, `DEFINE_TEST_BOOTSTRAP`, the assertion
  macros.
- `tools/seL4/cmake-tool/simulate_scripts/simulate.py` in seL4_tools:
  the template of `./simulate`.

In upstream CI, every kernel pull request runs sel4test in QEMU for
`armv7a`, `armv8a`, `nehalem` (x86), `rv32imac` and `rv64imac` with gcc
and clang; hardware runs across the supported boards happen on a
maintainer's label and after merge. [Upstream CI](ci.md) has the
workflows and the matrix.

## Gotchas

- **Simulation skips tests.** Anything gated on
  `!config_set(CONFIG_SIMULATION)` (`SCHED0021`, preemption among
  equal priorities, is one) and the cache tests do not run under
  `-DSIMULATION=TRUE`. A hardware-virtualised machine (KVM, a cloud
  instance) is not an emulator: decide deliberately which setting to
  test such a machine with.
- **"Tests disabled" is not "tests passed".** The count of disabled
  tests is in the summary line; a configuration change that silently
  disables a group still prints the success line.
- **The x86 simulation target is a specific CPU model.** CI's
  `nehalem` is a QEMU CPU choice; features newer than that
  ([x86 basics](../concepts/x86-64-basics.md)) are not exercised.
- **Debug by default.** Without `-DRELEASE=TRUE` the kernel is a
  debug build with printing and assertions, which is what you want
  when porting, and not what is verified or benchmarked.
- **The driver needs a working user-level serial and timer** before
  the first test line appears, so a silent start is more often a
  platsupport problem than a kernel one.
- **Tests assume they are the highest-priority thread** and run
  sequentially (sel4test's README); adding a background thread to the
  driver breaks scheduling tests.
- **Stale builds.** Changing `PLATFORM` in an existing build directory
  does not work across architectures: the cross-compiler is fixed
  when the build directory is initialised (the build system
  documentation); make a new one.
- **Each test starts from clean untypeds.** After a BASIC test the
  driver destroys the process and revokes every untyped it lent
  ("reset all the untypeds for the next test" in `basic_tear_down`),
  so nothing a test creates survives it, and a slow revoke shows up
  as a pause between tests.

## See also

- [Upstream CI](ci.md): where and when sel4test and sel4bench run automatically
- [seL4_libs and util_libs](sel4-libs.md): the allocator, process and timer code the driver is made of
- [Build system](build-system.md): `init-build.sh`, CMake cache variables, images
- [QEMU](../concepts/qemu.md): what `./simulate` starts
- [Debugging](debugging.md): kernel-side output when a test brings the kernel down
- [Timer calibration](../concepts/timer-calibration.md): the usual cause of timed-test failures on new x86 machines
- [Platform port](platform-port.md): sel4test as the acceptance test of a port
- [MCS](mcs.md), [SMP](smp.md): the configurations `-DMCS` and `-DSMP` select

## References

- [sel4test `README.md`](https://github.com/seL4/sel4test/blob/master/README.md):
  defining unit tests and larger tests, the assumptions.
  *Checked 2026-11-14.*
- [sel4test `settings.cmake`](https://github.com/seL4/sel4test/blob/master/settings.cmake),
  [`easy-settings.cmake`](https://github.com/seL4/sel4test/blob/master/easy-settings.cmake):
  the build variables and what they force. *Checked 2026-11-14.*
- [sel4test `apps/sel4test-driver/src/main.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/main.c)
  and [`testtypes.c`](https://github.com/seL4/sel4test/blob/master/apps/sel4test-driver/src/testtypes.c):
  the run loop, output strings, process set-up. *Checked 2026-11-14.*
- [sel4test-manifest `common.xml`](https://github.com/seL4/sel4test-manifest/blob/master/common.xml):
  the repositories and paths. *Checked 2026-11-14.*
- [libsel4test `test.h`](https://github.com/seL4/seL4_libs/blob/master/libsel4test/include/sel4test/test.h):
  the macros and test types. *Checked 2026-11-14.*
- [sel4bench `README.md`](https://github.com/seL4/sel4bench/blob/master/README.md):
  the benchmark applications, JSON output, results repository.
  *Checked 2026-11-14.*
- [seL4Test documentation](https://docs.sel4.systems/projects/sel4test/):
  getting the manifest, building and running. *Checked 2026-11-14.*
- [seL4 performance page](https://sel4.systems/performance.html):
  published sel4bench results. *Checked 2026-11-14.*
- seL4/ci-actions [`sel4test-sim/build.py`](https://github.com/seL4/ci-actions/blob/master/sel4test-sim/build.py),
  [`sel4test-hw/builds.yml`](https://github.com/seL4/ci-actions/blob/master/sel4test-hw/builds.yml)
  and [`seL4-platforms/builds.py`](https://github.com/seL4/ci-actions/blob/master/seL4-platforms/builds.py):
  how CI decides a run passed (`BAMBOO`, the `</testsuite>` marker,
  the jUnit summary). *Checked 2026-11-14.*
- seL4 [`.github/workflows/hw-tests.yml`](https://github.com/seL4/seL4/blob/master/.github/workflows/hw-tests.yml)
  and ci-actions [`sel4bench-hw.yml`](https://github.com/seL4/ci-actions/blob/master/.github/workflows/sel4bench-hw.yml):
  the `hw-bench` label. *Checked 2026-11-14.*
- [Using the seL4 build system](https://docs.sel4.systems/projects/buildsystem/using.html):
  the cross-compiler cannot be changed after the build directory is
  initialised. *Checked 2026-11-14.*
