/** Official-style full-color YouTube logo. */
export function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#FF0000"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814Z"
      />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
    </svg>
  );
}

/** Official-style full-color Twitch glitch logo. */
export function TwitchLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#9146FF"
        d="M2.149 0 .537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149Z"
      />
      <path
        fill="#FFFFFF"
        d="m21.314 13.612-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.149h17.195v11.463Z"
      />
      <path
        fill="#9146FF"
        d="M17.731 6.269h-2.149v6.448h2.149V6.269Zm-5.91 0H9.672v6.448h2.149V6.269Z"
      />
    </svg>
  );
}

/** Classic full-color RSS feed logo. */
export function RssLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#F26522" />
      <circle cx="6.8" cy="17.2" r="2.2" fill="#FFFFFF" />
      <path
        fill="#FFFFFF"
        d="M4.6 11.1a8.3 8.3 0 0 1 8.3 8.3H9.8a5.2 5.2 0 0 0-5.2-5.2v-3.1Zm0-5.7a14 14 0 0 1 14 14h-3.1A10.9 10.9 0 0 0 4.6 8.5V5.4Z"
      />
    </svg>
  );
}
