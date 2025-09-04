const fs = require('fs');
// Utilize node-fetch dinamicamente para compatibilidade com CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

// Ligas a serem consultadas: Brasileirão Série A, competições relevantes
// e algumas das principais ligas mundiais para clubes populares
const leagues = [
  'bra.1',                     // Campeonato Brasileiro Série A
  'bra.copa_do_brazil',        // Copa do Brasil
  'conmebol.libertadores',     // CONMEBOL Libertadores
  'conmebol.sudamericana',     // CONMEBOL Sudamericana
  
    
'conmebol.recopa',        // Recopa Sul-Americana
'bra.camp.carioca',       // Campeonato Carioca (Rio de Janeiro)
'bra.camp.paulista',      // Campeonato Paulista (S\u00e3o Paulo)
'bra.camp.gaucho',        // Campeonato Ga\u00facho (Rio Grande do Sul)
'bra.camp.mineiro',       // Campeonato Mineiro (Minas Gerais)
'bra.copa_do_nordeste',   // Copa do Nordeste
'fifa.cwc',               // Mundial de Clubes da FIFA// Mundial de Clubes da FIFA
  // Ligas europeias populares
  'esp.1',                     // La Liga (Espanha)
  'eng.1',                     // Premier League (Inglaterra)
  'ita.1',                     // Serie A (Itália)
  'ger.1',                     // Bundesliga (Alemanha)
    'fifa.friendly',       // Amistosos de seleções
  'fifa.friendly.w',     // Amistosos de seleções femininas

    'conmebol.copa_america',    // Copa América
  'conmebol.copa_america.w',  // Copa América Feminina
  'uefa.euro',                // Eurocopa
  'uefa.euro.w',              // Eurocopa Feminina
  'uefa.nations',             // Nations League
  'conmebol.worldcup_qualifiers', // Eliminatórias CONMEBOL
  'concacaf.worldcup_qualifiers', // Eliminatórias CONCACAF
  'uefa.worldcup_qualifiers',     // Eliminatórias UEFA
  'caf.worldcup_qualifiers',      // Eliminatórias CAF (África)
  'afc.worldcup_qualifiers',      // Eliminatórias AFC (Ásia)
  'ofc.worldcup_qualifiers',      // Eliminatórias OFC (Oceania)
  'fifa.worldcup',                // Copa do Mundo
  'fifa.worldcup.w',              // Copa do Mundo Feminina

  
  'fra.1',                     // Ligue 1 (França)
  // Competições continentais europeias
  'uefa.champions',            // UEFA Champions League
  'uefa.europa'               // UEFA Europa League
];

