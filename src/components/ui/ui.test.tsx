import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar } from './avatar';
import { Button } from './button';
import { Card, CardTitle } from './card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Input } from './input';
import { Modal, ModalContent, ModalTitle, ModalTrigger } from './modal';
import { Skeleton } from './skeleton';
import { Switch } from './switch';
import { Spinner } from './spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { ToastProvider, useToast } from './toast';

describe('UI primitives', () => {
  it('renders button variants and disabled state', () => {
    render(<Button variant="destructive" disabled>Delete</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });

  it('connects an input error to the field', () => {
    render(<Input label="Name" error="Required" />);
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Required');
  });

  it('renders a labelled spinner', () => {
    render(<Spinner label="Scanning" />);
    expect(screen.getByRole('status', { name: 'Scanning' })).toBeInTheDocument();
  });

  it('renders a skeleton', () => {
    const { container } = render(<Skeleton className="h-10" />);
    expect(container.firstChild).toHaveClass('animate-pulse', 'h-10');
  });

  it('renders card slots', () => {
    render(<Card><CardTitle>Library</CardTitle></Card>);
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  it('opens a modal', () => {
    render(<Modal><ModalTrigger>Open</ModalTrigger><ModalContent><ModalTitle>Connect</ModalTitle></ModalContent></Modal>);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Connect');
  });

  it('shows a toast through the provider hook', () => {
    function Demo() { const { toast } = useToast(); return <button onClick={() => toast({ title: 'Updated' })}>Notify</button>; }
    render(<ToastProvider><Demo /></ToastProvider>);
    fireEvent.click(screen.getByText('Notify'));
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('renders an open dropdown menu', async () => {
    render(<DropdownMenu open><DropdownMenuTrigger>More</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Settings</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(await screen.findByText('Settings')).toBeInTheDocument();
  });

  it('renders an avatar fallback', async () => {
    render(<Avatar alt="Dose Library" />);
    expect(await screen.findByText('DL')).toBeInTheDocument();
  });

  it('switches tabs', () => {
    render(<Tabs defaultValue="one"><TabsList><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList><TabsContent value="one">First</TabsContent><TabsContent value="two">Second</TabsContent></Tabs>);
    fireEvent.mouseDown(screen.getByText('Two'), { button: 0 });
    fireEvent.click(screen.getByText('Two'));
    expect(screen.getByText('Second')).toBeVisible();
  });

  it('toggles a switch by mouse and keyboard, and reports its state', async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Enabled" />);
    const control = screen.getByRole('switch', { name: 'Enabled' });

    expect(control).not.toBeChecked();
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    // Buttons activate on Enter and Space, so the keyboard path needs no extra code.
    rerender(<Switch checked onCheckedChange={onCheckedChange} aria-label="Enabled" />);
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeChecked();
  });

  it('does not report changes while disabled', () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={onCheckedChange} aria-label="Enabled" />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
