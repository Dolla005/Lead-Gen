import { 
  getDb, saveDb, getVideoSamples, updateAccountValidation, 
  insertValidationResult, getAccountsByStatus, getAllAccounts,
  type AccountData
} from '../db/database.js';
import studioBlocklist from '../data/studio-blocklist.json' assert { type: 'json' };

// ============ INDIVIDUAL VALIDATION RULES ============

/**
 * Rule 1: Studio Check
 * Verify the account is NOT affiliated with a production studio, official network, or record label.
 */
export function checkStudio(account: any): { passed: boolean; details: string } {
  const username = (account.username || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const displayName = (account.display_name || '').toLowerCase();
  const description = (account.description || '').toLowerCase();
  
  // 1. Direct username check against studio blocklist
  for (const studio of studioBlocklist.studios) {
    const cleanStudio = studio.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (username === cleanStudio || username.includes(cleanStudio)) {
      return { passed: false, details: `Username matches known studio/network: "${studio}"` };
    }
  }
  
  // 2. Check description for studio / copyright keywords
  for (const keyword of studioBlocklist.studio_keywords_in_description) {
    if (description.includes(keyword.toLowerCase())) {
      return { passed: false, details: `Description contains official studio indicator: "${keyword}"` };
    }
  }
  
  // 3. Display Name Studio Indicators
  // Major studio / official account markers
  const explicitStudioKeywords = [
    'official', 'studios', 'entertainment', 'productions', 'production', 
    'pictures', 'network', 'television', 'records', 'recordings', 'music company',
    'pvt ltd', 'ltd', 'inc', 'corp', 'corporation', 'co. ltd', 'media group'
  ];
  
  for (const kw of explicitStudioKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(displayName)) {
      return { passed: false, details: `Display name "${account.display_name}" contains studio/official keyword: "${kw}"` };
    }
  }
  
  // 4. Verification & Official badge language in description
  if ((description.includes('official') || description.includes('rights reserved')) && 
      (description.includes('channel') || description.includes('page') || description.includes('copyright'))) {
    return { passed: false, details: 'Description indicates official company/studio account' };
  }
  
  return { passed: true, details: 'Not a studio account' };
}

/**
 * Rule 2: Strict Language Check (100% English Only)
 * Checks for non-English Unicode scripts AND Romanized non-English words.
 */
