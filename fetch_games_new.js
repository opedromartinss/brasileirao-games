const fs = require('fs');
// Use node-fetch for HTTP requests (ESM imported dynamically). We defer the import
// to runtime because node-fetch is not a built‑in module. This pattern is
// compatible with the GitHub Actions environment used in this project.
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

/*
 * This script generates a JSON file containing football matches for the
 * current day and the next few days.  It combines data from ESPN's
 * public scoreboard endpoints for leagues and from team‑specific event
 * endpoints for a selected set of national teams.  The goal is to
 * provide a single, cached source of fixtures for the client
 * application to display without hitting rate limits.
 */

// Slugs of competitions to query via the ESPN scoreboard API.  These
// include the Brasileirão Serie A, national cups, CONMEBOL tournaments,
// state championships, the Club World Cup, and the top European leagues.
// Additional slugs cover international tournaments such as Copa América,
// Euro, Nations League and World Cup qualifiers.  Feel free to extend
// this list as new competitions become relevant.
const leagues = [
  // Brazilian domestic competitions
  'bra.1',               // Brasileirão Serie A
  'bra.copa_do_brazil',  // Copa do Brasil
  'bra.camp.carioca',    // Campeonato Carioca
  'bra.camp.paulista',   // Campeonato Paulista
  'bra.camp.gaucho',     // Campeonato Gaúcho
  'bra.camp.mineiro',    // Campeonato Mineiro
  'bra.copa_do_nordeste',// Copa do Nordeste
  // CONMEBOL tournaments
  'conmebol.libertadores',
  'conmebol.sudamericana',
  'conmebol.recopa',
  // Club World Cup
  'fifa.cwc',
  // European club competitions
  'eng.1',               // Premier League
  'esp.1',               // La Liga
  'ger.1',               // Bundesliga
  'ita.1',               // Serie A (Italy)
  'fra.1',               // Ligue 1
  'uefa.champions',      // UEFA Champions League
  'uefa.europa',         // UEFA Europa League
  'uefa.europa_conference', // UEFA Europa Conference League
  // Major international tournaments and qualifiers
  'conmebol.copa_america',     // Copa América
  'conmebol.copa_america.w',   // Copa América Feminina
  'uefa.euro',                 // Eurocopa
  'uefa.euro.w',               // Eurocopa Feminina
  'uefa.nations',              // UEFA Nations League
  // World Cup and qualifiers (various confederations)
  'fifa.worldcup',             // Copa do Mundo
  'fifa.worldcup.w',           // Copa do Mundo Feminina
  'fifa.friendly',             // Amistosos internacionais
  'fifa.friendly.w',           // Amistosos internacionais (femininos)
  'conmebol.worldcup_qualifiers', // Eliminatórias CONMEBOL
  'concacaf.worldcup_qualifiers', // Eliminatórias CONCACAF
  'uefa.worldcup_qualifiers',     // Eliminatórias UEFA
  'afc.worldcup_qualifiers',      // Eliminatórias AFC (Ásia)
  'caf.worldcup_qualifiers',      // Eliminatórias CAF (África)
  'ofc.worldcup_qualifiers'       // Eliminatórias OFC (Oceania)
];

// Define the national teams we want to track.  Each object includes
// the ESPN team ID, the English name returned by ESPN and the
// Portuguese translation.  You can add or adjust entries as
// necessary.  Note: IDs for Italy (Italie) and Netherlands are
// placeholders (-1) and should be updated once you discover the
// correct ESPN IDs (e.g. via API exploration).
const nationalTeams = [
  { id: 205, name: 'Brazil',         pt: 'Brasil' },
  { id: 202, name: 'Argentina',      pt: 'Argentina' },
  { id: 481, name: 'Germany',        pt: 'Alemanha' },
  { id: 478, name: 'France',         pt: 'França' },
  { id: 164, name: 'Spain',          pt: 'Espanha' },
  { id: 482, name: 'Portugal',       pt: 'Portugal' },
  { id: -1,  name: 'Italy',          pt: 'Itália' },    // TODO: set correct ID
  { id: -1,  name: 'Netherlands',    pt: 'Holanda' },   // TODO: set correct ID
  { id: 212, name: 'Uruguay',        pt: 'Uruguai' },
  { id: 207, name: 'Chile',          pt: 'Chile' },
  { id: 208, name: 'Colombia',       pt: 'Colômbia' },
  { id: 209, name: 'Ecuador',        pt: 'Equador' },
  { id: 210, name: 'Paraguay',       pt: 'Paraguai' },
  { id: 211, name: 'Peru',           pt: 'Peru' },
  { id: 203, name: 'Mexico',         pt: 'México' },
  { id: 660, name: 'United States',  pt: 'Estados Unidos' },
  { id: 206, name: 'Canada',         pt: 'Canadá' }
];

