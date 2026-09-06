# 小顿号 — selected option 2

Local transparent 192 × 192 lossless WebP poses. Used by `CommaCompanion`;
no external image service or runtime generation is needed.

The user selected the second displayed brand concept: navy comma silhouette,
small golden eye, no surrounding badge. Idle, thinking and reply-arrived poses
were generated with the built-in image tool from that selected reference.
The later deep-green recolouring suggestion has not been approved or applied.

Reference result: `exec-309877a5-e0b0-4823-affe-645e40b77841.png`.
Production three-pose result: `exec-4ba2c8b8-f843-44bc-ad4f-e2207e3eb140.png`.
Art direction: preserve selected silhouette and navy/gold palette, three isolated
poses on a chroma-green background, no typography, no badge or heavy highlight.

`node scripts/prepare-comma-assets.mjs <production-source.png>` removes chroma,
aligns poses at a common scale, composites before resizing and exports all three.
Committed assets are sufficient to run/build; source generation is not a build step.
