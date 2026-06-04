/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION SYSTEM INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXED:
 *  - Removed auto-init DOMContentLoaded block (conflicts with index.html init)
 *  - initialize() now uses the already-available window._firestoreDb
 */

window.ExplanationSystem = {
  // ─── Module References ─────────────────────────────────────────────
  aiManager: null,
  cloudflareHandler: null,
  firestoreHandler: null,
  generatorPanel: null,
  displaySystem: null,

  // ─── Status ────────────────────────────────────────────────────────
  isInitialized: false,
  config: {},

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async initialize(db, config = {}) {
    try {
      console.log('🚀 Starting ExplanationSystem initialization...');
      this.config = config;

      // ─── AI Manager ───────────────────────────────────────────────
      this.aiManager = new AIManager({
        openaiKey:      config.openaiKey      || '',
        claudeKey:      config.claudeKey      || '',
        huggingFaceKey: config.huggingFaceKey || '',
        cohereKey:      config.cohereKey      || '',
        replicateKey:   config.replicateKey   || ''
      });
      console.log('✅ AI Manager initialized');
      const aiStatus = this.aiManager.getHealthStatus();
      console.log(`   ${aiStatus.active}/${aiStatus.total} providers active`);

      // ─── Cloudflare Handler ───────────────────────────────────────
      this.cloudflareHandler = new CloudflareHandler({
        workerUrl:   config.cloudflareWorkerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations',
        maxRetries:  config.cloudflareRetries  || 3
      });
      console.log('✅ Cloudflare Handler initialized');
      // Health check is async — run in background, don't block init
      this.cloudflareHandler.healthCheck().then(h => console.log(`   Cloudflare status: ${h.status}`));

      // ─── Firestore Handler ────────────────────────────────────────
      this.firestoreHandler = new FirestoreHandler(db);
      console.log('✅ Firestore Handler initialized');

      // ─── Display System ───────────────────────────────────────────
      if (typeof ExplanationDisplaySystem !== 'undefined') {
        this.displaySystem = new ExplanationDisplaySystem(
          this.cloudflareHandler,
          this.firestoreHandler,
          {
            typingSpeed:         config.typingSpeed         || 20,
            transitionDuration:  config.transitionDuration  || 300,
            cacheExplanations:   config.cacheExplanations   !== false,
            showLoadingIndicator:config.showLoadingIndicator !== false,
            offlineMode:         config.offlineMode         || false
          }
        );
        console.log('✅ Explanation Display System initialized');
      }

      // ─── Generator Panel (optional) ───────────────────────────────
      const panelContainer = document.getElementById(
        config.panelContainerId || 'explanationGeneratorPanel'
      );
      if (panelContainer && typeof ExplanationGeneratorPanel !== 'undefined') {
        this.generatorPanel = new ExplanationGeneratorPanel(
          this.aiManager,
          this.cloudflareHandler,
          this.firestoreHandler,
          { panelId: config.panelContainerId || 'explanationGeneratorPanel', theme: config.theme || 'dark' }
        );
        await this.generatorPanel.initialize();
        await this.generatorPanel.loadProviderOptions();
        console.log('✅ Explanation Generator Panel initialized');
      } else {
        console.log('ℹ️  Generator Panel not found / not needed — skipping');
      }

      this.isInitialized = true;
      console.log('✨ ExplanationSystem fully initialized!');

      return {
        status: 'initialized',
        timestamp: new Date(),
        modules: {
          aiManager:        !!this.aiManager,
          cloudflareHandler:!!this.cloudflareHandler,
          firestoreHandler: !!this.firestoreHandler,
          displaySystem:    !!this.displaySystem,
          generatorPanel:   !!this.generatorPanel
        }
      };

    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return { status: 'error', error: error.message, timestamp: new Date() };
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════

  async initializeQuestionExplanations(questionId, containerElement) {
    try {
      if (!this.isInitialized) return { status: 'error', message: 'System not initialized' };
      if (!this.displaySystem)  return { status: 'error', message: 'Display System not available' };
      return await this.displaySystem.initializeForQuestion(questionId, containerElement);
    } catch (error) {
      console.error('Error initializing question explanations:', error);
      return { status: 'error', error: error.message };
    }
  },

  setApiKeys(keys) {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    this.aiManager.updateApiKeys(keys);
    console.log('✅ API keys updated');
    return { status: 'updated', timestamp: new Date() };
  },

  showGeneratorPanel() {
    if (!this.generatorPanel) return { status: 'error', message: 'Panel not initialized' };
    const el = document.getElementById(this.config.panelContainerId || 'explanationGeneratorPanel');
    if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior: 'smooth' }); return { status: 'shown' }; }
    return { status: 'error', message: 'Panel element not found' };
  },

  hideGeneratorPanel() {
    const el = document.getElementById(this.config.panelContainerId || 'explanationGeneratorPanel');
    if (el) { el.style.display = 'none'; return { status: 'hidden' }; }
    return { status: 'error', message: 'Panel element not found' };
  },

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      aiManager:    this.aiManager    ? this.aiManager.getHealthStatus()    : null,
      cloudflare:   this.cloudflareHandler ? this.cloudflareHandler.getConfig() : null,
      displaySystem:this.displaySystem ? this.displaySystem.getState()      : null,
      timestamp: new Date()
    };
  },

  getProviders()              { return this.aiManager ? this.aiManager.getProviderStatus() : null; },
  getUsageStats(p = null)     { return this.aiManager ? this.aiManager.getUsageStats(p)    : null; },

  async getExplanationCoverage(courseId) {
    return this.firestoreHandler ? await this.firestoreHandler.getExplanationStats(courseId) : null;
  },

  async getPendingExplanations(chapterId = null) {
    return this.firestoreHandler ? await this.firestoreHandler.getPendingExplanations(chapterId) : null;
  },

  async migrateSchema(courseId = null) {
    if (!this.firestoreHandler) return { status: 'error', message: 'Firestore Handler not initialized' };
    const result = await this.firestoreHandler.migrateQuestionsSchema(courseId);
    console.log('✅ Schema migration complete:', result);
    return result;
  },

  async generateExplanation(question, correctAnswer, level = 1, context = '', provider = null) {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    return await this.aiManager.generateExplanation(question, correctAnswer, level, context, provider);
  },

  clearCaches() {
    const results = {};
    if (this.cloudflareHandler) results.cloudflare    = this.cloudflareHandler.clearCache();
    if (this.displaySystem)     results.displaySystem = this.displaySystem.clearCache();
    console.log('✅ Caches cleared');
    return results;
  },

  resetDailyUsage() {
    if (!this.aiManager) return { status: 'error', message: 'AI Manager not initialized' };
    this.aiManager.resetDailyUsage();
    return { status: 'reset', timestamp: new Date() };
  },

  logSystemInfo() {
    console.group('📊 ExplanationSystem Information');
    console.log('Status:', this.isInitialized ? '✅ Initialized' : '❌ Not initialized');
    if (this.aiManager) {
      console.group('AI Manager');
      console.log('Providers:', this.aiManager.getProviderStatus());
      console.log('Usage:',     this.aiManager.getUsageStats());
      console.groupEnd();
    }
    if (this.cloudflareHandler) {
      console.group('Cloudflare');
      console.log('Config:', this.cloudflareHandler.getConfig());
      console.groupEnd();
    }
    console.groupEnd();
  }
};

// ── NOTE: Auto-initialization removed intentionally ─────────────────────────
// index.html already handles initialization after Firestore is ready.
// Having two init attempts caused a race condition and double-init errors.

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.ExplanationSystem;
}

console.log('✅ ExplanationSystem module loaded');
