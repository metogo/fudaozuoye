# Conversation reading edge fade (2026-09-06)

- User requested a softer transition from scrolling explanation to the docked composer. Added a 24–48px decorative gradient anchored to the dock, with opacity derived from remaining scroll distance; it fades out at the end, is absent on home, and is disabled while the quote composer floats.
- No layout space, blur layer, pointer interception, focus management or scroll locking added. Existing “new content / suggestions below” buttons remain above the gradient. Reduced-motion and print are explicitly handled.
- Native app browser, actual existing conversation: remaining scroll distance 1738 → 0 → 515; gradient opacity 1 → 0 → 1. Dock top matched scroll viewport bottom (659px). Hit testing inside the fade reached the original chat content. Home tab showed no pseudo-element. Visual screenshot inspected: `outputs/chat-edge-fade/reading.png`.
- New tests cover overflow/end/short content, streaming growth via ResizeObserver, viewport changes, one-frame event coalescing, stale callback cleanup and non-intercepting CSS. Full suite 778 tests / 51 files passed; typecheck and lint passed. Quote-mode disable is covered by the integration condition and cleanup tests, not a fresh physical-device long-press test.

---

# Crop redesign — selected first light concept (2026-09-06)

final result: passed

## Source and matched evidence

- Selected source: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-8cc38ec3-de0b-41b5-ba6b-e90bcd77494b.png`, 853 × 1844, normalized to 390 × 844 for comparison.
- Actual browser capture: `outputs/apple-ui/crop-light-final.jpg`, 390 × 844, DPR 1. Full comparison `crop-light-comparison-final.png` and focused header/footer comparison `crop-light-details.png` were opened and inspected together.
- Additional layouts: `crop-light-320.jpg` (320 × 740) and `crop-light-landscape.jpg` (844 × 390). Controls fit without horizontal overflow.

## Findings and fidelity

- Replaced the dark canvas and heavy header capsule with the selected light canvas, unboxed header, restrained outlined utility buttons and emerald primary action. Preserved all labels and control behavior.
- First comparison revealed a gray mask band around a fully selected image. Removed that mask only for full-image selection; partial selections retain a visible excluded-area mask.
- Kept slim green corner marks visible with 44 × 44 interaction targets. Typography, hierarchy, spacing, borders, icon stroke and footer placement were compared in the focused capture.
- Intentional deviation: the real 1424 × 402 question image keeps its original aspect ratio. The generated mockup's taller/reflowed question is not reproduced by stretching or altering actual mathematical content.
- Browser JPEG color capture differs from generated PNG rendering; this is a visual fidelity review, not a claim of exact cross-color-space pixel equality.

## Verification

- Actual original-image upload, corner drag and keyboard adjustment, full-image reset, 90° rotation, zoom to 150% and return passed. Rotation changed image dimensions to 402 × 1424 without changing the crop algorithm.
- Actual crop → model recognition → formula lesson → blank → show answer → continue → next lesson and choices passed. Post-response scrolling, PDF preview and starting a new question also passed.
- Full suite: 725 tests / 48 files passed; lint, typecheck, production build and bundle budget passed. After the final full-image mask correction, 15 targeted crop/performance/lazy-render tests and production build passed again.
- No final application errors observed; one earlier test was interrupted by development Fast Refresh and was rerun successfully after edits stopped.
- No physical-device or low-end performance benchmark claims. Performance evidence and boundaries are in `performance-report.md`.

No remaining actionable P0/P1/P2 findings in this scope.

---

# Homepage annotation refinements (2026-09-06)

final result: passed

## Scope and evidence

- Source: user's four cropped screenshots in `/var/folders/5_/t0gp9mpj5gq204lkpsv426_r0000gn/T/`: `codex-clipboard-8e42f3a1-bb25-423b-bd65-cb16fc7cf06f.png`, `codex-clipboard-23422048-b9db-4e23-8abd-61c91719d0dd.png`, `codex-clipboard-75aebeb9-a038-42ad-b993-30c8e5e50fa2.png`, `codex-clipboard-2145d6f7-310a-411c-b4e0-799ca2f7b6fa.png`. These identify requested corrections, not visual states to reproduce unchanged.
- Matched browser source/current captures: `outputs/apple-ui/home-polish-before-focus.jpg` and `home-polish-after-focus.jpg`, both 390 × 844 CSS/output pixels, DPR 1, homepage, empty focused input, light reasoning. User crops have unknown density; no false pixel-perfect claims against those crops.
- Full comparison: `outputs/apple-ui/home-polish-comparison.png` (800 × 844); focused header/input/settings comparison: `home-polish-details.png` (770 × 234). Both opened together and inspected after fixes. Before and after use the same browser capture color pipeline.
- Additional evidence: `home-polish-after.jpg`, `home-polish-320.jpg`, `home-polish-834.jpg`, `home-polish-1440.jpg`; respective viewports 390 × 844, 320 × 740, 834 × 1112, 1440 × 1000. No horizontal overflow.

## Findings and correction history

1. P2, header: generic 12px text lacked brand hierarchy. Scoped wordmark now 15px/600 with .12em spacing and navy-ink color; grade labels elsewhere retain their original styling.
2. P1, focused textarea: global outline produced an inner rectangle in addition to the capsule focus. Transfer textarea focus indication to the outer capsule; keep keyboard focus on other controls. Initial outer outline had a gap that still looked doubled; removed the gap and aligned border/outline colors. Final comparison shows one continuous rounded focus perimeter.
3. P2, icon semantics: identical pencils suggested identical input modes. Homepage typed input now uses the installed Phosphor Keyboard icon; whiteboard keeps PencilSimple. No new icon package, raster manipulation, or fake assets.
4. P2, secondary setting hierarchy: removed large tinted enclosure and elevated selected pill. Keep lightweight text and an understated selected underline. Actual DOM measurements confirm every option still has a 44 × 44 CSS pixel target.

## Required fidelity surfaces

- Typography: preserve existing system font stack and all copy; only wordmark and secondary setting optical hierarchy changed. No unintended wrapping on tested widths.
- Spacing/layout: existing hero, cards, input position and mascot dock unchanged. Settings no longer read as a competing primary control.
- Colors/tokens: existing emerald action palette and glass materials preserved. Wordmark uses navy compatible with the supplied comma; focus remains visible and accessible.
- Images/icons: supplied comma WebPs unchanged; keyboard and pencil use the same Phosphor family/stroke weight. No substitute brand drawings.
- Copy/content: unchanged labels, placeholders, options and learning flow.

## Verification

- Actual browser: type/delete text; disabled send becomes enabled; Tab reaches send with visible outline; all three reasoning options switch and report selected state; restored light; whiteboard opens and cancels back to homepage.
- Console: no application errors; one development Fast Refresh full-reload warning while editing the shared icon module.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed. Full test suite: 722 tests / 47 files passed; includes two new focused regression tests.
- No model response or OS photo-picker test was needed for these presentation-only edits; those paths were not modified.
- No remaining actionable P0/P1/P2 findings in this scope. Wordmark styling remains subjective and can be refined from user feedback.

---

# Homepage welcome — selected “轻轻点头” (2026-09-06)

final result: passed

## Scope and visual evidence

- Source visual truth: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-76c44c22-6588-40e6-baaa-07e4d4c38b2f.png`, first displayed welcome storyboard, 1536 × 1024.
- Existing page reference: `outputs/apple-ui/welcome-source.jpg`. This is an animation addition, not authorization to replace the existing homepage controls/layout with incidental differences generated in the storyboard.
- Final browser evidence: `outputs/apple-ui/nod-final-{250,650,1000,1600,2050}.jpg` and `nod-final-settled.jpg`, actual first-visit frames captured without pausing/seeking animations. 390 × 844 CSS viewport/output pixels. About 2.25 seconds captured including initial page readiness, animation duration 2100 ms.
- Full comparison: `outputs/apple-ui/nod-comparison.png`; focused hero/mascot comparison: `outputs/apple-ui/nod-detail.png`. Both opened and inspected. Storyboard's middle screen cropped at x686/y153, 340 × 760, normalized to 390 × 844; no surrounding storyboard typography treated as app UI. Untagged IAB JPEGs retained; `normalize-capture.mjs` used for colour-normalized PNG copies as documented below.
- Other actual viewport checks: `nod-width-320-final.jpg`, `nod-width-834.jpg`, `nod-width-1440.jpg`. No horizontal overflow. At 320px, character uses the clear space beside “Hey” above the full-size headline. At inaccessible/insufficient space it stays in the header rather than covering text.

