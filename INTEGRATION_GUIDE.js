/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETHIOMETRIC AI EXPLANATION SYSTEM - INTEGRATION GUIDE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete guide for integrating all modules into your existing project
 */

// ═══════════════════════════════════════════════════════════════════════════
// STEP 0: ADD TO YOUR HTML FILE (index__57_.html)
// ═══════════════════════════════════════════════════════════════════════════

/*
Add these script tags before your closing </body> tag:

<script src="aiManager.js"></script>
<script src="cloudflareHandler.js"></script>
<script src="firestoreHandler.js"></script>
<script src="explanationGeneratorPanel.js"></script>
<script src="explanationDisplaySystem.js"></script>
<script src="explanationIntegration.js"></script> <!-- This file below -->

Add this CSS to your <head> or style section:

<style>
  /* Spinner animation */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .hidden {
    display: none !important;
  }

  .exp-btn.active {
    background: linear-gradient(135deg, rgb(59, 130, 246) 0%, rgb(37, 99, 235) 100%) !important;
    border-color: rgb(37, 99, 235) !important;
  }

  .exp-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .exp-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .explanation-info-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #a7f3d0;
  }

  .explanation-info-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .explanation-info-warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fcd34d;
  }

  .explanation-info-info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
  }

  @media (max-width: 768px) {
    .explanation-controls {
      flex-direction: column;
    }

    .exp-btn {
      width: 100%;
    }
  }
</style>
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: INITIALIZE THE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Global object to manage explanation system
 */
