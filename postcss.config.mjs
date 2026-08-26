const flattenCascadeLayers = {
  postcssPlugin: "flatten-cascade-layers-for-legacy-mobile",
  OnceExit(root) {
    root.walkAtRules("layer", (rule) => {
      if (rule.nodes?.length) rule.replaceWith(...rule.nodes);
      else rule.remove();
    });
  },
};

const postcssConfig = {
  plugins: ["@tailwindcss/postcss", flattenCascadeLayers],
};

export default postcssConfig;
