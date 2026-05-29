const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const svg = path.join(root, 'assets', 'icon.svg');
const png = path.join(root, 'assets', 'icon.png');
const buildDir = path.join(root, 'build');

async function main() {
  if (!fs.existsSync(svg)) {
    console.error(`Missing source: ${svg}`);
    process.exit(1);
  }

  await sharp(svg, { density: 384 })
    .resize(1024, 1024)
    .png()
    .toFile(png);
  console.log(`Wrote ${png}`);

  execSync(
    `npx electron-icon-builder --input="${png}" --output="${buildDir}" --flatten`,
    { stdio: 'inherit', cwd: root }
  );

  const macSrc = path.join(buildDir, 'icons', 'icon.icns');
  const winSrc = path.join(buildDir, 'icons', 'icon.ico');
  const macDst = path.join(root, 'assets', 'icon.icns');
  const winDst = path.join(root, 'assets', 'icon.ico');

  if (fs.existsSync(macSrc)) {
    fs.copyFileSync(macSrc, macDst);
    console.log(`Wrote ${macDst}`);
  } else {
    console.warn(`Missing ${macSrc}`);
  }
  if (fs.existsSync(winSrc)) {
    fs.copyFileSync(winSrc, winDst);
    console.log(`Wrote ${winDst}`);
  } else {
    console.warn(`Missing ${winSrc}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
