import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export const DropdownMenuGroup = Dropdown.Group;
export const DropdownMenuSeparator = ({ className, ...props }: Dropdown.DropdownMenuSeparatorProps) => (
  <Dropdown.Separator className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
);
export const DropdownMenuLabel = ({ className, ...props }: Dropdown.DropdownMenuLabelProps) => (
  <Dropdown.Label className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} />
);
export const DropdownMenuItem = ({ className, ...props }: Dropdown.DropdownMenuItemProps) => (
  <Dropdown.Item className={cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props} />
);
export const DropdownMenuCheckboxItem = ({ className, children, checked, ...props }: Dropdown.DropdownMenuCheckboxItemProps) => (
  <Dropdown.CheckboxItem checked={checked} className={cn('relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent', className)} {...props}>
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center"><Dropdown.ItemIndicator><Check className="h-4 w-4" /></Dropdown.ItemIndicator></span>
    {children}
  </Dropdown.CheckboxItem>
);
export const DropdownMenuSub = Dropdown.Sub;
export const DropdownMenuSubTrigger = ({ className, children, ...props }: Dropdown.DropdownMenuSubTriggerProps) => (
  <Dropdown.SubTrigger className={cn('flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent', className)} {...props}>
    {children}<ChevronRight className="ml-auto h-4 w-4" />
  </Dropdown.SubTrigger>
);
export const DropdownMenuContent = ({ className, sideOffset = 4, ...props }: Dropdown.DropdownMenuContentProps) => (
  <Dropdown.Portal><Dropdown.Content sideOffset={sideOffset} className={cn('z-50 min-w-40 rounded-md border bg-card p-1 text-card-foreground shadow-md', className)} {...props} /></Dropdown.Portal>
);
export const DropdownMenuSubContent = ({ className, ...props }: Dropdown.DropdownMenuSubContentProps) => (
  <Dropdown.Portal><Dropdown.SubContent className={cn('z-50 min-w-40 rounded-md border bg-card p-1 shadow-md', className)} {...props} /></Dropdown.Portal>
);
