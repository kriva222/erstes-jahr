// A small ZIP writer and reader. Photos are already compressed, so files are simply
// stored. Each file becomes its own Blob, which keeps a year of photos out of memory
// while the backup is built: a phone never has to hold the whole archive at once.
const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export class ZipWriter {
  #parts = [];
  #central = [];
  #offset = 0;
  #encoder = new TextEncoder();

  add(name, bytes, date = new Date()) {
    const nameBytes = this.#encoder.encode(name);
    const crc = crc32(bytes);
    const { time, day } = dosDateTime(date);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // file names are UTF-8
    lv.setUint16(8, 0, true); // stored, no compression
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.#offset, true);
    central.set(nameBytes, 46);

    this.#parts.push(new Blob([local, bytes]));
    this.#central.push(central);
    this.#offset += local.length + bytes.length;
  }

  finish(type = 'application/zip') {
    const size = this.#central.reduce((sum, c) => sum + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.#central.length, true);
    ev.setUint16(10, this.#central.length, true);
    ev.setUint32(12, size, true);
    ev.setUint32(16, this.#offset, true);
    return new Blob([...this.#parts, ...this.#central, end], { type });
  }
}

const sliceBytes = async (blob, start, end) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());

export async function openZip(blob) {
  const tailStart = Math.max(0, blob.size - 65557);
  const tail = await sliceBytes(blob, tailStart, blob.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.length);
  let endAt = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) { endAt = i; break; }
  }
  if (endAt < 0) throw new Error('not-a-zip');

  const count = tv.getUint16(endAt + 10, true);
  const dirSize = tv.getUint32(endAt + 12, true);
  const dirStart = tv.getUint32(endAt + 16, true);
  const dir = await sliceBytes(blob, dirStart, dirStart + dirSize);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.length);
  const decoder = new TextDecoder();
  const files = new Map();

  let p = 0;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('not-a-zip');
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    files.set(decoder.decode(dir.subarray(p + 46, p + 46 + nameLength)), {
      method: dv.getUint16(p + 10, true),
      crc: dv.getUint32(p + 16, true),
      packedSize: dv.getUint32(p + 20, true),
      offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// Reads one file and checks it against its checksum, so a damaged backup is noticed
// before it can replace anything.
export async function readFile(blob, info) {
  const head = await sliceBytes(blob, info.offset, info.offset + 30);
  const hv = new DataView(head.buffer, head.byteOffset, head.length);
  if (hv.getUint32(0, true) !== 0x04034b50) throw new Error('damaged');
  const start = info.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const packed = blob.slice(start, start + info.packedSize);

  let bytes;
  if (info.method === 0) {
    bytes = new Uint8Array(await packed.arrayBuffer());
  } else if (info.method === 8 && typeof DecompressionStream === 'function') {
    // A cloud service may have re-packed the archive.
    const stream = packed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    throw new Error('unsupported');
  }
  if (crc32(bytes) !== info.crc) throw new Error('damaged');
  return bytes;
}