window.ExplanationSystem = {
  aiManager: null,
  cloudflareHandler: null,
  firestoreHandler: null,
  generatorPanel: null,
  displaySystem: null,

  /**
   * Initialize all components
   * Call this after Firebase is ready
   */
  async initialize(db, config = {}) {
    try {
      console.log('🚀 Initializing ExplanationSystem...');

      // ─── Create AI Manager ────────────────────────────────────────────
      this.aiManager = new AIManager({
        openaiKey: config.openaiKey || '', // User provides
        claudeKey: config.claudeKey || '',
        huggingFaceKey: config.huggingFaceKey || '',
        cohereKey: config.cohereKey || '',
        replicateKey: config.replicateKey || ''
      });

      console.log('✅ AI Manager initialized');
      console.log('  Available providers:', this.aiManager.getProviderStatus().length);

      // ─── Create Cloudflare Handler ────────────────────────────────────
      this.cloudflareHandler = new CloudflareHandler({
        workerUrl: config.cloudflareWorkerUrl || 'https://pdfstorageapp.abrahamtariku1997.workers.dev',
        storagePath: 'explanations'
      });

      console.log('✅ Cloudflare Handler initialized');

      // Check Cloudflare health
      const cfHealth = await this.cloudflareHandler.healthCheck();
      console.log('  Cloudflare status:', cfHealth.status);

      // ─── Create Firestore Handler ─────────────────────────────────────
      this.firestoreHandler = new FirestoreHandler(db);

      console.log('✅ Firestore Handler initialized');

      // ─── Create Explanation Display System ────────────────────────────
      this.displaySystem = new ExplanationDisplaySystem(
        this.cloudflareHandler,
        this.firestoreHandler,
        {
          typingSpeed: config.typingSpeed || 20,
          cacheExplanations: config.cacheExplanations !== false
        }
      );

      console.log('✅ Explanation Display System initialized');

      // ─── Create Generator Panel (Optional, for Admin/Special User) ────
      const panelContainer = document.getElementById(config.panelContainerId || 'explanationGeneratorPanel');
      if (panelContainer) {
        this.generatorPanel = new ExplanationGeneratorPanel(
          this.aiManager,
          this.cloudflareHandler,
          this.firestoreHandler,
          { panelId: config.panelContainerId || 'explanationGeneratorPanel' }
        );

        await this.generatorPanel.initialize();
        console.log('✅ Explanation Generator Panel initialized');
      }

      console.log('✨ ExplanationSystem fully initialized');
      return { status: 'initialized', timestamp: new Date() };
    } catch (error) {
      console.error('❌ Error initializing ExplanationSystem:', error);
      return { status: 'error', error: error.message };
    }
  },

  /**
   * Set API keys (call before initialize or after)
   */
  setApiKeys(keys) {
    if (this.aiManager) {
      this.aiManager.updateApiKeys(keys);
      console.log('✅ API keys updated');
      return { status: 'updated' };
    }
    return { status: 'error', message: 'AI Manager not initialized' };
  },

  /**
   * Initialize explanations for a question
   * Call this when displaying a question
   */
  async initializeQuestionExplanations(questionId, containerElement) {
    try {
      if (!this.displaySystem) {
        console.warn('Display System not initialized');
        return { status: 'error', message: 'Display System not initialized' };
      }

      return await this.displaySystem.initializeForQuestion(questionId, containerElement);
    } catch (error) {
      console.error('Error initializing question explanations:', error);
      return { status: 'error', error: error.message };
    }
  },

  /**
   * Show Special User Generator Panel
   */
  showGeneratorPanel() {
    if (this.generatorPanel) {
      // Make panel visible
      const panelElement = document.getElementById('explanationGeneratorPanel');
      if (panelElement) {
        panelElement.style.display = 'block';
        panelElement.scrollIntoView({ behavior: 'smooth' });
      }
    }
  },

  /**
   * Get system health status
   */
  getHealthStatus() {
    return {
      aiManager: this.aiManager ? this.aiManager.getHealthStatus() : null,
      cloudflare: this.cloudflareHandler ? this.cloudflareHandler.getConfig() : null,
      displaySystem: this.displaySystem ? this.displaySystem.getState() : null,
      timestamp: new Date()
    };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: UPDATE YOUR QUESTION DISPLAY CODE
// ═══════════════════════════════════════════════════════════════════════════

/*
When you display a question, add explanation system initialization.

ORIGINAL CODE (in your question display function):

function displayQuestion(questionId, question, answers) {
  const questionHTML = `
    <div class="question-box">
      <h3>${question}</h3>
      <div class="answers">
        ${answers.map(answer => `<div class="answer">${answer}</div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('questionPanel').innerHTML = questionHTML;
}

UPDATED CODE (with explanations):

function displayQuestion(questionId, question, answers) {
  const questionHTML = `
    <div class="question-box">
      <h3>${question}</h3>
      <div class="answers">
        ${answers.map(answer => `<div class="answer">${answer}</div>`).join('')}
      </div>
      <!-- Add container for explanations -->
      <div id="explanationContainer_${questionId}"></div>
    </div>
  `;
  document.getElementById('questionPanel').innerHTML = questionHTML;

  // Initialize explanation system for this question
  ExplanationSystem.initializeQuestionExplanations(
    questionId,
    document.getElementById(`explanationContainer_${questionId}`)
  );
}
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: INITIALIZATION EXAMPLE
// ═══════════════════════════════════════════════════════════════════════════

/*
Add this to your main initialization code (after Firebase is ready):

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Your existing Firebase initialization
    const db = firebase.firestore();

    // Initialize Explanation System
    await ExplanationSystem.initialize(db, {
      // API Keys (KEEP THESE SECRET!)
      openaiKey: 'sk-...', // Set these from backend or environment
      claudeKey: 'sk-ant-...',
      huggingFaceKey: 'hf_...',

      // Cloudflare configuration
      cloudflareWorkerUrl: 'https://pdfstorageapp.abrahamtariku1997.workers.dev',

      // Display configuration
      typingSpeed: 20, // milliseconds per character
      cacheExplanations: true,

      // Panel configuration
      panelContainerId: 'explanationGeneratorPanel' // Optional
    });

    // Check system health
    console.log('System Health:', ExplanationSystem.getHealthStatus());

  } catch (error) {
    console.error('Initialization error:', error);
  }
});
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: SPECIAL USER PANEL SETUP (Optional)
// ═══════════════════════════════════════════════════════════════════════════

/*
Add this HTML somewhere in your admin/special user interface:

<div id="explanationGeneratorPanel" style="display: none;">
  <!-- Panel will be created automatically -->
</div>

To show the panel:

// Show generator panel for logged-in Special User
if (userRole === 'specialUser') {
  ExplanationSystem.showGeneratorPanel();
}
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: FIRESTORE SCHEMA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

/*
Run this once to update your existing questions with explanation schema:

// In browser console or admin script:
await ExplanationSystem.firestoreHandler.migrateQuestionsSchema('your-course-id');

This will add the explanation fields to all questions:
{
  explanations: {
    level1: { /* already exists as 'explanation' */ },
    level2: { url: null, status: 'pending' },
    level3: { url: null, status: 'pending' }
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 6: USAGE EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════

/*
GET PROVIDER STATUS:
const providers = ExplanationSystem.aiManager.getProviderStatus();
console.log(providers);
// Output:
// [
//   { name: 'OpenAI GPT-4 Turbo', enabled: true, status: 'active', ... },
//   { name: 'Claude', enabled: true, status: 'active', ... },
//   ...
// ]

GET USAGE STATISTICS:
const stats = ExplanationSystem.aiManager.getUsageStats();
console.log(stats);
// Output:
// {
//   'OpenAI GPT-4 Turbo': { used: 5, limit: 200, remaining: 195, percentage: '2.50' },
//   'Claude': { used: 2, limit: 150, remaining: 148, percentage: '1.33' },
//   ...
// }

GENERATE EXPLANATION MANUALLY:
const result = await ExplanationSystem.aiManager.generateExplanation(
  'What is photosynthesis?',
  'Process where plants convert light to chemical energy',
  2, // Level 2
  '', // Optional context
  'gpt4-turbo' // Preferred provider
);
console.log(result);

CHECK EXPLANATION COVERAGE:
const stats = await ExplanationSystem.firestoreHandler.getExplanationStats('course-id');
console.log(stats);
// Output:
// { totalQuestions: 100, level2Only: 45, level3Only: 10, bothLevels: 30, noExplanations: 15 }

GET PENDING EXPLANATIONS:
const pending = await ExplanationSystem.firestoreHandler.getPendingExplanations('chapter-id');
console.log(pending);
// Shows which questions still need explanations

PRE-CACHE EXPLANATIONS:
await ExplanationSystem.displaySystem.precacheExplanation(2);
// Download Level 2 for offline use
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 7: CONFIGURATION REFERENCE
// ═══════════════════════════════════════════════════════════════════════════

/*
API KEYS - Store these securely!

OpenAI:
- Get from: https://platform.openai.com/api-keys
- Format: sk-...
- Used for: GPT-4 Turbo, GPT-3.5

Claude (Anthropic):
- Get from: https://console.anthropic.com/
- Format: sk-ant-...
- Used for: Claude 3 Opus

Hugging Face:
- Get from: https://huggingface.co/settings/tokens
- Format: hf_...
- Used for: Mistral, Llama, etc.

TYPING SPEED:
- Default: 20ms per character
- Lower = faster typing effect
- Higher = slower, more dramatic
- Recommended: 10-50ms

CACHING:
- Enabled by default
- Stores fetched explanations in memory
- Improves performance on re-visits
- Can be disabled if memory is limited
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 8: TROUBLESHOOTING
// ═══════════════════════════════════════════════════════════════════════════

/*
PROBLEM: "ExplanationSystem is not defined"
SOLUTION: Make sure all script files are loaded in correct order:
  1. aiManager.js
  2. cloudflareHandler.js
  3. firestoreHandler.js
  4. explanationGeneratorPanel.js
  5. explanationDisplaySystem.js
  6. This integration file

PROBLEM: "Cloudflare worker not responding"
SOLUTION: 
  - Check Worker URL is correct
  - Verify Worker is deployed
  - Check browser console for CORS errors
  - Test with: await ExplanationSystem.cloudflareHandler.healthCheck()

PROBLEM: "API key error - 401 Unauthorized"
SOLUTION:
  - Verify API key is correct
  - Check key has proper permissions
  - Make sure key is not expired
  - Test with: ExplanationSystem.aiManager.getProviderStatus()

PROBLEM: "Explanations not saving"
SOLUTION:
  - Check Firestore permissions
  - Verify question exists in database
  - Check network tab for failed requests
  - Ensure Cloudflare upload succeeded first

PROBLEM: "Typing effect is slow/fast"
SOLUTION:
  - Adjust typingSpeed: lower number = faster
  - Range: 5-100ms per character
  - Example: new ExplanationDisplaySystem(..., { typingSpeed: 10 })

PROBLEM: "Offline mode not working"
SOLUTION:
  - Make sure Level 1 explanations are downloaded with questions
  - Level 2 & 3 require internet (by design)
  - Check offline indicator appears when disconnected
*/

// ═══════════════════════════════════════════════════════════════════════════
// STEP 9: PRODUCTION CHECKLIST
// ═══════════════════════════════════════════════════════════════════════════

/*
Before launching to production:

[ ] API Keys
  - [ ] OpenAI key set and verified
  - [ ] Claude key set and verified
  - [ ] HuggingFace key set (optional)
  - [ ] Keys stored securely (not in code)

[ ] Cloudflare
  - [ ] Worker deployed and tested
  - [ ] Health check passing
  - [ ] CORS configured properly
  - [ ] Rate limits set appropriately

[ ] Firestore
  - [ ] Schema migration run
  - [ ] Indexes created for queries
  - [ ] Backup enabled
  - [ ] Security rules reviewed

[ ] UI/UX
  - [ ] Typing effect speed tuned
  - [ ] Button transitions smooth
  - [ ] Mobile responsive tested
  - [ ] Error messages user-friendly

[ ] Performance
  - [ ] Caching enabled
  - [ ] Load testing completed
  - [ ] Network usage optimized
  - [ ] Memory leaks checked

[ ] Monitoring
  - [ ] Error logging in place
  - [ ] Usage statistics tracked
  - [ ] API limits monitored
  - [ ] Uptime monitoring configured

[ ] Documentation
  - [ ] Admin guide written
  - [ ] Special User guide written
  - [ ] Troubleshooting guide ready
  - [ ] API documentation complete
*/

// ═══════════════════════════════════════════════════════════════════════════
// QUICK START COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

/*
// In browser console, test the system:

// 1. Check if loaded
typeof ExplanationSystem

// 2. Get health status
ExplanationSystem.getHealthStatus()

// 3. Get provider info
ExplanationSystem.aiManager.getProviderStatus()

// 4. Get usage stats
ExplanationSystem.aiManager.getUsageStats()

// 5. Test a question
await ExplanationSystem.initializeQuestionExplanations(
  'question-id',
  document.getElementById('test-container')
)

// 6. Migrate schema
await ExplanationSystem.firestoreHandler.migrateQuestionsSchema('course-id')

// 7. Get pending
await ExplanationSystem.firestoreHandler.getPendingExplanations('chapter-id')
*/

console.log('✅ ExplanationSystem Integration Guide Loaded');
console.log('📚 Call ExplanationSystem.initialize(db, config) to start');
