/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION SYSTEM INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file initializes all explanation system modules
 * Keeps index.html clean by centralizing all setup code
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

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize all explanation system modules
   * @param {Firebase.Firestore} db - Firestore database instance
   * @param {Object} config - Configuration object
   */
  async initialize(db, config = {}) {
    try {
      console.log('🚀 Starting ExplanationSystem initialization...');

      // Store config
      this.config = config;

      // ─── Initialize AI Manager ─────────────────────────────────────
      this.aiManager = new AIManager({
        openaiKey: config.openaiKey || '',
        claudeKey: config.claudeKey || '',
        huggingFaceKey: config.huggingFaceKey || '',
        cohereKey: config.cohereKey || '',
        replicateKey: config.replicateKey || ''
      });

      console.log('✅ AI Manager initialized');
      const aiStatus = this.aiManager.getHealthStatus();
      console.log(`   ${aiStatus.active}/${aiStatus.total} providers active`);

      // ─── Initialize Cloudflare Handler ────────────────────────────
      this.cloudflareHandler = new CloudflareHandler({
        workerUrl: config.cloudflareWorkerUrl || 
                   'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations',
        maxRetries: config.cloudflareRetries || 3
      });

      console.log('✅ Cloudflare Handler initialized');
      const cfHealth = await this.cloudflareHandler.healthCheck();
      console.log(`   Status: ${cfHealth.status}`);

      // ─── Initialize Firestore Handler ──────────────────────────────
      this.firestoreHandler = new FirestoreHandler(db);

      console.log('✅ Firestore Handler initialized');

      // ─── Initialize Display System ─────────────────────────────────
      this.displaySystem = new ExplanationDisplaySystem(
        this.cloudflareHandler,
        this.firestoreHandler,
        {
          typingSpeed: config.typingSpeed || 20,
          transitionDuration: config.transitionDuration || 300,
          cacheExplanations: config.cacheExplanations !== false,
          showLoadingIndicator: config.showLoadingIndicator !== false,
          offlineMode: config.offlineMode || false
        }
      );

      console.log('✅ Explanation Display System initialized');

      // ─── Initialize Generator Panel (Optional) ────────────────────
      const panelContainer = document.getElementById(
        config.panelContainerId || 'explanationGeneratorPanel'
      );

      if (panelContainer) {
        this.generatorPanel = new ExplanationGeneratorPanel(
          this.aiManager,
          this.cloudflareHandler,
          this.firestoreHandler,
          {
            panelId: config.panelContainerId || 'explanationGeneratorPanel',
            theme: config.theme || 'dark'
          }
        );

        await this.generatorPanel.initialize();
        console.log('✅ Explanation Generator Panel initialized');

        // Load provider options
        await this.generatorPanel.loadProviderOptions();
      } else {
        console.log('ℹ️  Generator Panel container not found (optional)');
      }

      // ─── Mark as initialized ──────────────────────────────────────
      this.isInitialized = true;
      console.log('✨ ExplanationSystem fully initialized!');

      return {
        status: 'initialized',
        timestamp: new Date(),
        modules: {
          aiManager: !!this.aiManager,
          cloudflareHandler: !!this.cloudflareHandler,
          firestoreHandler: !!this.firestoreHandler,
          displaySystem: !!this.displaySystem,
          generatorPanel: !!this.generatorPanel
        }
      };

    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date()
      };
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize explanations for a specific question
   * Call this when displaying a question
   */
  async initializeQuestionExplanations(questionId, containerElement) {
    try {
      if (!this.isInitialized) {
        console.error('ExplanationSystem not initialized. Call initialize() first.');
        return {
          status: 'error',
          message: 'System not initialized'
        };
      }

      if (!this.displaySystem) {
        console.error('Display System not available');
        return {
          status: 'error',
          message: 'Display System not available'
        };
      }

      return await this.displaySystem.initializeForQuestion(questionId, containerElement);

    } catch (error) {
      console.error('Error initializing question explanations:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  },

  /**
   * Set or update API keys
   */
  setApiKeys(keys) {
    if (!this.aiManager) {
      return {
        status: 'error',
        message: 'AI Manager not initialized'
      };
    }

    this.aiManager.updateApiKeys(keys);
    console.log('✅ API keys updated');

    return {
      status: 'updated',
      timestamp: new Date()
    };
  },

  /**
   * Show the generator panel for Special Users
   */
  showGeneratorPanel() {
    if (!this.generatorPanel) {
      console.warn('Generator Panel not initialized');
      return { status: 'error', message: 'Panel not initialized' };
    }

    const panelElement = document.getElementById(
      this.config.panelContainerId || 'explanationGeneratorPanel'
    );

    if (panelElement) {
      panelElement.style.display = 'block';
      panelElement.scrollIntoView({ behavior: 'smooth' });
      return { status: 'shown' };
    }

    return { status: 'error', message: 'Panel element not found' };
  },

  /**
   * Hide the generator panel
   */
  hideGeneratorPanel() {
    const panelElement = document.getElementById(
      this.config.panelContainerId || 'explanationGeneratorPanel'
    );

    if (panelElement) {
      panelElement.style.display = 'none';
      return { status: 'hidden' };
    }

    return { status: 'error', message: 'Panel element not found' };
  },

  /**
   * Get system health and status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      aiManager: this.aiManager ? this.aiManager.getHealthStatus() : null,
      cloudflare: this.cloudflareHandler ? this.cloudflareHandler.getConfig() : null,
      displaySystem: this.displaySystem ? this.displaySystem.getState() : null,
      timestamp: new Date()
    };
  },

  /**
   * Get all providers and their status
   */
  getProviders() {
    if (!this.aiManager) return null;
    return this.aiManager.getProviderStatus();
  },

  /**
   * Get API usage statistics
   */
  getUsageStats(providerName = null) {
    if (!this.aiManager) return null;
    return this.aiManager.getUsageStats(providerName);
  },

  /**
   * Get explanation coverage for a course/chapter
   */
  async getExplanationCoverage(courseId) {
    if (!this.firestoreHandler) return null;
    return await this.firestoreHandler.getExplanationStats(courseId);
  },

  /**
   * Get pending explanations
   */
  async getPendingExplanations(chapterId = null) {
    if (!this.firestoreHandler) return null;
    return await this.firestoreHandler.getPendingExplanations(chapterId);
  },

  /**
   * Migrate question schema to new format
   */
  async migrateSchema(courseId = null) {
    if (!this.firestoreHandler) {
      return { status: 'error', message: 'Firestore Handler not initialized' };
    }

    console.log('🔄 Starting schema migration...');
    const result = await this.firestoreHandler.migrateQuestionsSchema(courseId);
    console.log('✅ Schema migration complete:', result);

    return result;
  },

  /**
   * Generate explanation manually
   */
  async generateExplanation(question, correctAnswer, level = 1, context = '', provider = null) {
    if (!this.aiManager) {
      return { status: 'error', message: 'AI Manager not initialized' };
    }

    return await this.aiManager.generateExplanation(
      question,
      correctAnswer,
      level,
      context,
      provider
    );
  },

  /**
   * Clear all caches
   */
  clearCaches() {
    const results = {};

    if (this.cloudflareHandler) {
      results.cloudflare = this.cloudflareHandler.clearCache();
    }

    if (this.displaySystem) {
      results.displaySystem = this.displaySystem.clearCache();
    }

    console.log('✅ Caches cleared');
    return results;
  },

  /**
   * Reset daily usage (call at midnight or manually)
   */
  resetDailyUsage() {
    if (!this.aiManager) {
      return { status: 'error', message: 'AI Manager not initialized' };
    }

    this.aiManager.resetDailyUsage();
    console.log('✅ Daily usage reset');

    return { status: 'reset', timestamp: new Date() };
  },

  /**
   * Log system information to console
   */
  logSystemInfo() {
    console.group('📊 ExplanationSystem Information');
    console.log('Initialization Status:', this.isInitialized ? '✅ Initialized' : '❌ Not initialized');
    console.log('Timestamp:', new Date().toISOString());

    if (this.aiManager) {
      console.group('AI Manager');
      console.log('Providers:', this.aiManager.getProviderStatus());
      console.log('Usage:', this.aiManager.getUsageStats());
      console.groupEnd();
    }

    if (this.cloudflareHandler) {
      console.group('Cloudflare Handler');
      console.log('Config:', this.cloudflareHandler.getConfig());
      console.log('Cache:', this.cloudflareHandler.getCacheStats());
      console.groupEnd();
    }

    if (this.displaySystem) {
      console.group('Display System');
      console.log('State:', this.displaySystem.getState());
      console.log('Cache:', this.displaySystem.getCacheStats());
      console.groupEnd();
    }

    console.groupEnd();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INITIALIZATION (Optional)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-initialize when DOM is ready (optional)
 * Remove this section if you prefer manual initialization
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Wait a bit for Firebase to initialize
  setTimeout(async () => {
    try {
      // Check if Firebase is ready
      if (typeof firebase === 'undefined' || !firebase.firestore) {
        console.warn('Firebase not ready yet. Call ExplanationSystem.initialize() manually.');
        return;
      }

      const db = firebase.firestore();

      // Initialize with default config
      // You can customize by passing config object:
      await ExplanationSystem.initialize(db, {
        // openaiKey: 'sk-...', // Set these from environment or backend
        // claudeKey: 'sk-ant-...',
        // cloudflareWorkerUrl: 'your-worker-url',
        typingSpeed: 20,
        cacheExplanations: true
      });

      // Log system info
      // ExplanationSystem.logSystemInfo(); // Uncomment to see details

    } catch (error) {
      console.error('Failed to auto-initialize ExplanationSystem:', error);
    }
  }, 500); // Wait 500ms for Firebase to be ready
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR MODULES (if using bundler)
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.ExplanationSystem;
}

console.log('✅ ExplanationSystem Initialization Module Loaded');