## Findings and correction history

1. P2: global animation easing compressed the greeting and made the flight too slow. Moved easing to individual keyframe segments; nod/smile now occupy approximately the first 1.2 seconds, followed by a short return. Earlier frames: `nod-{250,650,1100,1650,2000}.jpg`.
2. P2: the initial return path crossed the header's product name. Rerouted through the blank strip beneath the header and approached the dock from below. Product name remains visible, and there is never a duplicate character.
3. P2: crossfading two full sprites washed out the navy body. Keep idle sprite opaque underneath the smile overlay. The expression changes without making the whole character translucent.
4. P2: sizing the padded raster canvas instead of visible character reduced its brand presence. Increased visible character size while respecting text bounds; shifted upward to keep the subtitle unobstructed. Latest final frames and combined comparisons document the correction. This vertical adjustment is intentional to honor the no-occlusion constraint, rather than reproduce the storyboard's tight subtitle clearance.

## Required surfaces

- Typography/copy: existing sizes, Chinese copy and line breaks preserved. Brand name remains visible during greeting, unlike the storyboard's empty-header artifact.
- Layout: only the decorative fixed-position actor changes transform/opacity; headline, controls, form and header reserve their existing positions. No layout shift introduced by the actor.
- Colour/tokens: selected navy/gold assets reused, existing green/white/glass UI unchanged. No newly generated assets, fonts, gradients or UI icons.
- Imagery: real transparent local idle/smile WebPs; no CSS/SVG mascot substitute. Sized at at most 120 CSS px from 192px sources, then lands at the existing 42px/34px dock. Clear edges and no residual backdrop visible.
- Interaction/accessibility: pointer-events none, aria-hidden actor, no focus or scroll-lock ownership. Reduced-motion users keep a static logo. Image errors/unsupported animation/hidden document safely retain the regular logo. All temporary animations and event listeners are cleaned up on completion, interruption or unmount.

