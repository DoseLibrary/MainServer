import { Input } from '@/components/ui/input';
import type { PluginField, PluginRunStatus } from '@/lib/api';

// Common cron presets surfaced as a datalist so admins don't have to know cron by heart.
export const SCHEDULE_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at 03:00', value: '0 3 * * *' },
  { label: 'Weekly (Sun 03:00)', value: '0 3 * * 0' },
];

export function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function PluginStatusBadge({ status }: { status: PluginRunStatus | null }) {
  if (!status) return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Never run</span>;
  const styles = status === 'succeeded' ? 'border-emerald-500/40 text-emerald-600' : status === 'failed' ? 'border-destructive/40 text-destructive' : 'border-amber-500/40 text-amber-600';
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{status === 'succeeded' ? 'Succeeded' : status === 'failed' ? 'Failed' : 'Running'}</span>;
}

type SettingFieldProps = {
  field: PluginField;
  value: unknown;
  /** Set for password fields that already hold a stored value the form never receives. */
  secretSet?: boolean;
  error?: string;
  onChange: (value: unknown) => void;
};

/** Renders one declared field. The plugin owns the descriptor; core owns the widget. */
export function SettingField({ field, value, secretSet, error, onChange }: SettingFieldProps) {
  const help = field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null;

  if (field.kind === 'boolean') {
    return (
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
          {field.label}
        </label>
        {help}
      </div>
    );
  }

  if (field.kind === 'select' || field.kind === 'multiselect') {
    const selected = field.kind === 'multiselect' ? (Array.isArray(value) ? value.map(String) : []) : [typeof value === 'string' ? value : ''];
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`field-${field.key}`} className="text-sm font-medium">{field.label}</label>
        <select
          id={`field-${field.key}`} multiple={field.kind === 'multiselect'} value={field.kind === 'multiselect' ? selected : selected[0]}
          onChange={(event) => onChange(field.kind === 'multiselect'
            ? [...event.target.selectedOptions].map((option) => option.value)
            : event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {help}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.kind === 'list') {
    const text = Array.isArray(value) ? value.join(', ') : '';
    return (
      <div className="flex flex-col gap-1">
        <Input label={field.label} placeholder={field.placeholder} value={text} error={error}
          onChange={(event) => onChange(event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} />
        {help}
      </div>
    );
  }

  if (field.kind === 'number') {
    return (
      <div className="flex flex-col gap-1">
        <Input label={field.label} type="number" min={field.min} max={field.max} step={field.step} required={field.required} error={error}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
        {help}
      </div>
    );
  }

  if (field.kind !== 'text' && field.kind !== 'password' && field.kind !== 'path') return null;
  const isSecret = field.kind === 'password';
  return (
    <div className="flex flex-col gap-1">
      <Input label={field.label} type={isSecret ? 'password' : 'text'} required={field.required} error={error}
        placeholder={isSecret && secretSet ? 'Stored — leave blank to keep' : field.placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)} />
      {help}
    </div>
  );
}