export function checkLanguage(account: any, videoSamples: any[]): { passed: boolean; details: string; needsReview: boolean } {
  const description = (account.description || '');
  const displayName = (account.display_name || '');
  
  // 1. Non-English script patterns (Devanagari, Arabic, Chinese, Japanese, Korean, Cyrillic, etc.)
  const nonEnglishScripts = [
    /[\u0600-\u06FF]{2,}/,  // Arabic
    /[\u0900-\u097F]{2,}/,  // Hindi / Devanagari
    /[\u0980-\u09FF]{2,}/,  // Bengali
    /[\u0A00-\u0A7F]{2,}/,  // Gurmukhi / Punjabi
    /[\u0B00-\u0B7F]{2,}/,  // Oriya
    /[\u0B80-\u0BFF]{2,}/,  // Tamil
    /[\u0C00-\u0C7F]{2,}/,  // Telugu
    /[\u0C80-\u0CFF]{2,}/,  // Kannada
    /[\u0D00-\u0D7F]{2,}/,  // Malayalam
    /[\u0E00-\u0E7F]{2,}/,  // Thai
    /[\u0E80-\u0EFF]{2,}/,  // Lao
    /[\u1000-\u109F]{2,}/,  // Myanmar
    /[\u4E00-\u9FFF]{2,}/,  // Chinese
    /[\u3040-\u309F\u30A0-\u30FF]{2,}/, // Japanese
    /[\uAC00-\uD7AF]{2,}/, // Korean
    /[\u0400-\u04FF]{3,}/,  // Cyrillic (Russian, Ukrainian, etc.)
    /[\u0370-\u03FF]{3,}/,  // Greek
    /[\u1780-\u17FF]{2,}/,  // Khmer
    /[\u10A0-\u10FF]{2,}/,  // Georgian
    /[\u0530-\u058F]{2,}/,  // Armenian
  ];
  
  // Check Channel Description & Name for non-English scripts
  for (const pattern of nonEnglishScripts) {
    if (pattern.test(description)) {
      return { passed: false, needsReview: false, details: 'Channel description contains non-English text — REJECTED' };
    }
    if (pattern.test(displayName)) {
      return { passed: false, needsReview: false, details: 'Channel name contains non-English characters — REJECTED' };
    }
  }
  
  // 2. Romanized Non-English Words (Spanish, Portuguese, Hindi/Hinglish, Tagalog, Indonesian, French, German, Italian, etc.)
  const romanizedNonEnglishKeywords = [
    // Spanish / Portuguese
    /\b(pelicula|peliculas|película|capitulo|capítulo|temporada|escena|escenas|completa|dublado|subtitulado|subtítulos|español|castellano|legendado|dublada)\b/i,
    // Hindi / Indian Romanized
    /\b(hindi|dubbed|bhojpuri|tamil|telugu|kannada|malayalam|marathi|punjabi|bengali|bhai|kahani|trailer official|gaana|song|bhojpuri|south indian)\b/i,
    // French / German / Italian
    /\b(film complet|en français|auf deutsch|subfrançais|subita|film entero|pelicula completa)\b/i,
    // Tagalog / Indonesian
    /\b(sub indo|bahasa|tagalog|filipino|full movie sub indo)\b/i,
  ];
  
  // Check video titles against scripts & Romanized keywords
  let nonEnglishVideoCount = 0;
  let totalChecked = videoSamples.length;
  
  for (const video of videoSamples) {
    const title = video.title || '';
    
    // Check script
    let isNonEnglish = false;
    for (const pattern of nonEnglishScripts) {
      if (pattern.test(title)) {
        isNonEnglish = true;
        break;
      }
    }
    
    // Check Romanized keywords if script passed
    if (!isNonEnglish) {
      for (const kwPattern of romanizedNonEnglishKeywords) {
        if (kwPattern.test(title)) {
          isNonEnglish = true;
          break;
        }
      }
    }
    
    if (isNonEnglish) nonEnglishVideoCount++;
  }
  
  if (nonEnglishVideoCount > 0) {
    return { 
      passed: false, 
      needsReview: false, 
      details: `${nonEnglishVideoCount}/${totalChecked} video titles contain non-English words/scripts — REJECTED` 
    };
  }
  
  return { passed: true, needsReview: false, details: '100% English content verified' };
}

/**
 * Rule 3: Content Type Check (Movie/TV Clips Only)
 * Filters out Sports, Gaming, Music, Vlogs, News, Tutorials, Religion, POV/Memes, Podcasts, etc.
 * Requires 70%+ of videos to be actual Movie or TV Show clips.
 */