## Verification and remaining limits

- Actual first-visit capture: actor appears, nods/smiles, returns to the original header box, then hides and restores the regular icon. Browser errors/warnings: none in final capture.
- Actual reload: no replay. Actual tap on 白板写题 during initial visit: first tap opens the whiteboard; cancel returns to home without replay or leftover overlay.
- Actual narrow-screen input click: cancels greeting, preserves typed draft, normal send works. Real model returns a lesson with learning choices; 开始新题 returns home without replay or stale new-lesson hint.
- Unit tests cover geometry at 320/390/834/1440, too-small/zoom-style geometry, storage persistence/failure, reduced-motion branch, inactive state, click interruption, natural finish, unmount before frame, image decode failure and listener cleanup.
- Full suite: 720 tests / 47 files passed. After final geometry refinement, 21 focused tests and production build passed; targeted ESLint and TypeScript passed. No new dependencies or model calls for animation.
- Limits: no physical iPhone/Android device verification; reduced-motion behavior tested through the lifecycle unit harness, not changing the user's OS preference. No performance benchmark claim. Final acceptance is for the selected interaction and preserved app UI, not literal pixel equality to generated screen chrome.

No remaining actionable P0/P1/P2 in this scope.

---

# Icon option 2 — missing-resource repair (2026-09-06)

final result: passed

Scope: restore the selected 小顿号 brand icon, not a new whole-page fidelity sign-off.

