// Shared Team-roster loader for the Cliffe Lab site.
// Reads Name/Position/Description .txt + photo pairs from a "Team" folder in the
// GitHub repo via the public GitHub Contents API — no build step needed.
//
// Expected files in /Team (one member per row):
//   First_Last.txt      (underscores separate name parts — safe even with hyphenated names)
//   First_Last.jpg|jpeg|png   (optional headshot, same basename as the .txt)
//
// .txt contents:
//   Name: "First M. Last"
//   Position: "Graduate Student"
//   Description: "10-50 word description"

const REPO_OWNER = 'schiracha';
const REPO_NAME = 'cliffelab';
const REPO_BRANCH = 'main';
const TEAM_PATH = 'Team';

// Controls the order role-group sections appear in on the Team page.
// Any position not listed here falls after these, alphabetically.
const GROUP_ORDER = ['Lab Manager', 'Technical Assistant', 'Graduate Student', 'Postdoctoral Fellow'];

const NAVY = 'linear-gradient(160deg,#232D4B,#33406a)';
const ORANGE = 'linear-gradient(160deg,#E57200,#c85f00)';

function parseField(text, field) {
  const re = new RegExp(field + '\\s*:\\s*"([\\s\\S]*?)"', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function initialsFor(name) {
  const words = name.replace(/[^A-Za-z\s\-']/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0] || '';
  const last = words[words.length - 1][0] || '';
  return (first + (words.length > 1 ? last : '')).toUpperCase();
}

function isCurrent(endYear) {
  return !endYear || /^current$/i.test(endYear.trim());
}

function pluralize(position) {
  if (!position) return 'Team';
  return /s$/i.test(position) ? position : position + 's';
}

function avatarBgFor(position) {
  const p = (position || '').toLowerCase();
  if (p.includes('postdoc') || p.includes('graduate') || p.includes('student')) return NAVY;
  return ORANGE;
}

export async function fetchTeamMembers() {
  const apiUrl = 'https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + TEAM_PATH + '?ref=' + REPO_BRANCH;
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

  const members = await Promise.all(txtFiles.map(async (f) => {
    let text = '';
    try {
      const r = await fetch(f.download_url);
      if (r.ok) text = await r.text();
    } catch (e) { /* ignore */ }

    const base = f.name.replace(/\.txt$/i, '').toLowerCase();
    const name = parseField(text, 'Name') || f.name.replace(/\.txt$/i, '').replace(/_/g, ' ');
    const position = parseField(text, 'Position');
    const startYear = parseField(text, 'Start Year');
    const endYearRaw = parseField(text, 'End Year');
    return {
      slug: f.name.replace(/\.txt$/i, ''),
      name,
      role: position,
      bio: parseField(text, 'Description'),
      link: parseField(text, 'Link'),
      startYear,
      endYear: endYearRaw,
      current: isCurrent(endYearRaw),
      initials: initialsFor(name),
      avatarBg: avatarBgFor(position),
      img: imageMap[base] || ''
    };
  }));

  return members;
}

// Splits the roster into present-day lab members and alumni, based on End Year.
// "Current" (or a blank End Year) keeps someone on the active roster.
export function splitCurrentAndAlumni(members) {
  const current = members.filter((m) => m.current);
  const alumni = members
    .filter((m) => !m.current)
    .map((m) => ({
      name: m.name,
      note: m.bio,
      href: m.link || '',
      img: m.img || '',
      years: (m.startYear ? m.startYear + '–' : '') + (m.endYear || ''),
      sortKey: (parseInt(m.endYear) || 0) * 100 + (parseInt(m.startYear) || 0) % 100
    }))
    .sort((a, b) => b.sortKey - a.sortKey);
  return { current, alumni };
}

export function groupByPosition(members) {
  const map = {};
  const order = [];
  members.forEach((m) => {
    const key = m.role || 'Team';
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(m);
  });
  order.sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return order.map((key) => ({ title: pluralize(key), members: map[key] }));
}
