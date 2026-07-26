import { getDb, saveDb, getApprovedAccounts } from './db/database.js';
import { discoverByHashtags, discoverByTitles, discoverRandom, discoverRelatedChannels } from './scrapers/youtube.js';
import { validateAllPending } from './validators/validator.js';
import { HASHTAG_QUERIES, TITLE_SEARCHES } from './data/search-queries.js';

const TARGET_CLEAN_COUNT = 5000;

async function getCleanCount(): Promise<number> {
  const approved = getApprovedAccounts();
  return approved.length;
}

export async function runAutoPipeline() {
  console.log('\n🚀 STARTING AUTOMATED DISCOVERY & STRICT VALIDATION PIPELINE');
  console.log(`🎯 Target: ${TARGET_CLEAN_COUNT} Clean Unchecked Leads`);
  console.log('═'.repeat(60));

  await getDb();

  let cleanCount = await getCleanCount();
  console.log(`📊 Initial Clean Unchecked Leads: ${cleanCount} / ${TARGET_CLEAN_COUNT}\n`);

  // First, validate all currently pending accounts
  console.log('🔍 Validating initial pending accounts...');
  await validateAllPending();
  saveDb();
  cleanCount = await getCleanCount();
  console.log(`✅ Current Clean Leads: ${cleanCount} / ${TARGET_CLEAN_COUNT}\n`);

  // Define query pools
  const hashtagCategories = Object.keys(HASHTAG_QUERIES) as Array<keyof typeof HASHTAG_QUERIES>;
  const titleCategories = Object.keys(TITLE_SEARCHES) as Array<keyof typeof TITLE_SEARCHES>;

  let cycle = 1;

  while (cleanCount < TARGET_CLEAN_COUNT) {
    console.log(`\n==================================================`);
    console.log(`🔄 PIPELINE CYCLE ${cycle} — Clean Leads: ${cleanCount} / ${TARGET_CLEAN_COUNT}`);
    console.log(`==================================================\n`);

    // 1. Deep Title Search Discovery
    for (const cat of titleCategories) {
      if (cleanCount >= TARGET_CLEAN_COUNT) break;
      console.log(`🔍 [Cycle ${cycle}] Title Discovery: ${cat}...`);
      try {
        await discoverByTitles(cat as any);
        saveDb();
      } catch (err: any) {
        console.error(`⚠️ Title discovery error (${cat}):`, err?.message || err);
      }

      // Validate new accounts found
      console.log('⚡ Validating newly discovered accounts...');
      await validateAllPending();
      saveDb();

      cleanCount = await getCleanCount();
      console.log(`📈 Clean Leads Progress: ${cleanCount} / ${TARGET_CLEAN_COUNT}\n`);
    }

    // 2. Deep Hashtag Discovery
    for (const cat of hashtagCategories) {
      if (cleanCount >= TARGET_CLEAN_COUNT) break;
      console.log(`🔍 [Cycle ${cycle}] Hashtag Discovery: ${cat}...`);
      try {
        await discoverByHashtags(cat as any);
        saveDb();
      } catch (err: any) {
        console.error(`⚠️ Hashtag discovery error (${cat}):`, err?.message || err);
      }

      // Validate new accounts found
      console.log('⚡ Validating newly discovered accounts...');
      await validateAllPending();
      saveDb();

      cleanCount = await getCleanCount();
      console.log(`📈 Clean Leads Progress: ${cleanCount} / ${TARGET_CLEAN_COUNT}\n`);
    }

    cycle++;
  }

  console.log('\n==================================================');
  console.log(`🎉 TARGET ACHIEVED! Reached ${cleanCount} Clean Leads!`);
  console.log('==================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('auto_pipeline.ts')) {
  runAutoPipeline().catch(console.error);
}
