/* ===================================================================
   Team Simulation Platform — Frontend Application Logic
   =================================================================== */

const $ = id => document.getElementById(id);

// ─── Model Labels ──────────────────────────────────────────────────
const MODEL_LABELS = {
  'kimi-k2.5':         'Kimi K2.5 (UVA)',
  'gpt-4o':            'OpenAI GPT-4o',
  'gpt-4-turbo':       'OpenAI GPT-4 Turbo',
  'gpt-3.5-turbo':     'OpenAI GPT-3.5 Turbo',
  'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-opus':     'Claude 3 Opus',
  'gemini-2.5-pro':    'Gemini 2.5 Pro',
  'llama-3.1-70b':     'Llama 3.1 70B',
  'mock':              'Mock Backend'
};

const MODEL_COLORS = {
  'kimi-k2.5':         '#1783ff',
  'gpt-4o':            '#10a37f',
  'gpt-4-turbo':       '#10a37f',
  'gpt-3.5-turbo':     '#19c37d',
  'claude-3.5-sonnet': '#d97706',
  'claude-3-opus':     '#b45309',
  'gemini-2.5-pro':    '#4285f4',
  'llama-3.1-70b':     '#7c3aed',
  'mock':              '#6b7280'
};

// ─── API Helper ────────────────────────────────────────────────────
async function apiCall(endpoint, method = 'GET', payload = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (payload) options.body = JSON.stringify(payload);
  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return null; }
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch {
      throw new Error(raw ? raw.slice(0, 180) : `Server error (${res.status})`);
    }
    if (!res.ok) throw new Error(data.detail || data.error || `API Error (${res.status})`);
    return data;
  } catch (err) {
    console.error('API Call Failed:', err);
    alert(err.message);
    return null;
  }
}


/* =================================================================
   MULTI-LLM TOGGLE + PER-LLM PROMPT RENDERING
   ================================================================= */

function initMultiLlm() {
  const toggle    = $('multiLlmToggle');
  if (!toggle) return;                  // Page doesn't have the widget

  const single    = $('singleLlmGroup');
  const multi     = $('multiLlmGroup');
  const perSec    = $('perLlmTaskSection');
  const container = $('perLlmInputsContainer');

  // ── rebuild the per-model prompt cards ────────────────────────
  function rebuild() {
    const isMulti = toggle.checked;

    // Show / hide the correct panel
    if (single) single.style.display = isMulti ? 'none' : '';
    if (multi)  multi.style.display  = isMulti ? ''     : 'none';
    if (perSec) perSec.style.display = isMulti ? ''     : 'none';

    if (!isMulti || !container) return;

    // Preserve any text the user already typed
    const saved = {};
    container.querySelectorAll('.per-llm-task-input').forEach(t => {
      saved[t.dataset.model] = t.value;
    });

    // Which checkboxes are checked?
    const checked = Array.from(document.querySelectorAll('.llm-checkbox:checked'));

    if (checked.length === 0) {
      container.innerHTML =
        '<p style="color:var(--danger); font-weight:500; font-size:0.9rem;">' +
        '⚠ Please select at least one LLM model above.</p>';
      return;
    }

    container.innerHTML = '';            // Clear old cards

    checked.forEach((cb, idx) => {
      const model = cb.value;
      const label = MODEL_LABELS[model] || model;
      const color = MODEL_COLORS[model] || 'var(--accent)';
      const prev  = saved[model] ?? '';  // Restore prior text if any

      const card = document.createElement('div');
      card.className = 'per-llm-card';
      card.style.borderLeftColor = color;
      card.innerHTML = `
        <div class="per-llm-header">
          <span class="per-llm-badge" style="background:${color};">Model ${idx + 1}</span>
          <span class="per-llm-name">${label}</span>
        </div>
        <textarea class="per-llm-task-input" data-model="${model}" rows="3"
                  placeholder="Describe the specific task, role, or behavior for ${label}…">${prev}</textarea>
      `;
      container.appendChild(card);
    });
  }

  // ── Wire up events ───────────────────────────────────────────
  toggle.addEventListener('change', rebuild);
  document.querySelectorAll('.llm-checkbox').forEach(cb =>
    cb.addEventListener('change', rebuild)
  );

  rebuild();   // Initial render (handles page re-load if toggle is cached)
}


