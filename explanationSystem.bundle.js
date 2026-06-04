/* ================================================================
   EXPLANATION SYSTEM — FIXED BUNDLE
   ================================================================ */

/* ── AIManager ─────────────────────────────────────────────────── */
class AIManager {
  constructor(config = {}) {
    this.config = {
      openaiKey: config.openaiKey || '',
      claudeKey: config.claudeKey || '',
      huggingFaceKey: config.huggingFaceKey || '',
      ...config
    };

    this.providers = {
      'claude': {
        name: 'Claude (Anthropic)',
        type: 'claude',
        model: 'claude-sonnet-4-20250514',
        apiKey: this.config.claudeKey,
        maxTokens: 1000,
        priority: 1,
        enabled: !!this.config.claudeKey,
        status: 'active',
        currentUsage: 0
      },
      'gpt4-turbo': {
        name: 'OpenAI GPT-4 Turbo',
        type: 'openai',
        model: 'gpt-4-turbo-preview',
        apiKey: this.config.openaiKey,
        maxTokens: 1000,
        priority: 2,
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'gpt35': {
        name: 'OpenAI GPT-3.5',
        type: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: this.config.openaiKey,
        maxTokens: 1000,
        priority: 3,
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'huggingface': {
        name: 'Hugging Face',
        type: 'huggingface',
        model: 'mistralai/Mistral-7B-Instruct-v0.1',
        apiKey: this.config.huggingFaceKey,
        maxTokens: 1000,
        priority: 4,
        enabled: !!this.config.huggingFaceKey,
        status: 'active',
        currentUsage: 0
      }
    };

    this.maxRetries = 3;
    this.usageLog = {};
  }

  getActiveProviders() {
    return Object.entries(this.providers)
      .filter(([, p]) => p.enabled && p.status === 'active')
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([key, p]) => ({ key, ...p }));
  }

  getHealthStatus() {
    const active = this.getActiveProviders();
    return {
      total: Object.keys(this.providers).length,
      active: active.length,
      providers: active.map(p => p.name)
    };
  }

  getProviderStatus() {
    return Object.entries(this.providers).map(([key, p]) => ({
      key, name: p.name, enabled: p.enabled, status: p.status, priority: p.priority
    }));
  }

  getUsageStats(providerKey = null) {
    if (providerKey) return { provider: providerKey, usage: this.providers[providerKey]?.currentUsage || 0 };
    const stats = {};
    Object.entries(this.providers).forEach(([k, p]) => { stats[k] = p.currentUsage; });
    return stats;
  }

  updateApiKeys(keys) {
    if (keys.openaiKey) {
      this.config.openaiKey = keys.openaiKey;
      if (this.providers['gpt4-turbo']) { this.providers['gpt4-turbo'].apiKey = keys.openaiKey; this.providers['gpt4-turbo'].enabled = true; }
      if (this.providers['gpt35'])      { this.providers['gpt35'].apiKey = keys.openaiKey;      this.providers['gpt35'].enabled = true; }
    }
    if (keys.claudeKey) {
      this.config.claudeKey = keys.claudeKey;
      if (this.providers['claude']) { this.providers['claude'].apiKey = keys.claudeKey; this.providers['claude'].enabled = true; }
    }
    if (keys.huggingFaceKey) {
      this.config.huggingFaceKey = keys.huggingFaceKey;
      if (this.providers['huggingface']) { this.providers['huggingface'].apiKey = keys.huggingFaceKey; this.providers['huggingface'].enabled = true; }
    }
  }

  resetDailyUsage() {
    Object.keys(this.providers).forEach(k => { this.providers[k].currentUsage = 0; });
  }

  _buildPrompt(question, correctAnswer, level, context) {
    const levelInstructions = {
      1: `Give 3-5 concise bullet points explaining why "${correctAnswer}" is the correct answer. Be brief and direct.`,
      2: `Write a clear, detailed explanation (2-3 paragraphs) of why "${correctAnswer}" is correct. Include the underlying concept, why other options would be wrong, and a memorable way to remember this.`,
      3: `Write a comprehensive, deeply engaging explanation of why "${correctAnswer}" is the correct answer. Cover: (1) the core concept in depth, (2) real-world connections, (3) why common misconceptions exist, (4) a vivid analogy or example, and (5) how this connects to broader topics. Make it truly educational and memorable.`
    };

    let prompt = `Question: ${question}\nCorrect Answer: ${correctAnswer}\n\n`;
    if (context && context.trim()) prompt += `Study Notes:\n${context}\n\n`;
    prompt += levelInstructions[level] || levelInstructions[1];
    return prompt;
  }

  async _callClaude(provider, prompt) {
  const response = await fetch('https://pdfstorageapp.abrahamtariku1997.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', prompt: prompt })
  });
  const data = await response.json();
  console.warn('Claude worker response:', JSON.stringify(data));
  if (!response.ok) throw new Error(`Claude via Worker error: ${response.status}`);
  return data.content?.[0]?.text || '';
  }

  async _callOpenAI(provider, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: provider.maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async _callHuggingFace(provider, prompt) {
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${provider.model}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: provider.maxTokens } })
      }
    );
    if (!response.ok) throw new Error(`HuggingFace API error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? (data[0]?.generated_text || '') : (data.generated_text || '');
  }

  async generateExplanation(question, correctAnswer, level = 1, context = '', preferredProvider = null) {
    const prompt = this._buildPrompt(question, correctAnswer, level, context);
    const activeProviders = this.getActiveProviders();

    if (!activeProviders.length) {
      return { status: 'error', error: 'No AI providers configured. Please add API keys in Firestore config/apiKeys.', text: '' };
    }

    /* Sort providers: preferred first, then by priority */
    const ordered = preferredProvider
      ? [activeProviders.find(p => p.key === preferredProvider), ...activeProviders.filter(p => p.key !== preferredProvider)].filter(Boolean)
      : activeProviders;

    let lastError = '';
    for (const provider of ordered) {
      try {
        let text = '';
        if (provider.type === 'claude')       text = await this._callClaude(provider, prompt);
        else if (provider.type === 'openai')  text = await this._callOpenAI(provider, prompt);
        else if (provider.type === 'huggingface') text = await this._callHuggingFace(provider, prompt);

        if (text && text.trim()) {
          provider.currentUsage++;
          return { status: 'success', text: text.trim(), provider: provider.name, level };
        }
      } catch (err) {
        console.warn(`Provider ${provider.name} failed:`, err.message);
        lastError = err.message;
        /* Try next provider */
      }
    }

    return {
      status: 'error',
      error: `All providers failed. Last error: ${lastError}`,
      text: ''
    };
  }
}

/* ── CloudflareHandler ─────────────────────────────────────────── */
class CloudflareHandler {
  constructor(config = {}) {
    this.config = {
      workerUrl: config.workerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
      storagePath: config.storagePath || 'explanations',
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    this.cache = new Map();
  }

  getConfig() {
    return { workerUrl: this.config.workerUrl, storagePath: this.config.storagePath };
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    return { cleared: size };
  }

  async healthCheck() {
    try {
      const response = await fetch(this.config.workerUrl, { method: 'HEAD' });
      return { status: response.ok ? 'healthy' : 'degraded', statusCode: response.status };
    } catch (e) {
      return { status: 'unreachable', error: e.message };
    }
  }

  _generateFileId(questionId, level, provider) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${this.config.storagePath}/${questionId}_level${level}_${timestamp}_${random}.txt`;
  }

  async uploadExplanation(questionId, explanationText, level, provider) {
    const fileId = this._generateFileId(questionId, level, provider);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(this.config.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload',
            fileId: fileId,
            content: explanationText,
            metadata: { questionId, level, provider, uploadedAt: new Date().toISOString() }
          })
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          const url = data.url || `${this.config.workerUrl}?file=${encodeURIComponent(fileId)}`;
          this.cache.set(fileId, explanationText);
          return { status: 'success', url, fileId, questionId, level, provider };
        }

        /* If the worker doesn't support the upload action, fall back to storing in Firestore only */
        if (response.status === 404 || response.status === 405) {
          console.warn('Cloudflare Worker does not support upload action — storing explanation in Firestore only.');
          return {
            status: 'success',
            url: `firestore://explanations/${questionId}_level${level}`,
            fileId: `firestore_${questionId}_level${level}`,
            questionId, level, provider,
            storageType: 'firestore_fallback'
          };
        }

        throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        if (attempt === this.config.maxRetries) {
          /* Final fallback: return a pseudo-URL so saving to Firestore still works */
          console.warn('All Cloudflare upload attempts failed — using Firestore fallback:', err.message);
          return {
            status: 'success',
            url: `firestore://explanations/${questionId}_level${level}`,
            fileId: `firestore_${questionId}_level${level}`,
            questionId, level, provider,
            storageType: 'firestore_fallback'
          };
        }
        await new Promise(r => setTimeout(r, this.config.retryDelay * attempt));
      }
    }
  }

  async retrieveExplanation(fileId) {
    if (this.cache.has(fileId)) return { status: 'success', content: this.cache.get(fileId), source: 'cache' };

    try {
      const url = `${this.config.workerUrl}?file=${encodeURIComponent(fileId)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const content = await response.text();
      this.cache.set(fileId, content);
      return { status: 'success', content, source: 'cloudflare' };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
}

/* ── FirestoreHandler ──────────────────────────────────────────── */
class FirestoreHandler {
  constructor(db) {
    this.db = db;
    this.collectionsNames = {
      questions:           'adminExams',
      explanationHistory:  'explanationGenerationHistory',
      explanationVersions: 'explanationVersions'
    };
    this.schemaVersion = 1;
  }

  _fns() {
    const fns = window._firestoreFns;
    if (!fns) throw new Error('Firestore functions not available');
    return fns;
  }

  async saveExplanationLink(questionId, level, cloudflareUrl, fileId, provider) {
    try {
      const { doc, updateDoc } = this._fns();
      const docRef = doc(this.db, this.collectionsNames.questions, questionId);
      const updateData = {};
      if (level === 2) {
        updateData['explanations.level2'] = { url: cloudflareUrl, fileId, provider, uploadedAt: new Date(), version: 1, status: 'published' };
      } else if (level === 3) {
        updateData['explanations.level3'] = { url: cloudflareUrl, fileId, provider, uploadedAt: new Date(), version: 1, status: 'published' };
      }
      await updateDoc(docRef, updateData);
      await this.logExplanationGeneration(questionId, level, provider, 'saved');
      return { questionId, level, url: cloudflareUrl, fileId, status: 'saved', timestamp: new Date() };
    } catch (error) {
      console.error('Error saving explanation link:', error);
      return { questionId, level, error: error.message, status: 'error' };
    }
  }

  async getExplanationLinks(questionId) {
    try {
      const { doc, getDoc } = this._fns();
      const snap = await getDoc(doc(this.db, this.collectionsNames.questions, questionId));
      if (!snap.exists()) throw new Error(`Question ${questionId} not found`);
      const data = snap.data();
      const explanations = data.explanations || {};
      return {
        questionId,
        level1: { text: data.explanation || null, available: !!data.explanation, source: 'firestore' },
        level2: { url: explanations.level2?.url || null, available: !!explanations.level2?.url, source: 'cloudflare' },
        level3: { url: explanations.level3?.url || null, available: !!explanations.level3?.url, source: 'cloudflare' }
      };
    } catch (error) {
      return { questionId, error: error.message, level1: { available: false }, level2: { available: false }, level3: { available: false } };
    }
  }

  async getExplanationStats(courseId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) q = query(q, where('courseId', '==', courseId));
      else q = query(q);
      const snapshot = await getDocs(q);
      let level2Count = 0, level3Count = 0, bothCount = 0, noneCount = 0;
      snapshot.forEach(d => {
        const exp = d.data().explanations || {};
        const h2 = !!exp.level2?.url, h3 = !!exp.level3?.url;
        if (h2 && h3) bothCount++;
        else if (h2) level2Count++;
        else if (h3) level3Count++;
        else noneCount++;
      });
      return { courseId, totalQuestions: snapshot.size, level2Only: level2Count, level3Only: level3Count, bothLevels: bothCount, noExplanations: noneCount };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getPendingExplanations(chapterId = null) {
    try {
      const { collection, query, where, getDocs } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (chapterId) q = query(q, where('chapterId', '==', chapterId));
      else q = query(q);
      const snapshot = await getDocs(q);
      const pending = [];
      snapshot.forEach(d => {
        const data = d.data(), exp = data.explanations || {};
        if (!exp.level2?.url || !exp.level3?.url) {
          pending.push({ questionId: d.id, question: data.question, missingLevels: [!exp.level2?.url ? 2 : null, !exp.level3?.url ? 3 : null].filter(Boolean) });
        }
      });
      return { total: pending.length, pending };
    } catch (error) {
      return { error: error.message, pending: [] };
    }
  }

  async logExplanationGeneration(questionId, level, provider, action) {
    try {
      const { collection, addDoc } = this._fns();
      await addDoc(collection(this.db, this.collectionsNames.explanationHistory), {
        questionId, level, provider, action, timestamp: new Date()
      });
    } catch (e) {
      console.warn('Logging failed (non-fatal):', e.message);
    }
  }

  async migrateQuestionsSchema(courseId = null) {
    try {
      const { collection, query, where, getDocs, updateDoc } = this._fns();
      let q = collection(this.db, this.collectionsNames.questions);
      if (courseId) q = query(q, where('courseId', '==', courseId));
      else q = query(q);
      const snapshot = await getDocs(q);
      let migratedCount = 0;
      const updates = [];
      snapshot.forEach(d => {
        if (!d.data().explanations) {
          updates.push(updateDoc(d.ref, { explanations: { level2: { url: null, status: 'pending' }, level3: { url: null, status: 'pending' } }, schemaVersion: this.schemaVersion }));
          migratedCount++;
        }
      });
      await Promise.all(updates);
      return { totalQuestions: snapshot.size, migratedCount, status: 'completed' };
    } catch (error) {
      return { error: error.message, status: 'error' };
    }
  }

  getCurrentUserId() {
    try { return window._currentUserPhone || window._currentUserId || 'admin'; } catch (e) { return 'admin'; }
  }
}

/* ── ExplanationSystem ─────────────────────────────────────────── */
window.ExplanationSystem = {
  aiManager: null,
  cloudflareHandler: null,
  firestoreHandler: null,
  displaySystem: null,
  isInitialized: false,
  config: {},

  async initialize(db, config = {}) {
    try {
      console.log('🚀 Starting ExplanationSystem initialization...');
      this.config = config;

      this.aiManager = new AIManager({
        openaiKey:      config.openaiKey      || '',
        claudeKey:      config.claudeKey      || '',
        huggingFaceKey: config.huggingFaceKey || ''
      });
      console.log('✅ AI Manager initialized');
      const h = this.aiManager.getHealthStatus();
      console.log(`   ${h.active}/${h.total} providers active`);

      this.cloudflareHandler = new CloudflareHandler({
        workerUrl:   config.cloudflareWorkerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations',
        maxRetries:  config.cloudflareRetries  || 3
      });
      console.log('✅ Cloudflare Handler initialized');

      this.firestoreHandler = new FirestoreHandler(db);
      console.log('✅ Firestore Handler initialized');

      this.isInitialized = true;
      console.log('✨ ExplanationSystem fully initialized!');

      return { status: 'initialized', timestamp: new Date() };
    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return { status: 'error', error: error.message };
    }
  },

  async generateExplanation(question, correctAnswer, level = 1, context = '', provider = null) {
    if (!this.isInitialized || !this.aiManager) {
      return { status: 'error', error: 'System not initialized. Call ExplanationSystem.initialize() first.', text: '' };
    }
    return await this.aiManager.generateExplanation(question, correctAnswer, level, context, provider);
  },

  setApiKeys(keys) {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    this.aiManager.updateApiKeys(keys);
    return { status: 'updated' };
  },

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      aiManager: this.aiManager ? this.aiManager.getHealthStatus() : null,
      timestamp: new Date()
    };
  },

  getProviders()          { return this.aiManager ? this.aiManager.getProviderStatus() : null; },
  getUsageStats(p = null) { return this.aiManager ? this.aiManager.getUsageStats(p)    : null; },

  async getExplanationCoverage(courseId) { return this.firestoreHandler ? await this.firestoreHandler.getExplanationStats(courseId) : null; },
  async getPendingExplanations(chapterId) { return this.firestoreHandler ? await this.firestoreHandler.getPendingExplanations(chapterId) : null; },
  async migrateSchema(courseId = null) { return this.firestoreHandler ? await this.firestoreHandler.migrateQuestionsSchema(courseId) : null; },

  clearCaches() {
    if (this.cloudflareHandler) this.cloudflareHandler.clearCache();
    return { status: 'cleared' };
  },

  resetDailyUsage() {
    if (this.aiManager) this.aiManager.resetDailyUsage();
    return { status: 'reset' };
  }
};

console.log('✅ ExplanationSystem bundle loaded and ready.');
