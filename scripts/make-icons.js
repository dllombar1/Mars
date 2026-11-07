#!/usr/bin/env node
// Generates the extension icons (16, 32, 48, 128 px) as PNG files.
// Uses only Node built-in modules (zlib for deflate, manual PNG chunks and CRC32).
// Usage: node scripts/make-icons.js
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var OUT_DIR = path.join(__dirname, '..', 'extension', 'icons');
var SIZES = [16, 32, 48, 128];
var SUPERSAMPLE = 4;              // sub-samples per axis for anti-aliasing
var CORNER_RADIUS = 0.22;         // in unit square coordinates
var BLUE = [37, 99, 235];
var WHITE = [255, 255, 255];

// ---- CRC32 (PNG chunk checksum) ----
var CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  var length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  var typeBuf = Buffer.from(type, 'ascii');
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

// rgba: Buffer of width * height * 4 bytes (non-premultiplied RGBA, row-major)
function encodePng(width, height, rgba) {
  var signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // compression method
  ihdr[11] = 0;  // filter method
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with a filter-type byte (0 = None).
  var stride = width * 4;
  var raw = Buffer.alloc((stride + 1) * height);
  for (var y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- Shape definitions in unit square coordinates [0, 1] ----
function insideRoundedSquare(x, y) {
  var r = CORNER_RADIUS;
  var cx = Math.min(Math.max(x, r), 1 - r);
  var cy = Math.min(Math.max(y, r), 1 - r);
  var dx = x - cx;
  var dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  var d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  var d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  var hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  var hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// A white right-pointing arrow (a bar plus an arrowhead).
function insideArrow(x, y) {
  var inBar = x >= 0.22 && x <= 0.62 && y >= 0.42 && y <= 0.58;
  if (inBar) return true;
  return insideTriangle(x, y, 0.50, 0.25, 0.78, 0.50, 0.50, 0.75);
}

function renderIcon(size) {
  var rgba = Buffer.alloc(size * size * 4);
  var samples = SUPERSAMPLE * SUPERSAMPLE;

  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var inSquare = 0;
      var inArrowCount = 0;

      for (var sy = 0; sy < SUPERSAMPLE; sy++) {
        for (var sx = 0; sx < SUPERSAMPLE; sx++) {
          var x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          var y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (insideRoundedSquare(x, y)) {
            inSquare++;
            if (insideArrow(x, y)) inArrowCount++;
          }
        }
      }

      var offset = (py * size + px) * 4;
      if (inSquare === 0) {
        rgba[offset] = 0;
        rgba[offset + 1] = 0;
        rgba[offset + 2] = 0;
        rgba[offset + 3] = 0;
        continue;
      }

      var t = inArrowCount / inSquare; // share of the square's coverage that is arrow
      for (var c = 0; c < 3; c++) {
        rgba[offset + c] = Math.round(BLUE[c] + (WHITE[c] - BLUE[c]) * t);
      }
      rgba[offset + 3] = Math.round((inSquare / samples) * 255);
    }
  }
  return rgba;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  SIZES.forEach(function (size) {
    var png = encodePng(size, size, renderIcon(size));
    var file = path.join(OUT_DIR, 'icon' + size + '.png');
    fs.writeFileSync(file, png);
    console.log('wrote ' + file + ' (' + png.length + ' bytes)');
  });
}

main();
