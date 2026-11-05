import { strict as assert } from "node:assert";
import { blendMaskedPixels } from "../public/composite.js";
// A hallucinated white/striped deck in the generated image must never replace an unselected black deck.
const original = new Uint8ClampedArray([
  15, 17, 20, 255, 60, 90, 120, 255, 3, 4, 5, 255,
]);
const generated = new Uint8ClampedArray([
  240, 240, 240, 255, 225, 225, 220, 255, 255, 0, 0, 255,
]);
const mask = new Uint8ClampedArray([
  255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 0,
]);
const result = blendMaskedPixels(original, generated, mask);
assert.deepEqual(
  Array.from(result),
  [15, 17, 20, 255, 225, 225, 220, 255, 3, 4, 5, 255],
);
assert.deepEqual(
  Array.from(original),
  [15, 17, 20, 255, 60, 90, 120, 255, 3, 4, 5, 255],
);
assert.throws(() =>
  blendMaskedPixels(original, new Uint8ClampedArray(4), mask),
);
console.log(
  "Structure protection checks passed: unselected deck/background pixels retained exactly, selected fabric changed.",
);
