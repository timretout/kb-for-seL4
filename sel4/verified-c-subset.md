# The verified C subset

> Verified seL4 code must be written in the subset of C99 that the Isabelle C parser accepts (no unions, no `goto`, no fall-through, no address of a local, no side effects inside expressions), which explains much of the kernel's unusual C style.

Read first: [Verification](verification.md), [l4v](l4v.md).

## What it is

The proofs do not read C as a compiler does. A tool in `l4v`, the **C
parser** (`tools/c-parser`, whose input language its manual calls
**StrictC**), translates the preprocessed kernel into a formal language
inside Isabelle. It accepts only C whose meaning it can state exactly,
so anything it rejects cannot appear in a verified configuration, and
some things it accepts are still avoided because they make proofs hard.

### Rejected by the parser

The parser manual's own summary of "the simplest restrictions":

| Restriction | Consequence in the kernel |
|---|---|
| No `goto` | error paths return early; no cleanup labels |
| No fall-through in `switch`; a case ends in `break`, `continue` or `return` | several labels may share one body, but a body cannot run into the next |
| `case` labels only directly inside the `switch`'s block | no Duff's device, no labels inside nested blocks |
| No unions | variant records come from the bitfield generator |
| `struct`, `enum` and `typedef` declarations only at file scope | no local type declarations |

Expressions must be free of side effects. The parser's statement syntax
has only three places for a function call: `f(x);`, `v = f(x);` and
`return f(x);`. A call embedded in a larger expression is accepted in
limited cases (the manual says `int x = f() + g();` where both have side
effects "is currently allowed but should be avoided", since C leaves the
order unspecified). Assignment is a statement, not an expression: no
`a = b = c`, no `if ((x = f()))`.

GCC `__attribute__` annotations are parsed and mostly ignored, so
attributes are harmless to the proofs but also mean nothing to them.

### Required by the coding conventions

The Foundation's "Verification requirements" for C add rules, some of
which the parser enforces and some of which keep the proofs tractable:

- Follow C99.
- Do not take the address of a local variable. The memory model has a
  heap of typed objects; locals are not in it. (Out-parameters are
  therefore rare: functions return small structs by value instead.)
- No floating-point types, no `restrict`, no variadic functions, no
  `static` locals.
- No pre-increment or pre-decrement (`++x`).
- A function without parameters is declared `f(void)`.
- Do not pass an array where a pointer parameter is expected.
- Linker symbols are declared `extern char name[]`, not `extern char`
  or `extern void *`.
- An `enum` is not given a `typedef`; values of enum type are stored as
  `word_t`, because the compiler chooses an enum's size.
- No variable may share its name with a `typedef`.
- Every `struct` must be free of implicit padding: add explicit padding
  fields, since the content of compiler padding is unspecified.
- New `struct`s prefix field names with the struct's name, as field
  names share one namespace in the proofs.

Function pointers and pointer casts beyond the object macros are also
absent from verified kernel code (unchecked which of these the parser
rejects outright and which are convention).

## In seL4

Conventions in the source that follow from the subset:

- **Bitfield generator in place of unions and C bitfields.** Capabilities,
  page table entries, thread states and message info words are declared
  in `.bf` files (`include/object/structures.bf` and per-architecture
  ones) as `block`s and `tagged_union`s. `tools/bitfield_gen.py`
  generates `static inline` accessors (`cap_get_capType`,
  `cap_endpoint_cap_new`, `..._ptr_set_...`) and, for `l4v`, their
  specifications and proofs ([Generated code](generated-code.md)).
- **Result structs.** Lookup functions return, for example,
  `lookupCap_ret_t { exception_t status; cap_t cap; }` in place of
  writing through a pointer to a local.
- **`CONST` and `PURE`** (`include/util.h`) are GCC's `__const__` and
  `__pure__` attributes: hints to the compiler. The parser ignores them.
- **`UNREACHABLE()`** is `__builtin_unreachable()`; after a call that
  never returns or a `switch` proved exhaustive, it tells the compiler
  no path falls through. `fail("...")` and `halt()` are the explicit
  stops.
- **`NODE_STATE(x)`** names a per-core kernel variable (`ksCurThread`,
  `ksSchedulerAction`). In the single-core verified configurations it
  expands to the plain global, which is what the proofs see; with SMP it
  indexes a per-core structure ([SMP](smp.md)).
