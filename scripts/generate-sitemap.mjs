import { writeFile } from 'node:fs/promises';

const SITE_URL = 'https://www.swamedia.online';
const DB_URL = 'https://swamediaweb-default-rtdb.firebaseio.com';

const escapeXml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const toLastMod = (value) => {
  const timestamp = Number(value || 0);
  if (!timestamp) return new Date().toISOString().slice(0, 10);
  return new Date(timestamp).toISOString().slice(0, 10);
};

const fetchJson = async (path) => {
  const response = await fetch(`${DB_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  return response.json();
};

const coreUrls = [
  '/',
  '/search',
  '/series',
  '/storyzone',
  '/payment',
  '/app',
  '/install/android',
  '/install/ios',
  '/feedback',
  '/help',
  '/about-us',
  '/privacy-policy',
  '/disclaimer'
].map((path) => ({ loc: `${SITE_URL}${path}`, lastmod: new Date().toISOString().slice(0, 10), images: [] }));

const mapContentUrls = (items = {}, type = 'movie') => Object.entries(items || {})
  .filter(([, value]) => value && value.isPublished !== false)
  .map(([id, value]) => {
    const slugMap = { movie: 'movie', series: 'series-show', adult: 'adult' };
    return {
      loc: `${SITE_URL}/${slugMap[type] || type}/${encodeURIComponent(id)}`,
      lastmod: toLastMod(value.createdAt || value.timestamp || value.updatedAt),
      images: value.posterUrl ? [value.posterUrl] : []
    };
  });

const mapStoryUrls = (items = {}) => Object.entries(items || {})
  .map(([id, value]) => ({
    loc: `${SITE_URL}/story/${encodeURIComponent(id)}`,
    lastmod: toLastMod(value.timestamp || value.updatedAt),
    images: value?.posterUrl ? [value.posterUrl] : []
  }));

const buildUrlNode = ({ loc, lastmod, images = [] }) => {
  const imageNodes = images.map((image) => `
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
    </image:image>`).join('');
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>${imageNodes}
  </url>`;
};

const main = async () => {
  const [movies, series, adultContent, stories] = await Promise.all([
    fetchJson('movies'),
    fetchJson('series'),
    fetchJson('adultContent'),
    fetchJson('stories')
  ]);

  const urls = [
    ...coreUrls,
    ...mapContentUrls(movies, 'movie'),
    ...mapContentUrls(series, 'series'),
    ...mapContentUrls(adultContent, 'adult'),
    ...mapStoryUrls(stories)
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.map(buildUrlNode).join('')}
</urlset>
`;

  await writeFile(new URL('../sitemap.xml', import.meta.url), xml, 'utf8');
  console.log(`Generated sitemap with ${urls.length} URLs`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
