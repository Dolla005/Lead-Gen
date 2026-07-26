import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getDb, reloadDb, getStats, getApprovedAccounts, getAccountsByStatus, 
  getAllAccounts, getVideoSamples, getValidationResults,
  markAsSubmitted, updateAccountValidation, saveDb,
  getCleanAccounts, getDuplicateAccounts
} from '../db/database.js';
import { runDuplicateChecker, submitCleanLeads } from '../submitter/viraltasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCRP Tool — Lead Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a2e;
      --bg-card-hover: #22223a;
      --border: #2a2a40;
      --text-primary: #e8e8f0;
      --text-secondary: #8888a0;
      --text-muted: #5555700;
      --accent: #6c5ce7;
      --accent-glow: rgba(108, 92, 231, 0.3);
      --green: #00d2a0;
      --green-bg: rgba(0, 210, 160, 0.1);
      --red: #ff4757;
      --red-bg: rgba(255, 71, 87, 0.1);
      --yellow: #ffa502;
      --yellow-bg: rgba(255, 165, 2, 0.1);
      --blue: #3b82f6;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    .header {
      background: linear-gradient(135deg, var(--bg-secondary), var(--bg-card));
      border-bottom: 1px solid var(--border);
      padding: 20px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .btn {
      padding: 8px 20px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent);
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: #7c6cf7;
    }

    .btn-sm {
      padding: 4px 12px;
      font-size: 12px;
    }

    .btn-green { background: var(--green-bg); border-color: var(--green); color: var(--green); }
    .btn-red { background: var(--red-bg); border-color: var(--red); color: var(--red); }
    .btn-yellow { background: var(--yellow-bg); border-color: var(--yellow); color: var(--yellow); }

    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      padding: 24px 32px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      transition: all 0.3s;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    }

    .stat-value {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .stat-card.green .stat-value { color: var(--green); }
    .stat-card.red .stat-value { color: var(--red); }
    .stat-card.yellow .stat-value { color: var(--yellow); }
    .stat-card.blue .stat-value { color: var(--blue); }
    .stat-card.accent .stat-value { color: var(--accent); }

    .tabs {
      display: flex;
      gap: 0;
      padding: 0 32px;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      padding: 12px 24px;
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab:hover { color: var(--text-primary); }
    .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .content {
      padding: 24px 32px;
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      text-align: left;
      padding: 14px 16px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    td {
      padding: 12px 16px;
      font-size: 13px;
      border-bottom: 1px solid rgba(255,255,255,0.03);
    }

    tr:hover td {
      background: var(--bg-card-hover);
    }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-passed { background: var(--green-bg); color: var(--green); }
    .badge-failed { background: var(--red-bg); color: var(--red); }
    .badge-review { background: var(--yellow-bg); color: var(--yellow); }
    .badge-pending { background: rgba(100,100,130,0.2); color: var(--text-secondary); }

    .channel-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .channel-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .channel-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    .channel-handle {
      font-size: 12px;
      color: var(--text-secondary);
    }

    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .score-bar {
      width: 60px;
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 6px;
    }

    .score-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }

    .copy-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
    }

    .copy-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .copy-btn.copied {
      border-color: var(--green);
      color: var(--green);
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }

    .empty-state h3 {
      font-size: 18px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .submission-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .submission-card h3 {
      font-size: 16px;
      margin-bottom: 12px;
      color: var(--accent);
    }

    .field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .field-label {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .field-value {
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-bar {
      width: 100%;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .search-bar:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 20px var(--accent-glow);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .animate-in {
      animation: fadeIn 0.3s ease forwards;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎬 MCRP Lead Dashboard</h1>
    <div class="header-actions">
      <button class="btn btn-green" onclick="copyInTabScript()">⚡ Auto-Submit in My Open Tab</button>
      <button class="btn" onclick="startAutoSubmit()">🤖 Launch Separate Browser</button>
      <button class="btn" onclick="refreshData()">🔄 Refresh</button>
      <button class="btn btn-primary" onclick="exportCSV()">📥 Export CSV</button>
    </div>
  </div>

  <div class="stats-bar" id="statsBar"></div>

  <div class="tabs">
    <div class="tab active" data-tab="ready" onclick="switchTab('ready')">🚀 Ready to Submit</div>
    <div class="tab" data-tab="review" onclick="switchTab('review')">⚠️ Needs Review</div>
    <div class="tab" data-tab="all" onclick="switchTab('all')">📋 All Accounts</div>
    <div class="tab" data-tab="submitted" onclick="switchTab('submitted')">✅ Submitted</div>
  </div>

  <div class="content" id="mainContent"></div>

  <script>
    let currentTab = 'ready';
    let allData = {};

    function escHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, ' ');
    }

    async function fetchData(endpoint) {
      const res = await fetch('/api/' + endpoint);
      return res.json();
    }

    async function refreshData() {
      try {
        const [stats, ready, review, all] = await Promise.all([
          fetchData('stats'),
          fetchData('ready'),
          fetchData('review'),
          fetchData('all'),
        ]);
        allData = { stats: stats || {}, ready: ready || [], review: review || [], all: all || [] };
        renderStats(allData.stats);
        renderTab(currentTab);
      } catch (err) {
        console.error('Error refreshing data:', err);
      }
    }

    function renderStats(stats) {
      stats = stats || {};
      document.getElementById('statsBar').innerHTML = 
        '<div class="stat-card accent"><div class="stat-value">' + (stats.total_accounts || 0) + '</div><div class="stat-label">Total Discovered</div></div>' +
        '<div class="stat-card green"><div class="stat-value">' + (stats.ready || 0) + '</div><div class="stat-label">Ready to Submit</div></div>' +
        '<div class="stat-card yellow"><div class="stat-value">' + (stats.review || 0) + '</div><div class="stat-label">Needs Review</div></div>' +
        '<div class="stat-card red"><div class="stat-value">' + (stats.failed || 0) + '</div><div class="stat-label">Failed</div></div>' +
        '<div class="stat-card blue"><div class="stat-value">' + (stats.submitted || 0) + '</div><div class="stat-label">Submitted</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + (stats.pending || 0) + '</div><div class="stat-label">Pending Validation</div></div>';
    }

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      var el = document.querySelector('[data-tab="' + tab + '"]');
      if (el) el.classList.add('active');
      renderTab(tab);
    }

    function renderTab(tab) {
      const content = document.getElementById('mainContent');
      
      if (tab === 'ready') {
        renderReadyTab(content, allData.ready || []);
      } else if (tab === 'review') {
        renderAccountTable(content, allData.review || [], true);
      } else if (tab === 'all') {
        renderAccountTable(content, allData.all || [], false);
      } else if (tab === 'submitted') {
        const submitted = (allData.all || []).filter(a => a.submission_status === 'submitted');
        renderAccountTable(content, submitted, false);
      }
    }

    function renderReadyTab(container, accounts) {
      if (!accounts || accounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No leads ready yet</h3><p>Run discovery and validation first, then approved leads will appear here.</p></div>';
        return;
      }

      let html = '<input type="text" class="search-bar" placeholder="🔍 Search accounts..." oninput="filterReady(this.value)">';
      html += '<div id="readyList">';
      
      for (let i = 0; i < accounts.length; i++) {
        html += renderSubmissionCard(accounts[i]);
      }
      
      html += '</div>';
      container.innerHTML = html;
    }

    function renderSubmissionCard(acc) {
      const name = escHtml(acc.display_name || acc.username || 'Unknown');
      const handle = escHtml(acc.username || acc.platform_id);
      const followers = acc.follower_count || 0;
      const url = escHtml(acc.profile_url);
      const score = acc.validation_score || 0;
      const scoreColor = score >= 70 ? 'var(--green)' : (score >= 50 ? 'var(--yellow)' : 'var(--red)');
      const notes = escHtml(acc.validation_notes || '-');
      
      return '<div class="submission-card animate-in" data-name="' + (name + ' ' + handle).toLowerCase() + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<h3>' + name + '</h3>' +
          '<div style="display:flex;gap:8px;">' +
            '<button class="btn btn-sm btn-green" onclick="markSubmitted(' + acc.id + ')">✅ Mark Submitted</button>' +
            '<a href="' + url + '" target="_blank" class="btn btn-sm">🔗 Open Channel</a>' +
          '</div>' +
        '</div>' +
        '<div class="field-row"><span class="field-label">Platform</span><span class="field-value">YouTube <button class="copy-btn" onclick="copyText(this, \'YouTube\')">Copy</button></span></div>' +
        '<div class="field-row"><span class="field-label">Username / Handle</span><span class="field-value">' + handle + ' <button class="copy-btn" onclick="copyText(this, \'' + handle + '\')">Copy</button></span></div>' +
        '<div class="field-row"><span class="field-label">Account URL</span><span class="field-value" style="max-width:400px;overflow:hidden;text-overflow:ellipsis;">' + url + ' <button class="copy-btn" onclick="copyText(this, \'' + url + '\')">Copy</button></span></div>' +
        '<div class="field-row"><span class="field-label">Follower Count (expanded)</span><span class="field-value">' + followers + ' <button class="copy-btn" onclick="copyText(this, \'' + followers + '\')">Copy</button></span></div>' +
        '<div class="field-row"><span class="field-label">Score</span><span class="field-value"><span class="score-bar"><span class="score-fill" style="width:' + score + '%;background:' + scoreColor + '"></span></span>' + score + '/100</span></div>' +
        '<div class="field-row"><span class="field-label">Notes</span><span class="field-value" style="font-size:11px;color:var(--text-secondary);">' + notes + '</span></div>' +
      '</div>';
    }

    function renderAccountTable(container, accounts, showActions) {
      if (!accounts || accounts.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No accounts found</h3><p>Run discovery to find accounts.</p></div>';
        return;
      }

      let html = '<input type="text" class="search-bar" placeholder="🔍 Search accounts..." oninput="filterTable(this.value)">';
      html += '<div class="table-container"><table><thead><tr>';
      html += '<th>Channel</th><th>Followers</th><th>Videos</th><th>Score</th><th>Status</th>';
      if (showActions) html += '<th>Actions</th>';
      html += '</tr></thead><tbody id="accountTableBody">';

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const initial = escHtml((acc.display_name || acc.username || '?')[0].toUpperCase());
        const name = escHtml(acc.display_name || 'Unknown');
        const handle = escHtml(acc.username || acc.platform_id);
        const url = escHtml(acc.profile_url);
        const statusClass = acc.validation_status === 'passed' ? 'passed' : acc.validation_status === 'failed' ? 'failed' : acc.validation_status === 'review' ? 'review' : 'pending';
        const score = acc.validation_score || 0;
        const scoreColor = score >= 70 ? 'var(--green)' : (score >= 50 ? 'var(--yellow)' : 'var(--red)');
        
        html += '<tr class="animate-in" data-name="' + (name + ' ' + handle).toLowerCase() + '">' +
          '<td><div class="channel-info"><div class="channel-avatar">' + initial + '</div><div><div class="channel-name"><a href="' + url + '" target="_blank">' + name + '</a></div><div class="channel-handle">@' + handle + '</div></div></div></td>' +
          '<td>' + (acc.follower_count || 0).toLocaleString() + '</td>' +
          '<td>' + (acc.video_count || 0) + '</td>' +
          '<td><span class="score-bar"><span class="score-fill" style="width:' + score + '%;background:' + scoreColor + '"></span></span>' + score + '</td>' +
          '<td><span class="badge badge-' + statusClass + '">' + (acc.validation_status || 'pending') + '</span></td>';
        
        if (showActions) {
          html += '<td><button class="btn btn-sm btn-green" onclick="approveAccount(' + acc.id + ')" style="margin-right:4px;">✅</button><button class="btn btn-sm btn-red" onclick="rejectAccount(' + acc.id + ')">❌</button></td>';
        }
        
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      container.innerHTML = html;
    }

    function filterReady(query) {
      const cards = document.querySelectorAll('#readyList .submission-card');
      cards.forEach(card => {
        card.style.display = card.dataset.name.includes(query.toLowerCase()) ? '' : 'none';
      });
    }

    function filterTable(query) {
      const rows = document.querySelectorAll('#accountTableBody tr');
      rows.forEach(row => {
        row.style.display = row.dataset.name?.includes(query.toLowerCase()) ? '' : 'none';
      });
    }

    async function copyText(btn, text) {
      await navigator.clipboard.writeText(text);
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    }

    async function markSubmitted(id) {
      await fetch('/api/submit/' + id, { method: 'POST' });
      refreshData();
    }

    async function approveAccount(id) {
      await fetch('/api/approve/' + id, { method: 'POST' });
      refreshData();
    }

    async function rejectAccount(id) {
      await fetch('/api/reject/' + id, { method: 'POST' });
      refreshData();
    }

    async function copyInTabScript() {
      const script = \`async function autoSubmit() {
        console.log('🤖 MCRP In-Tab Auto-Submitter Starting...');
        const res = await fetch('http://localhost:3456/api/ready');
        const leads = await res.json();
        if (!leads || leads.length === 0) { alert('No approved leads ready to submit in MCRP database!'); return; }
        if (!confirm('Found ' + leads.length + ' approved leads. Start auto-submitting in this tab?')) return;
        
        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i];
          console.log('[' + (i+1) + '/' + leads.length + '] Submitting @' + (lead.username || lead.platform_id) + '...');
          
          const handleInput = document.querySelector('input[placeholder*="username" i], input[placeholder*="handle" i], input[name*="username" i], input[name*="handle" i], input[id*="username" i]');
          const urlInput = document.querySelector('input[placeholder*="url" i], input[placeholder*="link" i], input[type="url"], input[name*="url" i]');
          const followerInput = document.querySelector('input[placeholder*="follower" i], input[placeholder*="subscribers" i], input[name*="follower" i], input[type="number"]');
          const platformSelect = document.querySelector('select[name*="platform" i], select[id*="platform" i]');
          
          if (platformSelect) { platformSelect.value = 'youtube'; platformSelect.dispatchEvent(new Event('change', { bubbles: true })); }
          if (handleInput) { handleInput.value = lead.username || lead.platform_id; handleInput.dispatchEvent(new Event('input', { bubbles: true })); }
          if (urlInput) { urlInput.value = lead.profile_url; urlInput.dispatchEvent(new Event('input', { bubbles: true })); }
          if (followerInput) { followerInput.value = lead.follower_count || 0; followerInput.dispatchEvent(new Event('input', { bubbles: true })); }
          
          const submitBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(b => b.textContent.toLowerCase().includes('submit') || b.textContent.toLowerCase().includes('add') || b.type === 'submit');
          
          if (submitBtn) { 
            submitBtn.click(); 
            await fetch('http://localhost:3456/api/submit/' + lead.id, { method: 'POST' }); 
          } else { 
            await fetch('http://localhost:3456/api/submit/' + lead.id, { method: 'POST' }); 
          }
          
          await new Promise(r => setTimeout(r, 2000));
        }
        alert('🎉 All leads auto-submitted successfully!');
      }; autoSubmit();\`;

      await navigator.clipboard.writeText(script);
      alert('✅ Auto-Submit code COPIED to clipboard!\n\n1. Switch to your open ViralTasks tab\n2. Press F12 (or right-click → Inspect) → click "Console"\n3. Paste (Ctrl+V) and press Enter!\n\nIt will submit all 31 leads automatically!');
    }

    async function startAutoSubmit() {
      if (!confirm('This will open Chrome and automatically submit all approved leads into ViralTasks. Continue?')) return;
      alert('🤖 Auto-submitter starting! Watch the opened browser window. If you are not logged in, please log in and it will resume automatically.');
      await fetch('/api/start-autosubmit', { method: 'POST' });
    }

    function exportCSV() {
      const accounts = allData.ready || [];
      if (accounts.length === 0) { alert('No leads to export'); return; }
      
      let csv = 'Platform,Username,Profile URL,Follower Count,Score,Status\n';
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        csv += 'YouTube,' + (acc.username || acc.platform_id) + ',' + acc.profile_url + ',' + (acc.follower_count || 0) + ',' + acc.validation_score + ',' + acc.validation_status + '\n';
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mcrp_leads_' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    }

    // Initial load
    refreshData();
    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);
  </script>
</body>
</html>`;

export async function handleDashboardRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  await getDb(); // Ensure DB is initialized
  
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  
  try {
    // API routes
    // Reload DB from disk on every API call to pick up discovery writes
    if (url.pathname.startsWith('/api/')) {
      await reloadDb();
    }
    
    if (url.pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStats()));
      return;
    }
    
    if (url.pathname === '/api/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getApprovedAccounts(200)));
      return;
    }
    
    if (url.pathname === '/api/review') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getAccountsByStatus('review', 200)));
      return;
    }
    
    if (url.pathname === '/api/all') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getAllAccounts(500)));
      return;
    }
    
    if (url.pathname.startsWith('/api/submit/') && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/').pop() || '0');
      if (id > 0) markAsSubmitted(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    
    if (url.pathname.startsWith('/api/approve/') && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/').pop() || '0');
      if (id > 0) updateAccountValidation(id, 'passed', 75, 'Manually approved');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    
    if (url.pathname === '/api/start-autosubmit' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true }));
      runDuplicateChecker(100).catch(err => console.error('Duplicate checker error:', err));
      return;
    }
    
    if (url.pathname === '/api/start-dupcheck' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true }));
      runDuplicateChecker(100).catch(err => console.error('Duplicate checker error:', err));
      return;
    }
    
    if (url.pathname === '/api/submit-clean' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true }));
      submitCleanLeads(100).catch(err => console.error('Clean submitter error:', err));
      return;
    }
    
    if (url.pathname === '/api/clean') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCleanAccounts(200)));
      return;
    }
    
    if (url.pathname === '/api/duplicates') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getDuplicateAccounts(200)));
      return;
    }
    
    if (url.pathname.startsWith('/api/reject/') && req.method === 'POST') {
      const id = parseInt(url.pathname.split('/').pop() || '0');
      if (id > 0) updateAccountValidation(id, 'failed', 0, 'Manually rejected');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    
    if (url.pathname.startsWith('/api/videos/')) {
      const id = parseInt(url.pathname.split('/').pop() || '0');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(id > 0 ? getVideoSamples(id) : []));
      return;
    }
    
    // Serve dashboard HTML
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(htmlContent);
    
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

export async function startDashboard(port: number = 3456) {
  await getDb(); // Ensure DB is initialized
  
  const server = http.createServer(async (req, res) => {
    await handleDashboardRequest(req, res);
  });
  
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n🌐 Dashboard running at:`);
    console.log(`   👉 http://127.0.0.1:${port}`);
    console.log(`   👉 http://localhost:${port}\n`);
  });
  
  return server;
}