/* =================================================================
   COLLECT FORM DATA  (shared between Pure-AI and HITL)
   ================================================================= */

function collectLlmAndTaskData() {
  const isMulti   = $('multiLlmToggle') && $('multiLlmToggle').checked;
  const taskType  = $('taskType')    ? $('taskType').value          : 'lost_at_sea';
  const customP   = $('customPrompt')? $('customPrompt').value      : '';
  const scored    = $('isScored')    ? $('isScored').value === 'true' : true;

  let llm, task;

  if (isMulti) {
    const selected = Array.from(document.querySelectorAll('.llm-checkbox:checked')).map(c => c.value);
    const perModel = {};
    document.querySelectorAll('.per-llm-task-input').forEach(t => {
      perModel[t.dataset.model] = t.value;
    });

    llm = {
      multi_llm: true,
      provider_model: selected[0] || 'mock',
      selected_models: selected,
      api_key: $('multiApiKey') ? $('multiApiKey').value : '',
      temperature: $('temperature') ? parseFloat($('temperature').value) : 0.7,
      max_tokens: $('maxTokens') ? parseInt($('maxTokens').value) || 0 : 0
    };
    task = { type: taskType, custom_prompt: customP, is_scored: scored, llm_tasks: perModel };
  } else {
    const model = $('modelName') ? $('modelName').value : 'mock';
    llm = {
      multi_llm: false,
      provider_model: model,
      selected_models: [model],
      api_key: $('apiKey') ? $('apiKey').value : '',
      temperature: $('temperature') ? parseFloat($('temperature').value) : 0.7,
      max_tokens: $('maxTokens') ? parseInt($('maxTokens').value) || 0 : 0
    };
    task = { type: taskType, custom_prompt: customP, is_scored: scored, llm_tasks: { [model]: customP } };
  }

  return { llm, task };
}

function renderPerAgentConfigs() {
  const container = $('perAgentConfigContainer');
  if (!container) return;
  const num = parseInt($('numAgents').value) || 3;
  const structure = $('teamStructure') ? $('teamStructure').value : 'team';
  let html = '';
  
  if (structure === 'reciprocal') {
    const mid = Math.max(1, Math.floor(num / 2));
    html += `<div style="margin-bottom:1rem; padding:1rem; background:rgba(229,114,0,0.05); border-radius:var(--radius-md); border:1px solid rgba(229,114,0,0.2);">
      <h4 style="color:var(--accent); margin-top:0; margin-bottom:0.5rem;">Reciprocal Grouping</h4>
      <div style="display:flex; gap:2rem; font-size:0.9rem;">
        <div><strong>Group A:</strong> Agent 1 to Agent ${mid}</div>
        <div><strong>Group B:</strong> Agent ${mid + 1} to Agent ${num}</div>
      </div>
      <p style="margin:0.5rem 0 0 0; font-size:0.85rem; color:var(--text-secondary);">These two groups will discuss the task in parallel independently, and merge messages at the end of each round.</p>
    </div>`;
  }

  for (let i = 1; i <= num; i++) {
    const exDesc = $('agentDesc_' + i) ? $('agentDesc_' + i).value : '';
    html += `
      <div class="agent-config-block card" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--border);">
        <h4 style="margin-top: 0; margin-bottom: 0.5rem; font-size: 0.95rem; color: var(--accent);">Agent ${i}</h4>
        <label style="margin-bottom: 0.5rem;">Role Description / Prompt
          <textarea id="agentDesc_${i}" rows="2" placeholder="e.g. You are the Leader...">${exDesc}</textarea>
        </label>
      </div>
    `;
  }
  container.innerHTML = html;
}

