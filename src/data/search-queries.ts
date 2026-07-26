// Deep search queries - niche, less-competed terms to find untouched accounts
// Organized by category for systematic deep searching

export const HASHTAG_QUERIES = {
  // Primary hashtags (most common - higher competition)
  primary: [
    '#movieclips', '#moviescene', '#moviescenes', '#filmedits',
    '#tvshowclips', '#tvshowscenes', '#movieedit', '#filmedit',
  ],
  
  // Secondary hashtags (less common - medium competition)
  secondary: [
    '#cinematicscenes', '#bestmoviescenes', '#moviemoments', '#iconicscenes',
    '#filmscene', '#filmscenes', '#movieclip', '#tvclip', '#tvclips',
    '#seriesclips', '#showclips', '#moviescenesshorts',
    '#movierecap', '#filmclips', '#cinemascenes',
    '#epicmoviescenes', '#moviefans', '#filmmoments',
  ],
  
  // Deep/niche hashtags (rare - low competition, untouched)
  deep: [
    '#actionscenes', '#fightscenes', '#chasescenes', '#romanticscenes',
    '#funnymovieescenes', '#scarymovieescenes', '#horrorscenes', '#thrillerscenes',
    '#dramascenes', '#emotionalscenes', '#sadmovieescenes',
    '#martialarts', '#swordfight', '#gunfight',
    '#superheroscenes', '#villainscenes', '#villainmoments',
    '#plottwist', '#plottwists', '#mindblowingscenes',
    '#moviequotes', '#iconicquotes', '#bestquotes',
    '#classicmovieescenes', '#90smovies', '#80smovies', '#2000smovies',
    '#animeenglish', '#animedubbed', '#englishanime', '#animescenes',
    '#cartoonclips', '#cartoonscenes', '#spongebobclips', '#familyguy',
    '#realitytv', '#realitytvclips', '#sharktank', '#sharktankclips',
    '#gameshowclips', '#familyfeud', '#familyfeudclips',
    '#talkshowclips', '#latenightclips', '#grahamnorton', '#jimmyfallon',
    '#documentaryclips', '#truecrimeclips', '#natureclips',
    '#topgear', '#topgearclips', '#carshows',
    '#ryangoslingedit', '#cillianmurphyedit', '#homelanderedit',
    '#batmanedit', '#jokeredit', '#peakyblindersedit', '#breakingbadedit',
    '#cinematicedit', '#sigmaedit', '#filmediting', '#movieedits',
  ],
  
  // Genre-specific
  genres: [
    '#comedymovie', '#actionmovie', '#horrormovie', '#romcom',
    '#scifi', '#scifimovie', '#fantasymovie', '#thriller',
    '#drama', '#mystery', '#western', '#warmovie',
    '#crimemovie', '#heist', '#spymovie', '#psychologicalthriller',
    '#neo-noir', '#cyberpunk', '#dystopian',
  ],
};

