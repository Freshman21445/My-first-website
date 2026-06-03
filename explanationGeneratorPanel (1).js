/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION GENERATOR PANEL - Special User Interface
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Select question/chapter to explain
 * - Choose resource (paste text or PDF URL)
 * - Select AI provider
 * - Generate explanations (Level 2 & 3)
 * - Edit generated content
 * - Save to Cloudflare & Firestore
 * - Track generation status & history
 */

class ExplanationGeneratorPanel {
  constructor(aiManager, cloudflareHandler, firestoreHandler, config = {}) {
    // ─── Dependencies ──────────────────────────────────────────────────
    this.aiManager = aiManager;
    this.cloudflareHandler = cloudflareHandler;
    this.firestoreHandler = firestoreHandler;

    // ─── Configuration ────────────────────────────────────────────────
    this.config = {
      panelId: config.panelId || 'explanationGeneratorPanel',
      theme: config.theme || 'dark',
      autoSave: config.autoSave || false,
      ...config
    };

    // ─── State Management ──────────────────────────────────────────────
    this.state = {
      currentQuestion: null,
      currentChapter: null,
      selectedResource: null,
      resourceType: null, // 'text' or 'pdf'
      selectedProvider: 'gpt4-turbo',
      generatedExplanations: {
        level2: null,
        level3: null
      },
      editedExplanations: {
        level2: null,
        level3: null
      },
      generationStatus: {
        level2: 'idle', // idle, generating, completed, error
        level3: 'idle'
      },
      saveStatus: null,
      history: []
    };

    // ─── UI Elements Cache ─────────────────────────────────────────────
    this.elements = {};
    this.initialized = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize the panel - create UI and attach event listeners
   */
  async initialize() {
    try {
      this.createPanelUI();
      this.attachEventListeners();
      this.loadSavedState();
      this.initialized = true;
      
      console.log('ExplanationGeneratorPanel initialized');
      return { status: 'initialized' };
    } catch (error) {
      console.error('Error initializing panel:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Create the main panel UI
   */
  createPanelUI() {
    const container = document.getElementById(this.config.panelId);
    if (!container) {
      console.error(`Container with id "${this.config.panelId}" not found`);
      return;
    }

    container.innerHTML = `
      <div class="explanation-generator-panel" style="${this.getPanelStyles()}">
        
        <!-- Header -->
        <div class="gen-header" style="${this.getHeaderStyles()}">
          <h2>📚 Explanation Generator</h2>
          <p class="gen-subtitle">Create multi-level AI explanations for questions</p>
        </div>

        <!-- Main Content -->
        <div class="gen-content" style="${this.getContentStyles()}">
          
          <!-- Step 1: Select Question -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 1: Select Question</h3>
            <div class="gen-form-group">
              <label>Chapter:</label>
              <select id="chapterSelect" class="gen-select" style="${this.getSelectStyles()}">
                <option value="">-- Select Chapter --</option>
              </select>
            </div>
            <div class="gen-form-group">
              <label>Question:</label>
              <select id="questionSelect" class="gen-select" style="${this.getSelectStyles()}">
                <option value="">-- Select Question --</option>
              </select>
            </div>
            <div id="selectedQuestionDisplay" class="gen-info-box" style="${this.getInfoBoxStyles()}"></div>
          </div>

          <!-- Step 2: Resource Input -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 2: Learning Resource</h3>
            
            <div class="gen-tabs" style="${this.getTabsStyles()}">
              <button class="gen-tab-btn active" data-tab="text">📝 Paste Text</button>
              <button class="gen-tab-btn" data-tab="pdf">📄 PDF URL</button>
            </div>

            <div id="textTab" class="gen-tab-content active" style="${this.getTabContentStyles()}">
              <label>Paste study notes, summaries, or relevant text:</label>
              <textarea id="textResource" class="gen-textarea" placeholder="Paste your learning material here..." style="${this.getTextareaStyles()}"></textarea>
              <div class="gen-char-count" id="textCharCount">0 characters</div>
            </div>

            <div id="pdfTab" class="gen-tab-content" style="${this.getTabContentStyles()}">
              <label>Paste a public PDF URL:</label>
              <input type="url" id="pdfUrl" class="gen-input" placeholder="https://example.com/file.pdf" style="${this.getInputStyles()}">
              <p class="gen-hint">Supported: Public URLs from Telegram, Google Drive, or direct PDF links</p>
            </div>

            <div id="resourceStatus" class="gen-status-box" style="${this.getStatusBoxStyles()}"></div>
          </div>

          <!-- Step 3: Provider Selection -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 3: AI Provider</h3>
            <div id="providerOptions" class="gen-provider-grid" style="${this.getProviderGridStyles()}"></div>
            <div id="providerStatus" class="gen-info-box" style="${this.getInfoBoxStyles()}"></div>
          </div>

          <!-- Step 4: Generate Explanations -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 4: Generate Explanations</h3>
            
            <div class="gen-buttons-grid" style="${this.getButtonsGridStyles()}">
              <div class="gen-level">
                <h4>🌊 Deep Explanation (Level 2)</h4>
                <p>Detailed with examples</p>
                <button id="generateLevel2Btn" class="gen-btn gen-btn-primary" style="${this.getButtonStyles()}">
                  Generate Level 2
                </button>
                <div id="level2Status" class="gen-status" style="${this.getStatusStyles()}"></div>
              </div>

              <div class="gen-level">
                <h4>🚀 Super Deep Explanation (Level 3)</h4>
                <p>Comprehensive for mastery</p>
                <button id="generateLevel3Btn" class="gen-btn gen-btn-primary" style="${this.getButtonStyles()}">
                  Generate Level 3
                </button>
                <div id="level3Status" class="gen-status" style="${this.getStatusStyles()}"></div>
              </div>
            </div>
          </div>

          <!-- Step 5: Review & Edit -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 5: Review & Edit</h3>
            
            <div class="gen-explanations-container">
              <!-- Level 2 -->
              <div class="gen-explanation-box">
                <div class="gen-explanation-header" style="${this.getExplanationHeaderStyles()}">
                  <h4>Level 2 Explanation</h4>
                  <span id="level2WordCount" class="gen-word-count"></span>
                </div>
                <textarea id="level2Text" class="gen-textarea" placeholder="Generated explanation will appear here..." style="${this.getTextareaStyles()}"></textarea>
                <div class="gen-explanation-actions" style="${this.getActionsStyles()}">
                  <button id="regenerateLevel2Btn" class="gen-btn gen-btn-secondary" style="${this.getButtonStyles()}">
                    🔄 Regenerate
                  </button>
                </div>
              </div>

              <!-- Level 3 -->
              <div class="gen-explanation-box">
                <div class="gen-explanation-header" style="${this.getExplanationHeaderStyles()}">
                  <h4>Level 3 Explanation</h4>
                  <span id="level3WordCount" class="gen-word-count"></span>
                </div>
                <textarea id="level3Text" class="gen-textarea" placeholder="Generated explanation will appear here..." style="${this.getTextareaStyles()}"></textarea>
                <div class="gen-explanation-actions" style="${this.getActionsStyles()}">
                  <button id="regenerateLevel3Btn" class="gen-btn gen-btn-secondary" style="${this.getButtonStyles()}">
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 6: Save -->
          <div class="gen-section">
            <h3 class="gen-section-title">Step 6: Save to System</h3>
            
            <div class="gen-save-options" style="${this.getSaveOptionsStyles()}">
              <label class="gen-checkbox">
                <input type="checkbox" id="saveLevel2Check" checked>
                Save Level 2 Explanation to Cloudflare
              </label>
              <label class="gen-checkbox">
                <input type="checkbox" id="saveLevel3Check" checked>
                Save Level 3 Explanation to Cloudflare
              </label>
            </div>

            <button id="savAllBtn" class="gen-btn gen-btn-success" style="${this.getSuccessButtonStyles()}">
              💾 Save All Explanations
            </button>

            <div id="saveStatus" class="gen-status-box" style="${this.getStatusBoxStyles()}"></div>
          </div>

          <!-- Status & Statistics -->
          <div class="gen-section">
            <h3 class="gen-section-title">Generation Statistics</h3>
            <div id="statsBox" class="gen-stats-box" style="${this.getStatsBoxStyles()}"></div>
          </div>

        </div>

        <!-- Footer -->
        <div class="gen-footer" style="${this.getFooterStyles()}">
          <p>ℹ️ All explanations are AI-generated and should be reviewed before publishing.</p>
        </div>

      </div>
    `;

    // Cache frequently used elements
    this.cacheElements();
  }

  /**
   * Cache DOM elements for faster access
   */
  cacheElements() {
    this.elements = {
      // Selectors
      chapterSelect: document.getElementById('chapterSelect'),
      questionSelect: document.getElementById('questionSelect'),
      selectedQuestionDisplay: document.getElementById('selectedQuestionDisplay'),

      // Resource
      textResource: document.getElementById('textResource'),
      pdfUrl: document.getElementById('pdfUrl'),
      resourceStatus: document.getElementById('resourceStatus'),
      textCharCount: document.getElementById('textCharCount'),

      // Tabs
      textTab: document.getElementById('textTab'),
      pdfTab: document.getElementById('pdfTab'),
      tabButtons: document.querySelectorAll('.gen-tab-btn'),

      // Provider
      providerOptions: document.getElementById('providerOptions'),
      providerStatus: document.getElementById('providerStatus'),

      // Generation
      generateLevel2Btn: document.getElementById('generateLevel2Btn'),
      generateLevel3Btn: document.getElementById('generateLevel3Btn'),
      level2Status: document.getElementById('level2Status'),
      level3Status: document.getElementById('level3Status'),

      // Edit
      level2Text: document.getElementById('level2Text'),
      level3Text: document.getElementById('level3Text'),
      level2WordCount: document.getElementById('level2WordCount'),
      level3WordCount: document.getElementById('level3WordCount'),
      regenerateLevel2Btn: document.getElementById('regenerateLevel2Btn'),
      regenerateLevel3Btn: document.getElementById('regenerateLevel3Btn'),

      // Save
      saveLevel2Check: document.getElementById('saveLevel2Check'),
      saveLevel3Check: document.getElementById('saveLevel3Check'),
      savAllBtn: document.getElementById('savAllBtn'),
      saveStatus: document.getElementById('saveStatus'),

      // Stats
      statsBox: document.getElementById('statsBox')
    };
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Chapter and question selection
    this.elements.chapterSelect.addEventListener('change', (e) => this.onChapterSelected(e));
    this.elements.questionSelect.addEventListener('change', (e) => this.onQuestionSelected(e));

    // Resource input
    this.elements.textResource.addEventListener('input', (e) => this.updateResourceStatus());
    this.elements.pdfUrl.addEventListener('input', (e) => this.updateResourceStatus());

    // Tab switching
    this.elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Generation
    this.elements.generateLevel2Btn.addEventListener('click', () => this.generateExplanation(2));
    this.elements.generateLevel3Btn.addEventListener('click', () => this.generateExplanation(3));
    this.elements.regenerateLevel2Btn.addEventListener('click', () => this.generateExplanation(2));
    this.elements.regenerateLevel3Btn.addEventListener('click', () => this.generateExplanation(3));

    // Text input tracking
    this.elements.level2Text.addEventListener('input', (e) => {
      this.updateWordCount(e.target, this.elements.level2WordCount);
      this.state.editedExplanations.level2 = e.target.value;
    });
    this.elements.level3Text.addEventListener('input', (e) => {
      this.updateWordCount(e.target, this.elements.level3WordCount);
      this.state.editedExplanations.level3 = e.target.value;
    });

    // Save
    this.elements.savAllBtn.addEventListener('click', () => this.saveExplanations());
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WORKFLOW METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Handle chapter selection
   */
  async onChapterSelected(event) {
    const chapterId = event.target.value;
    this.state.currentChapter = chapterId;

    // Load questions for this chapter
    if (chapterId) {
      await this.loadQuestionsForChapter(chapterId);
    } else {
      this.elements.questionSelect.innerHTML = '<option value="">-- Select Question --</option>';
    }
  }

  /**
   * Load questions from Firestore for selected chapter
   */
  async loadQuestionsForChapter(chapterId) {
    try {
      this.elements.questionSelect.innerHTML = '<option value="">-- Loading... --</option>';

      const db = this.firestoreHandler.db;
      const snapshot = await db.collection('questions')
        .where('chapterId', '==', chapterId)
        .get();

      if (snapshot.empty) {
        this.elements.questionSelect.innerHTML = '<option value="">-- No questions found --</option>';
        this.showMessage('No questions found for this chapter.', 'info');
        return;
      }

      let options = '<option value="">-- Select Question --</option>';
      snapshot.docs.forEach(function(docSnap) {
        const data = docSnap.data();
        const label = data.question
          ? data.question.substring(0, 80) + (data.question.length > 80 ? '...' : '')
          : docSnap.id;
        options += `<option value="${docSnap.id}">${label}</option>`;
      });

      this.elements.questionSelect.innerHTML = options;
      this.showMessage(`${snapshot.docs.length} questions loaded.`, 'info');
    } catch (error) {
      this.elements.questionSelect.innerHTML = '<option value="">-- Error loading --</option>';
      this.showMessage(`Error loading questions: ${error.message}`, 'error');
    }
  }

  /**
   * Handle question selection
   */
  onQuestionSelected(event) {
    const questionId = event.target.value;
    if (!questionId) {
      this.elements.selectedQuestionDisplay.innerHTML = '';
      return;
    }

    this.state.currentQuestion = questionId;
    // TODO: Load question details and display
    this.updateSelectedQuestionDisplay();
  }

  /**
   * Update resource status display
   */
  updateResourceStatus() {
    const textLength = this.elements.textResource.value.length;
    const pdfUrl = this.elements.pdfUrl.value;

    this.elements.textCharCount.textContent = `${textLength} characters`;

    if (textLength > 0) {
      this.state.selectedResource = this.elements.textResource.value;
      this.state.resourceType = 'text';
      this.updateStatus(this.elements.resourceStatus, `✅ Text resource loaded (${textLength} chars)`, 'success');
    } else if (pdfUrl) {
      this.state.selectedResource = pdfUrl;
      this.state.resourceType = 'pdf';
      this.updateStatus(this.elements.resourceStatus, '✅ PDF URL set', 'success');
    } else {
      this.state.selectedResource = null;
      this.updateStatus(this.elements.resourceStatus, '⚠️ No resource provided', 'warning');
    }
  }

  /**
   * Switch between tabs
   */
  switchTab(tab) {
    // Hide all tabs
    this.elements.textTab.classList.remove('active');
    this.elements.pdfTab.classList.remove('active');

    // Remove active from all buttons
    this.elements.tabButtons.forEach(btn => btn.classList.remove('active'));

    // Show selected tab
    if (tab === 'text') {
      this.elements.textTab.classList.add('active');
      this.elements.tabButtons[0].classList.add('active');
    } else if (tab === 'pdf') {
      this.elements.pdfTab.classList.add('active');
      this.elements.tabButtons[1].classList.add('active');
    }
  }

  /**
   * Generate explanation
   */
  async generateExplanation(level) {
    try {
      if (!this.state.currentQuestion) {
        this.showMessage('Please select a question first', 'error');
        return;
      }

      if (!this.state.selectedResource) {
        this.showMessage('Please provide a learning resource', 'error');
        return;
      }

      const levelKey = `level${level}`;
      const statusElement = level === 2 ? this.elements.level2Status : this.elements.level3Status;
      const textElement = level === 2 ? this.elements.level2Text : this.elements.level3Text;

      // Update status
      this.state.generationStatus[levelKey] = 'generating';
      this.updateStatus(statusElement, '⏳ Generating explanation...', 'info');

      // Call AI Manager to generate
      const result = await this.aiManager.generateExplanation(
        `Question: ${this.state.currentQuestion}`,
        this.state.selectedResource,
        level,
        '', // context (can be added later)
        this.state.selectedProvider
      );

      if (result.status === 'success') {
        this.state.generatedExplanations[levelKey] = result.text;
        this.state.editedExplanations[levelKey] = result.text;
        textElement.value = result.text;

        this.state.generationStatus[levelKey] = 'completed';
        this.updateStatus(statusElement, `✅ Generated with ${result.provider}`, 'success');
        this.updateWordCount(textElement, level === 2 ? this.elements.level2WordCount : this.elements.level3WordCount);

        // Log to history
        this.logToHistory('generated', level, result.provider);
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error) {
      const levelKey = `level${level}`;
      this.state.generationStatus[levelKey] = 'error';
      const statusElement = level === 2 ? this.elements.level2Status : this.elements.level3Status;
      this.updateStatus(statusElement, `❌ Error: ${error.message}`, 'error');
      this.logToHistory('error', level, error.message);
    }
  }

  /**
   * Save explanations to Cloudflare and Firestore
   */
  async saveExplanations() {
    try {
      if (!this.state.currentQuestion) {
        this.showMessage('No question selected', 'error');
        return;
      }

      this.updateStatus(this.elements.saveStatus, '⏳ Saving explanations...', 'info');
      const results = [];

      // Save Level 2
      if (this.elements.saveLevel2Check.checked && this.state.editedExplanations.level2) {
        const cloudflareResult = await this.cloudflareHandler.uploadExplanation(
          this.state.currentQuestion,
          this.state.editedExplanations.level2,
          2,
          this.state.selectedProvider
        );

        if (cloudflareResult.status === 'success') {
          const firestoreResult = await this.firestoreHandler.saveExplanationLink(
            this.state.currentQuestion,
            2,
            cloudflareResult.url,
            cloudflareResult.fileId,
            this.state.selectedProvider
          );
          results.push(firestoreResult);
          this.logToHistory('saved', 2, this.state.selectedProvider);
        }
      }

      // Save Level 3
      if (this.elements.saveLevel3Check.checked && this.state.editedExplanations.level3) {
        const cloudflareResult = await this.cloudflareHandler.uploadExplanation(
          this.state.currentQuestion,
          this.state.editedExplanations.level3,
          3,
          this.state.selectedProvider
        );

        if (cloudflareResult.status === 'success') {
          const firestoreResult = await this.firestoreHandler.saveExplanationLink(
            this.state.currentQuestion,
            3,
            cloudflareResult.url,
            cloudflareResult.fileId,
            this.state.selectedProvider
          );
          results.push(firestoreResult);
          this.logToHistory('saved', 3, this.state.selectedProvider);
        }
      }

      const successful = results.filter(r => r.status === 'saved').length;
      this.updateStatus(
        this.elements.saveStatus,
        `✅ Saved ${successful} explanations successfully`,
        'success'
      );

      this.showMessage('Explanations saved successfully!', 'success');
    } catch (error) {
      this.updateStatus(this.elements.saveStatus, `❌ Error: ${error.message}`, 'error');
      this.showMessage(`Save error: ${error.message}`, 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI UPDATE METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Update word count display
   */
  updateWordCount(textElement, countElement) {
    const words = textElement.value.trim().split(/\s+/).filter(w => w).length;
    countElement.textContent = `${words} words`;
  }

  /**
   * Update status display
   */
  updateStatus(element, message, type = 'info') {
    element.textContent = message;
    element.className = `gen-status-box gen-status-${type}`;
  }

  /**
   * Update selected question display
   */
  updateSelectedQuestionDisplay() {
    // TODO: Load and display question details
    this.elements.selectedQuestionDisplay.innerHTML = `
      <p><strong>Question ID:</strong> ${this.state.currentQuestion}</p>
    `;
  }

  /**
   * Show message toast
   */
  showMessage(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // TODO: Implement toast notification UI
  }

  /**
   * Load provider options
   */
  async loadProviderOptions() {
    const providers = this.aiManager.getProviderStatus();
    let html = '';

    providers.forEach(provider => {
      html += `
        <label class="gen-provider-option">
          <input type="radio" name="provider" value="${provider.key}" 
                 ${provider.key === this.state.selectedProvider ? 'checked' : ''}>
          <span class="gen-provider-name">${provider.name}</span>
          <span class="gen-provider-status">${provider.enabled ? '✅ Active' : '⭕ Disabled'}</span>
        </label>
      `;
    });

    this.elements.providerOptions.innerHTML = html;

    // Add change listeners
    document.querySelectorAll('input[name="provider"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.state.selectedProvider = e.target.value;
      });
    });
  }

  /**
   * Log action to history
   */
  logToHistory(action, level, provider) {
    this.state.history.push({
      action: action,
      level: level,
      provider: provider,
      questionId: this.state.currentQuestion,
      timestamp: new Date()
    });
  }

  /**
   * Load saved state from localStorage
   */
  loadSavedState() {
    try {
      const saved = localStorage.getItem('explanationGeneratorState');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = { ...this.state, ...parsed };
      }
    } catch (error) {
      console.warn('Could not load saved state:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  saveState() {
    try {
      localStorage.setItem('explanationGeneratorState', JSON.stringify(this.state));
    } catch (error) {
      console.warn('Could not save state:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STYLING METHODS
  // ═══════════════════════════════════════════════════════════════════════

  getPanelStyles() {
    return `
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-radius: 12px;
      padding: 24px;
      color: #e2e8f0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
    `;
  }

  getHeaderStyles() {
    return `
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid rgba(148, 163, 184, 0.2);
    `;
  }

  getContentStyles() {
    return `
      display: flex;
      flex-direction: column;
      gap: 24px;
    `;
  }

  getSectionStyles() {
    return `
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 8px;
      padding: 20px;
    `;
  }

  getSelectStyles() {
    return `
      width: 100%;
      padding: 10px;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #e2e8f0;
      border-radius: 6px;
      margin-top: 8px;
      font-size: 14px;
    `;
  }

  getInputStyles() {
    return `
      width: 100%;
      padding: 10px;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #e2e8f0;
      border-radius: 6px;
      margin-top: 8px;
      font-size: 14px;
    `;
  }

  getTextareaStyles() {
    return `
      width: 100%;
      padding: 12px;
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.3);
      color: #e2e8f0;
      border-radius: 6px;
      font-family: 'Monaco', monospace;
      font-size: 13px;
      min-height: 200px;
      resize: vertical;
      margin-top: 8px;
    `;
  }

  getButtonStyles() {
    return `
      padding: 10px 16px;
      background: rgba(59, 130, 246, 0.8);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s ease;
    `;
  }

  getSuccessButtonStyles() {
    return `
      padding: 12px 24px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      width: 100%;
      transition: all 0.3s ease;
    `;
  }

  getStatusBoxStyles() {
    return `
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
      margin-top: 12px;
    `;
  }

  getInfoBoxStyles() {
    return `
      background: rgba(59, 130, 246, 0.1);
      border-left: 4px solid rgb(59, 130, 246);
      padding: 12px;
      border-radius: 4px;
      margin-top: 12px;
      font-size: 13px;
    `;
  }

  getTabsStyles() {
    return `
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    `;
  }

  getTabContentStyles() {
    return `
      display: none;
    `;
  }

  getProviderGridStyles() {
    return `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 12px;
    `;
  }

  getButtonsGridStyles() {
    return `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    `;
  }

  getExplanationHeaderStyles() {
    return `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    `;
  }

  getActionsStyles() {
    return `
      display: flex;
      gap: 8px;
      margin-top: 12px;
    `;
  }

  getSaveOptionsStyles() {
    return `
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    `;
  }

  getStatsBoxStyles() {
    return `
      background: rgba(59, 130, 246, 0.05);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 6px;
      padding: 16px;
      margin-top: 12px;
    `;
  }

  getFooterStyles() {
    return `
      text-align: center;
      font-size: 12px;
      color: rgba(148, 163, 184, 0.6);
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    `;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExplanationGeneratorPanel;
}
