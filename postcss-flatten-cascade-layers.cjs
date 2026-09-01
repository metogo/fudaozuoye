module.exports = function flattenCascadeLayers() {
  return {
    postcssPlugin: "flatten-cascade-layers-for-legacy-mobile",
    OnceExit(root) {
      root.walkAtRules("layer", (rule) => {
        if (rule.nodes?.length) rule.replaceWith(...rule.nodes);
        else rule.remove();
      });
    },
  };
};
