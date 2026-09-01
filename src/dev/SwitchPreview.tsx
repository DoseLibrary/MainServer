import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

/** Interactive sample for the gallery: on, off, and disabled. */
export function SwitchPreview() {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="flex items-center gap-6">
      <label className="flex items-center gap-2 text-sm font-medium">
        Enabled
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enabled" />
      </label>
      <Switch checked={false} onCheckedChange={() => {}} disabled aria-label="Disabled, off" />
      <Switch checked onCheckedChange={() => {}} disabled aria-label="Disabled, on" />
    </div>
  );
}
