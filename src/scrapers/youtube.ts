import dotenv from 'dotenv';
import { 
  insertAccount, accountExists, insertVideoSample, 
  logSearch, hasSearchedRecently, getDb, saveDb,
  type AccountData, type VideoSampleData 
} from '../db/database.js';
import { 
  HASHTAG_QUERIES, TITLE_SEARCHES, 
  getRandomQueries, getRandomTitleSearches 
} from '../data/search-queries.js';

dotenv.config();

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// Rate limiting
let apiCallCount = 0;
const MAX_DAILY_CALLS = 9500; // Stay under 10k free tier
const DELAY_BETWEEN_CALLS_MS = 200; // Be nice to the API

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ytApiCall(endpoint: string, params: Record<string, string>): Promise<any> {
  if (!API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set in .env file! Get one free at https://console.cloud.google.com/apis/credentials');
  }
  
  if (apiCallCount >= MAX_DAILY_CALLS) {
    console.log('⚠️  Daily API quota nearly reached. Stopping to preserve quota.');
    return null;
  }
  
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  
  await sleep(DELAY_BETWEEN_CALLS_MS);
  apiCallCount++;
  
  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.json();
      console.error(`YouTube API error: ${response.status}`, error?.error?.message || '');
      if (response.status === 403) {
        console.error('🚫 API quota exceeded or key invalid. Check your YOUTUBE_API_KEY.');
      }
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error('Network error calling YouTube API:', (err as Error).message);
    return null;
  }
}

// ============ DISCOVERY METHODS ============

/**
 * Search YouTube Shorts by query and extract unique channels with deep pagination
 */
export async function searchShortsByQuery(query: string, maxResults: number = 200, order: string = 'relevance'): Promise<string[]> {
  console.log(`🔍 Deep Searching: "${query}" (order: ${order}, max: ${maxResults})`);
  
  const channelIds = new Set<string>();
  let nextPageToken: string | undefined;
  let totalFetched = 0;
  
  while (totalFetched < maxResults) {
    const params: Record<string, string> = {
      part: 'snippet',
      q: query,
      type: 'video',
      videoDuration: 'short',
      maxResults: '50',
      order: order,
    };
    
    if (nextPageToken) {
      params.pageToken = nextPageToken;
    }
    
    const data = await ytApiCall('search', params);
    if (!data || !data.items || data.items.length === 0) break;
    
    for (const item of data.items) {
      const channelId = item.snippet?.channelId;
      if (channelId) {
        channelIds.add(channelId);
      }
    }
    
    totalFetched += data.items.length;
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }
  
  logSearch('youtube', `search_${order}`, query, channelIds.size);
  console.log(`   Found ${channelIds.size} unique channels across ${Math.ceil(totalFetched / 50)} page(s)`);
  return Array.from(channelIds);
}

/**
 * Search specifically for channels (not videos) posting movie clips
 */
export async function searchChannels(query: string, maxResults: number = 25): Promise<string[]> {
  console.log(`🔍 Channel search: "${query}"`);
  
  const channelIds = new Set<string>();
  
  const params: Record<string, string> = {
    part: 'snippet',
    q: query,
    type: 'channel',
    maxResults: String(Math.min(maxResults, 50)),
  };
  
  const data = await ytApiCall('search', params);
  if (!data || !data.items) return [];
  
  for (const item of data.items) {
    const channelId = item.snippet?.channelId || item.id?.channelId;
    if (channelId) channelIds.add(channelId);
  }
  
  logSearch('youtube', 'channel_search', query, channelIds.size);
  console.log(`   Found ${channelIds.size} channels`);
  return Array.from(channelIds);
}

/**
 * Get channel details (stats, description, handle)
 */
export async function getChannelDetails(channelIds: string[]): Promise<any[]> {
  const channels: any[] = [];
  
  // API allows up to 50 channel IDs per request
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const data = await ytApiCall('channels', {
      part: 'snippet,statistics,contentDetails,brandingSettings',
      id: batch.join(','),
    });
    
    if (data?.items) {
      channels.push(...data.items);
    }
  }
  
  return channels;
}

/**
 * Get recent videos/shorts from a channel for sampling
 */
export async function getChannelVideos(channelId: string, maxResults: number = 15): Promise<any[]> {
  // First get the uploads playlist ID
  const channelData = await ytApiCall('channels', {
    part: 'contentDetails',
    id: channelId,
  });
  
  if (!channelData?.items?.[0]) return [];
  
  const uploadsPlaylistId = channelData.items[0].contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];
  
  // Get recent videos from uploads playlist
  const videos: any[] = [];
  let nextPageToken: string | undefined;
  
  while (videos.length < maxResults) {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(maxResults - videos.length, 50)),
    };
    if (nextPageToken) params.pageToken = nextPageToken;
    
    const data = await ytApiCall('playlistItems', params);
    if (!data?.items || data.items.length === 0) break;
    
    videos.push(...data.items);
    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }
  
  return videos;
}

