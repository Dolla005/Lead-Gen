#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import { getDb, getStats, closeDb, saveDb, getApprovedAccounts } from './db/database.js';
import { 
  runFullDiscovery, discoverByHashtags, discoverByTitles, 
  discoverChannels, discoverRandom, discoverRelatedChannels,
  getApiCallCount 
} from './scrapers/youtube.js';
import { validateAllPending, revalidateAll } from './validators/validator.js';
import { startDashboard } from './dashboard/server.js';
import { runDuplicateChecker, submitCleanLeads } from './submitter/viraltasks.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🎬 MCRP AUTOMATION TOOL v1.0                  ║');
  console.log('║   Movie Clip Research Project Lead Finder        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  
  // Initialize database
  await getDb();
  
  switch (command) {
    case 'discover':
    case 'find': {
      // Check API key
      if (!process.env.YOUTUBE_API_KEY) {
        console.log('❌ YOUTUBE_API_KEY not set!');
        console.log('');
        console.log('   1. Go to https://console.cloud.google.com/apis/credentials');
        console.log('   2. Create a project (or select existing)');
        console.log('   3. Enable "YouTube Data API v3"');
        console.log('   4. Create an API Key');
        console.log('   5. Copy the key into your .env file:');
        console.log('      YOUTUBE_API_KEY=your_key_here');
        console.log('');
        process.exit(1);
      }
      
      const strategy = args[1] || 'full';
      
      if (strategy === 'full') {
        await runFullDiscovery();
      } else if (strategy === 'hashtags') {
        const depth = (args[2] as any) || 'deep';
        await discoverByHashtags(depth);
      } else if (strategy === 'titles') {
        const category = (args[2] as any) || 'niche';
        await discoverByTitles(category);
      } else if (strategy === 'channels') {
        await discoverChannels();
      } else if (strategy === 'random') {
        const count = parseInt(args[2] || '20');
        await discoverRandom(count);
      } else if (strategy === 'related') {
        await discoverRelatedChannels();
      } else {
        console.log(`Unknown strategy: ${strategy}`);
        console.log('Available: full, hashtags, titles, channels, random, related');
      }
      
      // Auto-validate after discovery
      console.log('\n--- Auto-validating discovered accounts ---\n');
      await validateAllPending();
      
      break;
    }
    
    case 'validate': {
      await validateAllPending();
      break;
    }
    
    case 'revalidate':
    case 'recheck': {
      // Re-validate ALL accounts from scratch with strict filters
      await revalidateAll();
      break;
    }
    
    case 'dupcheck':
    case 'check-duplicates': {
      // PHASE 1: Check all approved leads against ViralTasks for duplicates
      const maxLeads = parseInt(args[1] || '100');
      await runDuplicateChecker(maxLeads);
      break;
    }
    
    case 'submit':
    case 'submit-clean':
    case 'autosubmit': {
      // PHASE 2: Submit only clean (non-duplicate) leads
      const maxLeads = parseInt(args[1] || '50');
      await submitCleanLeads(maxLeads);
      break;
    }
    
    case 'dashboard':
    case 'ui': {
      const port = parseInt(args[1] || process.env.PORT || '3456');
      await startDashboard(port);
      // Keep process alive
      console.log('Press Ctrl+C to stop the dashboard\n');
      return; // Don't close DB
    }
    
    case 'stats': {
      const stats = getStats();
      console.log('📊 Current Statistics:');
      console.log('─'.repeat(40));
      console.log(`   Total Discovered:    ${stats.total_accounts}`);
      console.log(`   ✅ Passed:           ${stats.passed}`);
      console.log(`   ❌ Failed:           ${stats.failed}`);
      console.log(`   ⚠️  Needs Review:     ${stats.review}`);
      console.log(`   ⏳ Pending:          ${stats.pending}`);
      console.log(`   📤 Submitted:        ${stats.submitted}`);
      console.log(`   🚀 Ready to Submit:  ${stats.ready}`);
      console.log('─'.repeat(40));
      break;
    }
    
    case 'export': {
      const format = args[1] || 'csv';
      const accounts = getApprovedAccounts(500);
      
      if (accounts.length === 0) {
        console.log('No approved accounts to export.');
        break;
      }
      
      if (format === 'csv') {
        let csv = 'Platform,Username,DisplayName,ProfileURL,FollowerCount,Score,Status\n';
        for (const acc of accounts) {
          csv += `YouTube,${acc.username || acc.platform_id},${(acc.display_name || '').replace(/,/g, ' ')},${acc.profile_url},${acc.follower_count || 0},${acc.validation_score},${acc.validation_status}\n`;
        }
        
        const filename = `mcrp_leads_${new Date().toISOString().split('T')[0]}.csv`;
        const fs = await import('fs');
        fs.writeFileSync(filename, csv);
        console.log(`✅ Exported ${accounts.length} leads to ${filename}`);
      } else if (format === 'json') {
        const filename = `mcrp_leads_${new Date().toISOString().split('T')[0]}.json`;
        const fs = await import('fs');
        fs.writeFileSync(filename, JSON.stringify(accounts, null, 2));
        console.log(`✅ Exported ${accounts.length} leads to ${filename}`);
      } else {
        console.log('Formats: csv, json');
      }
      break;
    }
    
    case 'list': {
      const status = args[1] || 'passed';
      const accounts = getApprovedAccounts(50);
      
      if (accounts.length === 0) {
        console.log(`No accounts with status: ${status}`);
        break;
      }
      
      console.log(`\n🚀 Ready-to-Submit Leads (${accounts.length}):\n`);
      console.log('─'.repeat(90));
      console.log(`${'#'.padEnd(4)} ${'Username'.padEnd(25)} ${'Followers'.padEnd(12)} ${'Score'.padEnd(8)} URL`);
      console.log('─'.repeat(90));
      
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        console.log(
          `${(i + 1).toString().padEnd(4)} ` +
          `${(acc.username || acc.platform_id || '').substring(0, 24).padEnd(25)} ` +
          `${String(acc.follower_count || 0).padEnd(12)} ` +
          `${String(acc.validation_score || 0).padEnd(8)} ` +
          `${acc.profile_url}`
        );
      }
      console.log('─'.repeat(90));
      break;
    }
    
    case 'run': {
      // Full pipeline: discover → validate → launch dashboard
      if (!process.env.YOUTUBE_API_KEY) {
        console.log('❌ Set YOUTUBE_API_KEY in .env first! (See "help" for instructions)');
        process.exit(1);
      }
      
      console.log('🚀 Running full pipeline: Discover → Validate → Dashboard\n');
      
      // Discovery
      await runFullDiscovery();
      
      // Validate
      await validateAllPending();
      
      // Show stats
      const stats = getStats();
      console.log('\n📊 Pipeline Results:');
      console.log(`   🚀 Ready to Submit: ${stats.ready}`);
      console.log(`   ⚠️  Needs Review: ${stats.review}`);
      console.log(`   ❌ Failed: ${stats.failed}`);
      
      // Launch dashboard
      console.log('\n🌐 Launching dashboard...\n');
      const port = parseInt(process.env.PORT || '3456');
      await startDashboard(port);
      return;
    }
    
    case 'help':
    default: {
      console.log('USAGE:');
      console.log('─'.repeat(50));
      console.log('');
      console.log('  npx tsx src/index.ts <command> [options]');
      console.log('');
      console.log('COMMANDS:');
      console.log('');
      console.log('  run                    Full pipeline (discover + validate + dashboard)');
      console.log('  discover [strategy]    Find new accounts');
      console.log('    full                   All strategies (default)');
      console.log('    hashtags [depth]       Hashtag search (primary|secondary|deep|genres|all)');
      console.log('    titles [category]      Title search (popular|niche|content_types|all)');
      console.log('    channels               Direct channel search');
      console.log('    random [count]         Randomized deep search');
      console.log('    related                Related channel chaining');
      console.log('  validate               Validate all pending accounts');
      console.log('  dashboard [port]       Launch web dashboard (default: 3456)');
      console.log('  stats                  Show current statistics');
      console.log('  list                   List ready-to-submit leads');
      console.log('  export [csv|json]      Export leads to file');
      console.log('  help                   Show this help');
      console.log('');
      console.log('SETUP:');
      console.log('─'.repeat(50));
      console.log('');
      console.log('  1. Get a FREE YouTube API key:');
      console.log('     → https://console.cloud.google.com/apis/credentials');
      console.log('     → Enable "YouTube Data API v3"');
      console.log('     → Create API Key');
      console.log('');
      console.log('  2. Add it to .env:');
      console.log('     YOUTUBE_API_KEY=your_key_here');
      console.log('');
      console.log('  3. Run:');
      console.log('     npx tsx src/index.ts run');
      console.log('');
      console.log('QUICK START:');
      console.log('─'.repeat(50));
      console.log('');
      console.log('  # Find leads with deep/niche search (less competition)');
      console.log('  npx tsx src/index.ts discover hashtags deep');
      console.log('');
      console.log('  # Full discovery + validation + dashboard');
      console.log('  npx tsx src/index.ts run');
      console.log('');
      break;
    }
  }
  
  saveDb();
  closeDb();
}

main().catch(err => {
  console.error('Fatal error:', err);
  saveDb();
  closeDb();
  process.exit(1);
});