export function checkContentType(videoSamples: any[]): { passed: boolean; details: string; needsReview: boolean; validRatio: number } {
  if (videoSamples.length === 0) {
    return { passed: false, needsReview: false, details: 'No video samples to analyze — REJECTED', validRatio: 0 };
  }
  
  // Positive patterns: Movies, TV Shows, Series, Anime clips
  const positivePatterns = [
    /\b(movie|film)\s*(scene|clip|moment|part|edit|shorts?)\b/i,
    /\b(scene|clip|moment)\s*(from|in|of)\b/i,
    /\b(tv|television)\s*(show|series|clip|scene|moment)\b/i,
    /\b(s\d{1,2}e\d{1,2})\b/i, // S01E02
    /\b(season\s*\d+\s*episode\s*\d+)\b/i,
    /\b(part\s*\d|ep\s*\d)\b/i,
    // Movie/TV Titles & Characters
    /\b(breaking\s*bad|better\s*call\s*saul|game\s*of\s*thrones|peaky\s*blinders|stranger\s*things)\b/i,
    /\b(the\s*wire|sopranos|suits|lucifer|squid\s*game|wednesday|ozark|narcos)\b/i,
    /\b(marvel|dc\s*comics|avengers|batman|spider.?man|joker|iron\s*man|thor|hulk)\b/i,
    /\b(john\s*wick|fast\s*.?\s*furious|mission\s*impossible|james\s*bond|007)\b/i,
    /\b(the\s*office|friends|seinfeld|brooklyn\s*nine|how\s*i\s*met|big\s*bang\s*theory)\b/i,
    /\b(harry\s*potter|lord\s*of\s*the\s*rings|hobbit|star\s*wars|matrix)\b/i,
    /\b(shark\s*tank|family\s*feud|americas?\s*got\s*talent|the\s*voice)\b/i,
    /\b(gordon\s*ramsay|kitchen\s*nightmares|hells?\s*kitchen|masterchef)\b/i,
    /\b(top\s*gear|grand\s*tour|graham\s*norton|late\s*night|tonight\s*show)\b/i,
    /\b(spongebob|tom\s*and\s*jerry|simpsons|family\s*guy|south\s*park|rick\s*and\s*morty)\b/i,
    /\b(anime|naruto|dragon\s*ball|one\s*piece|attack\s*on\s*titan|demon\s*slayer|jujutsu)\b/i,
    /\b(cops|body\s*cam|the\s*rookie|law\s*and\s*order|criminal\s*minds|csi)\b/i,
    /\b(godfather|goodfellas|scarface|shawshank|interstellar|inception|titanic|gladiator)\b/i,
    /\b(walking\s*dead|house\s*of\s*cards|black\s*mirror|westworld|handmaid)\b/i,
    /\b(twilight|hunger\s*games|divergent|maze\s*runner|percy\s*jackson)\b/i,
    /\b(transformers|pirates\s*of\s*the\s*caribbean|jurassic|terminator|alien|predator)\b/i,
    /🎬|🎥|🎞️|📽️|🍿|🎭/,
  ];
  
  // Negative patterns: NON-MOVIE content
  const negativePatterns = [
    // Reaction/Commentary
    /\b(reaction|react|reacting|commentary|review|breakdown|analysis|explained|ranking)\b/i,
    /\b(my\s*opinion|i\s*think|imo|unpopular\s*opinion|hot\s*take|tier\s*list|rating)\b/i,
    
    // Sports
    /\b(nba|nfl|ufc|mma|wwe|wrestling|boxing|premier\s*league|champions\s*league|cricket|ipl|football|soccer|basketball|baseball|tennis|formula\s*1|f1)\b/i,
    /\b(highlight|highlights|best\s*plays|top\s*plays|goals?|dunk|touchdown|knockout|match|tournament)\b/i,
    
    // Gaming
    /\b(gameplay|gaming|gamer|playthrough|walkthrough|speedrun|twitch|stream|fortnite|minecraft|gta|call\s*of\s*duty|cod|valorant|league\s*of\s*legends|apex|roblox|pubg|overwatch|elden\s*ring|zelda|pokemon|mario)\b/i,
    
    // Music
    /\b(official\s*(music\s*)?video|music\s*video|mv|lyric\s*video|lyrics|song|album|concert|live\s*performance|tour|remix|cover\s*song|rapper|hip\s*hop|pop\s*music|dj)\b/i,
    
    // News / Politics
    /\b(news|breaking\s*news|politics|political|election|president|congress|cnn|fox\s*news|msnbc|bbc\s*news)\b/i,
    
    // Personal / Vlog / Meme
    /\b(pov|when\s*you|when\s*your|that\s*moment\s*when|vlog|day\s*in\s*my\s*life|grwm|get\s*ready|tutorial|how\s*to|diy|recipe|cooking|unboxing|haul|shopping|asmr|mukbang|motivation|inspirational|prank|challenge)\b/i,
    
    // Religion / Fitness / Tech / Pet
    /\b(sermon|worship|prayer|bible|quran|workout|gym|fitness|yoga|coding|programming|tech\s*review|iphone|android|cute\s*dog|cute\s*cat|pet\s*video)\b/i,
  ];
  
  let validCount = 0;
  let invalidCount = 0;
  let uncertainCount = 0;
  
  for (const video of videoSamples) {
    const title = (video.title || '').toLowerCase();
    const desc = (video.description || '').toLowerCase().substring(0, 300);
    const combined = `${title} ${desc}`;
    
    let isPositive = false;
    let isNegative = false;
    
    // Check negatives FIRST
    for (const pattern of negativePatterns) {
      if (pattern.test(combined)) {
        isNegative = true;
        break;
      }
    }
    
    if (!isNegative) {
      for (const pattern of positivePatterns) {
        if (pattern.test(combined)) {
          isPositive = true;
          break;
        }
      }
    }
    
    if (isNegative) invalidCount++;
    else if (isPositive) validCount++;
    else uncertainCount++;
  }
  
  const total = videoSamples.length;
  const validRatio = validCount / total;
  const invalidRatio = invalidCount / total;
  
  const details = `Movie clips: ${validCount}/${total} (${Math.round(validRatio * 100)}%), Non-movie: ${invalidCount}/${total}, Unidentified: ${uncertainCount}/${total}`;
  
  // Any non-movie content > 20% = FAIL
  if (invalidRatio > 0.2) {
    return { passed: false, needsReview: false, details: `Too much non-movie content. ${details}`, validRatio };
  }
  
  // Require at least 70% confirmed movie clips
  if (validRatio >= 0.7) {
    return { passed: true, needsReview: false, details, validRatio };
  }
  
  // 50-69% valid = Review
  if (validRatio >= 0.5) {
    return { passed: false, needsReview: true, details: `Borderline content ratio. ${details}`, validRatio };
  }
  
  return { passed: false, needsReview: false, details: `Not movie/TV content. ${details}`, validRatio };
}

