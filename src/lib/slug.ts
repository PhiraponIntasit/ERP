/** URL-safe slug from a Latin name ("ASUS TUF B650-Plus" → "asus-tuf-b650-plus"); Thai text yields "". */
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
