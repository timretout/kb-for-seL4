# Untyped memory and retyping

> Untyped capabilities stand for blocks of physical memory that are not yet any kernel object; `seL4_Untyped_Retype` carves objects out of one, and revoking it is the only way to get the memory back, which is how seL4 leaves all memory allocation to user level.

[Index](../INDEX.md) › [Part 4: The seL4 kernel](../INDEX.md#part-4-the-sel4-kernel) › [Model and API](../INDEX.md#model-and-api) · ← [Kernel objects](kernel-objects.md) · [System calls and invocations](syscalls-and-invocations.md) →

Read first: [Capabilities](capabilities.md), [Kernel objects](kernel-objects.md).

| At a glance | |
|---|---|
| Kind | Kernel mechanism; there is no untyped object, all state is in the capability |
| Key source | [`src/object/untyped.c`](https://github.com/seL4/seL4/blob/master/src/object/untyped.c), [`include/object/untyped.h`](https://github.com/seL4/seL4/blob/master/include/object/untyped.h) |
| Config options | `CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS` (230), `CONFIG_RETYPE_FAN_OUT_LIMIT` (256), `CONFIG_RESET_CHUNK_BITS` (8) |
| API | `seL4_Untyped_Retype`; memory comes back by `seL4_CNode_Revoke` |
| Object size | 2^4 bytes up to 2^47 (x86-64, AArch64) or 2^38 (RV64) |
| Built on | The [capability derivation tree](capabilities.md) |
| Used by | Allocators in [seL4_libs](sel4-libs.md); [Microkit](microkit.md)'s build-time layout |
| Verified | `resetUntypedCap` is verified code |

## What it is

The seL4 kernel has no memory allocator of its own after boot. All
physical memory the kernel does not occupy is handed to the
[root task](bootinfo-and-root-task.md) as **untyped capabilities**
(untypeds): each names a contiguous, power-of-two sized, aligned block
of physical memory with no type yet. To create any
[kernel object](kernel-objects.md), including the page tables and TCBs
the kernel itself will use, user level **retypes** part of an untyped.
The consequences:

- whoever holds an untyped decides what its memory becomes, so memory
  policy is entirely user level's;
- the kernel can never run out of memory on a caller's behalf: an
  operation that needs memory is given it by the caller, or fails;
- handing a subsystem a set of untypeds bounds the memory it can ever
  use, kernel metadata included.

BootInfo lists the untypeds as `seL4_UntypedDesc` entries: physical
address (`paddr`), `sizeBits` and `isDevice`. There are at most
`CONFIG_MAX_NUM_BOOTINFO_UNTYPED_CAPS` (default 230), so a fragmented
memory map can lose memory off the end of the list. `create_untypeds`
makes the device untypeds first, then the recycled boot memory, then
free RAM; once the list is full `provide_untyped_cap` prints "Too many
untyped regions for boot info" and makes no capability for the rest,
so it is RAM that is lost.

### Retype

```c
seL4_Error seL4_Untyped_Retype(
    seL4_Untyped _service,   /* the untyped to carve from */
    seL4_Word type,          /* seL4_TCBObject, seL4_X86_4K, ... */
    seL4_Word size_bits,     /* only for variable-sized types */
    seL4_CNode root,         /* destination CNode: root, index, depth */
    seL4_Word node_index,
    seL4_Word node_depth,
    seL4_Word node_offset,   /* first destination slot in that CNode */
    seL4_Word num_objects);  /* how many objects, and slots, to fill */
```

It creates `num_objects` objects of one type, laid out consecutively in
the untyped's memory, and puts one capability to each in consecutive
empty slots starting at `node_offset` of the destination CNode. The
destination CNode is named by the root, index and depth triple
([CSpaces](cspace.md)); as a special case `node_depth == 0` means
`root` itself is the destination CNode. `size_bits` matters for
Untyped (log2 bytes, at least `seL4_MinUntypedBits` = 4), CNodes (log2
slots, at least 1) and scheduling contexts (log2 bytes, at least 7);
other types ignore it. `num_objects` is 1 to
`CONFIG_RETYPE_FAN_OUT_LIMIT` (default 256).

The new capabilities are children of the untyped in the
[capability derivation tree](capabilities.md).

### Watermark allocation

An untyped is not a heap. Its capability records one number, the
**free index**: a watermark, below which memory has been given out.

```
 untyped block, 2^capBlockSize bytes
 +-----------+----------+------+-----+----------------------+
 | object A  | object B | pad  |  C  |   free               |
 +-----------+----------+------+-----+----------------------+
 ^ capPtr                            ^ free index (watermark)
```

Retype aligns the watermark up to the new object's size (objects are
always aligned to their own size, hence the padding before C above),
places the objects, and moves the watermark past them. Nothing ever
moves it back while any child exists: deleting object A does not make
its memory reusable.

To reuse memory, delete *every* capability derived from the untyped,
normally by `seL4_CNode_Revoke` on the untyped capability. Then the
next Retype finds the untyped has no children, **resets** it (watermark
to zero, memory cleared) and allocates from the start. The rule exists
because the kernel must be certain no capability still refers to the
old objects before it reinterprets their memory; the derivation tree
gives that certainty cheaply, where per-object reference counting would
not.

For finer-grained reuse, retype a large untyped into smaller untypeds
first, and allocate from those: each can be revoked and reset
separately. User-level allocators (in [seL4_libs](sel4-libs.md), or the
static layout [Microkit](microkit.md) computes at build time) work this
way.

### Device untypeds

Memory that holds device registers rather than RAM is given out as
**device untypeds** (`isDevice` set). They can be retyped only into
frames, or into smaller device untypeds, never into objects the kernel
would store its own data in. The kernel never reads, writes or clears
that memory: touching device registers has side effects, and the
kernel's own state must sit in real RAM. A user-level driver gets its
MMIO region ([I/O ports and MMIO](../concepts/io-ports.md)) by retyping
the device untyped covering it into frames and mapping them.

## In seL4

Everything is in
[`src/object/untyped.c`](https://github.com/seL4/seL4/blob/master/src/object/untyped.c),
about 300 lines.

The capability (`untyped_cap` in
[`structures_64.bf`](https://github.com/seL4/seL4/blob/master/include/object/structures_64.bf))
has `capPtr`, `capBlockSize` (6 bits: log2 of the size), `capIsDevice`
and `capFreeIndex`. The free index counts units of
2^`seL4_MinUntypedBits` (16) bytes: `FREE_INDEX_TO_OFFSET(i)` is
`i << seL4_MinUntypedBits`, and `MAX_FREE_INDEX(sizeBits)` marks an
untyped as full
([`include/object/untyped.h`](https://github.com/seL4/seL4/blob/master/include/object/untyped.h)).
There is no untyped *object*: all state is in the capability, which is
why an untyped cannot be copied while it has children (two capabilities
would have two watermarks).

`decodeUntypedInvocation` checks, in order:

1. the label is `UntypedRetype` (the only method) and the message has 6
   words and one extra capability (`root`);
2. `type < seL4_ObjectTypeCount`; `getObjectSize(type, size_bits)`
   does not exceed `seL4_MaxUntypedBits`; the minimum sizes above;
3. the destination CNode resolves (`lookupTargetSlot`, or `root`
   directly when depth is 0) and really is a CNode; `node_offset` and
   `num_objects` fit in it and in `CONFIG_RETYPE_FAN_OUT_LIMIT`; every
   destination slot is empty (`ensureEmptySlot`, else
   `seL4_DeleteFirst`);
4. `ensureNoChildren(slot)`: if the untyped has no children, the free
   index to use is 0 and `reset = true`; otherwise it is the
   capability's `capFreeIndex`;
5. the space left, `2^capBlockSize - offset`, holds `num_objects`
   objects, else `seL4_NotEnoughMemory` (with the bytes left returned
   to the caller);
6. a device untyped is asked only for a frame type (`Arch_isFrameType`)
   or `seL4_UntypedObject`;
7. `alignedFreeRef = alignUp(freeRef, objectSize)`.

`invokeUntyped_Retype` then resets if asked, writes the new
`capFreeIndex`, and calls `createNewObjects`
([`src/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/object/objecttype.c)),
which loops over `createObject` and `insertNewCap` (the latter links
each new capability into the derivation list directly after the
untyped).

### Reset and preemption

`resetUntypedCap` is where memory is zeroed, and clearing a large
untyped could take far longer than the kernel's interrupt latency
allows. So for RAM untypeds of at least 2^`CONFIG_RESET_CHUNK_BITS`
bytes (`KernelResetChunkBits`, default 8, so 256 bytes) it clears one
chunk at a time, from the old watermark *downwards*, storing the
lowered free index in the capability after each chunk and then calling
`preemptionPoint()`. If an interrupt is pending the system call is
abandoned and later restarted
([kernel design](kernel-design.md)); the restarted call sees a smaller
free index and carries on where the last left off. Device untypeds are
not cleared; their index is just set to 0. `Arch_postResetUntyped`
lets an architecture do cache maintenance afterwards.

The preemption check does not actually happen every 256 bytes:
`preemptionPoint()` only polls for interrupts after
`CONFIG_MAX_NUM_WORK_UNITS_PER_PREEMPTION` calls.

## Gotchas

- **Deleting an object does not free its memory.** Only revoking the
  parent untyped (deleting all its children) does, and then all of it
  at once. Plan untyped granularity around what must be freed together.
- **Alignment padding is lost** until the next reset. Retyping a small
  object then a large one wastes up to the large size; allocate large
  objects first.
- **Check 5 ignores alignment**, on the argument in the source that if
  the objects fit unaligned they fit aligned. That holds because the
  block and the objects are powers of two.
- **A device untyped retyped to a frame gives a device frame**: the
  kernel will not use it for an IPC buffer and never zeroes it.
- **Revoking a big untyped is slow twice**: once to delete the
  children, and again, at the next Retype, to clear the memory. Both
  are preemptible, so a caller sees the same system call restarted.
- **Reset is verified code.** Changing clearing behaviour touches the
  proofs of `resetUntypedCap`: note the `AUXUPD` and `GHOSTUPD`
  annotations in the function, which are instructions to the proof,
  not ordinary comments ([proof impact](proof-impact.md)).
- **`seL4_RevokeFirst` versus `seL4_DeleteFirst`**: the first means the
  untyped (or a capability being copied) still has children; the second
  means a destination slot is occupied.
- **Largest object is bounded by `seL4_MaxUntypedBits`** (47 on x86-64
  and AArch64, 38 on RV64), and by the untypeds the boot code actually
  produced: RAM regions are split into aligned power-of-two blocks, so
  a 3 GiB region arrives as a 2 GiB and a 1 GiB untyped.
- **Physical addresses matter for devices and DMA only.** BootInfo
  gives each untyped's `paddr`; a frame's physical address is the
  untyped's plus the offset at which it was allocated, which user level
  must track itself (or ask with the architecture's `Page_GetAddress`).

## See also

- [Kernel objects](kernel-objects.md): the types and sizes Retype accepts
- [Capabilities](capabilities.md): the derivation tree and revoke
- [CSpaces and capability addressing](cspace.md): the destination triple
- [BootInfo and the root task](bootinfo-and-root-task.md): the untyped list at boot
- [Kernel design and execution model](kernel-design.md): preemption points and restartable system calls
- [Address spaces (VSpace)](vspace.md): what is done with frames and page tables once made
- [Microkit internals](microkit-internals.md): untyped allocation done at build time
- [CAmkES and capDL](camkes-capdl.md): capDL is a language that describes a complete system as kernel objects and the capabilities between them,...
- [Kernel boot sequence](kernel-boot.md): the path from the kernel's entry point to the first user thread

## References

- [seL4 `src/object/untyped.c`](https://github.com/seL4/seL4/blob/master/src/object/untyped.c):
  `decodeUntypedInvocation`, `resetUntypedCap`, `invokeUntyped_Retype`.
  *Checked 2026-11-14.*
- [seL4 `include/object/untyped.h`](https://github.com/seL4/seL4/blob/master/include/object/untyped.h):
  the free index macros. *Checked 2026-11-14.*
- [seL4 `src/object/objecttype.c`](https://github.com/seL4/seL4/blob/master/src/object/objecttype.c):
  `getObjectSize`, `createNewObjects`. *Checked 2026-11-14.*
- [seL4 `config.cmake`](https://github.com/seL4/seL4/blob/master/config.cmake):
  `KernelRetypeFanOutLimit` (256), `KernelResetChunkBits` (8),
  `KernelMaxNumBootinfoUntypedCaps` (230). *Checked 2026-11-14.*
- [libsel4 `object-api.xml`](https://github.com/seL4/seL4/blob/master/libsel4/include/interfaces/object-api.xml),
  interface `seL4_Untyped`: the Retype method and its documentation.
  *Checked 2026-11-14.*
- [libsel4 `bootinfo_types.h`](https://github.com/seL4/seL4/blob/master/libsel4/include/sel4/bootinfo_types.h):
  `seL4_UntypedDesc`. *Checked 2026-11-14.*
- [seL4 Reference Manual](https://sel4.systems/Info/Docs/seL4-manual-latest.pdf),
  section 2.4 "Kernel Memory Allocation": the model in prose, with
  the reuse rules (2.4.1) and the restrictions on device untypeds and
  their frames. *Checked 2026-11-14 (version 17.0.0).*
- [seL4 `src/kernel/boot.c`](https://github.com/seL4/seL4/blob/master/src/kernel/boot.c):
  `create_untypeds`, `provide_untyped_cap`: the order of creation and
  the full-list case. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
