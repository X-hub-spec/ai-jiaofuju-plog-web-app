type OptimizeOptions = {
  maxWidth: number;
  maxHeight: number;
  mimeType: "image/jpeg" | "image/png";
  quality?: number;
};

export async function optimizeImageFile(
  file: File,
  options: OptimizeOptions,
): Promise<string> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadHtmlImage(imageUrl);
    const ratio = Math.min(
      1,
      options.maxWidth / image.naturalWidth,
      options.maxHeight / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Cannot prepare uploaded image.");
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(options.mimeType, options.quality ?? 0.92);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load uploaded image."));
    image.src = src;
  });
}
