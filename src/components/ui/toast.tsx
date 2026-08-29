import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastOptions = { title: string; description?: string; variant?: 'default' | 'destructive' | 'success' };
type ToastContextValue = { toast: (options: ToastOptions) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Array<ToastOptions & { id: number }>>([]);
  const toast = useCallback((options: ToastOptions) => {
    setItems((current) => [...current, { ...options, id: Date.now() + current.length }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            defaultOpen
            duration={4000}
            onOpenChange={(open) => !open && setItems((current) => current.filter(({ id }) => id !== item.id))}
            className={cn('relative grid gap-1 rounded-md border bg-card p-4 pr-10 text-card-foreground shadow-lg', item.variant === 'destructive' && 'border-destructive', item.variant === 'success' && 'border-emerald-500')}
          >
            <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
            {item.description && <ToastPrimitive.Description className="text-sm text-muted-foreground">{item.description}</ToastPrimitive.Description>}
            <ToastPrimitive.Close aria-label="Close" className="absolute right-3 top-3 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
