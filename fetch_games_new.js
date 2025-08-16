const fs = require('fs');
// Utilize node-fetch dinamicamente para compatibilidade com CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

// Ligas a serem consultadas: Brasileirão Série A e competições relevantes
const leagues = [
  'bra.1',                     // Campeonato Brasileiro Série A
  'bra.copa_do_brazil',        // Copa do Brasil
  'conmebol.libertadores',     // CONMEBOL Libertadores
  'conmebol.sudamericana',     // CONMEBOL Sudamericana
  'conmebol.recopa',           // Recopa Sul-Americana
  'fifa.cwc'                   // Mundial de Clubes da FIFA
];

// Lista de times da Série A 2025 (nomes com e sem acentuação/abreviações)
const serieATeams = [
  'Atlético Mineiro','Atletico Mineiro',
  'Bahia',
  'Botafogo',
  'Ceará','Ceara',
  'Corinthians',
  'Cruzeiro',
  'Flamengo',
  'Fluminense',
  'Fortaleza',
  'Grêmio','Gremio',
  'Internacional',
  'Juventude',
  'Mirassol',
  'Palmeiras',
  'Red Bull Bragantino','RB Bragantino','Bragantino',
  'Santos',
  'São Paulo','Sao Paulo',
  'Sport','Sport Recife',
  'Vasco da Gama','Vasco',
  'Vitória','Vitoria'
];

// Função para normalizar nomes (remover acentuação e deixar minúsculo)
function normalizeName(name) {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
const serieASet = new Set(serieATeams.map(n => normalizeName(n)));

async function main() {
  const now = new Date();
  // Data formatada como YYYYMMDD no fuso America/Bahia
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(now).replace(/-/g, '');
  let allGames = [];
  for (const slug of leagues) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStr}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Erro ao buscar ${slug}: ${resp.statusText}`);
        continue;
      }
      const data = await resp.json();
      const events = data.events || [];
      for (const event of events) {
        const competitions = event.competitions || [];
        if (competitions.length === 0) continue;
        const comp = competitions[0];
        const competitors = comp.competitors || [];
        // Filtra somente partidas envolvendo ao menos um time da Série A
        const hasSerieATeam = competitors.some(c => serieASet.has(normalizeName(c.team.displayName)));
        if (!hasSerieATeam) continue;
        // Identifica mandante e visitante
        const homeComp = competitors.find(c => c.homeAway === 'home');
        const awayComp = competitors.find(c => c.homeAway === 'away');
        const homeName = homeComp ? homeComp.team.displayName : '';
        const awayName = awayComp ? awayComp.team.displayName : '';
        // Logos: usa propriedade logos array ou logo direto se existir
        const homeLogo = homeComp && homeComp.team
          ? (homeComp.team.logo || (homeComp.team.logos && homeComp.team.logos[0] && homeComp.team.logos[0].href) || '')
          : '';
        const awayLogo = awayComp && awayComp.team
          ? (awayComp.team.logo || (awayComp.team.logos && awayComp.team.logos[0] && awayComp.team.logos[0].href) || '')
          : '';
        // Nome da competição: primeiro league name ou slug
        let compName = '';
        if (event.leagues && event.leagues.length > 0) {
          compName = event.leagues[0].name || event.leagues[0].abbreviation || '';
        }
        const startDate = comp.date || event.date;
        allGames.push({
          startDate,
          home: homeName,
          away: awayName,
          homeLogo,
          awayLogo,
          competition: compName
        });
      }
    } catch (err) {
      console.error(`Erro ao obter dados de ${slug}:`, err.message);
    }
  }
  // Caso nenhuma partida seja obtida via ESPN, tenta fallback usando Sofascore apenas para Série A
  if (allGames.length === 0) {
    console.log('Nenhuma partida encontrada via ESPN, tentando fallback Sofascore...');
    try {
      const dateDash = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(now); // YYYY-MM-DD
      const urlSf = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${dateDash}`;
      const resSf = await fetch(urlSf);
      if (resSf.ok) {
        const dataSf = await resSf.json();
        const events = dataSf.events || [];
        events.forEach(ev => {
          // Filtra apenas Brasileirão Série A (uniqueTournament.id = 325)
          const tId = ev.tournament?.uniqueTournament?.id || ev.tournament?.id;
          if (tId !== 325) return;
          // Usa startTimestamp (segundos) para montar ISO
          const startDateIso = new Date((ev.startTimestamp || 0) * 1000).toISOString();
          const homeName = ev.homeTeam?.name || '';
          const awayName = ev.awayTeam?.name || '';
          allGames.push({
            startDate: startDateIso,
            home: homeName,
            away: awayName,
            homeLogo: '',
            awayLogo: '',
            competition: 'Brasileirão Série A'
          });
        });
        console.log(`Fallback Sofascore adicionou ${allGames.length} partidas.`);
      } else {
        console.error('Falha no fallback Sofascore:', resSf.statusText);
      }
    } catch (err) {
      console.error('Erro ao consultar Sofascore:', err.message);
    }
  }
  // Escreve o arquivo JSON com lista de partidas
  fs.writeFileSync('games.json', JSON.stringify(allGames, null, 2), 'utf8');
  console.log(`Gerado games.json com ${allGames.length} partidas.`);
}

main().catch(err => {
  console.error('Falha ao gerar games.json:', err);
  process.exit(1);
});