// List of well‑known club teams from around the world to include
// regardless of competition.  This list is used alongside the
// dynamic Serie A team list when filtering scoreboard events.  You
// can expand or refine this list to suit your site's audience.
const popularTeams = [
  'Real Madrid', 'Barcelona', 'Atletico Madrid',
  'Manchester United', 'Manchester City', 'Chelsea', 'Liverpool', 'Arsenal',
  'Bayern', 'Borussia Dortmund', 'Juventus', 'Milan', 'Inter', 'Roma',
  'Paris Saint‑Germain', 'Olympique de Marseille',
  'Ajax', 'Feyenoord', 'PSV',
  'Porto', 'Benfica', 'Sporting',
  // South American giants
  'Boca Juniors', 'River Plate', 'Peñarol', 'Nacional', 'Flamengo', 'Palmeiras'
];

// Helper: remove accents and convert to lower case for comparison
function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Fetch the list of teams in the Brasileirão Serie A from ESPN.  If
// the call fails, fall back to a hard‑coded list defined in the
// workflow.  The function returns an array of team names.
async function fetchSerieATeams() {
  try {
    const url =
      'https://sports.core.api.espn.com/v2/sports/soccer/leagues/bra.1/teams?limit=300';
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const refs = (data.items || []).map((item) => item.$ref);
    const teamPromises = refs.map(async (ref) => {
      try {
        const teamResp = await fetch(ref);
        const tData = await teamResp.json();
        return tData.displayName || tData.name || null;
      } catch {
        return null;
      }
    });
    const names = (await Promise.all(teamPromises)).filter(Boolean);
    return names;
  } catch {
    return [];
  }
}

