/**
 * Minimal zip reader for the SVG-generator export archives ("Download
 * approved" in the sibling physics_sim_icon_dev repo — JSZip archives holding
 * `<name>.svg` files plus a `manifest.json`). Parses the central directory
 * and inflates entries natively via DecompressionStream, so the debug-only
 * "Import Object" path doesn't take on a zip dependency.
 *
 * Supports compression methods 0 (stored) and 8 (deflate) — the only ones
 * JSZip emits. Not a general-purpose unzipper: no zip64, no encryption.
 * Sizes are read from the central directory, which is populated even when a
 * writer streamed the local entries (general-purpose flag bit 3).
 */

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // End-of-central-directory record: fixed 22 bytes plus an up-to-64K
  // trailing comment, so scan backwards from the end for its signature.
  let eocd = -1;
  const scanFloor = Math.max(0, buffer.byteLength - 22 - 0xffff);
  for (let i = buffer.byteLength - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record).');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== CDIR_SIG) {
      throw new Error('Corrupt zip: bad central-directory entry signature.');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory entry

    // The local header repeats name/extra with a possibly DIFFERENT extra
    // length, so the data offset must come from the local header itself.
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new Error(`Corrupt zip: bad local-header signature for "${name}".`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 0) {
      data = compressed.slice();
    } else if (method === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported zip compression method ${method} for "${name}".`);
    }
    entries.push({ name, bytes: data });
  }
  return entries;
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  // Copy the subarray view into a standalone ArrayBuffer — Blob wants a
  // BlobPart backed by a plain ArrayBuffer (not ArrayBufferLike).
  const copy = new Uint8Array(compressed.length);
  copy.set(compressed);
  const stream = new Blob([copy.buffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
