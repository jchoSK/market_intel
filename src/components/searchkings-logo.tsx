// app/components/searchkings-logo.tsx
import type { SVGProps } from 'react';

export function SearchKingsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 56 30" // Adjusted viewBox for the new flatter aspect ratio
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SearchKings Crown Logo"
      {...props} // width and height will be controlled by CSS via className
    >
      <title>SearchKings Crown</title>
      {/* Gold crown body, adjusted for flatter appearance */}
      <path
        d="M28,0 L18,16.18 L6,9.99 L0,20.67 C8,29.67 48,29.67 56,20.67 L50,9.99 L38,16.18 Z"
        fill="#FFA300" // SK Gold
      />
      {/* Dark accent line on the base, adjusted for flatter appearance */}
      <path
        d="M0,20.67 Q9,14.38 18,16.18 T38,16.18 Q47,14.38 56,20.67"
        stroke="#000000" // SK Black
        strokeWidth="1.5" // Kept stroke width, consider adjusting if it looks too thick/thin
        fill="none"
      />
    </svg>
  );
}
