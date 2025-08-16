const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// Mapping of leagues to human-readable names
const leagueSlugs = {
  'bra.1': 'Brasileir\u00e3o S\u00e9rie A',
  'bra.copa_do_brazil': 'Copa do Brasil',
  'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana',
  'conmebol.recopa': 'Recopa Sul-Americana',
  'fifa.cwc': 'Mundial de Clubes'
};

// List of Serie A teams for the 2025 season
const serieATeams = [
  'Atl\u00e9tico Mineiro',
  'Bahia',
  'Botafogo',
  'Cear\u00e1',
  'Corinthians',
  'Cruzeiro',
  'Flamengo',
  'Fluminense',
  'Fortaleza',
  'Gr\u00eamio',
  'Internacional',
  'Juventude',
  'Mirassol',
  'Palmeiras',
  'Red Bull Bragantino',
  'Santos',
  'S\u00e3o Paulo',
  'Sport',
  'Vasco da Gama',
  'Vit\u00f3ria'
];

// Normalize names by removing accents and converting to lowercase
function normalize(str) {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
const serieASet = new Set(serieATeams.map(normalize));

async function fetchGames(dateStr) {
  const allGames = [];
  for (const [slug, leagueName] of Object.entries(leagueSlugs)) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStr}`;
    let data;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch (err) {
      console.error('Erro ao buscar', url, err);
      continue;
    }
    if (!data || !data.events) continue;
    for (const event of data.events) {
      const comp = event.competitions && event.competitions[0];
      if (!comp) continue;
      const competitors = comp.competitors || [];
      // Check if any competitor is a Serie A team
      const teamNamesNorm = competitors.map(c => normalize(c.team.displayName));
      if (!teamNamesNorm.some(t => serieASet.has(t))) continue;
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      if (!home || !away) continue;
      const startDateISO = comp.date;
      allGames.push({
        league: leagueName,
        slug,
        startDate: startDateISO,
        homeTeam: {
          name: home.team.displayName,
          logo: home.team.logo
        },
        awayTeam: {
          name: away.team.displayName,
          logo: away.team.logo
        }
      });
    }
  }
  return allGames;
}

(async () => {
  // Determine current date in America/Bahia timezone (format YYYYMMDD)
  const now = new Date();
  const tzFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' });
  const [year, month, day] = tzFormatter.format(now).split('-');
  const dateStr = `${year}${month}${day}`;
  const games = await fetchGames(dateStr);
  fs.writeFileSync('games.json', JSON.stringify(games, null, 2));
})();