/**
 * Get video statistics (views, likes, comments) for a batch of video IDs
 */
export async function getVideoStats(videoIds: string[]): Promise<Map<string, any>> {
  const statsMap = new Map<string, any>();
  
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const data = await ytApiCall('videos', {
      part: 'statistics,contentDetails,snippet',
      id: batch.join(','),
    });
    
    if (data?.items) {
      for (const item of data.items) {
        statsMap.set(item.id, {
          viewCount: parseInt(item.statistics?.viewCount || '0'),
          likeCount: parseInt(item.statistics?.likeCount || '0'),
          commentCount: parseInt(item.statistics?.commentCount || '0'),
          duration: item.contentDetails?.duration || '',
          title: item.snippet?.title || '',
          description: item.snippet?.description || '',
          publishedAt: item.snippet?.publishedAt || '',
        });
      }
    }
  }
  
  return statsMap;
}

/**
 * Parse ISO 8601 duration to seconds
 */
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) + 
         (parseInt(match[2] || '0') * 60) + 
         (parseInt(match[3] || '0'));
}

/**
 * Extract the best available username/handle from channel data
 */
function extractUsername(channel: any): string {
  // Priority: customUrl (@handle) > snippet title > channel ID
  const customUrl = channel.snippet?.customUrl;
  if (customUrl) {
    // Remove @ prefix if present
    return customUrl.startsWith('@') ? customUrl.substring(1) : customUrl;
  }
  return channel.id;
}

/**
 * Build profile URL from channel data
 */
function buildProfileUrl(channel: any): string {
  const customUrl = channel.snippet?.customUrl;
  if (customUrl) {
    return `https://www.youtube.com/${customUrl}`;
  }
  return `https://www.youtube.com/channel/${channel.id}`;
}

// ============ MAIN DISCOVERY PIPELINE ============

/**
 * Process discovered channel IDs: fetch details, check duplicates, save to DB
 */
export async function processChannels(channelIds: string[], discoveryMethod: string, discoveryQuery: string): Promise<number> {
  let newAccountsCount = 0;
  
  // Filter out already-known channels
  const newChannelIds = channelIds.filter(id => !accountExists('youtube', id));
  
  if (newChannelIds.length === 0) {
    console.log('   All channels already in database');
    return 0;
  }
  
  console.log(`   Processing ${newChannelIds.length} new channels...`);
  
  // Fetch channel details
  const channels = await getChannelDetails(newChannelIds);
  
  for (const channel of channels) {
    const username = extractUsername(channel);
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || '0');
    const videoCount = parseInt(channel.statistics?.videoCount || '0');
    
    // Skip channels with 0 videos
    if (videoCount === 0) continue;
    
    const accountData: AccountData = {
      platform: 'youtube',
      platform_id: channel.id,
      username,
      display_name: channel.snippet?.title || '',
      profile_url: buildProfileUrl(channel),
      follower_count: subscriberCount,
      video_count: videoCount,
      description: (channel.snippet?.description || '').substring(0, 1000),
      discovery_method: discoveryMethod,
      discovery_query: discoveryQuery,
    };
    
    const accountId = insertAccount(accountData);
    if (accountId) {
      newAccountsCount++;
      
      // Fetch and save video samples for this channel
      await sampleChannelVideos(accountId, channel.id);
    }
  }
  
  console.log(`   ✅ Added ${newAccountsCount} new accounts`);
  return newAccountsCount;
}

/**
 * Sample recent videos from a channel and save to DB
 */
async function sampleChannelVideos(accountId: number, channelId: string) {
  const videos = await getChannelVideos(channelId, 15);
  if (videos.length === 0) return;
  
  // Get video IDs
  const videoIds = videos
    .map((v: any) => v.snippet?.resourceId?.videoId || v.contentDetails?.videoId)
    .filter(Boolean);
  
  if (videoIds.length === 0) return;
  
  // Get stats for all videos at once
  const statsMap = await getVideoStats(videoIds);
  
  for (const videoId of videoIds) {
    const stats = statsMap.get(videoId);
    if (!stats) continue;
    
    const durationSeconds = parseDuration(stats.duration);
    
    // Only save shorts (under 61 seconds)
    if (durationSeconds > 0 && durationSeconds <= 61) {
      const sampleData: VideoSampleData = {
        account_id: accountId,
        video_id: videoId,
        video_url: `https://www.youtube.com/shorts/${videoId}`,
        title: stats.title,
        description: (stats.description || '').substring(0, 500),
        view_count: stats.viewCount,
        like_count: stats.likeCount,
        comment_count: stats.commentCount,
        published_at: stats.publishedAt,
        duration_seconds: durationSeconds,
      };
      
      insertVideoSample(sampleData);
    }
  }
}

