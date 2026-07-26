import { chromium, Browser, Page } from 'playwright';
import { getDb, getApprovedAccounts, markAsSubmitted, updateAccountValidation, saveDb } from '../db/database.js';

const PROJECT_URL = 'https://www.viraltasks.com/platform/leads/project/67de0467-441a-4846-bc0d-0b303fc1ed1b';

/**
 * Mark an account as a duplicate on ViralTasks (sets submission_status = 'duplicate')
 */
export function markAsDuplicate(db: any, accountId: number) {
  if (!db) return;
  db.run(`UPDATE accounts SET submission_status = 'duplicate', submitted_at = datetime('now') WHERE id = ?`, [accountId]);
  saveDb();
}

/**
 * Mark an account as clean (not a duplicate) — sets submission_status = 'clean'
 */
export function markAsClean(db: any, accountId: number) {
  if (!db) return;
  db.run(`UPDATE accounts SET submission_status = 'clean' WHERE id = ?`, [accountId]);
  saveDb();
}

/**
 * PHASE 1: Duplicate Checker
 * Goes to ViralTasks, inputs each approved lead's platform + username,
 * clicks "Check for Duplicates", reads the result, and categorizes
 * each lead as 'clean' or 'duplicate' in our database.
 */
export async function runDuplicateChecker(maxLeads: number = 100) {
  console.log('\n' + '🔍'.repeat(25));
  console.log('  MCRP DUPLICATE CHECKER — PHASE 1');
  console.log('  Check leads against ViralTasks before submitting');
  console.log('🔍'.repeat(25));

  const db = await getDb();
  const leads = getApprovedAccounts(maxLeads);

  if (leads.length === 0) {
    console.log('\n❌ No approved leads to check. Run discovery + validation first!');
    return;
  }

  console.log(`\n📋 Found ${leads.length} approved lead(s) to check for duplicates.`);
  console.log('🌐 Launching browser...\n');

  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const userDataDir = path.join(__dirname, '..', '..', 'data', 'browser_session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  const page: Page = context.pages()[0] || await context.newPage();

  // Navigate to project page
  console.log('🔗 Navigating to ViralTasks project page...');
  await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Check if login is required
  if (page.url().includes('login') || page.url().includes('auth')) {
    console.log('\n' + '🔑'.repeat(30));
    console.log('  ACTION REQUIRED: Please log into ViralTasks in the opened browser window.');
    console.log('  The checker will automatically resume once you log in!');
    console.log('🔑'.repeat(30) + '\n');

    while (page.url().includes('login') || page.url().includes('auth')) {
      await page.waitForTimeout(1000);
    }

    console.log('✅ Login detected! Navigating to project page...\n');
    await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  await page.waitForLoadState('networkidle').catch(() => {});

  let cleanCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const username = lead.username || lead.platform_id;

    console.log(`\n[${ i + 1}/${leads.length}] 🔍 Checking: @${username} (${lead.display_name || 'Unknown'})`);

    try {
      // Make sure we're on the project page with the form visible
      // Check if "Check for Duplicates" button is visible
      let checkBtn = await page.$('button:has-text("Check for Duplicates")').catch(() => null);
      
      if (!checkBtn) {
        // We might be on a different page — navigate back to project
        console.log('   📍 Navigating back to project form...');
        await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await page.waitForLoadState('networkidle').catch(() => {});
      }

      // ===== STEP 1: Select Platform (YouTube) =====
      // Look for the platform dropdown trigger (custom React dropdown, not native select)
      const platformDropdown = await page.$('select').catch(() => null);
      
      if (platformDropdown) {
        // Native select
        await platformDropdown.selectOption({ label: 'YouTube' }).catch(async () => {
          await platformDropdown.selectOption({ value: 'youtube' }).catch(() => {});
        });
      } else {
        // Custom dropdown — click the trigger that says "Platform where you found" or "Social Media"
        const dropdownTrigger = await page.$('[class*="select"] >> visible=true').catch(() => null) ||
          await page.locator('button, div').filter({ hasText: /Platform where you found|Social Media/i }).first().elementHandle().catch(() => null);
        
        if (dropdownTrigger) {
          await dropdownTrigger.click();
          await page.waitForTimeout(400);
          
          // Click "YouTube" option
          const ytOption = await page.locator('li, div[role="option"], span').filter({ hasText: /^YouTube$/i }).first().elementHandle().catch(() => null);
          if (ytOption) {
            await ytOption.click();
            await page.waitForTimeout(300);
          }
        }
      }

      // ===== STEP 1b: Fill Username =====
      const usernameInput = await page.$('input[placeholder*="username" i], input[placeholder*="creator" i], input[name*="username" i]').catch(() => null);

      if (usernameInput) {
        await usernameInput.click();
        await usernameInput.fill('');
        await page.waitForTimeout(100);
        await usernameInput.fill(username);
        await page.waitForTimeout(300);
      } else {
        console.log('   ⚠️  Username input not found, skipping...');
        errorCount++;
        continue;
      }

      // ===== STEP 1c: Click "Check for Duplicates" =====
      checkBtn = await page.$('button:has-text("Check for Duplicates")').catch(() => null);
      if (checkBtn) {
        await checkBtn.click();
        console.log('   👉 Clicked "Check for Duplicates"...');
      } else {
        console.log('   ⚠️  "Check for Duplicates" button not found.');
        errorCount++;
        continue;
      }

      // Wait for ViralTasks to respond
      await page.waitForTimeout(3000);

      // ===== STEP 2: Read the result =====
      const bodyText = await page.innerText('body').catch(() => '');
      const isDuplicate = bodyText.toLowerCase().includes('already submitted') ||
        bodyText.toLowerCase().includes('duplicate') ||
        bodyText.toLowerCase().includes('submission exists') ||
        bodyText.toLowerCase().includes('already been submitted') ||
        bodyText.toLowerCase().includes('this lead has already');

      if (isDuplicate) {
        console.log(`   ⚠️  DUPLICATE — @${username} is already submitted on ViralTasks!`);
        markAsDuplicate(db, lead.id);
        duplicateCount++;
      } else {
        console.log(`   ✅ CLEAN — @${username} is available for submission!`);
        markAsClean(db, lead.id);
        cleanCount++;
      }

      // Navigate back to project page for the next check
      await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle').catch(() => {});

    } catch (err: any) {
      console.error(`   ❌ Error checking @${username}:`, err.message);
      errorCount++;
      // Try to recover by navigating back
      await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  saveDb();

  console.log('\n' + '═'.repeat(60));
  console.log('🔍 DUPLICATE CHECK COMPLETE:');
  console.log('═'.repeat(60));
  console.log(`   ✅ Clean (ready to submit):  ${cleanCount}`);
  console.log(`   ⚠️  Duplicates (skipped):     ${duplicateCount}`);
  console.log(`   ❌ Errors:                    ${errorCount}`);
  console.log('═'.repeat(60));
  console.log('\n💡 Now run the dashboard to see clean vs duplicate leads!');
  console.log('   npx tsx src/index.ts dashboard\n');

  console.log('Browser closing in 5 seconds...');
  await page.waitForTimeout(5000).catch(() => {});
  await context.close().catch(() => {});
}

/**
 * PHASE 2: Submit only CLEAN leads (those that passed duplicate check)
 */
export async function submitCleanLeads(maxLeads: number = 50) {
  console.log('\n' + '🚀'.repeat(25));
  console.log('  MCRP SUBMITTER — PHASE 2');
  console.log('  Submitting only CLEAN (non-duplicate) leads');
  console.log('🚀'.repeat(25));

  const db = await getDb();

  // Only get leads that passed duplicate check (submission_status = 'clean')
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE validation_status = 'passed' AND submission_status = 'clean' 
    ORDER BY validation_score DESC LIMIT ?
  `);
  stmt.bind([maxLeads]);
  const cleanLeads: any[] = [];
  while (stmt.step()) {
    cleanLeads.push(stmt.getAsObject());
  }
  stmt.free();

  if (cleanLeads.length === 0) {
    console.log('\n❌ No clean leads to submit.');
    console.log('   Run duplicate checker first: npx tsx src/index.ts dupcheck');
    return;
  }

  console.log(`\n📋 Found ${cleanLeads.length} clean lead(s) to submit.`);
  console.log('🌐 Launching browser...\n');

  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const userDataDir = path.join(__dirname, '..', '..', 'data', 'browser_session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  const page: Page = context.pages()[0] || await context.newPage();

  console.log('🔗 Navigating to ViralTasks...');
  await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Handle login
  if (page.url().includes('login') || page.url().includes('auth')) {
    console.log('\n🔑 Please log in to ViralTasks in the browser. Will resume automatically.\n');
    while (page.url().includes('login') || page.url().includes('auth')) {
      await page.waitForTimeout(1000);
    }
    await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  await page.waitForLoadState('networkidle').catch(() => {});

  let submittedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < cleanLeads.length; i++) {
    const lead = cleanLeads[i];
    const username = lead.username || lead.platform_id;

    console.log(`\n[${i + 1}/${cleanLeads.length}] 🚀 Submitting: @${username}`);

    try {
      // Make sure form is visible
      let checkBtn = await page.$('button:has-text("Check for Duplicates")').catch(() => null);
      if (!checkBtn) {
        await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
      }

      // Select YouTube Platform
      const platformDropdown = await page.$('select').catch(() => null);
      if (platformDropdown) {
        await platformDropdown.selectOption({ label: 'YouTube' }).catch(async () => {
          await platformDropdown.selectOption({ value: 'youtube' }).catch(() => {});
        });
      } else {
        const dropdownTrigger = await page.locator('button, div').filter({ hasText: /Platform where you found|Social Media/i }).first().elementHandle().catch(() => null);
        if (dropdownTrigger) {
          await dropdownTrigger.click();
          await page.waitForTimeout(400);
          const ytOption = await page.locator('li, div[role="option"], span').filter({ hasText: /^YouTube$/i }).first().elementHandle().catch(() => null);
          if (ytOption) {
            await ytOption.click();
            await page.waitForTimeout(300);
          }
        }
      }

      // Fill Username
      const usernameInput = await page.$('input[placeholder*="username" i], input[placeholder*="creator" i]').catch(() => null);
      if (usernameInput) {
        await usernameInput.click();
        await usernameInput.fill('');
        await usernameInput.fill(username);
      }

      await page.waitForTimeout(300);

      // Click Check for Duplicates (Step 1)
      checkBtn = await page.$('button:has-text("Check for Duplicates")').catch(() => null);
      if (checkBtn) {
        await checkBtn.click();
        console.log('   ✓ Passed duplicate check');
      }

      await page.waitForTimeout(3000);

      // Fill Step 2 fields (URL + Followers)
      const urlInput = await page.$('input[placeholder*="url" i], input[placeholder*="link" i], input[type="url"]').catch(() => null);
      if (urlInput) {
        await urlInput.click();
        await urlInput.fill(lead.profile_url);
      }

      const followerInput = await page.$('input[placeholder*="follower" i], input[placeholder*="subscribers" i], input[type="number"]').catch(() => null);
      if (followerInput) {
        await followerInput.click();
        await followerInput.fill(String(lead.follower_count || 0));
      }

      await page.waitForTimeout(500);

      // Click Submit
      const submitBtn = await page.$('button:has-text("Submit"), button:has-text("Add Lead"), button:has-text("Finish"), input[type="submit"]').catch(() => null);
      if (submitBtn) {
        await submitBtn.click();
        console.log(`   ✅ Submitted @${username}!`);
        markAsSubmitted(lead.id);
        submittedCount++;
      } else {
        console.log('   ⚠️  Submit button not found. Waiting 5s for manual click...');
        await page.waitForTimeout(5000);
        markAsSubmitted(lead.id);
        submittedCount++;
      }

      await page.waitForTimeout(2000);

      // Navigate back to project for next lead
      await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

    } catch (err: any) {
      console.error(`   ❌ Error submitting @${username}:`, err.message);
      errorCount++;
      await page.goto(PROJECT_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  saveDb();

  console.log('\n' + '═'.repeat(60));
  console.log('🚀 SUBMISSION COMPLETE:');
  console.log('═'.repeat(60));
  console.log(`   ✅ Submitted:  ${submittedCount}`);
  console.log(`   ❌ Errors:     ${errorCount}`);
  console.log('═'.repeat(60) + '\n');

  console.log('Browser closing in 5 seconds...');
  await page.waitForTimeout(5000).catch(() => {});
  await context.close().catch(() => {});
}
