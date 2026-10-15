import type { SVGProps } from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  'aria-hidden': true,
  focusable: false,
} as const;

export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="m3 8.5 3.25 3.25L13 5" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function MinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M3 8h10" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}
