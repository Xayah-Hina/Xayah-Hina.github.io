// Content-addressed Writing assets are stored under lowercase filenames.
// Only normalize this exact local syntax; external and arbitrary URLs retain
// their original case and semantics.
export function canonicalWritingAssetName(source) {
  const match = /^\.\/([a-f0-9]{64}\.(?:jpe?g|png|webp|gif|avif))$/i.exec(source);
  return match ? match[1].toLowerCase() : null;
}
