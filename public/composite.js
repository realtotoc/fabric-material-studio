// Preserve every unselected pixel exactly; generative output only supplies selected upholstery.
export function blendMaskedPixels(original, generated, mask) {
  if (
    original.length !== generated.length ||
    original.length !== mask.length ||
    original.length % 4
  ) {
    throw new Error("Image and selection dimensions do not match.");
  }
  const output = new Uint8ClampedArray(original.length);
  for (let i = 0; i < original.length; i += 4) {
    const alpha = mask[i + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      output[i + channel] =
        alpha === 0
          ? original[i + channel]
          : Math.round(
              generated[i + channel] * alpha +
                original[i + channel] * (1 - alpha),
            );
    }
    output[i + 3] = original[i + 3];
  }
  return output;
}