- Source: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-309877a5-e0b0-4823-affe-645e40b77841.png` (1254 × 1254 concept board).
- Implementation: `outputs/apple-ui/comma-live.jpg`, actual existing conversation at http://localhost:3000/, 548 × 807 CSS/output pixels. Header asset box is 42 × 42 CSS px; local images are 192 × 192.
- Full context comparison: `outputs/apple-ui/comma-comparison.png`; focused idle-icon comparison: `outputs/apple-ui/comma-detail.png`. Both opened and visually inspected. The concept board is not a full-page screen; only the supplied brand mark is the comparison scope. Focused crops are enlarged for silhouette/edge inspection, not a claim of equal source density or exact colour calibration.
- P1 fixed: source export failed because Sharp resized the base before compositing larger poses; public/brand was empty and the browser rendered broken images. Split composition and resizing into separate pipelines; all three assets now decode and return HTTP 200.
- P2 fixed: chroma removal left a faint rectangular residue. Removed low-alpha chroma noise before resizing; recaptured the page after regeneration. No visible rectangle at actual display size.
- Fixed the loading mascot selector specificity so the existing tutor badge cannot reintroduce a green background.
- Fonts/copy: unchanged in this repair. Layout: fixed-size mascot fits the existing header without moving adjacent labels or controls. Colour: selected navy/gold retained; the proposed green recolouring is not approved. Image: selected comma/eye silhouette preserved, transparent local WebP, no SVG substitute. Small rendering differences from generated poses and enlarged browser JPEG are acceptable; no remaining P0/P1/P2 within the missing-icon scope.
- Verification: actual page refreshed, all three image natural widths are 192, idle opacity is 1 and other poses 0; browser error/warning log empty. Seven focused tests passed, targeted ESLint and TypeScript passed. New tests require every referenced image to exist, decode, have alpha, and remain under a combined 70 KB budget.
- Gaps: no new live-model animation cycle or full application regression run in this narrowly scoped repair. Earlier whole-page evidence remains below, not re-certified by this icon fix.

---

# Apple-style UI — option 2, material-fidelity revision (2026-09-06)

final result: passed

## Target and comparison evidence

- Selected visual truth: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-f52a69e1-e4b1-4df6-8530-e8bdea4cd779.png` (the second displayed option, not prompt submission order).
- Reference: 853 × 1844 pixels, normalized to the 390 × 844 CSS viewport. Browser captures: 390 × 844 pixels, one output pixel per CSS pixel. No device frame was added.
- Final implementation: `outputs/apple-ui/material-final.png`; untouched browser bytes: `outputs/apple-ui/material-final-raw.jpg`.
- Full side-by-side: `outputs/apple-ui/material-comparison-final.png`, reference left, implementation right. Focused header and action-tray comparison: `outputs/apple-ui/material-details-final.png`. Both combined images were opened and inspected.
- Same-state comparison uses the real `LearningChat` renderer with the reference's lesson text and an understanding gate. It is an isolated, non-shipped SSR visual fixture, not a claimed live model response. Actual generated lesson/blank/export evidence is recorded separately below.
- Capture colour handling: this macOS IAB returns untagged JPEG values consistent with Display P3. For example, the CSS sRGB green `#006951` encodes near RGB 44/103/81 in untagged P3. The QA-only `outputs/apple-ui/normalize-capture.mjs` attaches the missing P3 profile and converts to sRGB for reference comparison; raw captures are retained. No content, shadows, geometry or individual pixel regions were retouched.

## Findings and correction history

1. **P1: initial material implementation was too flat.** `comparison-final.png` from the first pass had shallow green-tinted shadows, a plain header, and white secondary buttons without the source's floating depth. Corrected neutral glass/tray/control tokens, separate outer shadow and inner contour, directional inset highlights on emerald actions, and a nested header action capsule. Applied the same tokens to homepage, blank actions, completion, handwriting controls and export controls.
2. **P2: button hierarchy and alignment drifted.** The primary arrow sat beside its label rather than at the trailing edge; the tray and labels were vertically displaced. Corrected trailing-arrow positioning with protected text padding, measured capsule heights and inter-button gaps, and a distinct full-width helper row. `material-comparison-1.png` documents the first material revision.
3. **P2: reading rhythm did not match.** The initial message size, bottom paragraph margin, heading tracking and section gaps pushed the action tray down. Corrected the student bubble to 14 px, aligned its outer edge, removed the final paragraph's redundant margin and tuned gate spacing. The final primary action starts near y = 537 versus approximately 536 in the normalized reference; the 332 px action width matches the reference.
4. **P2: arithmetic typography was too light.** Simple completed numeric displays now use the interface's semibold numeral face. Symbolic expressions, fractions, roots, mixed displays and streaming output retain KaTeX's original mathematical typefaces/metrics. Added regression tests for these exclusions. Source text and MathML remain intact.
5. **P2: secondary surfaces and states were inconsistent.** Unified handwriting, completion, answer-choice, blank and PDF-preview actions; added restrained hover and pressed shadows, disabled styling and optical icon sizing. The tutor indicator now uses a library star to follow the source while the header retains the existing connected-node product logo.

The final full and focused comparisons have no remaining actionable P0/P1/P2 findings in this UI scope. This supersedes the initial, too-permissive material assessment.

## Required fidelity surfaces

- **Typography:** system/PingFang stack, 26 px emerald lesson headings, 16 px/1.8 reading text, semibold arithmetic emphasis, 14–16 px actions. No image-based text, long-text truncation or scaled-down lesson body to force a one-screen fit.
- **Layout:** floating double-edge header and composer, solid unboxed lesson text, pale student bubble, distinct inset tray plus lifted capsule controls. Responsive content can scroll without losing the dock. Copy control remains available without consuming an extra full row.
- **Colour/material:** neutral white reading surface `#fdfdfd`, emerald action `#006951`, deeper text `#005b49`, neutral rather than green-grey glass, separate border/highlight/contact-shadow layers. Static CSS material, not a full-screen blur or a continuously animated effect.
- **Assets/icons:** direct SSR Phosphor imports, consistent icon size/weight, existing supplied product mark. No generated bitmap assets were needed for this UI; no new handcrafted decorative SVG or CSS illustration substitutes.
- **Copy/content:** original labels, current-task information, copy action, gate title, suggestions and learning branches are retained. The selected mock omits some live information; it was not removed simply to match a picture.