function initPerAgentConfigs() {
  const numInput = $('numAgents');
  if (numInput) {
    numInput.addEventListener('change', renderPerAgentConfigs);
    numInput.addEventListener('input', renderPerAgentConfigs);
  }
  const structInput = $('teamStructure');
  if (structInput) {
    structInput.addEventListener('change', renderPerAgentConfigs);
  }
  if (numInput) {
    renderPerAgentConfigs();
  }
}

function collectAgentConfigs() {
  const configs = [];
  const num = parseInt($('numAgents').value) || 3;
  for (let i = 1; i <= num; i++) {
    configs.push({
      agent_id: i,
      description: $('agentDesc_' + i) ? $('agentDesc_' + i).value : ''
    });
  }
  return configs;
}


let currentJobId = null;
let progressTimer = null;
let pendingPayload = null;
let pendingEndpoint = null;
let pendingCallback = null;

async function stopExperiment() {
  if (!currentJobId) return;
  const res = await apiCall('/api/experiment/' + currentJobId + '/stop', 'POST');
  if (res && res.status === 'stopped') {
    if (progressTimer) clearInterval(progressTimer);
    if ($('statusBadge')) { 
      $('statusBadge').className = 'status paused'; 
      $('statusBadge').innerText = 'STOPPED'; 
    }
    if ($('stopBtn')) $('stopBtn').style.display = 'none';
    if ($('startBtn')) $('startBtn').disabled = false;
  }
}

function showSummaryModal(payload, endpoint, callback) {
  pendingPayload = payload;
  pendingEndpoint = endpoint;
  pendingCallback = callback;
  
  const modelDisplay = payload.llm.multi_llm
    ? payload.llm.selected_models.map(m => MODEL_LABELS[m] || m).join(', ')
    : (MODEL_LABELS[payload.llm.provider_model] || payload.llm.provider_model);
  
  const taskLabel = {
    lost_at_sea: 'Lost at Sea', hiring: 'Hiring Decision', desert_survival: 'Desert Survival',
    moon_landing: 'Moon Landing', ethical_dilemma: 'Ethical Dilemma', custom: 'Custom Prompt'
  }[payload.task.type] || payload.task.type.replace(/_/g, ' ');

  let rows = [
    ['Task', taskLabel],
    ['Agents', payload.team.num_agents],
    ['Rounds', payload.team.num_rounds],
    ['Structure', payload.team.structure],
    ['Model(s)', modelDisplay],
  ];
  if (payload.num_simulations) rows.push(['Replications', payload.num_simulations]);
  if (payload.concurrency) rows.push(['Concurrency', payload.concurrency]);
  if (payload.experiment_label) rows.push(['Label', payload.experiment_label]);

  const html = `<ul class="summary-list">${rows.map(([k,v]) =>
    `<li><strong>${k}</strong><span>${v}</span></li>`
  ).join('')}</ul>`;
  
  $('summaryModalBody').innerHTML = html;
  $('summaryModalOverlay').classList.add('active');
}

function closeSummaryModal() {
  $('summaryModalOverlay').classList.remove('active');
  pendingPayload = null;
  pendingEndpoint = null;
  pendingCallback = null;
  if ($('startBtn')) $('startBtn').disabled = false;
}

/* =================================================================
   PURE-AI  FORM  HANDLER
   ================================================================= */

