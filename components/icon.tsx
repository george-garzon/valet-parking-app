const icons: Record<string, string> = {
 download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 chevron: '<path d="m6 9 6 6 6-6"/>',
 grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 car: '<path d="m5 8 2-4h10l2 4M4 9h16v8H4zM6 17v3m12-3v3M7 13h1m8 0h1"/>',
 key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-6 0 3-3"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
 user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 check: '<path d="m5 12 4 4L19 6"/>',
 money: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 8h1m10 8h1"/>',
 exit: '<path d="M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5"/>',
 location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
};

export default function Icon({name}: {name: string}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{__html: icons[name] || icons.car}} />;
}
