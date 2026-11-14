# Notifications

> A notification object is one word of pending signal bits that senders OR into without ever blocking and a receiver collects by waiting; it is how seL4 delivers interrupts and how Microkit channels and sDDF queues say "there is work".

Read first: [IPC and endpoints](ipc.md), [Threads and TCBs](threads.md).

## What it is

[Endpoint IPC](ipc.md) is synchronous: the sender waits for the
receiver. That is wrong for an interrupt (hardware cannot wait) and
for a producer that must not be held up by a slow consumer. A
**notification** is the asynchronous alternative: a kernel object
holding a single word of bits, a set of binary semaphores.

- **Signal** (`seL4_Signal(ntfn)`): OR the *badge* of the capability
  used into the word. Never blocks, never fails, carries no message.
- **Wait** (`seL4_Wait(ntfn, &badge)`): if the word is non-zero,
  return it and clear it; otherwise block until someone signals.
- **Poll** (`seL4_Poll(ntfn, &badge)`): the same without blocking;
  returns 0 if nothing is pending.

These are not new system calls. `seL4_Signal` is `seL4_Send` on a
notification capability, `seL4_Wait` is `seL4_Recv` (on MCS, the
`Wait` system call, a receive that takes no reply capability) and
`seL4_Poll` is `seL4_NBRecv`; the kernel looks at the capability type.

The badge does the work. Different signallers are given capabilities
to the same notification minted with different badges, by convention
one bit each. Signals accumulate by OR, so:

- the receiver learns *which* sources signalled since it last looked,
  as a bit set;
- it does not learn *how many times*: two signals from one source
  before a wait are one bit. A notification says "look at your
  queues", never "here is one item";
- with one bit per source, a word gives at most 64 distinguishable
  sources on a 64-bit kernel (28 on 32-bit: the badge field width).

A capability with badge 0 can still signal and still wakes a waiter,
but adds no bit.

### States

| State | Meaning | Word |
|---|---|---|
| Idle | No signal pending, nobody waiting | unused |
| Waiting | One or more threads blocked in Wait | unused; queue of TCBs |
| Active | Signals pending, nobody waiting | the ORed badges |

```
            Signal                       Signal (ORs more bits in)
   Idle ────────────▶ Active ◀──┐  ──────┘
    ▲ │                 │
    │ │ Wait            │ Wait / Poll: return word, clear
    │ ▼                 ▼
  Waiting ──Signal──▶ (head waiter runs with the badge;
                       Idle when the queue empties)
```

A signal to a Waiting notification wakes exactly one thread, the head
of the queue, and hands it that one badge.

### Binding to a TCB

