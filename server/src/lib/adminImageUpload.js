'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DEFAULT_EXPORT_FORMATS = {
  webp: false,
  avif: false,
  svg: false,
  png: false,
  jpg: false,
  jpeg: false,
};

/** Allowed upload MIME types (normalized lowercase). */
const INPUT_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

function normalizeAdminImageExportFormats(value) {
  const o = value && typeof value === 'object' ? value : {};
  return {
    webp: o.webp === true,
    avif: o.avif === true,
    svg: o.svg === true,
    png: o.png === true,
    jpg: o.jpg === true,
    jpeg: o.jpeg === true,
  };
}

function anyExportEnabled(formats) {
  return !!(formats && Object.values(formats).some(Boolean));
}

function isSvgMime(mime) {
  return String(mime || '').toLowerCase() === 'image/svg+xml';
}

/**
 * Writes one or more image files under destDir. Returns primary URL and optional variant URLs.
 */
async function processAdminImageUpload(opts) {
  const { fileBuffer, contentType, stamp, safeBase, destDir, toPublicUrl } = opts;
  const formats = normalizeAdminImageExportFormats(opts.exportFormats);
  const mime = String(contentType || '').trim().toLowerCase();
  const inputExt = INPUT_MIME_TO_EXT[mime];
  if (!inputExt) {
    const err = new Error('UNSUPPORTED_TYPE');
    err.code = 'UNSUPPORTED_TYPE';
    throw err;
  }

  const prefix = `${stamp}-${safeBase}`;
  /** @type {Record<string, string>} */
  const variants = {};
  const sharpInputOptions = isSvgMime(mime) ? { density: 150 } : {};

  const writeRasterVariants = async () => {
    if (formats.webp) {
      const fileName = `${prefix}.webp`;
      await sharp(fileBuffer, sharpInputOptions).webp({ quality: 86 }).toFile(path.join(destDir, fileName));
      variants.webp = toPublicUrl(fileName);
    }
    if (formats.avif) {
      const fileName = `${prefix}.avif`;
      await sharp(fileBuffer, sharpInputOptions).avif({ quality: 72 }).toFile(path.join(destDir, fileName));
      variants.avif = toPublicUrl(fileName);
    }
    if (formats.png) {
      const fileName = `${prefix}.png`;
      await sharp(fileBuffer, sharpInputOptions).png({ compressionLevel: 9 }).toFile(path.join(destDir, fileName));
      variants.png = toPublicUrl(fileName);
    }
    if (formats.jpg) {
      const fileName = `${prefix}.jpg`;
      await sharp(fileBuffer, sharpInputOptions).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(destDir, fileName));
      variants.jpg = toPublicUrl(fileName);
    }
    if (formats.jpeg) {
      const fileName = `${prefix}.jpeg`;
      await sharp(fileBuffer, sharpInputOptions).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(destDir, fileName));
      variants.jpeg = toPublicUrl(fileName);
    }
  };

  if (!anyExportEnabled(formats)) {
    const fileName = `${prefix}.${inputExt}`;
    fs.writeFileSync(path.join(destDir, fileName), fileBuffer);
    variants.original = toPublicUrl(fileName);
  } else {
    if (isSvgMime(mime) && formats.svg) {
      const fileName = `${prefix}.svg`;
      fs.writeFileSync(path.join(destDir, fileName), fileBuffer);
      variants.svg = toPublicUrl(fileName);
    }

    const needRaster =
      formats.webp || formats.avif || formats.png || formats.jpg || formats.jpeg;
    if (needRaster) {
      await writeRasterVariants();
    }

    if (Object.keys(variants).length === 0) {
      const fileName = `${prefix}.${inputExt}`;
      fs.writeFileSync(path.join(destDir, fileName), fileBuffer);
      variants.original = toPublicUrl(fileName);
    }
  }

  const priority = ['webp', 'avif', 'png', 'jpg', 'jpeg', 'svg', 'original'];
  let imageUrl = '';
  for (const k of priority) {
    if (variants[k]) {
      imageUrl = variants[k];
      break;
    }
  }
  if (!imageUrl) {
    imageUrl = Object.values(variants)[0] || '';
  }

  return { imageUrl, variants };
}

module.exports = {
  INPUT_MIME_TO_EXT,
  DEFAULT_EXPORT_FORMATS,
  normalizeAdminImageExportFormats,
  processAdminImageUpload,
};
