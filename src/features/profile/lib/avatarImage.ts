// Turns a picked photo into a small square JPEG data URL for the profile: the middle square, 256 x 256,
// smaller quality steps until it fits under the server's limit (MAX_AVATAR_LENGTH in server/validation.js).
const SIZE = 256;
const MAX_LENGTH = 90_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be opened as a picture. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture file (JPEG, PNG or WebP).');
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Your browser couldn't resize the picture.");
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
  for (const quality of [0.85, 0.7, 0.55]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_LENGTH) return dataUrl;
  }
  throw new Error('That picture is too detailed to save. Try another one.');
}
