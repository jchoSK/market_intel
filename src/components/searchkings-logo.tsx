// app/components/searchkings-logo.tsx
import type { SVGProps } from 'react';

export function SearchKingsLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 56 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SearchKings Crown Logo"
      {...props} // width and height will be controlled by CSS via className
    >
      <title>SearchKings Crown</title>
      <path
        d="M27.9999 4.5C23.8999 4.5 20.5713 6.07143 18.0142 9.21429L4.78562 20.0714C3.71419 17.3571 2.64277 15.0714 0.499899 13.9286L0 14.8571C1.67848 16.2143 3.07134 18.2143 4.07134 20.5L1.92848 22.7857L3.35705 24.6429L6.21419 22.5L7.78562 25.5C10.0713 29.0357 14.0713 32.5714 20.4999 34.7143L22.0713 30.7143C17.9713 29.0357 14.6428 26.4643 12.6428 23.5L27.9999 11.0714L43.357 23.5C41.357 26.4643 38.0285 29.0357 33.9285 30.7143L35.4999 34.7143C41.9285 32.5714 45.9285 29.0357 48.2142 25.5L49.7856 22.5L52.6428 24.6429L54.0713 22.7857L51.9285 20.5C52.9285 18.2143 54.3213 16.2143 55.9999 14.8571L55.4999 13.9286C53.357 15.0714 52.2856 17.3571 51.2142 20.0714L37.9856 9.21429C35.4285 6.07143 32.0999 4.5 27.9999 4.5Z"
        fill="url(#paint0_linear_crown)"
      />
      <ellipse
        cx="28"
        cy="36.5"
        rx="18"
        ry="3.5"
        stroke="url(#paint1_linear_crown)"
        strokeWidth="1"
      />
      <defs>
        <linearGradient
          id="paint0_linear_crown"
          x1="28"
          y1="4.5"
          x2="28"
          y2="34.7143"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFA300" />
          <stop offset="1" stopColor="#FFC966" />
        </linearGradient>
        <linearGradient
            id="paint1_linear_crown"
            x1="28"
            y1="32.8" 
            x2="28"
            y2="40.2"
            gradientUnits="userSpaceOnUse"
        >
            <stop stopColor="#FFA300" />
            <stop offset="1" stopColor="#E69500" />
        </linearGradient>
      </defs>
    </svg>
  );
}
