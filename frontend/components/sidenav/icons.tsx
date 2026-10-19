import type { ComponentType, CSSProperties } from "react";

const ICON = 15;
const HELP_RING = 27.5;
const HELP_ICON = (HELP_RING * 24) / 19.868;

export type MenuIcon = ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;

export function HomeIcon() {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2" />
      <path d="M9 15a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6H9z" />
    </svg>
  );
}

export function LeagueShield({ color }: { color: string }) {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color }}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M20.995 6.903a1 1 0 0 0-.547-.797l-7.973-4a1 1 0 0 0-.895-.002l-8.027 4c-.297.15-.502.437-.544.767c-.013.097-1.145 9.741 8.541 15.008a1 1 0 0 0 .969-.009c9.307-5.259 8.514-14.573 8.476-14.967m-8.977 12.944c-6.86-4.01-7.14-10.352-7.063-12.205l7.071-3.523l6.998 3.511c.005 1.87-.481 8.243-7.006 12.217"
      />
    </svg>
  );
}

export function Caret() {
  return (
    <svg
      className="sidenav-caret"
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1 3.5h8L5 8.5z" />
    </svg>
  );
}

export function LockIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" style={style}>
      <path
        fill="currentColor"
        d="M832 464h-68V240c0-70.7-57.3-128-128-128H388c-70.7 0-128 57.3-128 128v224h-68c-17.7 0-32 14.3-32 32v384c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32M332 240c0-30.9 25.1-56 56-56h248c30.9 0 56 25.1 56 56v224H332zm460 600H232V536h560zM484 701v53c0 4.4 3.6 8 8 8h40c4.4 0 8-3.6 8-8v-53a48.01 48.01 0 1 0-56 0"
      />
    </svg>
  );
}

export function DocsIcon({ size = 16, strokeWidth = 1.75, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  const paths = [
    "M40.358 12.581L26.363 6.04a5.74 5.74 0 0 0-4.857-.001l-13.863 6.47a2.295 2.295 0 0 0-.001 4.159l13.995 6.541a5.74 5.74 0 0 0 4.857.002l13.863-6.471a2.295 2.295 0 0 0 .001-4.159",
    "m13.227 19.278l-5.584 2.606a2.295 2.295 0 0 0-.001 4.16l13.995 6.54a5.74 5.74 0 0 0 4.857.002l13.863-6.47a2.295 2.295 0 0 0 .001-4.159l-5.585-2.61",
    "M13.227 28.654L7.643 31.26a2.295 2.295 0 0 0-.001 4.16l13.995 6.54a5.74 5.74 0 0 0 4.857.001l13.863-6.47a2.295 2.295 0 0 0 .001-4.159l-5.585-2.61",
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth * 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths.map(d => <path key={d} d={d} />)}
    </svg>
  );
}

export function MailIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.72 6h14.56L12 12.188zM3 18V7.162l9 7.65l9-7.65V18zM1 4v16h22V4z"
      />
    </svg>
  );
}

export function SettingsIcon({ size = 16, style }: { size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="1 1 14 14" aria-hidden="true" style={style}>
      <path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4M7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0m3.618-3.602a.71.71 0 0 1-.824-.567l-.26-1.416a.35.35 0 0 0-.275-.282a6.1 6.1 0 0 0-2.519 0a.35.35 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.36.36 0 0 0-.382.095a6 6 0 0 0-1.262 2.173a.35.35 0 0 0 .108.378l1.102.931q.045.037.081.081a.704.704 0 0 1-.081.995l-1.102.931a.35.35 0 0 0-.108.378A6 6 0 0 0 3.53 12.02a.36.36 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.1 6.1 0 0 0 2.52 0a.35.35 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a6 6 0 0 0 1.262-2.173a.35.35 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.35.35 0 0 0 .108-.378A6 6 0 0 0 12.47 3.98a.36.36 0 0 0-.382-.095l-1.36.484a1 1 0 0 1-.111.03m-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5 5 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977q.384.503.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a5 5 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5 5 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a5 5 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637q.248-.581.63-1.084" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg
      width={HELP_ICON}
      height={HELP_ICON}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="var(--help-mark, currentColor)"
        d="M11.411 12.459a1.55 1.55 0 0 1 .341-.6a2.6 2.6 0 0 1 .535-.417a2.2 2.2 0 0 0 .363-.286a1.2 1.2 0 0 0 .256-.363a1.1 1.1 0 0 0 .094-.452a.9.9 0 0 0-.142-.517a.94.94 0 0 0-.374-.338a1.1 1.1 0 0 0-.519-.119a1.2 1.2 0 0 0-.495.107a.93.93 0 0 0-.389.335a1 1 0 0 0-.111.224a.52.52 0 0 1-.483.359a.506.506 0 0 1-.479-.675a1.7 1.7 0 0 1 .178-.349a1.8 1.8 0 0 1 .748-.634a2.4 2.4 0 0 1 1.031-.215a2.4 2.4 0 0 1 1.082.231a1.74 1.74 0 0 1 .721.641a1.77 1.77 0 0 1 .257.96a1.8 1.8 0 0 1-.118.678a1.7 1.7 0 0 1-.334.536a2.3 2.3 0 0 1-.52.417a2.3 2.3 0 0 0-.462.369a1.1 1.1 0 0 0-.256.455a2 2 0 0 0-.045.283a.49.49 0 0 1-.483.429a.484.484 0 0 1-.483-.531a3 3 0 0 1 .087-.528"
      />
      <circle cx="11.793" cy="14.891" r=".587" fill="var(--help-mark, currentColor)" />
      <path
        fill="var(--help-ring, currentColor)"
        d="M12 21.931A9.934 9.934 0 1 1 21.934 12A9.945 9.945 0 0 1 12 21.931m0-18.867A8.934 8.934 0 1 0 20.934 12A8.943 8.943 0 0 0 12 3.064"
      />
    </svg>
  );
}
