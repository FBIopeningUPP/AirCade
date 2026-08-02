export class BinWriter {
  constructor(size = 256) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
    this.off = 0;
  }
  u8(v) { this.view.setUint8(this.off++, v); return this; }
  u16(v) { this.view.setUint16(this.off, v, true); this.off += 2; return this; }
  u32(v) { this.view.setUint32(this.off, v, true); this.off += 4; return this; }
  i16(v) { this.view.setInt16(this.off, v, true); this.off += 2; return this; }
  bytes(arr) { new Uint8Array(this.buf).set(arr, this.off); this.off += arr.length; return this; }
  done() { return new Uint8Array(this.buf, 0, this.off); }
}

export class BinReader {
  constructor(buf) {
    if (buf instanceof ArrayBuffer) {
      this.view = new DataView(buf);
    } else if (buf && buf.buffer instanceof ArrayBuffer) {
      this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      throw new Error('BinReader expects ArrayBuffer or ArrayBufferView');
    }
    this.off = 0;
  }
  u8() { return this.view.getUint8(this.off++); }
  u16() { const v = this.view.getUint16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.view.getUint32(this.off, true); this.off += 4; return v; }
  i16() { const v = this.view.getInt16(this.off, true); this.off += 2; return v; }
  bytes(len) { const a = new Uint8Array(this.view.buffer, this.off, len); this.off += len; return a; }
  left() { return this.view.byteLength - this.off; }
}

export function packPos(x, y) {
  const xi = Math.max(0, Math.min(4095, Math.round(x * 10)));
  const yi = Math.max(0, Math.min(4095, Math.round(y * 10)));
  return (xi << 12) | yi;
}

export function unpackPos(p) {
  return { x: (p >> 12) / 10, y: (p & 0xFFF) / 10 };
}

// console.log('packPos test', packPos(400, 300), unpackPos(packPos(400, 300)));