# Changelog

## 0.1.0

First release.

- `createTooltipTurn` and the shared `tooltipTurn`: one tooltip on the page at a time. The first one a mouse rests on waits 400ms. While tooltips are warm, the next opens at once and replaces the open one. Taps, clicks and the keyboard never wait.
- `useTooltipTurn` for React, from `tooltip-turn/react`.
- Both delays can be changed.
