# Coverage hardening progress — 2026-09-06

## Added automated coverage

- HTTP behavior: board-cache restore/fallback, knowledge expansion SSE, transfer gate validation, and provider listing.
- Model boundary: student-response parsing, single corrective retry, and malformed confidence/text rejection.
- Browser interaction: thought-state transition, companion state, PDF export preparation/print/close, rich-copy fallback, report image export, and copy feedback.
- Semantic safety: accepted and rejected board visual contracts across all supported visual kinds.

## Verification

- `npm test`: 65 files / 878 assertions passing at the time this note was added.
- `npm run typecheck`: passing.
- `npm run test:coverage`: explicit coverage scope includes `components/`, `lib/learning/`, and the cloud-function entry. This deliberately counts unimported production modules and therefore prevents a falsely optimistic imported-files-only metric.

## Current coverage baseline under explicit project scope

| Metric | Coverage |
| --- | ---: |
| Statements | 64.53% |
| Branches | 60.94% |
| Functions | 68.91% |
| Lines | 70.00% |

The 90% target is not yet achieved. Remaining work is concentrated in high-volume client flows (`education-chat-app`, image cropper, selection interactions, learning board), visualization renderers, and the isolated teaching worker. These require behavioral tests rather than exclusion from the metric.
