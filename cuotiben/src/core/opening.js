// Frames in the 60 fps opening. Bites run 本、题、错; releases run 错、题、本.
export const biteFrames = [45, 62, 79];
export const releaseFrames = [117, 131, 145];
export const celebrationStart = 174;
export const celebrationFrames = 120; // Two seconds at 60 fps, after the last letter settles.
export const openingFrames = celebrationStart + celebrationFrames;
