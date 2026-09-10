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
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'API Error');
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
    const usingKimi = (llm.selected_models || []).includes('kimi-k2.5') || llm.provider_model === 'kimi-k2.5';
    if (usingKimi && !(llm.api_key || '').trim()) {
      alert('Paste your UVA RC GenAI / ITS API key before starting a Kimi K2.5 run.');
      if (btn) btn.disabled = false;
      return;
    }

    const payload = {
      llm, task,
      team: {
        num_agents: parseInt($('numAgents').value),
        num_rounds: parseInt($('numRounds').value),
        structure:  $('teamStructure').value
      },
      persona_strategy: $('personaStrategy') ? $('personaStrategy').value : 'generic',
      num_simulations:  parseInt($('numSimulations').value),
      concurrency:      parseInt($('concurrency').value),
      random_seed:      $('seed') && $('seed').value ? parseInt($('seed').value) : null,
      experiment_label: $('experimentLabel') ? $('experimentLabel').value : '',
      researcher_notes: $('researcherNotes') ? $('researcherNotes').value : ''
    };

    const data = await apiCall('/api/experiment/pure-ai/start', 'POST', payload);
    if (data) {
      if ($('progressCard')) $('progressCard').style.display = 'block';
      if ($('statusBadge'))  { $('statusBadge').className = 'status running'; $('statusBadge').innerText = 'RUNNING'; }
      pollProgress(data.experiment_id || data.job_id);
    } else {
      if (btn) btn.disabled = false;
    }
  });
}


/* =================================================================
   POLL PROGRESS
   ================================================================= */

function pollProgress(id) {
  const timer = setInterval(async () => {
    const s = await apiCall(`/api/experiment/${id}/status`);
    if (!s) { clearInterval(timer); return; }
    if ($('progressText'))    $('progressText').innerText    = `${s.completed} / ${s.total} completed`;
    const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
    if ($('progressPercent')) $('progressPercent').innerText = `${pct}%`;
    if ($('progressFill'))   $('progressFill').style.width   = `${pct}%`;
    if (s.status === 'done' || s.status === 'error') {
      clearInterval(timer);
      if ($('statusBadge')) { $('statusBadge').className = s.status === 'done' ? 'status completed' : 'status paused'; $('statusBadge').innerText = s.status.toUpperCase(); }
      if (s.status === 'error') {
        if ($('errorText')) {
          $('errorText').style.display = 'block';
          $('errorText').innerText = s.error || 'The experiment failed. Check the API key and endpoint.';
        }
        if ($('startBtn')) $('startBtn').disabled = false;
      } else {
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
    const usingKimi = (llm.selected_models || []).includes('kimi-k2.5') || llm.provider_model === 'kimi-k2.5';
    if (usingKimi && !(llm.api_key || '').trim()) {
      alert('Paste your UVA RC GenAI / ITS API key before creating a Kimi K2.5 session.');
      return;
    }

    const payload = {
      llm, task,
      team: {
        num_agents: parseInt($('numAgents').value),
        num_rounds: parseInt($('numRounds').value),
        structure:  $('teamStructure').value
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

    const data = await apiCall('/api/experiment/hitl/create', 'POST', payload);
    if (data) {
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
      `;
      if ($('sessionList')) $('sessionList').prepend(div);
    }
  });
}


/* =================================================================
   BOOT
   ================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMultiLlm();
  initPureAiForm();
  initHitlForm();
});