function initPureAiForm() {
  const form = $('pureAiForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('startBtn');
    if (btn) btn.disabled = true;

    const { llm, task } = collectLlmAndTaskData();

    const payload = {
      llm, task,
      team: {
        num_agents: parseInt($('numAgents').value),
        num_rounds: parseInt($('numRounds').value),
        structure:  $('teamStructure').value,
        agent_configs: collectAgentConfigs()
      },
      persona_strategy: $('personaStrategy') ? $('personaStrategy').value : 'generic',
      num_simulations:  parseInt($('numSimulations').value),
      concurrency:      parseInt($('concurrency').value),
      random_seed:      $('seed') && $('seed').value ? parseInt($('seed').value) : null,
      experiment_label: $('experimentLabel') ? $('experimentLabel').value : '',
      researcher_notes: $('researcherNotes') ? $('researcherNotes').value : ''
    };

    showSummaryModal(payload, '/api/experiment/pure-ai/start', (data) => {
      currentJobId = data.experiment_id || data.job_id;
      if ($('progressCard')) $('progressCard').style.display = 'block';
      if ($('stopBtn')) $('stopBtn').style.display = 'inline-flex';
      if ($('statusBadge'))  { $('statusBadge').className = 'status running'; $('statusBadge').innerText = 'RUNNING'; }
      pollProgress(currentJobId);
    });
  });
}


/* =================================================================
   POLL PROGRESS
   ================================================================= */

function pollProgress(id) {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(async () => {
    const s = await apiCall(`/api/experiment/${id}/status`);
    if (!s) { clearInterval(progressTimer); return; }
    if ($('progressText'))    $('progressText').innerText    = `${s.completed} / ${s.total} completed`;
    const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
    if ($('progressPercent')) $('progressPercent').innerText = `${pct}%`;
    if ($('progressFill'))   $('progressFill').style.width   = `${pct}%`;
    if (s.status === 'done' || s.status === 'error' || s.status === 'stopped') {
      clearInterval(progressTimer);
      if ($('stopBtn')) $('stopBtn').style.display = 'none';
      if ($('statusBadge')) { 
        const cls = s.status === 'done' ? 'completed' : (s.status === 'stopped' ? 'stopped' : 'paused');
        $('statusBadge').className = 'status ' + cls; 
        $('statusBadge').innerText = s.status.toUpperCase(); 
      }
      if (s.status === 'error') {
        if ($('errorText')) {
          $('errorText').style.display = 'block';
          $('errorText').innerText = s.error || 'The experiment failed. Check the API key and endpoint.';
        }
        if ($('startBtn')) $('startBtn').disabled = false;
      } else if (s.status === 'done') {
        if ($('resultsActions')) $('resultsActions').style.display = 'block';
        if ($('dashboardLink'))  $('dashboardLink').href = `/experiment/${id}/dashboard`;
      }
    }
  }, 1000);
}


/* =================================================================
   HITL  FORM  HANDLER
   ================================================================= */

function initHitlForm() {
  const form = $('hitlForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { llm, task } = collectLlmAndTaskData();

    const payload = {
      llm, task,
      team: {
        num_agents: parseInt($('numAgents').value),
        num_rounds: parseInt($('numRounds').value),
        structure:  $('teamStructure').value,
        agent_configs: collectAgentConfigs()
      },
      persona_strategy: $('personaStrategy') ? $('personaStrategy').value : 'generic',
      intervention_rules: {
        when:              $('interveneWhen')     ? $('interveneWhen').value     : 'any',
        presentation_mode: $('presentationMode')  ? $('presentationMode').value  : 'human_teammate',
        visibility:        $('interventionVisibility') ? $('interventionVisibility').value : 'all_agents',
        checkpoint_interval: $('checkpointInterval') ? parseInt($('checkpointInterval').value) : null,
        instructions:      $('participantInstructions') ? $('participantInstructions').value : ''
      },
      experiment_label: $('experimentLabel') ? $('experimentLabel').value : ''
    };

    showSummaryModal(payload, '/api/experiment/hitl/create', (data) => {
      const code = data.session_code || data.session_id;
      if ($('sessionsCard')) $('sessionsCard').style.display = 'block';
      const div = document.createElement('div');
      div.className = 'session-link-row';
      div.innerHTML = `
        <div>
          <strong style="color:var(--accent);">Session ${code}</strong>
          <div style="font-size:0.85rem; color:var(--text-secondary); font-family:'JetBrains Mono',monospace;">${window.location.origin}/participant/${code}</div>
        </div>
        <a href="/participant/${code}" target="_blank" class="button secondary">Open</a>
        <button class="button danger" style="padding: 0.4rem 1rem;" onclick="stopExperimentHITL('${data.session_id}', this)">Stop</button>
      `;
      if ($('sessionList')) $('sessionList').prepend(div);
    });
  });
}

