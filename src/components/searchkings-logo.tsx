// app/components/searchkings-logo.tsx
import type { SVGProps } from 'react';

export function SearchKingsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 60 40" // Adjusted viewBox for the new design
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SearchKings Crown Logo"
      {...props} // width and height will be controlled by CSS via className
    >
      <title>SearchKings Crown</title>
      {/* Gold crown body */}
      <path
        d="M30,2 L20,20 L8,12 L2,25 C10,35 50,35 58,25 L52,12 L40,20 Z"
        fill="#FFA300" // SK Gold
      />
      {/* Dark accent line on the base */}
      <path
        d="M2,25 Q11,18 20,20 T40,20 Q49,18 58,25"
        stroke="#000000" // SK Black
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
