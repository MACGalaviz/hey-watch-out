const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const svgWin = path.join(root, 'assets', 'icon.svg');
const svgMac = path.join(root, 'assets', 'icon-mac.svg');
const pngWin = path.join(root, 'assets', 'icon.png');
const pngMac = path.join(root, 'assets', 'icon-mac.png');
const buildDir = path.join(root, 'build');
const buildWin = path.join(buildDir, 'win');
const buildMac = path.join(buildDir, 'mac');

async function rasterize(svg, png) {
  if (!fs.existsSync(svg)) {
    console.error(`Missing source: ${svg}`);
    process.exit(1);
  }
  await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(png);
  console.log(`Wrote ${png}`);
}

function runBuilder(input, output) {
  fs.mkdirSync(output, { recursive: true });
  execSync(
    `npx electron-icon-builder --input="${input}" --output="${output}" --flatten`,
    { stdio: 'inherit', cwd: root }
  );
}

function copy(src, dst) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`Wrote ${dst}`);
  } else {
    console.warn(`Missing ${src}`);
  }
}

async function main() {
  await rasterize(svgWin, pngWin);
  await rasterize(svgMac, pngMac);

  runBuilder(pngWin, buildWin);
  runBuilder(pngMac, buildMac);

  copy(path.join(buildWin, 'icons', 'icon.ico'), path.join(root, 'assets', 'icon.ico'));
  copy(path.join(buildMac, 'icons', 'icon.icns'), path.join(root, 'assets', 'icon.icns'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
