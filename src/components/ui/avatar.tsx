import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

export interface AvatarProps extends AvatarPrimitive.AvatarProps {
  src?: string;
  alt: string;
  fallback?: string;
}

export function Avatar({ src, alt, fallback, className, ...props }: AvatarProps) {
  const initials = fallback ?? alt.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <AvatarPrimitive.Root className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)} {...props}>
      <AvatarPrimitive.Image src={src} alt={alt} className="h-full w-full object-cover" />
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium" delayMs={src ? 300 : 0}>
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