async function stopExperimentHITL(sessionId, btn) {
  const res = await apiCall('/api/experiment/' + sessionId + '/stop', 'POST');
  if (res && res.status === 'stopped') {
    btn.innerText = 'Stopped';
    btn.disabled = true;
  }
}


/* =================================================================
   CUSTOM MODAL LOGIC
   ================================================================= */

function showInfoModal(type) {
  const overlay = $('infoModalOverlay');
  const titleEl = $('infoModalTitle');
  const bodyEl = $('infoModalBody');
  if (!overlay || !titleEl || !bodyEl) return;

  if (type === 'task') {
    titleEl.innerText = 'Task Configuration';
    bodyEl.innerHTML = `
      <p><strong>Task Configuration</strong> defines the specific scenario, problem, or decision the AI team must tackle.</p>
      <ul>
        <li><strong>Lost at Sea (Scored):</strong> Rank 15 survival items after a shipwreck. The AI's list is compared to expert coast guard answers.</li>
        <li><strong>Hiring Decision (Unscored):</strong> Compare candidates and discuss trade-offs in technical skill vs. culture fit.</li>
        <li><strong>Desert Survival (Scored):</strong> Rank items for surviving in a desert. Compared to expert answers.</li>
        <li><strong>Moon Landing (Scored):</strong> Rank items for a 200-mile trek on the moon. Compared to NASA expert answers.</li>
        <li><strong>Ethical Dilemma (Unscored):</strong> Debate competing moral frameworks without a strict ground truth.</li>
        <li><strong>Custom Prompt:</strong> Provide your own completely custom instructions for the team to solve.</li>
      </ul>
    `;
  } else if (type === 'structure') {
    titleEl.innerText = 'Interdependence Structure';
    bodyEl.innerHTML = `
      <p><strong>Interdependence Structure</strong> dictates how the AI agents communicate with each other during a round.</p>
      <ul>
        <li><strong>Pooled:</strong> Agents work completely independently without seeing each other's work. Their individual results are aggregated at the end.</li>
        <li><strong>Sequential:</strong> Agents pass their work to the next agent in a chain, building upon the previous agent's output.</li>
        <li><strong>Reciprocal:</strong> Agents are split evenly into two parallel groups (Group A and Group B). The groups discuss independently and their messages are merged at the end of each round.</li>
        <li><strong>Team:</strong> All agents discuss together simultaneously in a shared, fully open round-robin format.</li>
      </ul>
    `;
  }

  overlay.classList.add('active');
}

function closeInfoModal(e) {
  const overlay = $('infoModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

/* =================================================================
   BOOT
   ================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMultiLlm();
  initPerAgentConfigs();
  initPureAiForm();
  initHitlForm();
  
  if ($('summaryConfirmBtn')) {
    $('summaryConfirmBtn').addEventListener('click', async () => {
      if (!pendingPayload || !pendingEndpoint) return;
      $('summaryConfirmBtn').disabled = true;
      $('summaryConfirmBtn').innerText = 'Launching...';
      
      const data = await apiCall(pendingEndpoint, 'POST', pendingPayload);
      
      $('summaryConfirmBtn').disabled = false;
      $('summaryConfirmBtn').innerText = 'Confirm & Launch';
      closeSummaryModal();
      
      if (data && pendingCallback) {
        pendingCallback(data);
      } else if (!data) {
        if ($('startBtn')) $('startBtn').disabled = false;
      }
    });
  }
});
