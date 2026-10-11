/* zip.js — 极简 ZIP 打包（仅 store 无压缩，PNG/JPEG 本身已压缩） */
(function () {
  const WB = (window.WB = window.WB || {});

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }
  function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]; }

  WB.makeZip = function (files) {
    // files: [{ name, data: Uint8Array }]
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((f) => {
      const nameBuf = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameBuf.length), u16(0)
      );
      const localBuf = new Uint8Array(local);
      chunks.push(localBuf, nameBuf, f.data);

      central.push({
        name: nameBuf,
        crc, size, offset,
      });
      offset += localBuf.length + nameBuf.length + size;
    });

    const centralStart = offset;
    const centralChunks = [];
    central.forEach((c) => {
      const head = new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
      ));
      centralChunks.push(head, c.name);
      offset += head.length + c.name.length;
    });

    const eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - centralStart), u32(centralStart), u16(0)
    ));

    const all = chunks.concat(centralChunks).concat([eocd]);
    let total = 0;
    all.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let p = 0;
    all.forEach((a) => { out.set(a, p); p += a.length; });
    return new Blob([out], { type: 'application/zip' });
  };
})();
