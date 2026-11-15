# IPC (inter-process communication) and endpoints

> seL4's synchronous message passing: threads rendezvous at endpoint objects to copy a few words and capabilities, with Call/ReplyRecv forming the remote procedure call that every seL4 system is built from and that the kernel's fastpath exists to make quick.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [MCS kernel](mcs.md) · [Notifications](notifications.md) →

Read first: [Capabilities](capabilities.md), [Threads and TCBs](threads.md), [Syscalls and invocations](syscalls-and-invocations.md).

| At a glance | |
|---|---|
| Kind | Kernel mechanism, with its kernel object the endpoint |
| Key source | [`src/object/endpoint.c`](https://github.com/seL4/seL4/blob/master/src/object/endpoint.c), [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c), [`src/fastpath/fastpath.c`](https://github.com/seL4/seL4/blob/master/src/fastpath/fastpath.c) |
| Config options | `KernelFastpath` (on by default) |
| API | `seL4_Send`, `seL4_Recv`, `seL4_Call`, `seL4_ReplyRecv`, and the non-blocking `seL4_NBSend`, `seL4_NBRecv` |
| Object size | Endpoint: 16 bytes on 64-bit |
| Built on | [Capabilities](capabilities.md) (rights and badges), [threads](threads.md) |
| Used by | [Faults](faults.md), [kernel invocations](syscalls-and-invocations.md), [Microkit](microkit.md) protected procedure calls |
| Verified | Fastpath proved to refine the same specification as the slowpath on AArch32 (also in hypervisor mode) and AArch64; not on RISC-V or x64 |

## What it is

In a microkernel system, services that Linux keeps in the kernel
(drivers, file systems, network stacks) are user-level threads, and a
"system call" to one of them is a message. seL4's mechanism for that is
**IPC** through **endpoints**.

An **endpoint** is a tiny kernel object (16 bytes on 64-bit) that holds
no data, only a queue of blocked threads. It is a rendezvous point:

- a thread that sends when no receiver is waiting blocks in the queue
  (state `BlockedOnSend`);
- a thread that receives when no sender is waiting blocks in the queue
  (`BlockedOnReceive`);
- when one of each meets, the kernel copies the message directly from
  sender to receiver and both continue. Nothing is buffered.

So an endpoint is always in one of three states: idle (empty queue),
send (queue of senders) or receive (queue of receivers).

### The operations

IPC operations are system calls on an endpoint capability:

| Call | Behaviour |
|---|---|
| `seL4_Send` | Block until a receiver takes the message |
| `seL4_NBSend` | Deliver if a receiver is waiting now, otherwise drop the message silently |
| `seL4_Recv` | Block until a message arrives; returns the sender's badge |
| `seL4_NBRecv` | Take a message if a sender is waiting now, otherwise return at once with badge 0 |
| `seL4_Call` | Send, then block for the reply, atomically |
| `seL4_Reply` | (non-MCS) Reply to the thread that last called us; never blocks |
| `seL4_ReplyRecv` | Reply, then receive on the endpoint, in one kernel entry |

Rights on the endpoint capability gate them: **Write** to send,
**Read** to receive, **Grant** to send capabilities along,
**GrantReply** to make a `Call` (the receiver gets a reply capability
but the caller cannot pass other capabilities).

The typical pattern is client/server remote procedure call: the client
does `seL4_Call(ep, msg)`; the server loops on
`seL4_ReplyRecv(ep, reply, &badge)`, which answers the previous client
and waits for the next in one system call. Call plus ReplyRecv is two
kernel entries per round trip, and it is the path the kernel optimises.

![A server waits on an endpoint with seL4_ReplyRecv; a client's seL4_Call delivers the message and badge to it and blocks the client; the server's next seL4_ReplyRecv sends the reply and waits for the next client.](../images/ipc-call-replyrecv.svg)

*One client/server round trip. The message goes straight from sender to
receiver, and the reply does not pass through the endpoint.*

The same system calls applied to a capability that is *not* an endpoint
are how every other kernel service is invoked: `seL4_Call` on a TCB
capability with a label meaning "Configure" is `seL4_TCB_Configure`.
See [syscalls and invocations](syscalls-and-invocations.md).

### Replies

`Call` needs a way for the server to answer exactly the caller, once,
without the caller having given it a permanent capability.

- **Non-MCS**: when a `Call` is delivered the kernel creates a
  single-use **reply capability** and puts it in a special slot of the
  *receiver's* TCB, `tcbCaller`. `seL4_Reply` and `seL4_ReplyRecv` use
  that slot implicitly and consume it. A server that wants to answer
  later, after receiving other messages, must first move the capability
  into its CSpace with `seL4_CNode_SaveCaller`, and then `seL4_Send` on
  it. A second `Call` arriving overwrites `tcbCaller`.
- **MCS**: the slot is gone. The server allocates **Reply objects**
  (`seL4_ReplyObject`) and passes a capability to one as an extra
  argument to `seL4_Recv` and `seL4_ReplyRecv`. When a `Call` is
  received, the kernel links the caller to that Reply object; the
  server answers with `seL4_Send` on the reply capability, or passes it
  to the next `seL4_ReplyRecv`. There is no `seL4_Reply` system call.
  Reply objects also carry the borrowed scheduling context back to the
  caller ([MCS](mcs.md)). MCS adds `seL4_NBSendRecv`,
  `seL4_NBSendWait`, and `seL4_Wait`/`seL4_NBWait` for receiving
  without a reply capability.

### Badges

A server usually has one endpoint and many clients, and needs to tell
them apart without trusting what they say. A **badge** is a word
stored in an endpoint capability when it is minted
(`seL4_CNode_Mint`); every message sent through that capability
arrives with that badge. The server (or whoever sets the system up)
mints one badged capability per client. A badge is 64 bits on 64-bit
kernels and 28 on 32-bit ones (`capEPBadge` in
`include/object/structures_*.bf`).
An unbadged capability has badge 0.

### What a message is

A message is a **message info** word (the *tag*,
`seL4_MessageInfo_t`) and up to `seL4_MsgMaxLength` = 120 **message
registers** (MRs), each one word:

| Tag field | Bits | Meaning |
|---|---|---|
| `length` | 7 | Number of message registers used |
| `extraCaps` | 2 | Number of capabilities attached (0 to 3) |
| `capsUnwrapped` | 3 | Set by the kernel on receipt: which caps arrived as badges |
| `label` | the rest | Free for the protocol; for kernel invocations, the method number; for faults, the fault type |

The first few MRs travel in real CPU registers
(`seL4_FastMessageRegisters`: 4 on x86-64, AArch64 and AArch32, 1 or 2
on ia32), so a short message never touches memory. The rest live in the
thread's **IPC buffer**, a page shared between the thread and the
kernel (`seL4_IPCBuffer`: `tag`, `msg[120]`, `userData`,
`caps_or_badges[3]`, then the receive slot description). libsel4's
`seL4_SetMR()`/`seL4_GetMR()` write the buffer; the `seL4_CallWithMRs`
family passes the register ones directly.

### Capability transfer

A sender with the Grant right may attach up to three capabilities by
putting their CPtrs in `caps_or_badges` and setting `extraCaps`. For
each, the kernel does one of two things:

- If the capability is to the *same endpoint* the message is being sent
  on, it is **unwrapped**: the receiver gets its badge in
  `caps_or_badges[i]` and bit *i* of `capsUnwrapped` is set. This lets
  a client prove to a server that it holds a particular badged
  capability of that server's.
- Otherwise the capability is copied (derived) into the receiver's
  **receive slot**, an empty CSpace slot the receiver named beforehand
  with `seL4_SetCapReceivePath()` (`receiveCNode`, `receiveIndex`,
  `receiveDepth` in its IPC buffer).

There is one receive slot, so at most one capability is actually
transferred per message; transfer stops quietly at the first that
cannot be delivered, and the received `extraCaps` says how many were
processed.

## In seL4

- [`src/object/endpoint.c`](https://github.com/seL4/seL4/blob/master/src/object/endpoint.c):
  `sendIPC()` and `receiveIPC()` are the two halves of the rendezvous,
  each a `switch` on the endpoint state (`EPState_Idle`,
  `EPState_Send`, `EPState_Recv`). A blocked sender's badge, rights and
  "is a call" flag are stored in its thread state
  (`blockingIPCBadge`, `blockingIPCCanGrant`,
  `blockingIPCCanGrantReply`, `blockingIPCIsCall`) since the endpoint
  has no room. `cancelIPC()` takes a thread out of whatever it is
  blocked on; `cancelAllIPC()` (endpoint deleted) and
  `cancelBadgedSends()` (badged capability revoked) restart blocked
  threads.
- [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c):
  `doIPCTransfer()` chooses `doNormalTransfer()` or, when the sender
  has a pending fault, `doFaultTransfer()` ([Faults](faults.md)).
  `doNormalTransfer()` looks up the extra caps (only if the sender may
  grant), `copyMRs()`, `transferCaps()`, then writes the tag and badge
  into the receiver's `msgInfoRegister` and `badgeRegister`.
  `doReplyTransfer()` handles replies, including replies to faults.
- [`src/api/syscall.c`](https://github.com/seL4/seL4/blob/master/src/api/syscall.c):
  `handleSyscall()` dispatches `SysSend`, `SysCall`, `SysRecv`,
  `SysReplyRecv` and the rest to `handleInvocation()`, `handleRecv()`
  and `handleReply()`.
- Non-MCS reply capabilities: `setupCallerCap()` in
  `src/object/tcb.c` inserts the reply capability into the receiver's
  `tcbCaller` slot as a child of the caller's `tcbReply` "reply
  master". MCS: `src/object/reply.c` (`reply_push()`,
  `reply_remove()`).
- On the non-MCS kernel endpoint queues are FIFO. On MCS
  `tcbEPAppend()` keeps them ordered by priority, FIFO within a
  priority (`tcbAppend()` in `include/object/tcb.h`), and
  `setPriority()` calls `reorderEP()` for a blocked thread.

After a successful rendezvous the woken thread goes to
`possibleSwitchTo()`, so the scheduler may run it at once
([Scheduling](scheduling.md)).

### The fastpath

Call and ReplyRecv dominate the cost of any seL4 system, so the kernel
has a hand-optimised **fastpath** for the common case, in
[`src/fastpath/fastpath.c`](https://github.com/seL4/seL4/blob/master/src/fastpath/fastpath.c)
(`fastpath_call()`, `fastpath_reply_recv()`, and on AArch64 MCS an
optional `fastpath_signal()` under `KernelSignalFastpath`), enabled by
`KernelFastpath` (on by default). The entry code
(`c_handle_fastpath_call()` and friends in each architecture's
`c_traps.c`) tries it first. The fastpath checks a list of conditions
and, if any fails, calls `slowpath()`, which runs the normal C path as
if nothing had happened. If all hold it does the whole IPC inline:
dequeue the receiver, set states, copy the registers, switch address
space, return to user level in the *other* thread, without calling
`schedule()`.

For `fastpath_call()` the conditions are, in outline:

- the message has no extra caps and fits in the register MRs
  (`fastpath_mi_check()`), and the caller has no pending fault;
- the capability is an endpoint with send right, and with Grant or
  GrantReply;
- the endpoint has a receiver waiting (`EPState_Recv`);
- the receiver's VSpace root is valid and its
  ASID (address-space identifier, see [VSpace](vspace.md)) is still
  current;
- the receiver's priority is at least the caller's, or it is the
  highest runnable priority, so that switching straight to it is what
  the scheduler would have decided;
- the receiver is in the current domain and (SMP) on this core;
- MCS: the receiver has no scheduling context of its own (it is a
  passive server and will run on the caller's) and supplied a Reply
  object.

`fastpath_reply_recv()` is the mirror image. The published sel4bench
figures are a few hundred cycles for each direction of a fastpath
round trip: an IPC call takes 372 cycles on an i.MX6 (Cortex-A9), 419
on a Jetson TX1 (Cortex-A57) and 790 on a Haswell Core i7, and the
reply about the same. That page gives no slowpath figures.

Why changes to it are sensitive: the fastpath is a second
implementation of semantics that the slowpath and the abstract
specification already define, written with every branch and cache line
counted. A fastpath that takes a case it should not, or leaves state
slightly different from the slowpath, is a kernel bug that functional
tests of IPC mostly will not see. On verified configurations the
fastpath is proved to refine the same specification as the slowpath
(the AArch32, AArch32 hypervisor and AArch64 proofs include the
fastpath; the RISC-V and x64 proofs do not), so changing it means
changing a proof. A change elsewhere that adds a TCB field or a new
thread state must also ask whether the fastpath has to check it.

## Gotchas

- **`seL4_NBSend` fails silently.** There is no return value saying
  whether the message was delivered; this is deliberate, to avoid an
  information channel back to the sender.
- **`seL4_NBRecv` with nothing waiting returns badge 0** and garbage
  message contents; a real message from an unbadged capability also
  has badge 0. Servers that poll should use badged capabilities.
- **A `Send` (not `Call`) needs no reply**, and replying to one on
  non-MCS uses whatever stale reply capability is in `tcbCaller`, or
  nothing.
- **Non-MCS: receive again before replying and the reply capability is
  gone**, unless it was saved with `seL4_CNode_SaveCaller`.
- **A `Call` through a capability with neither Grant nor GrantReply
  delivers the message and leaves the caller `Inactive` forever**
  (`sendIPC()` sets `ThreadState_Inactive`): no reply capability can be
  made.
- **Long messages are truncated to what the receiver's buffer allows**,
  and a thread with no valid IPC buffer receives only the register
  MRs; `length` in the received tag is what was actually copied.
- **Receiving more than one capability per message is impossible**
  even though three can be sent.
- **IPC is not a data plane.** At 120 words and a copy per message,
  bulk data goes through shared memory with
  [notifications](notifications.md) for signalling; IPC is for control
  and for protected procedure calls. sDDF and Microkit are designed
  around that split.
- **A server at lower priority than its clients defeats the fastpath
  check** and invites priority inversion; the usual design gives
  servers a priority at least that of their clients.
- **Blocking operations and the endpoint capability's badge**: the
  badge is captured when the sender blocks, so revoking the badged
  capability afterwards must find and restart those senders, which is
  what `cancelBadgedSends()` is for; it is one of the kernel's
  long-running, preemptible operations.

## See also

- [Notifications](notifications.md): the asynchronous counterpart
- [Faults](faults.md): fault messages are IPC sent by the kernel on a thread's behalf
- [Syscalls and invocations](syscalls-and-invocations.md): the same calls on other capabilities
- [Scheduling](scheduling.md): `possibleSwitchTo()` and what the fastpath bypasses
- [MCS](mcs.md): Reply objects and scheduling-context donation over Call
- [libsel4](libsel4.md): the user-side stubs and `seL4_IPCBuffer`
- [Microkit](microkit.md): protected procedure calls are `seL4_Call` on an endpoint
- [Kernel objects](kernel-objects.md): the fixed set of object types the seL4 kernel implements

## References

- [`src/object/endpoint.c`](https://github.com/seL4/seL4/blob/master/src/object/endpoint.c):
  `sendIPC()`, `receiveIPC()`. *Checked 2026-11-14.*
- [`src/kernel/thread.c`](https://github.com/seL4/seL4/blob/master/src/kernel/thread.c):
  `doIPCTransfer()`, `doNormalTransfer()`, `transferCaps()`,
  `doReplyTransfer()`. *Checked 2026-11-14.*
- [`src/fastpath/fastpath.c`](https://github.com/seL4/seL4/blob/master/src/fastpath/fastpath.c):
  the conditions in `fastpath_call()`. *Checked 2026-11-14 (the checks
  and their comments; the body after them not read).*
- [`libsel4/include/sel4/shared_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/shared_types.h)
  and
  [`constants.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/constants.h):
  `seL4_IPCBuffer`, `seL4_MsgMaxLength`, `seL4_MsgExtraCapBits`.
  *Checked 2026-11-14.*
- [`libsel4/include/api/syscall.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/api/syscall.xml):
  the system call lists for the non-MCS and MCS kernels.
  *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  version 17.0.0, chapter 4 "Message Passing (IPC)".
  *Checked 2026-11-14.*
- [seL4 tutorial, "IPC"](https://docs.sel4.systems/Tutorials/ipc.html):
  a worked client and server with badges and cap transfer.
  *Checked 2026-11-14.*
- [sel4bench results](https://sel4.systems/performance.html): IPC
  call and reply figures per platform. *Checked 2026-11-14.*
- [Verified configurations](https://docs.sel4.systems/projects/sel4/verified-configurations.html):
  which architectures' proofs include the fastpath.
  *Checked 2026-11-14.*
