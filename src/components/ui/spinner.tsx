import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<SVGSVGElement> {
  label?: string;
}

export function Spinner({ className, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      role="status"
      aria-label={label}
      className={cn('h-5 w-5 animate-spin', className)}
      {...props}
    />
  );
}
