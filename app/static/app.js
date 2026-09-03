// Shared utilities for API calls and WebSockets

const $ = id => document.getElementById(id);

// API Helpers
async function apiCall(endpoint, method = 'GET', payload = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (payload) options.body = JSON.stringify(payload);
  
  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login';
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'API Error');
    return data;
  } catch (err) {
    console.error('API Call Failed:', err);
    alert(err.message);
    return null;
  }
}

// Pure AI Form Handling
if ($('pureAiForm')) {
  $('pureAiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('startBtn').disabled = true;
    
    const payload = {
      llm: {
        provider_model: $('modelName').value,
        api_key: $('apiKey').value,
        temperature: parseFloat($('temperature').value)
      },
      task: {
        type: $('taskType').value,
        custom_prompt: $('customPrompt') ? $('customPrompt').value : "",
        is_scored: $('isScored') ? $('isScored').value === 'true' : true
      },
      team: {
        num_agents: parseInt($('numAgents').value),
        num_rounds: parseInt($('numRounds').value),
        structure: $('teamStructure').value
      },
      num_simulations: parseInt($('numSimulations').value),
      concurrency: parseInt($('concurrency').value),
      random_seed: $('seed').value ? parseInt($('seed').value) : null
    };

    const data = await apiCall('/api/experiment/pure-ai/start', 'POST', payload);
    if (data) {
      $('progressCard').style.display = 'block';
      $('statusBadge').className = 'status running';
      $('statusBadge').innerText = 'RUNNING';
      pollProgress(data.experiment_id);
    } else {
      $('startBtn').disabled = false;
    }
  });
}

function pollProgress(experimentId) {
  const timer = setInterval(async () => {
    const status = await apiCall(`/api/experiment/${experimentId}/status`);
    if (!status) { clearInterval(timer); return; }
    
    $('progressText').innerText = `${status.completed} / ${status.total} completed`;
    const pct = status.total ? Math.round((status.completed / status.total) * 100) : 0;
    $('progressPercent').innerText = `${pct}%`;
    $('progressFill').style.width = `${pct}%`;
    
    if (status.status === 'done' || status.status === 'error') {
      clearInterval(timer);
      $('statusBadge').className = status.status === 'done' ? 'status completed' : 'status paused';
      $('statusBadge').innerText = status.status.toUpperCase();
      $('resultsActions').style.display = 'block';
      $('dashboardLink').href = `/experiment/${experimentId}/dashboard`;
    }
  }, 1000);
}

// HITL Setup Form Handling
if ($('hitlForm')) {
  $('hitlForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      llm: { provider_model: $('modelName').value, api_key: $('apiKey').value, temperature: 0.7 },
      task: { type: $('taskType').value, custom_prompt: "", is_scored: true },
      team: { num_agents: parseInt($('numAgents').value), num_rounds: parseInt($('numRounds').value), structure: $('teamStructure').value },
      intervention_rules: {
        when: $('interveneWhen').value,
        presentation_mode: $('presentationMode').value,
        instructions: $('participantInstructions').value
      }
    };
    
    const data = await apiCall('/api/experiment/hitl/create', 'POST', payload);
    if (data) {
      $('sessionsCard').style.display = 'block';
      const div = document.createElement('div');
      div.style = "background: rgba(0,0,0,0.2); padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;";
      div.innerHTML = `
        <div>
          <strong style="color: var(--accent);">Session ${data.session_code}</strong>
          <div style="font-size: 0.85rem; color: var(--text-secondary); font-family: monospace;">${window.location.origin}/participant/${data.session_code}</div>
        </div>
        <a href="/participant/${data.session_code}" target="_blank" class="button secondary">Open</a>
      `;
      $('sessionList').prepend(div);
    }
  });
}
