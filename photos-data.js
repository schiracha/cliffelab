// Shared Photos-feed loader for the Cliffe Lab site.
// Reads .txt + image pairs from a "Photos" folder in the GitHub repo via the public
// GitHub Contents API (no build step, no server — works from a static GitHub Pages site).
//
// Expected file format in /Photos:
//   Some-Title-yyyymmdd.txt   (yyyymmdd = publish date, used for sorting)
//   Some-Title-yyyymmdd.jpg|jpeg|png   (optional, same basename as the .txt)
//
// .txt contents:
//   Title:"Long title of the photos"
//   Message:"The message that will with the photo"
//   [End]

const REPO_OWNER = 'schiracha';
const REPO_NAME = 'cliffelab';
const REPO_BRANCH = 'main';
const PHOTO_PATH = 'Lab Photos';

function parseDateFromName(name) {
  const m = name.match(/-(\d{4})(\d{2})(\d{2})\.txt$/i);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function parseField(text, field) {
  const re = new RegExp(field + '\\s*:\\s*"([\\s\\S]*?)"', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

export async function fetchPhotoItems() {
  const apiUrl = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + PHOTO_PATH + '?ref=' + REPO_BRANCH;
  let listing;
  try {
    const res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
    if (!res.ok) return [];
    listing = await res.json();
  } catch (e) {
    return [];
  }
  if (!Array.isArray(listing)) return [];

  const imageMap = {};
  listing.forEach((f) => {
    if (f.type !== 'file') return;
    const m = f.name.match(/^(.*)\.(jpe?g|png)$/i);
    if (m) imageMap[m[1].toLowerCase()] = f.download_url;
  });

  const txtFiles = listing.filter((f) => f.type === 'file' && /\.txt$/i.test(f.name));

  const items = await Promise.all(txtFiles.map(async (f) => {
    let text = '';
    try {
      const r = await fetch(f.download_url);
      if (r.ok) text = await r.text();
    } catch (e) { /* ignore */ }

    const date = parseDateFromName(f.name);
    const base = f.name.replace(/\.txt$/i, '').toLowerCase();
    return {
      slug: f.name.replace(/\.txt$/i, ''),
      title: parseField(text, 'Title') || f.name.replace(/\.txt$/i, ''),
      message: parseField(text, 'Message'),
      date,
      dateLabel: date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
      image: imageMap[base] || null
    };
  }));

  items.sort((a, b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
  return items;
}
