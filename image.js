// Prepares a chosen photo on the phone: one image for viewing and backup, one small
// preview for the timeline. Nothing leaves the device.
const FULL_EDGE = 2000;
const THUMB_EDGE = 600;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}

function render(img, edge, quality) {
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        const { width, height } = canvas;
        canvas.width = canvas.height = 0; // frees the memory right away on iPhones
        if (blob) resolve({ blob, width, height });
        else reject(new Error('unreadable'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function processPhoto(file) {
  const { img, release } = await loadImage(file);
  try {
    const full = await render(img, FULL_EDGE, 0.86);
    const thumb = await render(img, THUMB_EDGE, 0.76);
    return { photo: full.blob, thumb: thumb.blob, w: full.width, h: full.height };
  } finally {
    release();
  }
}
