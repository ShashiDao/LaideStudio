import React from 'react';

export interface LaideLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  withBackground?: boolean;
}

export function LaideLogo({
  size = 24,
  className = '',
  withBackground = true,
  ...props
}: LaideLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-label="LAIDE Studio Logo"
      role="img"
      {...props}
    >
      {withBackground && <rect width="512" height="512" rx="100" fill="#d4af37" />}
      <path
        d="M 190 158 L 190 330 L 268 330"
        fill="none"
        stroke="#0e0f12"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 340 182 C 340 152, 288 145, 268 169 C 250 191, 270 208, 296 222 C 324 238, 344 256, 324 284 C 300 306, 260 297, 253 271"
        fill="none"
        stroke="#0e0f12"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
