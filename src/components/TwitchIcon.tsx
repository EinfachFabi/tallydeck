/** Simple Twitch glitch icon (brand icons are not part of lucide). */
export function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 3h17v11l-4 4h-4l-3 3v-3H6l-2-2V3z" />
      <path d="M11 8v4" />
      <path d="M16 8v4" />
    </svg>
  );
}