## Browser and functional verification

- Live app: http://localhost:3000/. Independent test conversation; existing user's conversation preserved.
- Real model path: typed a rectangle problem → initial explanation → “这一步我来做” → one blank → “显示答案” fills 22 → “看懂了，继续” → subsequent explanation and complete action group. Evidence: `blank-material.png`, `live-material.png` (the latter includes a visible keyboard focus outline after End).
- Earlier in this same implementation pass, also exercised hint, expanded/collapsed full explanation, key-step recall and reviewed-complete state. Selected-text question → floating composer → cancel, and send → model answer → PageUp remained scrollable. No learning handlers or scroll ownership were changed by the material revision.
- Homepage and handwriting open/cancel verified; drawing/undo had been verified in the initial pass. Evidence: `home-material.png`, `handwriting-material.png`. Crop/rotate/preview/return/cancel were checked in the initial pass (`crop-390.png`); crop geometry was not changed by the material revision.
- PDF preview opens with all eight records of the new test session plus current task. Close returns to a scrollable conversation; browser error/warning log empty. Evidence: `export-material.png`. This revision did not perform a new native Save PDF operation; print styling remains independent from the screen-only theme.
- Responsive checks: `material-320.png` (320 × 568), `material-834.png` (834 × 1194), `material-1440.png` (1440 × 1000). Document widths matched viewports; narrow-screen controls are reachable by scrolling, desktop reading surface remains constrained to 768 px. Keyboard-focus outlines in these captures are intentional accessibility state, not a permanent page border.
- `npm test`: 702 tests passed across 44 files. Production build/typecheck and full-project ESLint passed. The additional icon change was covered again by the icon/export and UI tests.
- Stability/performance: existing lazy export loading, memoized message rendering and text batching retained. Only small chrome surfaces blur; reduced-motion, reduced-transparency and high-contrast fallbacks exist. Page zoom remains enabled. No new animation loop, network font, background model call or large image payload was introduced. This is not an FPS or physical-device performance benchmark.

## Accepted differences / remaining device checks

- Source-generated microtexture and exact OS font rasterization are not literal raster replicas. Runtime uses layered UI borders/shadows; final screenshots, rather than a pixel-identical claim, are the acceptance evidence.
- The mock shows an enabled Send button with no draft. Runtime keeps empty-draft Send disabled. It also retains the current-task line and full gate title, and only shows a suggestions hint when suggestions actually exist.
- The original logo remains the header brand; the tutor star is the closest standard library icon, without inventing a custom speech-tail asset.
- Physical iOS camera, touch selection/dragging, pinch and software-keyboard animation remain device-test gaps; desktop browser behavior was verified. No deployment or commit performed.

## Implementation checklist

- [x] Correct glass contours, highlights and layered shadows across shared controls.
- [x] Correct action geometry, arithmetic emphasis and reading rhythm.
- [x] Preserve live content, state-dependent affordances and hidden board/illustration entry points.
- [x] Re-capture full and focused reference comparisons after corrections.
- [x] Recheck responsive layouts, real blank continuation, export close and console.
- [x] Pass build, lint and regression tests.

---

# Earlier homepage and conversation QA

## Follow-up: crop tools and independent suggestions

- Crop defaults to 100% of the image, with outward high-contrast corner handles. Preview supports 1–6× zoom and pan, without changing crop coordinates. Clockwise rotation uses the original image and maps the crop to the rotated coordinates.
- Browser checked with the user's landscape math image: preview 225%, return preserves the 1% left inset, rotating maps it to a 1% top inset and swaps image dimensions to 402 × 1424. Reset restores full selection. Physical two-finger input remains a device-test gap; the zoom anchor math has regression coverage.
- Suggestions now follow all task controls. Decorative branch lines and numbers removed; grouped full-row question buttons retain source labels. `overflow-anchor: none` prevents browser anchor adjustments; suggestion-only updates remain excluded from existing auto-scroll content version.
- Visual evidence: `outputs/suggestion-preview/verified.png`, 390 × 844. This is the actual component rendered with fixed regression data, not a live generated suggestion. Two live runs produced no suggestions, so asynchronous before/after arrival was not verified live. DOM-order regression confirms the suggestion region follows the task controls.
- Verification: 655 tests, lint, typecheck and build passed. Test browser tabs/server cleaned up; preview artifacts retained.