// ============ DEEP DISCOVERY STRATEGIES ============

/**
 * Strategy 1: Hashtag-based discovery (primary, secondary, deep, genre)
 */
export async function discoverByHashtags(depth: 'primary' | 'secondary' | 'deep' | 'genres' | 'all' = 'all'): Promise<number> {
  console.log('\n🏷️  HASHTAG DISCOVERY');
  console.log('═'.repeat(50));
  
  let queries: string[];
  if (depth === 'all') {
    queries = [
      ...HASHTAG_QUERIES.primary,
      ...HASHTAG_QUERIES.secondary,
      ...HASHTAG_QUERIES.deep,
      ...HASHTAG_QUERIES.genres,
    ];
  } else {
    queries = HASHTAG_QUERIES[depth];
  }
  
  let totalNew = 0;
  
  for (const query of queries) {
    // Skip if we've searched this recently
    if (hasSearchedRecently('youtube', query, 12)) {
      console.log(`   ⏭️  Skipping "${query}" (searched recently)`);
      continue;
    }
    
    if (apiCallCount >= MAX_DAILY_CALLS) {
      console.log('⚠️  API quota limit reached. Stopping.');
      break;
    }
    
    const channelIds = await searchShortsByQuery(query, 50);
    const newCount = await processChannels(channelIds, 'hashtag', query);
    totalNew += newCount;
  }
  
  console.log(`\n📊 Hashtag discovery complete: ${totalNew} new accounts found`);
  return totalNew;
}

/**
 * Strategy 2: Title-based discovery (search specific movie/show names)
 */
export async function discoverByTitles(category: 'popular' | 'niche' | 'content_types' | 'all' = 'all'): Promise<number> {
  console.log('\n🎬 TITLE-BASED DISCOVERY');
  console.log('═'.repeat(50));
  
  let queries: string[];
  if (category === 'all') {
    queries = [
      ...TITLE_SEARCHES.popular_movies,
      ...TITLE_SEARCHES.niche_titles,
      ...TITLE_SEARCHES.content_types,
    ];
  } else if (category === 'popular') {
    queries = TITLE_SEARCHES.popular_movies;
  } else if (category === 'niche') {
    queries = TITLE_SEARCHES.niche_titles;
  } else {
    queries = TITLE_SEARCHES.content_types;
  }
  
  let totalNew = 0;
  
  for (const query of queries) {
    if (hasSearchedRecently('youtube', query, 12)) {
      console.log(`   ⏭️  Skipping "${query}" (searched recently)`);
      continue;
    }
    
    if (apiCallCount >= MAX_DAILY_CALLS) {
      console.log('⚠️  API quota limit reached. Stopping.');
      break;
    }
    
    const channelIds = await searchShortsByQuery(query, 50);
    const newCount = await processChannels(channelIds, 'title_search', query);
    totalNew += newCount;
  }
  
  console.log(`\n📊 Title discovery complete: ${totalNew} new accounts found`);
  return totalNew;
}

/**
 * Strategy 3: Channel-based discovery (find channels directly)
 */
export async function discoverChannels(): Promise<number> {
  console.log('\n📺 CHANNEL DISCOVERY');
  console.log('═'.repeat(50));
  
  const channelQueries = [
    'movie clips shorts', 'movie scenes channel', 'film clips shorts',
    'tv show clips channel', 'movie edits shorts', 'cinema scenes',
    'best movie moments', 'iconic scenes shorts', 'movie clip compilations',
    'tv series clips', 'anime scenes english', 'cartoon clips channel',
    'reality tv clips', 'talk show clips', 'game show clips',
    'documentary clips shorts', 'horror movie scenes', 'action scenes shorts',
    'comedy movie clips', 'thriller scenes', 'drama scenes shorts',
  ];
  
  let totalNew = 0;
  
  for (const query of channelQueries) {
    if (hasSearchedRecently('youtube', `ch:${query}`, 24)) {
      console.log(`   ⏭️  Skipping channel search "${query}" (searched recently)`);
      continue;
    }
    
    if (apiCallCount >= MAX_DAILY_CALLS) break;
    
    const channelIds = await searchChannels(query, 25);
    const newCount = await processChannels(channelIds, 'channel_search', query);
    totalNew += newCount;
    logSearch('youtube', 'channel_search', `ch:${query}`, channelIds.length);
  }
  
  console.log(`\n📊 Channel discovery complete: ${totalNew} new accounts found`);
  return totalNew;
}

