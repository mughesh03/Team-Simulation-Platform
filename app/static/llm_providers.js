/* Provider → latest models (LiteLLM slugs). Shared by Pure AI & HITL builders. */
(function (global) {
  const PROVIDER_ORDER = [
    'Institution gateway',
    'OpenAI',
    'Anthropic',
    'Gemini',
    'Meta',
    'Local / OpenAI-compatible',
    'Other',
    'Mock',
  ];

  /** @type {{ provider: string, models: { label: string, slug: string }[] }[]} */
  const ENTRIES = [
    {
      provider: 'Institution gateway',
      models: [{ label: 'Kimi K2.5', slug: 'kimi-k2.5' }],
    },
    {
      provider: 'OpenAI',
      models: [
        { label: 'GPT-6 Astra', slug: 'gpt-6-astra' },
        { label: 'GPT-6.1 Sol', slug: 'gpt-6.1-sol' },
        { label: 'GPT-6 Luna', slug: 'gpt-6-luna' },
        { label: 'GPT-5.5', slug: 'gpt-5.5' },
        { label: 'GPT-5.4', slug: 'gpt-5.4' },
        { label: 'o3', slug: 'o3' },
        { label: 'o3-pro', slug: 'o3-pro' },
        { label: 'o4-mini', slug: 'o4-mini' },
      ],
    },
    {
      provider: 'Anthropic',
      models: [
        { label: 'Claude Fable 5.1', slug: 'claude-fable-5-1' },
        { label: 'Claude Opus 5.5', slug: 'claude-opus-5-5' },
        { label: 'Claude Sonnet 5.5', slug: 'claude-sonnet-5-5' },
        { label: 'Claude Haiku 5.5', slug: 'claude-haiku-5-5' },
      ],
    },
    {
      provider: 'Gemini',
      models: [
        { label: 'Gemini 4 Argon', slug: 'gemini/gemini-4-argon' },
        { label: 'Gemini 3.8 Flash', slug: 'gemini/gemini-3.8-flash' },
        { label: 'Gemini 3.8 Live', slug: 'gemini/gemini-3.8-live' },
        { label: 'Gemini 3.1 Pro Preview', slug: 'gemini/gemini-3.1-pro-preview' },
        { label: 'Gemini Nano Banana 2.1', slug: 'gemini/gemini-nano-banana-2.1' },
      ],
    },
    {
      provider: 'Meta',
      models: [
        { label: 'Muse Spark', slug: 'muse-spark' },
        { label: 'Llama 4 Maverick', slug: 'llama-4-maverick' },
        { label: 'Llama 4 Scout', slug: 'llama-4-scout' },
        { label: 'Llama 3.3 70B', slug: 'llama-3.3-70b' },
        { label: 'Llama 3.1 405B', slug: 'llama-3.1-405b' },
        { label: 'Llama 3.1 70B', slug: 'llama-3.1-70b' },
        { label: 'Llama 3.1 8B', slug: 'llama-3.1-8b' },
      ],
    },
    {
      provider: 'Local / OpenAI-compatible',
      models: [
        { label: 'GPT-5.5 (local endpoint)', slug: 'gpt-5.5' },
        { label: 'Llama 3.3 70B (local)', slug: 'llama-3.3-70b' },
        { label: 'Llama 3.1 8B (local)', slug: 'llama-3.1-8b' },
      ],
    },
    { provider: 'Other', models: [] },
    {
      provider: 'Mock',
      models: [{ label: 'Mock Backend (Demo)', slug: 'mock' }],
    },
  ];

  const byProvider = Object.fromEntries(ENTRIES.map((e) => [e.provider, e.models]));

  function normalizeProvider(provider) {
    if (provider === 'Google') return 'Gemini';
    return provider;
  }

  function modelsFor(provider) {
    return byProvider[normalizeProvider(provider)] || [];
  }

  function modelLabelsFor(provider) {
    return modelsFor(provider).map((m) => m.label);
  }

  function isOther(provider) {
    return normalizeProvider(provider) === 'Other';
  }

  function isMock(provider, modelLabel) {
    const p = normalizeProvider(provider);
    return p === 'Mock' || modelLabel === 'Mock Backend (Demo)';
  }

  function resolveSlug(provider, modelLabel, customModelId) {
    const p = normalizeProvider(provider);
    if (isMock(p, modelLabel)) return 'mock';
    if (p === 'Other') return String(customModelId || '').trim();
    const hit = modelsFor(p).find((m) => m.label === modelLabel);
    if (hit) return hit.slug;
    return String(modelLabel || '')
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  function syncModelsForSlice(slice) {
    if (!slice) return;
    slice.provider = normalizeProvider(slice.provider);
    const p = slice.provider;
    if (p === 'Mock') {
      slice.model = 'Mock Backend (Demo)';
      slice.apiKey = '';
      slice.customModelId = '';
      return;
    }
    if (p === 'Other') {
      slice.model = '';
      slice.customModelId = slice.customModelId || '';
      return;
    }
    const labels = modelLabelsFor(p);
    if (!labels.includes(slice.model)) slice.model = labels[0] || '';
    slice.customModelId = '';
  }

  function providerOptionsHtml(current) {
    const cur = normalizeProvider(current);
    return PROVIDER_ORDER.map(
      (p) => `<option${cur === p ? ' selected' : ''}>${p}</option>`
    ).join('');
  }

  function modelOptionsHtml(provider, currentModel) {
    const models = modelsFor(provider);
    return models
      .map((m) => {
        const sel = currentModel === m.label ? ' selected' : '';
        return `<option${sel}>${m.label}</option>`;
      })
      .join('');
  }

  function displayModel(provider, modelLabel, customModelId) {
    if (isOther(provider)) return customModelId || '(enter model ID)';
    return modelLabel || '';
  }

  function buildLlmSlugs(state) {
    if (state.llmAssignment === 'Same model for all agents') {
      const mock = isMock(state.provider, state.model);
      const slug = mock ? 'mock' : resolveSlug(state.provider, state.model, state.customModelId);
      return { isMock: mock, provider_model: slug, selected_models: [slug] };
    }
    const slugs = state.perAgentLLM.slice(0, state.agents).map((a) => {
      if (isMock(a.provider, a.model)) return 'mock';
      return resolveSlug(a.provider, a.model, a.customModelId);
    });
    const allMock = slugs.length > 0 && slugs.every((s) => s === 'mock');
    return {
      isMock: allMock,
      provider_model: slugs[0] || 'mock',
      selected_models: slugs.length ? slugs : ['mock'],
    };
  }

  const slugToLabel = { mock: 'Mock Backend (Demo)' };
  ENTRIES.forEach((e) => e.models.forEach((m) => { slugToLabel[m.slug] = m.label; }));

  const LlmCatalog = {
    PROVIDER_ORDER,
    ENTRIES,
    normalizeProvider,
    modelsFor,
    modelLabelsFor,
    isOther,
    isMock,
    resolveSlug,
    syncModelsForSlice,
    providerOptionsHtml,
    modelOptionsHtml,
    displayModel,
    buildLlmSlugs,
    slugToLabel,
  };

  global.LlmCatalog = LlmCatalog;

  global.pbSetProvider = function pbSetProvider(agentIdx, provider) {
    if (typeof st === 'undefined' || typeof render !== 'function') return;
    if (agentIdx === null || agentIdx === undefined) {
      st.provider = provider;
      LlmCatalog.syncModelsForSlice(st);
    } else {
      st.perAgentLLM[agentIdx].provider = provider;
      LlmCatalog.syncModelsForSlice(st.perAgentLLM[agentIdx]);
    }
    render();
  };

  global.pbSetModel = function pbSetModel(agentIdx, modelLabel) {
    if (typeof st === 'undefined' || typeof render !== 'function') return;
    const slice = agentIdx === null || agentIdx === undefined ? st : st.perAgentLLM[agentIdx];
    slice.model = modelLabel;
    if (modelLabel === 'Mock Backend (Demo)') {
      slice.provider = 'Mock';
      slice.apiKey = '';
      slice.customModelId = '';
    }
    render();
  };

  if (typeof MODEL_LABELS !== 'undefined') {
    Object.assign(MODEL_LABELS, slugToLabel);
  }
  if (typeof MODEL_COLORS !== 'undefined') {
    const openai = '#10a37f';
    const anthropic = '#d97706';
    const gemini = '#4285f4';
    const meta = '#7c3aed';
    Object.assign(MODEL_COLORS, {
      'gpt-6-astra': openai,
      'gpt-6.1-sol': openai,
      'gpt-6-luna': openai,
      'gpt-5.5': openai,
      'gpt-5.4': openai,
      o3: openai,
      'o3-pro': openai,
      'o4-mini': openai,
      'claude-fable-5-1': anthropic,
      'claude-opus-5-5': '#b45309',
      'claude-sonnet-5-5': anthropic,
      'claude-haiku-5-5': anthropic,
      'gemini/gemini-4-argon': gemini,
      'gemini/gemini-3.8-flash': gemini,
      'gemini/gemini-3.8-live': gemini,
      'gemini/gemini-3.1-pro-preview': gemini,
      'gemini/gemini-nano-banana-2.1': gemini,
      'muse-spark': meta,
      'llama-4-maverick': meta,
      'llama-4-scout': meta,
      'llama-3.3-70b': meta,
      'llama-3.1-405b': meta,
      'llama-3.1-70b': meta,
      'llama-3.1-8b': meta,
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
