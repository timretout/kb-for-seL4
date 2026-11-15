# Trapping foreign system calls

> A thread that issues another operating system's system calls should fault to its handler, which can then emulate them; on x86-64 and AArch64 seL4 reads its own system call number from a register the foreign program fills with something else, so a few calls are silently run as seL4 calls instead, and upstream tracks this as an open issue.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [Faults and fault handlers](faults.md) · [Address spaces (VSpace)](vspace.md) →

Read first: [System calls and invocations](syscalls-and-invocations.md), [Faults and fault handlers](faults.md).

| At a glance | |
|---|---|
| Kind | Kernel mechanism, with a known gap |
| Key source | [`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c), [`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S), [`src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S) |
| Config options | `CONFIG_PRINTING`, `CONFIG_DEBUG_BUILD`, `CONFIG_VTX` and `CONFIG_SET_TLS_BASE_SELF` each add calls that do not fault |
| API | The `UnknownSyscall` fault and its reply |
| Built on | [Faults and fault handlers](faults.md) |
| Used by | A [Linux personality](linux-personality.md) |
| Verified | The proposed fixes change verified code; none is merged |

## What it is

A **foreign system call** is a system call instruction executed by a
program built for another operating system: a Linux binary running
`syscall` on x86-64 or `svc #0` on AArch64. The program expects a Linux
kernel underneath. On seL4 the hope is that the kernel does not
recognise the call and reports it to user level, where a server emulates
it. This is the basis of an OS personality; see
[A Linux personality on seL4](linux-personality.md).

seL4 has the mechanism. A system call number outside the kernel's own
range raises an [`UnknownSyscall` fault](faults.md): the kernel sends
the thread's registers to its fault handler, the handler does the work,
and its reply carries new register values and resumes the thread.

The gap is in the word "outside". Each kernel decides which call was
meant by reading one register, and the two kernels read different ones:

| | Linux number | Linux arguments 1 to 6 | seL4 number |
|---|---|---|---|
| x86-64 | `rax` | `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9` | `rdx` |
| AArch64 | `x8` | `x0` to `x5` | `x7` |

seL4's own numbers are small and negative, counting down from -1. So:

- On **x86-64**, seL4 looks at the Linux program's *third argument*. A
  Linux call whose third argument is one of seL4's numbers is taken as
  that seL4 call.
- On **AArch64**, seL4 looks at `x7`, which is no part of the Linux
  convention. It holds whatever the program last left there.

![The registers of one x86-64 system call, read as Linux reads them (a write of a buffer) and as seL4 reads them (a non-blocking send).](../images/foreign-syscalls-registers.svg)

*The same instruction, two meanings. Linux's `write` is number 1, in
`rax`; seL4 never looks at `rax`.*

### Most collisions still fault, a few do not

A collision is harmless if the seL4 call it lands on fails loudly. Give
the thread no capabilities and most do: the call names a capability,
the lookup fails, and the kernel raises a **cap fault** to the same
handler. The handler sees an odd fault type but still has the registers
and can emulate the Linux call.

The trouble is the seL4 calls that fail quietly or cannot fail:

| seL4 call | MCS number | Non-MCS number | Why it does not fault |
|---|---|---|---|
| `NBSend` | -6 | -4 | A non-blocking send to an invalid capability is dropped |
| `NBSendRecv` | -3 | none | The same, for its send phase |
| `NBSendWait` | -4 | none | The same, for its send phase |
| `Yield` | -11 | -7 | Needs no capability, so it always succeeds |
| `Reply` | none | -6 | Acts on the thread's own reply slot; an empty slot is ignored |

A Linux call that lands on one of these returns to the program as if it
had run, with nothing done and no one told. The numbers differ between
the [MCS](mcs.md) and non-MCS kernels because they are assigned in the
order of two separate lists.

### The x86-64 stack pointer

x86-64 has a second obstacle. On entry through `syscall` the kernel
does not save the user's stack pointer, and before returning with
`sysretq` it clears `rsp`. seL4's own system call stubs work around
this by copying `rsp` into `rbx` before the instruction and back after
it. A Linux binary does neither, so the handler cannot learn where the
program's stack was. AArch64 has no such problem.

### What upstream has said

The problem is filed as seL4 issue 477, open since August 2021, and is
listed among wanted features in the AArch64 verification issue list.
The issue records four possible fixes:

1. **Every system call needs a capability and faults without one.**
   The non-blocking sends would fault on an invalid capability, and
   `Yield` would be authorised by a capability, with the scheduling
   context suggested. The maintainers who commented favoured this.
2. **A null CSpace root, or a flag in the TCB,** makes every system
   call from that thread fault.
3. **Use Linux's register** for the system call number. Linux's
   numbers are not negative, so the two sets never overlap; this helps
   Linux only.
4. **A system call origin limit:** calls from outside a set address
   range fault, which lets native and foreign code share a thread.

None has been implemented in seL4. The stack pointer problem was filed
separately as issue 1451 and closed in favour of 477; a reply there
expects that saving `rsp` in the entry code would not affect
verification, because that code is below the proofs' machine interface.

## In seL4

- **Entry.** On x86-64, `handle_fastsyscall` in
  [`src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S)
  pushes the registers into the thread's context, `rdx` commented as
  "syscall number", and jumps to `c_handle_syscall`. It pushes no
  `rsp`. On AArch64, `lel_syscall` in
  [`src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S)
  compares `x7` with the fast path numbers and passes it on as the
  number.
- **Known or unknown.** `slowpath()` in
  [`src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c)
  sends a number outside `SYSCALL_MIN` to `SYSCALL_MAX` to
  `handleUnknownSyscall()` and the rest to `handleSyscall()`.
- **The quiet calls.** In
  [`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c),
  `handleInvocation()` builds a cap fault when the lookup fails and
  calls `handleFault()` only `if (isBlocking)`. `SysNBSend`,
  `SysNBSendRecv` and `SysNBSendWait` pass `isBlocking` as false.
  `handleYield()` looks up nothing. `handleRecv()`, by contrast, faults
  on a failed lookup whether blocking or not.
- **The unknown path is not empty.** `handleUnknownSyscall()` first
  checks for the debug, benchmark and optional calls and runs them. Only
  then does it raise `seL4_Fault_UnknownSyscall`.
- **Return.** `restore_user_context()` in
  [`src/arch/x86/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/c_traps.c)
  takes the `sysretq` path when the thread entered by `syscall`, and
  that path ends with `xor %rsp, %rsp`.
- **Numbers.** The lists are in
  [`libsel4/include/api/syscall.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/api/syscall.xml):
  `api-master`, `api-mcs`, then the conditional `debug` calls.

## Gotchas

- **A debug kernel swallows more.** With `CONFIG_PRINTING`, the number
  after the last ordinary call is `SysDebugPutChar`, which prints the
  byte in the first argument register and returns. A foreign call that
  lands there writes a stray character to the console. Test trapping on
  a release build.
- **`VMEnter` and `SetTLSBase` are in the same class.** They exist only
  with `CONFIG_VTX` and `CONFIG_SET_TLS_BASE_SELF`, sit on the
  unknown-syscall path, and take no capability.
- **AArch64 is not safer, only less predictable.** No Linux argument
  lives in `x7`, so a collision depends on leftover register contents
  and not on any value the program passed.
- **An empty CSpace does not make every call fault.** It turns the
  capability-taking calls into cap faults. `Yield` still succeeds and
  the non-blocking sends are still dropped.
- **The fault restarts at the trap instruction.** A handler that
  emulates a call must advance the instruction pointer in its reply;
  see [Faults and fault handlers](faults.md).
- **`syscall` is not the only way in on x86.** A software interrupt
  with a vector the kernel treats as a trap is also reported as an
  unknown system call, with the vector in the top byte of the number.

## See also

- [Faults and fault handlers](faults.md): the `UnknownSyscall` message and its reply
- [System calls and invocations](syscalls-and-invocations.md): seL4's own calls and registers
- [A Linux personality on seL4](linux-personality.md): the design this gap stands in the way of
- [Neptune OS](neptune-os.md): a personality that avoids the gap by shipping its own `ntdll.dll`
- [x86-64 exceptions and system calls](../concepts/x86-exceptions-syscalls.md): what `syscall` and `sysretq` do
- [AArch64 exceptions](../concepts/aarch64-exceptions.md): `svc` and exception entry
- [Proof impact of a change](proof-impact.md): why a fix here needs the verification team

## References

- [seL4 issue 477, "Linux syscall emulation not possible on aarch64 or x86_64"](https://github.com/seL4/seL4/issues/477):
  the register tables, the calls that do not fault, the four proposed
  fixes and the maintainers' discussion. *Checked 2026-11-15.*
- [seL4 issue 1451, "Do not clobber `rsp` on syscall entry on x86_64"](https://github.com/seL4/seL4/issues/1451):
  the stack pointer problem and the reply about verification.
  *Checked 2026-11-15.*
- [seL4 issue 769, "AArch64 verification issue list"](https://github.com/seL4/seL4/issues/769):
  lists issue 477 under "Features, not issues". *Checked 2026-11-15.*
- [seL4 `src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c):
  `handleUnknownSyscall()`, `handleInvocation()`, `handleRecv()`,
  `handleReply()`, `handleYield()`. *Checked 2026-11-15.*
- [seL4 `src/arch/x86/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/traps.S):
  `handle_fastsyscall`. *Checked 2026-11-15.*
- [seL4 `src/arch/x86/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/c_traps.c)
  and [`src/arch/x86/64/c_traps.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/64/c_traps.c):
  `slowpath()`, traps as unknown system calls, and the `sysretq` return.
  *Checked 2026-11-15.*
- [seL4 `src/arch/arm/64/traps.S`](https://github.com/seL4/seL4/blob/master/src/arch/arm/64/traps.S):
  `lel_syscall`. *Checked 2026-11-15.*
- [seL4 `libsel4/include/api/syscall.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/api/syscall.xml):
  the order that fixes the numbers. *Checked 2026-11-15.*
- [seL4 `libsel4/sel4_arch_include/x86_64/sel4/sel4_arch/syscalls_syscall.h`](https://github.com/seL4/seL4/blob/master/libsel4/sel4_arch_include/x86_64/sel4/sel4_arch/syscalls_syscall.h):
  the stubs that keep `rsp` in `rbx`. *Checked 2026-11-15.*
- [syscall(2), Linux man-pages](https://man7.org/linux/man-pages/man2/syscall.2.html),
  "Architecture calling conventions": Linux's number and argument
  registers. *Checked 2026-11-15.*
- [Linux `arch/x86/entry/syscalls/syscall_64.tbl`](https://github.com/torvalds/linux/blob/master/arch/x86/entry/syscalls/syscall_64.tbl):
  `write` is number 1. *Checked 2026-11-15.*