/**
 * Rule 4: View Performance Check
 */
export function checkViewPerformance(videoSamples: any[]): { passed: boolean; details: string; needsReview: boolean } {
  if (videoSamples.length === 0) {
    return { passed: false, needsReview: false, details: 'No video samples' };
  }
  
  const views = videoSamples.map(v => v.view_count || 0);
  const totalVideos = views.length;
  
  const over100k = views.filter(v => v >= 100000).length;
  const over50k = views.filter(v => v >= 50000).length;
  const over1k = views.filter(v => v >= 1000).length;
  const avgViews = views.reduce((a, b) => a + b, 0) / totalVideos;
  const maxViews = Math.max(...views);
  
  const pct100k = over100k / totalVideos;
  const pct1k = over1k / totalVideos;
  
  const details = `Avg views: ${Math.round(avgViews).toLocaleString()}, Max: ${maxViews.toLocaleString()}, 100k+: ${over100k}/${totalVideos} (${Math.round(pct100k * 100)}%), 1k+: ${over1k}/${totalVideos} (${Math.round(pct1k * 100)}%)`;
  
  if (pct100k >= 0.10) {
    return { passed: true, needsReview: false, details };
  }
  
  if (over50k >= 2 && pct1k >= 0.5) {
    return { passed: true, needsReview: true, details: `Borderline views but active. ${details}` };
  }
  
  if (pct1k < 0.5) {
    return { passed: false, needsReview: false, details: `Low view performance. ${details}` };
  }
  
  return { passed: false, needsReview: true, details: `Below 100k threshold. ${details}` };
}

/**
 * Rule 5: Activity Check
 */