// Fetch matches for national teams within the given date range.  This
// function uses the team events endpoint, then requests each event's
// details to extract names, logos, competition and broadcast info.
async function fetchNationalTeamEvents(startDate, endDate) {
  const games = [];
  for (const team of nationalTeams) {
    if (team.id <= 0) continue; // skip teams with unknown IDs
    const url =
      `https://sports.core.api.espn.com/v2/sports/soccer/teams/${team.id}/events?startDate=${startDate}&endDate=${endDate}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data.items || [];
      for (const item of items) {
        try {
          const evResp = await fetch(item.$ref);
          if (!evResp.ok) continue;
          const ev = await evResp.json();
          const comp = (ev.competitions && ev.competitions[0]) || null;
          if (!comp) continue;
          const competitors = comp.competitors || [];
          if (!Array.isArray(competitors) || competitors.length < 2) continue;
          const homeEntry = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const awayEntry = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          let homeName = homeEntry.team.displayName || '';
          let awayName = awayEntry.team.displayName || '';
          // Translate national team names to Portuguese if in mapping
          const tHome = nationalTeams.find(
            (nt) => nt.name.toLowerCase() === homeName.toLowerCase()
          );
          if (tHome) homeName = tHome.pt;
          const tAway = nationalTeams.find(
            (nt) => nt.name.toLowerCase() === awayName.toLowerCase()
          );
          if (tAway) awayName = tAway.pt;
          // Team logos
          const homeLogo =
            (homeEntry.team.logos && homeEntry.team.logos[0].href) || '';
          const awayLogo =
            (awayEntry.team.logos && awayEntry.team.logos[0].href) || '';
          // Competition name
          let compName = '';
          if (ev.leagues && ev.leagues.length > 0) {
            compName = ev.leagues[0].name || ev.leagues[0].shortName || '';
          }
          // Determine broadcast
          let broadcast = '';
          let broadcasts = [];
          if (Array.isArray(comp.broadcasts) && comp.broadcasts.length > 0) {
            broadcasts = comp.broadcasts;
          } else if (
            Array.isArray(ev.broadcasts) &&
            ev.broadcasts.length > 0
          ) {
            broadcasts = ev.broadcasts;
          }
          if (broadcasts.length > 0) {
            const b = broadcasts[0];
            if (b.media && (b.media.shortName || b.media.name)) {
              broadcast = b.media.shortName || b.media.name;
            } else if (Array.isArray(b.names) && b.names.length > 0) {
              broadcast = b.names[0];
            } else if (b.shortName || b.name) {
              broadcast = b.shortName || b.name;
            }
          }
          const startDateTime = ev.date;
          games.push({
            startDate: startDateTime,
            home: homeName,
            away: awayName,
            homeLogo,
            awayLogo,
            competition: compName,
            broadcast
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  return games;
}

// Main routine: fetch scoreboard games for leagues and national team
// events, then output a JSON file with two arrays: games for the
// current day (today) and games for the coming days (future).
async function main() {
  const now = new Date();
  // Format today as YYYYMMDD for scoreboard and YYYY-MM-DD for national team events
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.format(now).split('-');
  const ymdWithHyphen = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const ymd = `${parts[0]}${parts[1]}${parts[2]}`;

  // Determine how many days ahead to fetch (default: 7)
  const DAYS_AHEAD = 7;
  // Fetch dynamic Serie A teams; fallback list will be defined later if needed
  const dynamicTeams = await fetchSerieATeams();
  // Fallback list of Serie A clubs for 2025 season (will be used if dynamic fetch fails)
  const fallbackTeams = [
    'Atlético Mineiro', 'Bahia', 'Botafogo', 'Ceará', 'Corinthians', 'Cruzeiro',
    'Flamengo', 'Fluminense', 'Fortaleza', 'Grêmio', 'Internacional', 'Juventude',
    'Mirassol', 'Palmeiras', 'Santos', 'São Paulo', 'Sport Recife', 'Vasco da Gama',
    'Vitória', 'Cuiabá'
  ];
  const serieAList = dynamicTeams && dynamicTeams.length > 0 ? dynamicTeams : fallbackTeams;
  const serieASet = new Set(serieAList.map((n) => normalizeName(n)));
  const popularSet = new Set(popularTeams.map((n) => normalizeName(n)));
  // Containers for games
  const todayGames = [];
  const futureGames = [];
  // Helper to avoid duplicate events (by combining date and team names)
  const seenKeys = new Set();
  // Iterate through each league and fetch events for today and the next days
  for (const slug of leagues) {
    for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
      const dateObj = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      const dateParts = formatter.format(dateObj).split('-');
      const dateStr = `${dateParts[0]}${dateParts[1]}${dateParts[2]}`;
      const url =
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStr}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        const events = data.events || [];
        for (const ev of events) {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp) continue;
          const competitors = comp.competitors || [];
          if (competitors.length < 2) continue;
          const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          const homeName = home.team && home.team.displayName;
          const awayName = away.team && away.team.displayName;
          const normHome = normalizeName(homeName);
          const normAway = normalizeName(awayName);
          // Filter: keep matches where at least one team is a Serie A club or popular team
          if (
            !serieASet.has(normHome) &&
            !serieASet.has(normAway) &&
            !popularSet.has(normHome) &&
            !popularSet.has(normAway)
          ) {
            continue;
          }
          // Unique key to prevent duplicates
          const key = `${ev.date || ev.id}-${homeName}-${awayName}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const homeLogo =
            (home.team.logos && home.team.logos[0].href) || home.team.logo || '';
          const awayLogo =
            (away.team.logos && away.team.logos[0].href) || away.team.logo || '';
          let compName = '';
          if (ev.leagues && ev.leagues.length > 0) {
            compName = ev.leagues[0].name || ev.leagues[0].shortName || '';
          }
          // Broadcast for scoreboard events
          let broadcast = '';
          let broadcasts = [];
          if (Array.isArray(comp.broadcasts) && comp.broadcasts.length > 0) {
            broadcasts = comp.broadcasts;
          } else if (Array.isArray(ev.broadcasts) && ev.broadcasts.length > 0) {
            broadcasts = ev.broadcasts;
          }
          if (broadcasts.length > 0) {
            const b = broadcasts[0];
            if (b.media && (b.media.shortName || b.media.name)) {
              broadcast = b.media.shortName || b.media.name;
            } else if (Array.isArray(b.names) && b.names.length > 0) {
              broadcast = b.names[0];
            } else if (b.shortName || b.name) {
              broadcast = b.shortName || b.name;
            }
          }
          const startDate = ev.date;
          const gameObj = {
            startDate,
            home: homeName,
            away: awayName,
            homeLogo,
            awayLogo,
            competition: compName,
            broadcast
          };
          if (offset === 0) todayGames.push(gameObj);
          else futureGames.push(gameObj);
        }
      } catch {
        continue;
      }
    }
  }
  // Fetch national team events for the seven day window
  try {
    const nationalGames = await fetchNationalTeamEvents(
      ymdWithHyphen,
      (() => {
        const endDateObj = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
        const p = formatter.format(endDateObj).split('-');
        return `${p[0]}-${p[1]}-${p[2]}`;
      })()
    );
    for (const g of nationalGames) {
      // Determine if game is today or in future using startDate (ISO string)
      const eventDate = new Date(g.startDate);
      const eventKey = `${g.startDate}-${g.home}-${g.away}`;
      if (seenKeys.has(eventKey)) continue;
      seenKeys.add(eventKey);
      const diffDays = Math.floor(
        (eventDate.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) /
          (24 * 60 * 60 * 1000)
      );
      if (diffDays === 0) {
        todayGames.push(g);
      } else if (diffDays > 0 && diffDays <= DAYS_AHEAD) {
        futureGames.push(g);
      }
    }
  } catch {
    // ignore errors in national team fetch
  }
  // Sort today games and future games by start date
  todayGames.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  futureGames.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  // Write the JSON file
  const output = { today: todayGames, future: futureGames };
  fs.writeFileSync('games.json', JSON.stringify(output, null, 2));
  console.log(
    `Gerado games.json com ${todayGames.length} jogos hoje e ${futureGames.length} futuros.`
  );
}

main().catch((err) => {
  console.error('Erro ao executar o script:', err);
});