/**
 * Strategy 4: Related channel chaining
 * Find channels related to known good channels
 */
export async function discoverRelatedChannels(): Promise<number> {
  console.log('\n🔗 RELATED CHANNEL DISCOVERY');
  console.log('═'.repeat(50));
  
  const db = await getDb();
  // Get existing validated channels to use as seeds
  const stmt = db.prepare(`
    SELECT platform_id FROM accounts 
    WHERE platform = 'youtube' AND validation_status = 'passed' 
    ORDER BY validation_score DESC LIMIT 20
  `);
  
  const seedChannels: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    seedChannels.push(row.platform_id as string);
  }
  stmt.free();
  
  if (seedChannels.length === 0) {
    console.log('   No validated seed channels yet. Run hashtag/title discovery first.');
    return 0;
  }
  
  let totalNew = 0;
  
  for (const seedChannelId of seedChannels) {
    if (apiCallCount >= MAX_DAILY_CALLS) break;
    
    // Get channel name to use as search seed
    const channelData = await getChannelDetails([seedChannelId]);
    if (!channelData[0]) continue;
    
    const channelName = channelData[0].snippet?.title || '';
    console.log(`   Chaining from: ${channelName}`);
    
    // Search for similar channels
    const relatedIds = await searchShortsByQuery(`${channelName} movie clips`, 30);
    const newCount = await processChannels(relatedIds, 'related_chain', channelName);
    totalNew += newCount;
  }
  
  console.log(`\n📊 Related discovery complete: ${totalNew} new accounts found`);
  return totalNew;
}

/**
 * Strategy 5: Random deep search with shuffled queries
 * Uses randomized combinations to find untapped accounts
 */
export async function discoverRandom(queryCount: number = 20): Promise<number> {
  console.log('\n🎲 RANDOM DEEP DISCOVERY');
  console.log('═'.repeat(50));
  
  const hashtagQueries = getRandomQueries(Math.floor(queryCount / 2));
  const titleQueries = getRandomTitleSearches(Math.floor(queryCount / 2));
  
  let totalNew = 0;
  
  for (const query of [...hashtagQueries, ...titleQueries]) {
    if (hasSearchedRecently('youtube', query, 6)) continue;
    if (apiCallCount >= MAX_DAILY_CALLS) break;
    
    const channelIds = await searchShortsByQuery(query, 50);
    const newCount = await processChannels(channelIds, 'random_deep', query);
    totalNew += newCount;
  }
  
  console.log(`\n📊 Random deep discovery complete: ${totalNew} new accounts found`);
  return totalNew;
}

// ============ FULL DISCOVERY RUN ============

/**
 * Run all discovery strategies in sequence
 */
export async function runFullDiscovery(): Promise<number> {
  console.log('\n' + '🚀'.repeat(25));
  console.log('  MCRP YOUTUBE DISCOVERY ENGINE');
  console.log('🚀'.repeat(25));
  console.log(`\nAPI calls used today: ${apiCallCount}/${MAX_DAILY_CALLS}\n`);
  
  await getDb(); // Initialize DB
  
  let totalNew = 0;
  
  // Phase 1: Deep/niche hashtags first (less competition)
  totalNew += await discoverByHashtags('deep');
  
  // Phase 2: Niche title searches
  totalNew += await discoverByTitles('niche');
  
  // Phase 3: Genre hashtags
  totalNew += await discoverByHashtags('genres');
  
  // Phase 4: Primary hashtags (more competition but still good)
  totalNew += await discoverByHashtags('primary');
  
  // Phase 5: Popular title searches
  totalNew += await discoverByTitles('popular');
  
  // Phase 6: Direct channel search
  totalNew += await discoverChannels();
  
  // Phase 7: Random deep search
  totalNew += await discoverRandom(30);
  
  // Phase 8: Related channel chaining (uses validated accounts as seeds)
  totalNew += await discoverRelatedChannels();
  
  saveDb();
  
  console.log('\n' + '═'.repeat(50));
  console.log(`🏁 DISCOVERY COMPLETE`);
  console.log(`   Total new accounts found: ${totalNew}`);
  console.log(`   API calls used: ${apiCallCount}/${MAX_DAILY_CALLS}`);
  console.log('═'.repeat(50));
  
  return totalNew;
}

export function getApiCallCount(): number {
  return apiCallCount;
}

export function resetApiCallCount() {
  apiCallCount = 0;
}
