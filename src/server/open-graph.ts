/**
 * Link previews for shared title pages. A chat app fetching `/media/:id`
 * never logs in, so the tags describe the title from public artwork and copy
 * only; nothing here is gated by a session or a maturity limit.
 */

export interface SharePreview {
  title: string;
  overview?: string | null;
  /** Local artwork path (`/api/v1/images/...`), backdrop preferred. */
  imageUrl?: string | null;
  kind: string;
  year?: number | null;
}

const SHARE_PATH = /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i;

/** The item id when a request path is a title page, otherwise null. */
export function sharePathItemId(url: string): string | null {
  const match = SHARE_PATH.exec(url);
  return match ? match[1]!.toLowerCase() : null;
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function meta(attribute: 'property' | 'name', key: string, value: string): string {
  return `<meta ${attribute}="${key}" content="${escape(value)}">`;
}

/** Open Graph plus Twitter card tags for one title, as a single HTML fragment. */
export function openGraphTags(preview: SharePreview, origin: string, path: string): string {
  const title = preview.year ? `${preview.title} (${preview.year})` : preview.title;
  const image = preview.imageUrl ? `${origin}${preview.imageUrl}?w=1200&h=630&fit=cover&format=jpeg` : null;
  const lines = [
    meta('property', 'og:site_name', 'Dose'),
    meta('property', 'og:type', preview.kind === 'movie' ? 'video.movie' : preview.kind === 'episode' ? 'video.episode' : 'video.tv_show'),
    meta('property', 'og:title', title),
    meta('property', 'og:url', `${origin}${path}`),
    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
  ];
  if (preview.overview) lines.push(meta('property', 'og:description', preview.overview));
  if (image) lines.push(meta('property', 'og:image', image), meta('property', 'og:image:width', '1200'), meta('property', 'og:image:height', '630'));
  return lines.join('\n');
}

/** Adds a tag fragment to the shell's head and names the document after the title. */
export function injectHead(html: string, tags: string, title: string): string {
  const head = html.indexOf('</head>');
  if (head < 0) return html;
  const named = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)} · DOSE</title>`);
  const end = named.indexOf('</head>');
  return `${named.slice(0, end)}${tags}${named.slice(end)}`;
}

/** Only the share title needs the title text; the rest of the page loads from the SPA. */
export function shareTitle(preview: SharePreview): string {
  return preview.year ? `${preview.title} (${preview.year})` : preview.title;
}
