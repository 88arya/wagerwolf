// Wager mark — blue tile with white bet slips falling down through it.
//
// Three slips on a top-left to bottom-right diagonal, each tilted the opposite
// way to its neighbour so the set reads as tumbling rather than as a neat stack,
// and each slightly larger than the one above it so the fall reads as coming
// toward the viewer.
//
// Every value is tuned for the small end. At 20px the slips are only ~5px
// across, so they have to stay clearly separated — the earlier tighter
// arrangements merged into one shape and lost the whole idea. Keep the blue gaps
// between slips if these are ever adjusted.
//
// [centreX, centreY, width, height, rotation]
const SLIPS: Array<[number, number, number, number, number]> = [
  [5.8, 5.4, 4.6, 6.0, -24],
  [12.0, 12.0, 5.2, 6.8, 12],
  [18.2, 18.6, 5.8, 7.4, -14],
];

const BLUE = "#0E92EB";

// Clip id has to be unique per document — several Logos can be mounted at once
// (nav plus a page heading), and duplicate ids would make them share a clip.
let clipSeq = 0;

export default function Logo({ size = 28 }: { size?: number }) {
  const clipId = `logo-tile-${clipSeq++}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Wager"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="24" height="24" rx="2" />
        </clipPath>
      </defs>
      <rect width="24" height="24" rx="2" fill={BLUE} />
      {/* Clipped so a slip that overhangs the tile is cut by its edge rather
          than floating outside it. */}
      <g clipPath={`url(#${clipId})`}>
        {SLIPS.map(([cx, cy, w, h, rot]) => (
          <rect
            key={`${cx}-${cy}`}
            x={+(cx - w / 2).toFixed(2)}
            y={+(cy - h / 2).toFixed(2)}
            width={w}
            height={h}
            rx="0.4"
            fill="#FFFFFF"
            transform={`rotate(${rot} ${cx} ${cy})`}
          />
        ))}
      </g>
    </svg>
  );
}
