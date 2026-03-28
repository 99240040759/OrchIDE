import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — merge Tailwind classes safely, resolving conflicts via tailwind-merge.
 * Required by all shadcn/ui components.
 *
 * @example cn('px-2 py-1', condition && 'font-bold', 'px-4') → 'py-1 font-bold px-4'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