export function checkActivity(videoSamples: any[]): { passed: boolean; details: string } {
  if (videoSamples.length === 0) {
    return { passed: false, details: 'No video samples to check activity' };
  }
  
  const dates = videoSamples
    .map(v => v.published_at)
    .filter(Boolean)
    .map(d => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());
  
  if (dates.length === 0) {
    return { passed: false, details: 'No publish dates found' };
  }
  
  const mostRecentPost = dates[0];
  const now = new Date();
  const daysSinceLastPost = Math.floor((now.getTime() - mostRecentPost.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastPost <= 30) {
    return { passed: true, details: `Last post: ${daysSinceLastPost} days ago (active)` };
  }
  
  if (daysSinceLastPost <= 60) {
    return { passed: true, details: `Last post: ${daysSinceLastPost} days ago (moderately active)` };
  }
  
  if (daysSinceLastPost <= 90) {
    return { passed: false, details: `Last post: ${daysSinceLastPost} days ago (possibly inactive)` };
  }
  
  return { passed: false, details: `Last post: ${daysSinceLastPost} days ago (inactive)` };
}

/**
 * Rule 6: Shorts Format Check
 */
export function checkShortsFormat(videoSamples: any[]): { passed: boolean; details: string } {
  if (videoSamples.length === 0) {
    return { passed: false, details: 'No video samples' };
  }
  
  const shortsCount = videoSamples.filter(v => (v.duration_seconds || 0) <= 61).length;
  const ratio = shortsCount / videoSamples.length;
  
  if (ratio >= 0.5) {
    return { passed: true, details: `${shortsCount}/${videoSamples.length} videos are shorts format` };
  }
  
  return { passed: false, details: `Only ${shortsCount}/${videoSamples.length} videos are shorts format` };
}

/**
 * Rule 7: Channel Relevance Check
 */
export function checkChannelRelevance(account: any): { passed: boolean; details: string } {
  const description = (account.description || '').toLowerCase();
  const displayName = (account.display_name || '').toLowerCase();
  const combined = `${displayName} ${description}`;
  
  const nonMovieChannelPatterns = [
    /\b(gaming|gamer|streamer|twitch|esports)\b/i,
    /\b(music\s*artist|rapper|singer|songwriter|producer|beats)\b/i,
    /\b(news\s*channel|journalist|reporter|breaking\s*news)\b/i,
    /\b(fitness|workout|personal\s*trainer|gym|bodybuilding)\b/i,
    /\b(cooking\s*channel|recipe|chef|food\s*blogger)\b/i,
    /\b(tech\s*channel|tech\s*review|gadget|unboxing)\b/i,
    /\b(beauty|makeup|skincare|fashion\s*blog)\b/i,
    /\b(travel\s*vlog|travel\s*blog|backpacking)\b/i,
    /\b(crypto|bitcoin|trading|forex|stock\s*market|invest)\b/i,
    /\b(motivational\s*speaker|life\s*coach|self\s*improvement)\b/i,
    /\b(sports\s*channel|football|soccer|basketball|cricket)\b/i,
    /\b(car\s*channel|car\s*review|automotive)\b/i,
    /\b(pet\s*channel|cat\s*lover|dog\s*lover|animal)\b/i,
    /\b(podcast|talk\s*show\s*host)\b/i,
  ];
  
  for (const pattern of nonMovieChannelPatterns) {
    if (pattern.test(combined)) {
      return { passed: false, details: `Channel description/name indicates non-movie content: ${pattern.toString()}` };
    }
  }
  
  return { passed: true, details: 'Channel appears movie/TV relevant' };
}

// ============ MAIN VALIDATION PIPELINE ============

export interface ValidationResult {
  accountId: number;
  overallStatus: 'passed' | 'failed' | 'review';
  score: number;
  notes: string;
  ruleResults: {
    rule: string;
    passed: boolean;
    needsReview?: boolean;
    details: string;
  }[];
}

/**
 * Run all validation rules on a single account (STRICT 100% ACCURACY MODE)
 */
export async function validateAccount(account: any): Promise<ValidationResult> {
  const accountId = account.id;
  const videoSamples = getVideoSamples(accountId);
  
  const ruleResults: ValidationResult['ruleResults'] = [];
  let score = 0;
  let failCount = 0;
  let reviewCount = 0;
  let hardFail = false;
  
  // Rule 1: Studio Check (weight: 15)
  const studioResult = checkStudio(account);
  ruleResults.push({ rule: 'studio_check', passed: studioResult.passed, details: studioResult.details });
  insertValidationResult(accountId, 'studio_check', studioResult.passed ? 1 : 0, studioResult.details);
  if (studioResult.passed) score += 15;
  else { failCount++; hardFail = true; }
  
  // Rule 2: Language Check (weight: 20) — 100% English requirement
  const langResult = checkLanguage(account, videoSamples);
  ruleResults.push({ rule: 'language', passed: langResult.passed, needsReview: langResult.needsReview, details: langResult.details });
  insertValidationResult(accountId, 'language', langResult.passed ? 1 : 0, langResult.details);
  if (langResult.passed) score += 20;
  else { failCount++; hardFail = true; }
  
  // Rule 3: Content Type (weight: 25) — Movie clips requirement
  const contentResult = checkContentType(videoSamples);
  ruleResults.push({ rule: 'content_type', passed: contentResult.passed, needsReview: contentResult.needsReview, details: contentResult.details });
  insertValidationResult(accountId, 'content_type', contentResult.passed ? 1 : (contentResult.needsReview ? -1 : 0), contentResult.details);
  if (contentResult.passed && !contentResult.needsReview) score += 25;
  else if (contentResult.needsReview) { reviewCount++; score += 5; }
  else { failCount++; hardFail = true; }
  
  // Rule 4: View Performance (weight: 20)
  const viewResult = checkViewPerformance(videoSamples);
  ruleResults.push({ rule: 'view_performance', passed: viewResult.passed, needsReview: viewResult.needsReview, details: viewResult.details });
  insertValidationResult(accountId, 'view_performance', viewResult.passed ? 1 : (viewResult.needsReview ? -1 : 0), viewResult.details);
  if (viewResult.passed && !viewResult.needsReview) score += 20;
  else if (viewResult.passed && viewResult.needsReview) { score += 10; reviewCount++; }
  else if (viewResult.needsReview) reviewCount++;
  else failCount++;
  
  // Rule 5: Activity (weight: 10)
  const activityResult = checkActivity(videoSamples);
  ruleResults.push({ rule: 'activity', passed: activityResult.passed, details: activityResult.details });
  insertValidationResult(accountId, 'activity', activityResult.passed ? 1 : 0, activityResult.details);
  if (activityResult.passed) score += 10;
  else failCount++;
  
  // Rule 6: Shorts Format (weight: 5)
  const formatResult = checkShortsFormat(videoSamples);
  ruleResults.push({ rule: 'shorts_format', passed: formatResult.passed, details: formatResult.details });
  insertValidationResult(accountId, 'shorts_format', formatResult.passed ? 1 : 0, formatResult.details);
  if (formatResult.passed) score += 5;
  else failCount++;
  
  // Rule 7: Channel Relevance (weight: 5)
  const relevanceResult = checkChannelRelevance(account);
  ruleResults.push({ rule: 'channel_relevance', passed: relevanceResult.passed, details: relevanceResult.details });
  insertValidationResult(accountId, 'channel_relevance', relevanceResult.passed ? 1 : 0, relevanceResult.details);
  if (relevanceResult.passed) score += 5;
  else { failCount++; hardFail = true; }
  
  // ============ OVERALL DECISION ============
  let overallStatus: 'passed' | 'failed' | 'review';
  let notes = '';
  
  if (hardFail) {
    overallStatus = 'failed';
    const failedRules = ruleResults.filter(r => !r.passed).map(r => r.rule);
    notes = `HARD FAIL: ${failedRules.join(', ')}. Score: ${score}/100`;
  }
  else if (failCount >= 2) {
    overallStatus = 'failed';
    notes = `Failed ${failCount} rules: ${ruleResults.filter(r => !r.passed).map(r => r.rule).join(', ')}. Score: ${score}/100`;
  }
  else if (score >= 75 && reviewCount === 0) {
    overallStatus = 'passed';
    notes = `Score: ${score}/100. Verified English Movie Clip Channel.`;
  }
  else if (score >= 60 && reviewCount > 0) {
    overallStatus = 'review';
    notes = `Score: ${score}/100. Needs review: ${ruleResults.filter(r => r.needsReview).map(r => r.rule).join(', ')}`;
  }
  else {
    overallStatus = 'failed';
    notes = `Score too low: ${score}/100. Minimum required: 75`;
  }
  
  updateAccountValidation(accountId, overallStatus, score, notes);
  
  return { accountId, overallStatus, score, notes, ruleResults };
}

/**
 * Validate all pending accounts until 0 pending remain
 */
export async function validateAllPending(): Promise<{ passed: number; failed: number; review: number }> {
  console.log('\n✅ VALIDATION PIPELINE (STRICT MODE)');
  console.log('═'.repeat(50));
  
  let totalPassed = 0, totalFailed = 0, totalReview = 0;
  let batchCount = 0;

  while (true) {
    const pendingAccounts = getAccountsByStatus('pending', 1000);
    if (pendingAccounts.length === 0) break;
    
    batchCount++;
    console.log(`\n📦 Batch ${batchCount}: Processing ${pendingAccounts.length} pending accounts...`);

    for (let i = 0; i < pendingAccounts.length; i++) {
      const account = pendingAccounts[i];
      const result = await validateAccount(account);
      
      if (result.overallStatus === 'passed') totalPassed++;
      else if (result.overallStatus === 'failed') totalFailed++;
      else totalReview++;
      
      const icon = result.overallStatus === 'passed' ? '✅' : result.overallStatus === 'failed' ? '❌' : '⚠️';
      console.log(`${icon} [Batch ${batchCount} | ${i + 1}/${pendingAccounts.length}] ${account.display_name || account.username} — Score: ${result.score}/100 — ${result.overallStatus}`);
    }
    
    saveDb();
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 All validation batches complete:`);
  console.log(`   ✅ Passed: ${totalPassed}`);
  console.log(`   ❌ Failed: ${totalFailed}`);
  console.log(`   ⚠️  Review: ${totalReview}`);
  console.log('═'.repeat(50));
  
  return { passed: totalPassed, failed: totalFailed, review: totalReview };
}

/**
 * Re-validate ALL accounts
 */
export async function revalidateAll(): Promise<{ passed: number; failed: number; review: number }> {
  console.log('\n🔄 RE-VALIDATING ALL ACCOUNTS (STRICT MODE)');
  console.log('═'.repeat(50));
  
  const db = await getDb();
  db.run(`UPDATE accounts SET validation_status = 'pending', validation_score = 0, validation_notes = '', submission_status = 'not_submitted'`);
  db.run(`DELETE FROM validation_results`);
  saveDb();
  
  console.log('Reset all accounts to pending status.\n');
  return validateAllPending();
}