A server often needs to wait for two kinds of event: requests on an
endpoint and signals (an interrupt, a client's "queue is not empty").
A thread can block on only one object. **Binding** solves it:
`seL4_TCB_BindNotification(tcb, ntfn)` ties one notification to one
thread, and from then on a signal to it is also delivered when the
thread is blocked in `seL4_Recv` *on any endpoint*. The receive
returns as if a message had arrived, with the notification word as the
badge and no message contents.

The receiver tells the two apart by badge, so the system designer
must choose badges that cannot collide: for example reserving the top
bit of every endpoint badge. A notification binds to at most one TCB
and a TCB to at most one notification; the thread can still `Wait` on
its bound notification directly.

### Interrupts

A device interrupt reaches user level as a signal. A driver holds an
IRQ handler capability, calls `seL4_IRQHandler_SetNotification(irq,
ntfn)` with a badged notification capability, and waits. When the
interrupt fires the kernel masks it and signals; the driver handles
the device and calls `seL4_IRQHandler_Ack` to unmask. See
[IRQ handling](irq-handling.md).

### Shared-memory protocols

Bulk data on seL4 moves through memory shared between two components,
typically a pair of lock-free rings, and a notification in each
direction says the ring's state changed. Because signals coalesce, the
protocol must be written so that one wake-up handles everything
pending: the consumer drains the ring until empty, then re-checks
after deciding to sleep.

- **[Microkit](microkit.md)**: every protection domain has one
  notification bound to its thread and one endpoint. A *channel*
  between two protection domains is a pair of badged notification
  capabilities; `microkit_notify(ch)` is
  `seL4_Signal(BASE_OUTPUT_NOTIFICATION_CAP + ch)`. The domain's event
  loop receives on its endpoint, and if the badge's top bit
  (`BADGE_ENDPOINT_BIT`) is clear it walks the set bits and calls
  `notified(ch)` once per bit. So a protection domain has at most 62
  or so channel and interrupt sources (unchecked: the exact limit is
  in the Microkit manual).
- **[sDDF](sddf.md)**: drivers, virtualisers and clients share queues
  and signal each other through Microkit channels, with a flag in the
  shared queue header to suppress signals the consumer does not need.

## In seL4

The object is a bitfield block `notification` in
`include/object/structures_*.bf`: `ntfnBoundTCB`, `ntfnMsgIdentifier`
(the word), `ntfnQueue_head`/`ntfnQueue_tail`, `state`, and on MCS
`ntfnSchedContext`. Its size is `2^seL4_NotificationBits` bytes: 32 on
x86-64 non-MCS, 64 on MCS. The capability (`notification_cap`) holds
`capNtfnBadge`, `capNtfnCanSend` and `capNtfnCanReceive`.

[`src/object/notification.c`](https://github.com/seL4/seL4/blob/master/src/object/notification.c):

- **`sendSignal(ntfn, badge)`**, a `switch` on the state:
  - `NtfnState_Idle`: if a TCB is bound and it is
    `BlockedOnReceive`, `cancelIPC()` it, make it `Running` and write
    the badge into its `badgeRegister`; otherwise store the badge and
    go Active (`ntfn_set_active()`). On x86 with VT-x a bound thread
    in `RunningVM` is kicked out of the guest.
  - `NtfnState_Waiting`: dequeue the head waiter, make it `Running`
    with the badge; Idle if the queue is now empty.
  - `NtfnState_Active`: OR the badge into `ntfnMsgIdentifier`.
- **`receiveSignal(thread, cap, isBlocking)`**: Active returns the
  word and goes Idle; otherwise block (`BlockedOnNotification`, append
  to the queue, state Waiting) or, for Poll,
  `doNBRecvFailedTransfer()` (badge register 0).
- **`completeSignal()`** is the bound case seen from the other side:
  `receiveIPC()` in `endpoint.c` checks the thread's bound
  notification *first* and, if it is Active, returns its word without
  looking at the endpoint.
- `bindNotification()`/`unbindNotification()` set the two pointers;
  `decodeBindNotification()` in `src/object/tcb.c` refuses if the TCB
  already has one, if the capability lacks the receive right, or if
  the notification already has a bound TCB or queued waiters.
- `cancelSignal()` removes one waiter (thread suspended or deleted);
  `cancelAllSignals()` restarts all waiters when the object is deleted.

Interrupts arrive through `handleInterrupt()` in
`src/object/interrupt.c`, which for a user interrupt calls
`sendSignal()` with the badge of the capability stored in the IRQ's
slot.

On MCS a notification can also hold a scheduling context
(`seL4_SchedContext_Bind` accepts a notification): a passive thread
that receives a signal runs on that context
(`maybeDonateSchedContext()`) and returns it when it next blocks
(`maybeReturnSchedContext()`). This is how a passive server or driver
gets time to handle an interrupt. See [MCS](mcs.md). Wait queues are
priority ordered on MCS (`tcbNTFNAppend()`, `reorderNTFN()`) and FIFO
otherwise. AArch64 MCS has an optional signal fastpath
(`KernelSignalFastpath`).

## Gotchas

- **Signals are not counted.** A handler that processes one item per
  wake-up loses work. Drain until empty.
- **A bound thread in the middle of a `Call` is not woken.** If it is
  `BlockedOnReply` (or blocked sending), `sendSignal()` just makes the
  notification Active; the signal is seen at the thread's next
  receive. A server that makes long calls to others delays its own
  interrupt handling by that long.
- **Bound notification beats the endpoint.** `receiveIPC()` returns a
  pending signal before any queued sender, every time, so a flood of
  signals can starve endpoint clients.
- **Badge collisions between endpoint and notification are silent.**
  The kernel does not say which kind of event a receive returned.
- **Badge 0 signals look like "nothing"** to a Poll and are
  indistinguishable from an unbadged endpoint message to a bound
  receiver.
- **One waiter per signal.** With several threads waiting on one
  notification only the head is woken, and it takes the whole badge;
  a notification is not a broadcast.
- **`seL4_Signal` sets a message length of 1** in libsel4's x86-64
  stub (`seL4_MessageInfo_new(0, 0, 0, 1)`); the kernel ignores the
  message for a notification capability.
- **An interrupt stays masked until acknowledged.** A driver that
  takes the signal and never calls `seL4_IRQHandler_Ack` gets exactly
  one interrupt.
- **MCS: a passive thread woken by a signal on a notification with no
  scheduling context does not run.** It is `Running` but has nothing
  to run on (`MCS_DO_IF_SC` skips `possibleSwitchTo()`).

## See also

- [IPC and endpoints](ipc.md): the synchronous mechanism, and `receiveIPC()`'s check of the bound notification
- [IRQ handling](irq-handling.md): interrupts as signals
- [Threads and TCBs](threads.md): `BindNotification`, `BlockedOnNotification`
- [Microkit](microkit.md) and [Microkit internals](microkit-internals.md): channels and the event loop
- [sDDF](sddf.md): queues plus notifications as a driver framework
- [MCS](mcs.md): scheduling contexts bound to notifications

## References

- [`src/object/notification.c`](https://github.com/seL4/seL4/blob/master/src/object/notification.c):
  `sendSignal()`, `receiveSignal()`, `completeSignal()`.
  *Checked 2026-11-14.*
- [`src/object/endpoint.c`](https://github.com/seL4/seL4/blob/master/src/object/endpoint.c):
  `receiveIPC()` checking the bound notification first.
  *Checked 2026-11-14.*
- [`include/object/structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf):
  the `notification` and `notification_cap` blocks.
  *Checked 2026-11-14.*
- [`src/object/tcb.c`](https://github.com/seL4/seL4/blob/master/src/object/tcb.c):
  `decodeBindNotification()` and its error cases. *Checked 2026-11-14
  (error messages; conditions not read line by line).*
- [`libmicrokit/src/main.c`](https://github.com/seL4/microkit/blob/main/libmicrokit/src/main.c)
  and
  [`libmicrokit/include/microkit.h`](https://github.com/seL4/microkit/blob/main/libmicrokit/include/microkit.h):
  the event loop's badge decoding and `microkit_notify()`.
  *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  chapter 5 "Notifications". *Unchecked (not opened today).*
- [seL4 tutorial, "Notifications"](https://docs.sel4.systems/Tutorials/notifications.html).
  *Unchecked (not opened today).*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