// Função para normalizar nomes (remover acentuação e deixar minúsculo)
function normalizeName(name) {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

// Lista de clubes populares mundialmente para exibir suas partidas independentemente da liga
const popularTeams = [
  // Inglaterra / Premier League
  'Manchester United', 'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
  // Espanha / La Liga
  'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Sevilla', 'Valencia',
  // Alemanha / Bundesliga
  'Bayern München', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
  // Itália / Serie A
  'Juventus', 'Inter', 'AC Milan', 'Roma', 'Napoli',
  // França / Ligue 1
  'Paris Saint-Germain', 'Marseille', 'Lyon',
  // Portugal / Primeira Liga (para efeitos de Champions/Europa)
  'Benfica', 'Porto', 'Sporting CP',
  // Holanda / Eredivisie
  'Ajax', 'PSV',
  // Outras equipes sul-americanas populares
  'Boca Juniors', 'River Plate', 'Nacional', 'Peñarol',
  // Seleções nacionais populares (masculinas e femininas)
  'Brazil','Argentina','France','Germany','Spain','England','Italy','Portugal','Netherlands','Uruguay',
  'Brazil W','Argentina W','France W','Germany W','Spain W','England W','Italy W','Portugal W','Netherlands W','Uruguay W'

];

// Dinamicamente busca a lista de times da Série A para a temporada atual.
async function fetchSerieATeams() {
  try {
    const url = 'https://sports.core.api.espn.com/v2/sports/soccer/leagues/bra.1/teams?lang=en&region=us';
    const resp = await fetch(url);
    const list = await resp.json();
    const refs = list.items?.map(item => item.$ref) || [];
    // Carrega detalhes de cada time para obter displayName ou name.
    const teamPromises = refs.map(async (ref) => {
      try {
        const data = await fetch(ref).then(r => r.json());
        return data.displayName || data.name || null;
      } catch (e) {
        return null;
      }
    });
    const names = (await Promise.all(teamPromises)).filter(Boolean);
    return names;
  } catch (err) {
    return [];
  }
}

async function main() {
  const now = new Date();
  // Data formatada como YYYYMMDD no fuso America/Bahia
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(now).replace(/-/g, '');
  // Obtém lista dinâmica de times da Série A; se falhar, usa lista estática como fallback.
  const dynamicTeams = await fetchSerieATeams();
  const fallbackTeams = [
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
  const serieAList = dynamicTeams.length ? dynamicTeams : fallbackTeams;
  const serieASet = new Set(serieAList.map(n => normalizeName(n)));
  const popularSet = new Set(popularTeams.map(n => normalizeName(n)));
  let allGames = [];
  let futureGames = [];
  // Quantos dias no fu7uro buscar quando não houver jogos hoje
  const DAYS_AHEAD = 7;
  
  
  
  
  
  // Para cada liga, buscamos jogos de hoje e próximos dias
  for (const slug of leagues) {
    for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
      // Calcula a data consultada
      const dateObj = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia' }));
      dateObj.setDate(dateObj.getDate() + offset);
      const dateStrOffset = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(dateObj).replace(/-/g, '');
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateStrOffset}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`Erro ao buscar ${slug} em ${dateStrOffset}: ${resp.statusText}`);
          continue;
        }
        const data = await resp.json();
        const events = data.events || [];
        for (const event of events) {
          const competitions = event.competitions || [];
          if (competitions.length === 0) continue;
          const comp = competitions[0];
          const competitors = comp.competitors || [];
          // Filtra partidas envolvendo ao menos um time da Série A ou um time popular
          const hasSerieATeam = competitors.some(c => serieASet.has(normalizeName(c.team.displayName)));
          const hasPopularTeam = competitors.some(c => popularSet.has(normalizeName(c.team.displayName)));
          if (!hasSerieATeam && !hasPopularTeam) continue;
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
          // Nome da competição
          let compName = '';
          if (event.leagues && event.leagues.length > 0) {
            compName = event.leagues[0].name || event.leagues[0].abbreviation || '';
          }
          // Canal de transmissão (broadcast)
          let broadcast = '';
          let broadcasts = [];
          if (Array.isArray(comp.broadcasts) && comp.broadcasts.length > 0) {
            broadcasts = comp.broadcasts;
          } else if (Array.isArray(event.broadcasts) && event.broadcasts.length > 0) {
            broadcasts = event.broadcasts;
          }
          if (broadcasts.length > 0) {
            for (const b of broadcasts) {
              let name = '';
              if (b.media && (b.media.shortName || b.media.name)) {
                name = b.media.shortName || b.media.name;
              } else if (Array.isArray(b.names) && b.names.length > 0) {
                name = b.names[0];
              } else if (b.shortName || b.name) {
                name = b.shortName || b.name;
              }
              if (typeof name === 'string' && name.trim()) {
                broadcast = name.trim();
                break;
              }
            }
            if (broadcast.includes('/')) {
              broadcast = broadcast.split('/')[0].trim();
            }
          }
          const startDate = comp.date || event.date;
          const matchObj = {
            startDate,
            home: homeName,
            away: awayName,
            homeLogo,
            awayLogo,
            competition: compName,
            broadcast
          };
          if (offset === 0) {
            allGames.push(matchObj);
          } else {
            futureGames.push(matchObj);
          }
        }
      } catch (err) {
        console.error(`Erro ao obter dados de ${slug} em ${dateStrOffset}:`, err.message);
      }
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
            competition: 'Brasileirão Série A',
            broadcast: '' // Sofascore não fornece informações de transmissão
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
  // Gera saída com jogos de hoje e futuros
  const output = { today: allGames, future: futureGames };
  fs.writeFileSync('games.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`Gerado games.json com ${allGames.length} partidas hoje e ${futureGames.length} futuras.`);
}

main().catch(err => {
  console.error('Falha ao gerar games.json:', err);
  process.exit(1);
});