## Conversation redesign — selected second design

final result: passed

- Source: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-13c372f0-9b4e-4086-b844-0d0d03b4906f.png`.
- Comparison: `outputs/chat-ui-design/comparison.png` combines normalized source at 390 × 844 with two 390 × 844 implementation scroll positions (reading and checkpoint). Source is 853 × 1844; browser density is 1. Same sample problem and first understanding checkpoint; long content is intentionally not compressed to the mock's small body type.
- Typography: 16 px live lesson body, 20 px green heading, 18 px checkpoint title, 14 px secondary and 16 px primary action. Existing copy, progress milestones, scope labels, and suggested questions remain intact although the mock omitted some of these.
- Layout: full-width white lesson surface, 20 px outer gutters, flat checkpoint surface, full-width primary action, two-column secondary actions, fixed composer. Real text scrolls; no truncation or scaled-down text to force one-screen fit.
- Tokens/assets: approved warm paper, near-black primary, muted green hierarchy, subtle border/shadow. Existing logo and icon components reused; no new bitmap assets. Board tool uses existing pencil icon, not a newly drawn mock icon.
- Comparison history: first rendered reading view had a small black secondary heading; corrected the first rich heading to 20 px green and tightened progress milestone spacing. Post-fix evidence: `implemented-reading-final.png` and `comparison.png`. Core checkpoint evidence: `implemented-actions.png`.
- The comparison is readable at native scale; no additional zoomed crop was necessary. Accepted differences are readable live type versus the mock's compressed long text, preserved existing content, and development-only Next indicator. No remaining actionable P0/P1/P2 visual findings.
- Responsive checks: 320 × 568 `small-answer.png`, desktop `desktop.png`. Narrow-screen document width equals viewport width; composer remains within viewport and main content scrolls independently.
- Interactions: clicked “懂了，继续” and observed streamed next explanation followed by original-answer task; opened/cancelled whiteboard by keyboard; switched answer to question and back, observing textarea labels/placeholders change. Browser error log empty. Phone hardware camera and a fresh illustration generation were not retested in this UI-only pass.
- Validation: 652 tests passed; lint, typecheck, and production build passed. No backend changes or deployment.

final result: passed

## Scope and reference

- Implemented the user's selected first design in the existing homepage only; retained original copy and existing handlers.
- Reference: `/Users/fanhua/.codex/generated_images/01a06f13-1da2-7750-9e1c-d75403c4e1f3/exec-6dc2cd2a-1fcb-4fc6-ad6f-aa4b1c42a016.png` (853 × 1844).
- Local preview: http://localhost:3000/
- Side-by-side evidence: `outputs/home-first-design/comparison.png`. Reference normalized to 390 × 844, implementation captured at 390 × 844; reference left, implementation right.
- Responsive evidence: `outputs/home-first-design/mobile-small.png` (320 × 568), `outputs/home-first-design/desktop.png` (821 × 807).

## Visual review

- Layout: matched greeting, primary camera action, secondary rows, input, and quiet reasoning controls. Short screens scroll vertically; no horizontal overflow at 320 px.
- Typography: original Chinese copy and ellipsis retained. Heading adjusted from 32 to 34 px after comparison; desktop 40 px.
- Spacing: adjusted secondary-row gap and input padding after the first comparison, bringing input height to 78 px.
- Color/surfaces: warm neutral canvas, dark primary action, restrained green accent, subtle input border and shadow.
- Assets: reused the app's existing logo and icon components. No generated imagery or new runtime assets needed.
- Accepted minor differences: existing icon strokes, OS font rendering, and original reasoning-picker styling. Development-only Next indicator is not part of the production UI.
- No outstanding P0/P1/P2 visual findings within this homepage scope.

## Functional checks

- Text entry enables Send; clearing via keyboard disables Send again. No live model request submitted.
- Reasoning selection changed to medium and back to light; pressed state and existing feedback verified.
- Whiteboard opens with drawing controls and cancels back to homepage.
- Album chooser accepts the synthetic test fixture, displays the crop image, and enables crop/recognize; cancelled before recognition.
- Camera input retains `capture="environment"` and its existing image handler. Physical phone-camera capture was not tested on desktop.
- Browser error log: no errors observed during checks.
- `npm test`: 652 tests passed across 36 files.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- No backend behavior changed or deployment performed. Browser viewport override reset after QA.
