'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import catalog from '@/data/vehicles.json';
import Icon from './icon';
import type { Ticket } from '@/lib/types';

function uniqueOptions(options: string[]) {
  const unique = new Map<string, string>();
  for (const option of options) if (option.trim()) unique.set(option.trim().toLowerCase(), option.trim());
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function VehicleCombobox({ label, name, value, options, placeholder, change }: {
  label: string; name: string; value: string; options: string[]; placeholder: string; change: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const query = value.trim().toLowerCase();
  const matches = options.filter(option => option.toLowerCase().includes(query));
  const suggestions = matches.slice(0, 50);
  const allowCustom = value.trim() && !options.some(option => option.toLowerCase() === query);
  const choices = [...suggestions, ...(allowCustom ? [value.trim()] : [])];
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  function select(option: string) { change(option); setOpen(false); setHighlighted(-1); input.current?.focus(); }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      setHighlighted(index => event.key === 'ArrowDown' ? Math.min(index + 1, choices.length - 1) : Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && highlighted >= 0 && choices[highlighted]) {
      event.preventDefault(); select(choices[highlighted]);
    } else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setHighlighted(-1); }
    else if (event.key === 'Tab') setOpen(false);
  }
  useEffect(() => {
    if (open && highlighted >= 0) document.getElementById(`${id}-option-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, id]);
  return <div className="field vehicle-combobox" ref={root}><label htmlFor={id}>{label}</label><div className="vehicle-combobox-control">
    <input ref={input} id={id} name={name} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && highlighted >= 0 ? `${id}-option-${highlighted}` : undefined} aria-describedby={`${id}-help`} autoComplete="off" placeholder={placeholder} required maxLength={120} value={value} onFocus={() => { setOpen(true); setHighlighted(-1); }} onKeyDown={keyboard} onChange={event => { change(event.target.value); setOpen(true); setHighlighted(-1); }} />
    <button type="button" tabIndex={-1} aria-label={`Show ${name} options`} onPointerDown={e => e.preventDefault()} onClick={() => { const wasOpen = open; input.current?.focus(); setOpen(!wasOpen); setHighlighted(-1); }}><Icon name="chevron" /></button>
  </div><small id={`${id}-help`} className="vehicle-field-help">Choose from the list or type your own.</small>
    {open && <div className="vehicle-options"><ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`}>{choices.map((option, index) => <li key={`${index}-${option}`} id={`${id}-option-${index}`} role="option" aria-selected={index === highlighted}><button type="button" tabIndex={-1} className={index === highlighted ? 'highlighted' : ''} onPointerDown={e => e.preventDefault()} onClick={() => select(option)}>{allowCustom && index === choices.length - 1 ? <><Icon name="plus" />Use “{option}”</> : option}</button></li>)}</ul>
      {!choices.length && <p>{name === 'model' && !options.length ? 'Choose a make first, or type any model.' : 'No suggestions. Type a value to add it.'}</p>}
      {matches.length > 50 && <p>Type to narrow {matches.length} suggestions.</p>}
    </div>}
  </div>;
}
export default function VehicleSelector({ existingVehicles = [] }: { existingVehicles?: Ticket[] }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const makeOptions = uniqueOptions([...existingVehicles.map(ticket => ticket.make), ...catalog.vehicles.map(entry => entry.make)]);
  const models = uniqueOptions([...(catalog.vehicles.find(entry => entry.make.toLowerCase() === make.trim().toLowerCase())?.models || []), ...existingVehicles.filter(ticket => ticket.make.trim().toLowerCase() === make.trim().toLowerCase()).map(ticket => ticket.model)]);
  function changeMake(next: string) { if (next !== make) setModel(''); setMake(next); }
  return <><VehicleCombobox label="Make" name="make" value={make} options={makeOptions} placeholder="Search or enter a make" change={changeMake} /><VehicleCombobox label="Model" name="model" value={model} options={models} placeholder={make ? 'Search or enter a model' : 'Choose a make first'} change={setModel} /></>;
}
