import { useState } from 'react';
import { ListFilter, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Radix Select can't hold '' as a value, so "no number" (e.g. Unlimited) travels as this inside the dropdown.
const NONE = '__none';
const CUSTOM = '__custom';

// A number picked from a few presets, or typed in. The dropdown's "Custom…" (or the pencil) swaps it for
// a number box; the list button swaps back. `value` is a string ('' = the preset with value '', if any),
// or null while the number box is empty — callers treat null as "not filled in yet".
// `presets` is [[value, label]], `suffix(value)` is the word shown after the typed number ("classes").
export default function NumberChoice({ value, onChange, presets, suffix, placeholder, className, size = 'sm' }) {
  const isPreset = presets.some(([v]) => v === value);
  const [custom, setCustom] = useState(!isPreset);
  const height = size === 'sm' ? 'h-8' : 'h-7';

  if (custom) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <Input
          autoFocus={value == null}
          inputMode="numeric"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+/, '') || null)}
          className={cn(height, 'w-20')}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix(value)}</span>}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground"
          aria-label="Pick from the list"
          title="Pick from the list"
          onClick={() => {
            setCustom(false);
            if (!presets.some(([v]) => v === value)) onChange(presets[0][0]);
          }}
        >
          <ListFilter />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Select
        value={value === '' ? NONE : value}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            onChange(value || null);
          } else onChange(v === NONE ? '' : v);
        }}
      >
        <SelectTrigger size={size} className="min-w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map(([v, label]) => (
            <SelectItem key={v || NONE} value={v === '' ? NONE : v}>
              {label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground"
        aria-label="Type a number"
        title="Type a number"
        onClick={() => {
          setCustom(true);
          onChange(value || null);
        }}
      >
        <Pencil />
      </Button>
    </div>
  );
}
