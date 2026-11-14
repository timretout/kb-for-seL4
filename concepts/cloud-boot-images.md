# Booting a custom kernel on a cloud

> What it takes to get a kernel that is not Linux running on EC2 or Compute Engine: a GPT disk image with an EFI system partition and a boot loader at the fallback path, the import and registration steps of each cloud, and reading the serial log.

[Index](../INDEX.md) › [Part 3: Platform and devices](../INDEX.md#part-3-platform-and-devices) › [Cloud platforms](../INDEX.md#cloud-platforms) · ← [Compute Engine machine types](gce-machine-types.md) · [ENA](ena.md) →

Read first: [Cloud virtual machines](cloud-vms.md), [UEFI](uefi.md), [x86 boot](x86-boot.md).

| At a glance | |
|---|---|
| Kind | Procedure: building a boot disk and importing it as a cloud image |
| Disk | GPT with one 64 MiB FAT32 EFI system partition at 1 MiB |
| Loader path | `\EFI\BOOT\BOOTX64.EFI` on x86-64, `\EFI\BOOT\BOOTAA64.EFI` on 64-bit Arm |
| x86 loader | GRUB, loading the kernel with `multiboot2` and the root task with `module2` |
| Arm loader | [elfloader](../sel4/elfloader.md) built as an EFI application |
| Into EC2 | `import-snapshot`, then `register-image` with `--ena-support` and `--boot-mode` |
| Into Compute Engine | `disk.raw` in an `oldgnu` tar, then `gcloud compute images create` |
| seL4 code | [`boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c), [`cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c); [`elfloader-tool`](https://github.com/seL4/seL4_tools/tree/master/elfloader-tool) |

## What it is

A cloud will not load a kernel file. It boots a **disk image**: the
firmware of the instance looks on the boot disk for a boot loader, as a
PC would. So running seL4 there means building a disk that the cloud's
firmware can boot, turning it into the cloud's image object (an *AMI*
on EC2, an *image* on Compute Engine), and starting an instance from
it.

### The disk

One small disk serves both clouds and both boot modes:

```
 sector 0      protective MBR (+ GRUB boot code, for BIOS boot)
 sector 1...   GPT header and partition table
 (gap)         GRUB core image (BIOS boot only)
 1 MiB         partition 1: EFI system partition, FAT32, 64 MiB
                 /EFI/BOOT/BOOTX64.EFI   or  BOOTAA64.EFI
                 /boot/sel4-kernel, /boot/sel4-rootserver   (x86)
 end           backup GPT
```

- **GPT** (GUID partition table) is the partition format
  [UEFI](uefi.md) firmware expects.
- The **EFI system partition** (ESP) is a FAT partition flagged `esp`.
  A fresh instance has no boot entries stored in firmware variables, so
  the firmware falls back to the *removable media path*:
  `\EFI\BOOT\BOOTX64.EFI` on x86-64, `\EFI\BOOT\BOOTAA64.EFI` on
  64-bit Arm. Whatever is at that path runs.
- No root file system and no operating system are needed in the image.
  Tools: `parted` for the table, `mkfs.vfat` and `mcopy` (mtools) to
  fill the partition without mounting it.

![On x86 the UEFI firmware runs GRUB from the fallback path, and GRUB loads the seL4 kernel with multiboot2 and the root task with module2; on Arm the file at the fallback path is the elfloader, built as an EFI application that carries the kernel, device tree and root task.](../images/cloud-boot-images-chain.svg)

*What sits at the fallback path on each architecture, as the next
paragraphs explain: x86 needs GRUB in between, Arm does not.*

**x86.** seL4 has no UEFI entry point on x86, only Multiboot, so the
file at the fallback path is GRUB, built as one self-contained EFI
program with its configuration inside:

```
grub-mkimage -O x86_64-efi -c grub.cfg -p /boot/grub -o BOOTX64.EFI \
    part_gpt fat multiboot2 serial terminal search search_fs_file echo boot
```

and a configuration that prints to the serial port and loads the
kernel and root task:

```
serial --port=0x3f8 --speed=115200
terminal_input serial
terminal_output serial
search --no-floppy --file --set=root /boot/sel4-kernel
multiboot2 /boot/sel4-kernel console_port=0x3f8 debug_port=0x3f8
module2 /boot/sel4-rootserver
boot
```

`multiboot2` loads the kernel ELF and `module2` passes the root task
as a boot module; the firmware's memory map and ACPI root pointer
reach the kernel in Multiboot2 tags. (`grub-mkstandalone` is the other
way to build such a file.)

**Arm.** No GRUB is needed: seL4's [elfloader](../sel4/elfloader.md)
can be built as an EFI application (`ElfloaderImage` set to `efi`)
carrying the kernel, device tree and root task, and that file is
copied to `BOOTAA64.EFI`. For a loader image that is not an EFI
program, as Microkit produces, a small EFI program at the fallback
path has to load and jump to it.

**Legacy BIOS.** Where UEFI is not used (EC2's `legacy-bios` boot
mode, which is all the Xen-based types offer), the same disk can carry
GRUB's BIOS pieces: the 440 bytes of boot code from `boot.img` in the
MBR, and a `core.img` (built with `grub-mkimage -O i386-pc`, adding
`biosdisk`) in the gap before the first partition, with the core
image's sector number patched into the boot code. `grub-install` does
this on a real disk; on an image file it can be done by hand.

### Into EC2

1. Upload the raw disk to an S3 bucket.
2. `aws ec2 import-snapshot --disk-container Format=RAW,UserBucket={...}`
   turns it into an EBS snapshot; poll
   `describe-import-snapshot-tasks` until it completes. This needs the
   `vmimport` service role set up once in the account.
3. Register an AMI over the snapshot:

```
aws ec2 register-image --name NAME --architecture x86_64|arm64 \
    --virtualization-type hvm --boot-mode uefi|legacy-bios --ena-support \
    --root-device-name /dev/sda1 \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={SnapshotId=snap-...}"
```

`--ena-support` declares that the image can drive the [ENA](ena.md);
Nitro instance types refuse an AMI without it, whether or not the
kernel ever touches the network. `--boot-mode` picks the firmware.
(The other route, writing the image to an EBS volume from a helper
instance and snapshotting that, avoids S3 and the import role.)

4. `aws ec2 run-instances`, then read the console:
   `aws ec2 get-console-output --latest`, or the EC2 serial console for
   an interactive connection.

### Into Compute Engine

1. The raw disk must be named `disk.raw`, be a whole number of GiB in
   size, and be packed alone in a gzipped tar of the old GNU format:
   `tar --format=oldgnu -Sczf image.tar.gz disk.raw` (`-S` keeps it
   sparse: a 1 GiB disk holding seL4 packs to 2 or 3 MB; observed).
2. Copy the archive to a Cloud Storage bucket.
3. Create the image:

```
gcloud compute images create NAME --source-uri gs://BUCKET/image.tar.gz \
    --architecture X86_64|ARM64 --guest-os-features UEFI_COMPATIBLE,GVNIC
```

`UEFI_COMPATIBLE` selects UEFI boot; `GVNIC` lets the image be used
with a [gVNIC](gvnic.md), which newer machine series require. No
import role or conversion step is involved.

4. `gcloud compute instances create ... --image NAME`, then
   `gcloud compute instances get-serial-port-output NAME`, which
   returns the log and the offset to continue from (`--start`).

### The loop, and shortening it

One round is build, pack, upload, register, start, wait, fetch the
log, delete. On Compute Engine a sel4test boot took about two minutes
from instance creation to a complete log (observed, 2026); EC2's
snapshot import adds minutes more. Against a few seconds under
[QEMU](qemu.md), that is the cost that shapes the work:

- Boot the *same disk image* under QEMU with OVMF (the EDK II build
  for QEMU) first: `qemu-system-x86_64 -bios OVMF.fd -drive
  file=disk.raw,format=raw -nographic`. It catches every mistake in
  the partition table, the fallback path and `grub.cfg`.
- Make QEMU resemble the target: `-machine q35,hpet=off` for Compute
  Engine's lack of an [HPET](hpet.md), legacy virtio devices for its
  older series.
- Script the whole round, so that a try is one command, and have the
  script delete the instance; give instances a maximum run time so
  that a forgotten one removes itself.
- Change one thing per boot. The log is all the evidence there is.

## In seL4

Nothing upstream builds a cloud image; the pieces it provides are the
boot protocols.

- **x86**: the kernel is a Multiboot1 and Multiboot2 image; the
  Multiboot2 path and the command line options `console_port` and
  `debug_port` are in
  [`src/arch/x86/kernel/boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c)
  and
  [`cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c).
  See [kernel boot](../sel4/kernel-boot.md).
- **Arm**: the elfloader's EFI image type, in
  [seL4_tools `elfloader-tool`](https://github.com/seL4/seL4_tools/tree/master/elfloader-tool).
- **Microkit** produces a loader image per board, not an EFI program;
  see [Microkit internals](../sel4/microkit-internals.md).

## Gotchas

- **Silence on x86 under UEFI.** With no `console_port` option the
  kernel takes its serial port from the BIOS data area (the word at
  `0x400`) when that area claims to list one, and only otherwise
  defaults to `0x3f8`. Under UEFI the area holds nothing useful, and
  the kernel ran with no output at all, even through a complete test
  run (observed on EC2, 2026). Pass the ports on the kernel command
  line.
- **A hang with no console is the common failure**, and has many
  causes: wrong boot mode for the image, nothing at the fallback path,
  the wrong architecture's file name, a kernel built for CPU features
  the instance lacks. Getting GRUB itself to print on the serial port
  splits the problem in two.
- **Secure Boot rejects unsigned loaders.** Compute Engine logs "UEFI:
  Failed to load image" and "Status: Security Violation". It is off by
  default there; keep it off.
- **Boot mode is fixed in the image** (`--boot-mode` on the AMI,
  `UEFI_COMPATIBLE` on the Compute Engine image), not chosen per
  instance.
- **The serial port is not always COM1.** EC2's x86 bare-metal types
  have no UART at `0x3f8`: the console is a 16550 behind a memory BAR
  of PCI device `1d0f:8250`, at an address the firmware chooses
  (observed, 2026). On Arm the UART type and address differ per cloud;
  see [UARTs](uart.md).
- **GRUB's embedded configuration** is run by its rescue parser, which
  does not understand comments (observed).
- **GRUB under UEFI warns that no console is available to the OS.**
  That concerns video and can be ignored.
- **EC2's `get-console-output` can return nothing for a running
  instance** on Xen types; the interactive serial console works there
  (observed on `t2.micro`).
- **Compute Engine's log dies with the instance**: fetch before
  deleting.

## See also

- [Cloud virtual machines](cloud-vms.md): what the booted kernel then finds
- [Amazon EC2 and the Nitro system](ec2.md), [Google Compute Engine](gce.md): per-cloud detail, including image flags
- [UEFI](uefi.md), [x86 boot](x86-boot.md): the firmware and Multiboot background
- [QEMU](qemu.md): the local loop
- [Elfloader](../sel4/elfloader.md): the Arm boot path
- [ELF and linking](elf.md): ELF is the file format of every kernel, loader and user program in an seL4 system

## References

- [Compute Engine: create custom images](https://docs.cloud.google.com/compute/docs/images/create-custom):
  `gcloud compute images create`, `--guest-os-features` and the flags. *Checked 2026-11-14.*
- [Compute Engine: troubleshooting using the serial console](https://docs.cloud.google.com/compute/docs/troubleshooting/troubleshooting-using-serial-console):
  reading port 1. *Checked 2026-11-14.*
- [Shielded VM](https://docs.cloud.google.com/compute/shielded-vm/docs/shielded-vm):
  the Secure Boot failure message. *Checked 2026-11-14.*
- [Compute Engine: manually import boot disks](https://docs.cloud.google.com/compute/docs/import/import-existing-image):
  the `disk.raw` name, the size in whole GB and the gzipped `oldgnu` tar. *Checked 2026-11-14.*
- [AWS VM Import/Export: importing a disk as a snapshot](https://docs.aws.amazon.com/vm-import/latest/userguide/vmimport-import-snapshot.html),
  [required permissions](https://docs.aws.amazon.com/vm-import/latest/userguide/required-permissions.html)
  and [monitoring an import snapshot task](https://docs.aws.amazon.com/vm-import/latest/userguide/check-status-import-task.html):
  raw images from S3 with `import-snapshot`, the `vmimport` role,
  `describe-import-snapshot-tasks`. *Checked 2026-11-14.*
- [AWS CLI reference, `register-image`](https://docs.aws.amazon.com/cli/latest/reference/ec2/register-image.html):
  `--boot-mode`, `--ena-support`, `--virtualization-type` and the
  device mapping options. *Checked 2026-11-14.*
- [GNU GRUB manual](https://www.gnu.org/software/grub/manual/grub/grub.html) (2.16),
  sections [6.6 "Embedding a configuration file into GRUB"](https://www.gnu.org/software/grub/manual/grub/html_node/Embedded-configuration.html)
  (`grub-mkimage -c`),
  [16.194 "multiboot2"](https://www.gnu.org/software/grub/manual/grub/html_node/multiboot2_005fmodule.html)
  (the `multiboot2` and `module2` commands) and
  [17.3.1 "serial"](https://www.gnu.org/software/grub/manual/grub/html_node/serial.html).
  The manual has no chapter on invoking `grub-mkimage` or
  `grub-mkstandalone`. *Checked 2026-11-14.*
- [seL4 `src/arch/x86/kernel/cmdline.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/cmdline.c):
  `console_port` and `debug_port`, and the BIOS data area default;
  [`boot_sys.c`](https://github.com/seL4/seL4/blob/master/src/arch/x86/kernel/boot_sys.c)
  for the Multiboot2 entry. *Checked 2026-11-14.*
- [seL4_tools `elfloader-tool/CMakeLists.txt`](https://github.com/seL4/seL4_tools/blob/master/elfloader-tool/CMakeLists.txt):
  the `efi` value of `ElfloaderImage`. *Checked 2026-11-14.*

## My notes

<!-- Tim writes here. Sessions leave this section as it is. -->