- **Comment annotations.** `/** DONT_TRANSLATE */` before a function
  tells the parser to skip its body (used about 55 times, for functions
  containing inline assembly or other untranslatable code, whose
  behaviour is then assumed); `/** MODIFIES: ... */` declares what state
  such a function may change; other `/** ... */` blocks carry "ghost
  state" updates the proofs need, for instance around retyping memory.
  They look like comments and must not be edited casually.
- **`compile_assert`** is the static check used in place of runtime
  assumptions about sizes and layout.

What the parser never sees, in a verified configuration:

| Code | Why it is outside |
|---|---|
| Assembly files (`*.S`: entry, exit, context switch) | not C |
| Bodies marked `DONT_TRANSLATE` | skipped; specified by assumption |
| Anything under an `#ifdef` that is false in that configuration (SMP, debug printing, benchmarks, most optional features) | removed by the preprocessor before parsing |
| Files the configuration does not compile (other architectures and platforms' drivers) | not in `kernel_all.c_pp` |
| `libsel4`, the elfloader, user level | not part of the kernel image |

`BOOT_CODE` functions are the opposite case: they *are* in
`kernel_all.c_pp` and must parse, but no refinement proof covers them
([Boot code](boot-code.md)). They may not use constructs the parser
rejects, and a change to one changes the preprocessed file.

### How CI notices

Two checks ([CI](ci.md)):

- **C Parser** runs the standalone parser over the kernel for the
  verified configurations. Unparseable C fails here in minutes, without
  Isabelle proofs.
- **Preprocess** builds `kernel_all.c_pp` (via the kernel's
  `kernel_all_pp_wrapper` target) for the base and head of a pull
  request and compares them. Any textual difference in what a verified
  configuration compiles, including a comment-free reordering or a
  changed boot function, is reported. It cannot tell a harmless
  difference from a proof-breaking one; that is what `proof-test` is
  for ([Proof impact](proof-impact.md)).

## Gotchas

- **Code that compiles and passes sel4test can still be unacceptable.**
  A `goto`, a union or `&local` in generic code breaks the C Parser
  check even if every test passes.
- **The subset binds unverified code too, when it shares a file.** Code
  under `#ifdef CONFIG_ENABLE_SMP_SUPPORT` is invisible to the parser and
  in principle free, but reviewers expect the same style everywhere in
  `src/`.
- **Platform drivers in verified configurations are parsed.** The timer
  and interrupt controller drivers of a verified platform are in
  `kernel_all.c_pp`; their hardware accesses are modelled as assumed
  machine operations, but their C must still parse.
- **Order of evaluation.** Two calls with side effects in one expression
  parse today; do not write them.
- **Harmless-looking refactors are visible.** Turning a macro into a
  `static inline` function, or changing a type from `int` to `word_t`,
  changes the parsed program and may need a proof update even though
  behaviour is identical.
- **Padding.** A new struct with implicit padding is a verification bug
  even if it never reaches user level.

## See also

- [Generated code](generated-code.md): the bitfield generator that replaces unions
- [l4v](l4v.md): where the parser lives and how its output is used
- [Proof impact](proof-impact.md): working out whether a change is seen by the parser
- [Boot code](boot-code.md): parsed but unverified
- [Contributing a patch](contributing.md): the rest of the code conventions

## References

- [C parser manual, `tools/c-parser/doc/ctranslation.tex`](https://github.com/seL4/l4v/blob/master/tools/c-parser/doc/ctranslation.tex),
  "StrictC Subset Summary", "Abstract Syntax", "GCC `__attribute__`
  Declarations": the five listed restrictions, the statement forms for
  calls, the evaluation-order warning. *Checked 2026-11-14.*
- [Coding conventions](https://sel4.systems/Contribute/style.html),
  "Verification requirements" and "Kernel code": the convention list
  above. *Checked 2026-11-14.*
- [seL4 `include/util.h`](https://github.com/seL4/seL4/blob/master/include/util.h)
  and [`include/model/statedata.h`](https://github.com/seL4/seL4/blob/master/include/model/statedata.h):
  `CONST`, `PURE`, `UNREACHABLE`, `NODE_STATE`. *Checked 2026-11-14.*
- [seL4 `CMakeLists.txt`](https://github.com/seL4/seL4/blob/master/CMakeLists.txt):
  the `kernel_all_pp_wrapper` target. *Checked 2026-11-14.*
- [`ci-actions/preprocess`](https://github.com/seL4/ci-actions/tree/master/preprocess):
  what the preprocess check compares. *Checked 2026-11-14.*
- Cock, "Bitfields and tagged unions in C: verification through
  automatic generation", VERIFY 2008: the bitfield generator, cited by
  the parser manual for unions. *Unchecked: from the manual's citation.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
