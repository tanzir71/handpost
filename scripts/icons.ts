/**
 * Regenerates the packaged app icons from assets/brand/handpost-app-icon.svg (Figma brand/app-icon 12:79):
 * build/icon.png (1024), build/icon.ico (16–256) and build/icon.icns (16–1024), PNG-compressed.
 *   npm run icons
 * Rendering uses Playwright's Chromium, so no image library is needed.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile('assets/brand/handpost-app-icon.svg', 'utf8');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(size: number): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace(
      /<svg width="\d+" height="\d+"/,
      `<svg width="${size}" height="${size}"`,
    )}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** ICO with PNG entries (Windows Vista+). */
function ico(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/** ICNS with PNG entries (macOS 10.7+). */
function icns(entries: Array<{ type: string; png: Buffer }>): Buffer {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

try {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const png = new Map<number, Buffer>();
  for (const size of sizes) png.set(size, await render(size));
  await writeFile('build/icon.png', png.get(1024)!);
  await writeFile(
    'build/icon.ico',
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png.get(size)! }))),
  );
  await writeFile(
    'build/icon.icns',
    icns([
      { type: 'icp4', png: png.get(16)! },
      { type: 'icp5', png: png.get(32)! },
      { type: 'icp6', png: png.get(64)! },
      { type: 'ic07', png: png.get(128)! },
      { type: 'ic08', png: png.get(256)! },
      { type: 'ic09', png: png.get(512)! },
      { type: 'ic10', png: png.get(1024)! },
      { type: 'ic11', png: png.get(32)! },
      { type: 'ic12', png: png.get(64)! },
      { type: 'ic13', png: png.get(256)! },
      { type: 'ic14', png: png.get(512)! },
    ]),
  );
  console.log('Wrote build/icon.png, build/icon.ico, build/icon.icns');
} finally {
  await browser.close();
}
