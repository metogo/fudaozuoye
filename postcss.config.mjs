import { fileURLToPath } from "node:url";

const flattenCascadeLayers = fileURLToPath(new URL("./postcss-flatten-cascade-layers.cjs", import.meta.url));

const postcssConfig = {
  plugins: ["@tailwindcss/postcss", flattenCascadeLayers],
};

export default postcssConfig;
