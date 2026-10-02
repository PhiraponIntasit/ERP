// Icons for the "report a problem" form (lucide-style strokes, inlined).
const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS: Record<string, React.ReactNode> = {
  laptop: <><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20" /><path d="M9.5 19l.5-1.5h4l.5 1.5" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
  network: <><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M2 9a15 15 0 0 1 20 0" /><circle cx="12" cy="19.5" r=".8" fill="currentColor" /></>,
  printer: <><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3h12v6" /><rect x="6" y="14" width="12" height="7" rx="1" /></>,
  software: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M7 6.5h.01M10 6.5h.01" /><path d="m10 13-2 2 2 2" /><path d="m14 13 2 2-2 2" /></>,
  peripheral: <><rect x="6" y="2" width="12" height="20" rx="6" /><path d="M12 6v4" /></>,
};
export const CategoryIcon = ({ cat, size = 24 }: { cat: string; size?: number }) => svg(size, ICONS[cat] ?? ICONS.laptop);
export const CameraIcon = ({ size = 22 }: { size?: number }) => svg(size, <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.5" /></>);
export const GalleryIcon = ({ size = 22 }: { size?: number }) => svg(size, <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>);
export const SendIcon = ({ size = 18 }: { size?: number }) => svg(size, <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>);