// Movie/show title searches - search for specific titles to find clip channels
export const TITLE_SEARCHES = {
  // Highly clipped movies (fan favorites)
  popular_movies: [
    'breaking bad scene', 'game of thrones scene', 'peaky blinders scene',
    'the dark knight scene', 'interstellar scene', 'inception scene',
    'avengers scene', 'iron man scene', 'spider-man scene',
    'john wick scene', 'fast and furious scene', 'rocky scene',
    'godfather scene', 'scarface scene', 'goodfellas scene',
    'pulp fiction scene', 'fight club scene', 'shawshank scene',
    'joker scene', 'batman scene', 'superman scene',
    'harry potter scene', 'lord of the rings scene', 'hobbit scene',
    'star wars scene', 'mandalorian scene',
    'stranger things scene', 'wednesday scene', 'squid game scene',
    'money heist scene', 'narcos scene', 'ozark scene',
    'succession scene', 'suits scene', 'better call saul scene',
    'the office scene', 'friends scene', 'seinfeld scene',
    'how i met your mother scene', 'brooklyn nine nine scene',
    'the walking dead scene', 'vikings scene', 'last of us scene',
    'house of cards scene', 'power scene', 'snowfall scene',
    'top gun scene', 'mission impossible scene', 'james bond scene',
    'transformers scene', 'pirates of the caribbean scene',
  ],
  
  // Deep Cult & Niche Titles (less competition, untouched channels)
  niche_titles: [
    'drive 2011 scene', 'taxi driver scene', 'american psycho scene',
    'nightcrawler scene', 'blade runner 2049 scene', 'oppenheimer scene',
    'dune 2021 scene', 'dune part two scene', 'the batman 2022 scene',
    'everything everywhere all at once scene', 'whiplash scene',
    'no country for old men scene', 'sicario scene', 'there will be blood scene',
    'prison break scene', 'dexter scene', 'homeland scene',
    'boardwalk empire scene', 'the wire scene', 'sopranos scene',
    'true detective scene', 'fargo scene', 'mindhunter scene',
    'hannibal scene', 'sherlock scene', 'luther scene',
    'black mirror scene', 'westworld scene', 'altered carbon scene',
    'the boys scene', 'invincible scene', 'umbrella academy scene',
    'cobra kai scene', 'karate kid scene', 'gladiator scene',
    'braveheart scene', '300 scene', 'troy scene', 'kingdom of heaven scene',
    'taken scene', 'equalizer scene', 'man on fire scene',
    'gran torino scene', 'a few good men scene',
    'wolf of wall street scene', 'big short scene', 'social network scene',
    'hell or high water scene', 'wind river scene',
    'yellowstone scene', 'reacher scene', 'jack ryan scene',
    'severance hbo scene', 'shogun 2024 scene', 'fallout tv show scene',
    'house of the dragon scene', 'the bear fx scene', 'atlanta fx scene',
    'peacemaker hbo scene', 'chernobyl hbo scene', 'mr robot scene',
    'fleabag scene', 'silicon valley scene',
    'spongebob scene', 'tom and jerry scene', 'family guy scene',
    'south park scene', 'simpsons scene', 'american dad scene',
    'rick and morty scene', 'futurama scene',
    'family feud scene', 'shark tank scene', 'dragons den scene',
    'gordon ramsay scene', 'kitchen nightmares scene', 'hells kitchen scene',
    'graham norton scene', 'jimmy fallon scene', 'conan scene',
    'top gear scene', 'grand tour scene',
  ],
  
  // Actor / Character Edits (Deep untouched channels)
  character_edits: [
    'cillian murphy shorts edit', 'ryan gosling shorts edit', 'christian bale shorts edit',
    'jake gyllenhaal edit', 'willem dafoe monologue', 'margot robbie scene',
    'florence pugh scene', 'ana de armas scene', 'leonardo dicaprio speech',
    'bryan cranston acting', 'antony starr homelander edit', 'pedro pascal scene',
    'mad mikkelsen scene', 'willem dafoe laughing', 'heath ledger joker edit',
    'tom hardy scene', 'keanu reaves edit', 'matthew mcconaughey scene',
  ],
  
  // Content type searches
  content_types: [
    'best movie scenes shorts', 'iconic movie moments',
    'movie clip shorts', 'tv show clip shorts',
    'best tv scenes', 'emotional movie scenes',
    'funny movie scenes', 'action movie scenes',
    'villain scenes', 'hero scenes', 'boss fight scene',
    'best anime fights english dub', 'anime english dub scene',
    'cartoon funny moments', 'reality tv best moments',
    'talk show funny moments', 'game show funny moments',
  ],
};

// YouTube-specific search operators for deep discovery
export const YOUTUBE_SEARCH_STRATEGIES = [
  { type: 'shorts_hashtag', prefix: '#Shorts ' },
  { type: 'channel_search', suffix: ' clips channel' },
  { type: 'recent', filter: 'EgQIAxAB' }, // Last hour filter
  { type: 'today', filter: 'EgQIAhAB' }, // Today filter  
  { type: 'this_week', filter: 'EgQIAxAB' }, // This week filter
];

export const SEED_CHANNELS_YOUTUBE = [
  'movie clips shorts', 'best movie scenes', 'film scenes shorts',
  'tv clips', 'movie edits', 'cinema scenes',
];

export function getRandomQueries(count: number = 15): string[] {
  const all = [
    ...HASHTAG_QUERIES.primary,
    ...HASHTAG_QUERIES.secondary,
    ...HASHTAG_QUERIES.deep,
    ...HASHTAG_QUERIES.genres,
  ];
  
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function getRandomTitleSearches(count: number = 15): string[] {
  const all = [
    ...TITLE_SEARCHES.popular_movies,
    ...TITLE_SEARCHES.niche_titles,
    ...TITLE_SEARCHES.character_edits,
    ...TITLE_SEARCHES.content_types,
  ];
  
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function getAllSearchQueries(): string[] {
  return [
    ...HASHTAG_QUERIES.primary,
    ...HASHTAG_QUERIES.secondary,
    ...HASHTAG_QUERIES.deep,
    ...HASHTAG_QUERIES.genres,
    ...TITLE_SEARCHES.popular_movies,
    ...TITLE_SEARCHES.niche_titles,
    ...TITLE_SEARCHES.character_edits,
    ...TITLE_SEARCHES.content_types,
  ];
}
