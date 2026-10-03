// Downloads national-team rosters of recent IIHF tournaments from Wikipedia (wikitext via the
// MediaWiki API) into data/raw/intl/ — the source for players of smaller hockey nations that the
// NHL and KHL data don't cover. Slow on purpose: one request every few seconds, cached on disk.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-intl.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const RAW = path.resolve('data/raw/intl');
export const INTL_PAGES = [
  ['en', '2026_IIHF_World_Championship_rosters'],
  ['en', '2025_IIHF_World_Championship_rosters'],
  ['en', '2024_IIHF_World_Championship_rosters'],
  ['en', "Ice_hockey_at_the_2026_Winter_Olympics_–_Men's_team_rosters"],
  ['uk', 'Збірна_України_з_хокею_із_шайбою'],
  ['pl', 'Reprezentacja_Polski_w_hokeju_na_lodzie_mężczyzn'],
];

const file = (lang, page) => path.join(RAW, `${lang}-${page.replace(/[^\p{L}\p{N}]+/gu, '_')}.json`);

async function main() {
  await fs.mkdir(RAW, { recursive: true });
  for (const [lang, page] of INTL_PAGES) {
    const out = file(lang, page);
    try { await fs.access(out); continue; } catch { /* not cached */ }
    const url = `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=wikitext&page=${encodeURIComponent(page)}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(url, { headers: { 'user-agent': 'nhl-gm-fan-project/0.1 (hockey management game; rosters)' } });
      if (res.ok) {
        const json = await res.json();
        await fs.writeFile(out, JSON.stringify({ lang, page, wikitext: json.parse?.wikitext ?? '' }));
        console.log(lang, page, json.parse?.wikitext?.length ?? 0);
        break;
      }
      console.warn(lang, page, res.status, 'retry');
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main();
