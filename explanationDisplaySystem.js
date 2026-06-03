/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPLANATION DISPLAY SYSTEM - User Interface for Multi-Level Explanations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Progressive button disclosure (buttons appear as user advances)
 * - Typing effect animation for realistic AI feel
 * - Blink transition between levels
 * - Offline detection and graceful degradation
 * - Smooth scrolling and transitions
 * - Loading indicators
 * - Error handling
 */

class ExplanationDisplaySystem {
  constructor(cloudflareHandler, firestoreHandler, config = {}) {
    // ─── Dependencies ──────────────────────────────────────────────────
    this.cloudflareHandler = cloudflareHandler;
    this.firestoreHandler = firestoreHandler;

    // ─── Configuration ────────────────────────────────────────────────
    this.config = {
      typingSpeed: config.typingSpeed || 20, // ms per character
      transitionDuration: config.transitionDuration || 300, // ms
      cacheExplanations: config.cacheExplanations || true,
      showLoadingIndicator: config.showLoadingIndicator || true,
      offlineMode: config.offlineMode || false,
      ...config
    };

    // ─── State Management ──────────────────────────────────────────────
    this.state = {
      currentQuestionId: null,
      currentLevel: 1, // 1, 2, or 3
      explanations: {
        level1: null,
        level2: null,
        level3: null
      },
      isLoading: false,
      isOnline: navigator.onLine,
      typingInProgress: false,
      cache: new Map()
    };

    // ─── Event Listeners ───────────────────────────────────────────────
    this.setupOnlineListener();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION & SETUP
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize explanation system for a question
   * @param {string} questionId - Question ID
   * @param {HTMLElement} containerElement - Where to display explanations
   * @returns {Promise<Object>} - Initialization result
   */
  async initializeForQuestion(questionId, containerElement) {
    try {
      this.state.currentQuestionId = questionId;

      // Get explanation links from Firestore
      const explanationLinks = await this.firestoreHandler.getExplanationLinks(questionId);

      // Store explanations metadata
      this.state.explanations = {
        level1: explanationLinks.level1.text || null,
        level2Url: explanationLinks.level2.url || null,
        level3Url: explanationLinks.level3.url || null
      };

      // Create UI
      this.createExplanationUI(containerElement, explanationLinks);

      return {
        status: 'initialized',
        questionId: questionId,
        hasLevel1: !!explanationLinks.level1.available,
        hasLevel2: !!explanationLinks.level2.available,
        hasLevel3: !!explanationLinks.level3.available
      };
    } catch (error) {
      console.error('Error initializing explanation system:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Create the explanation UI
   */
  createExplanationUI(containerElement, explanationLinks) {
    const html = `
      <div class="explanation-system" style="${this.getSystemStyles()}">
        
        <!-- Explanation Display Area -->
        <div class="explanation-display" style="${this.getDisplayStyles()}">
          <div id="explanationContent" class="explanation-content" style="${this.getContentStyles()}">
            <!-- Content will be displayed here -->
          </div>
          <div id="loadingIndicator" class="explanation-loading" style="${this.getLoadingStyles()}; display: none;">
            <div class="spinner" style="${this.getSpinnerStyles()}"></div>
            <p>Loading explanation...</p>
          </div>
        </div>

        <!-- Button Controls -->
        <div class="explanation-controls" style="${this.getControlsStyles()}">
          
          <!-- Level 1: Basic Explanation -->
          <button id="level1Btn" class="exp-btn exp-btn-level1 active" 
                  style="${this.getLevelButtonStyles('level1')}"
                  ${!explanationLinks.level1.available ? 'disabled' : ''}>
            📖 Explanation
          </button>

          <!-- Level 2: Deep Explanation (appears after Level 1) -->
          ${explanationLinks.level2.available ? `
            <button id="level2Btn" class="exp-btn exp-btn-level2 hidden" 
                    style="${this.getLevelButtonStyles('level2')}">
              🌊 Deep Explanation
            </button>
          ` : ''}

          <!-- Level 3: Super Deep (appears after Level 2) -->
          ${explanationLinks.level3.available ? `
            <button id="level3Btn" class="exp-btn exp-btn-level3 hidden" 
                    style="${this.getLevelButtonStyles('level3')}">
              🚀 Super Deep
            </button>
          ` : ''}

          <!-- Offline Indicator -->
          <div id="offlineIndicator" class="offline-indicator hidden" style="${this.getOfflineIndicatorStyles()}">
            <span>📡 Offline - Limited explanations available</span>
          </div>
        </div>

        <!-- Info Messages -->
        <div id="infoMessage" class="explanation-info" style="${this.getInfoStyles()}; display: none;"></div>

      </div>
    `;

    containerElement.innerHTML = html;
    this.cacheElements(containerElement);
    this.attachButtonListeners(explanationLinks);
  }

  /**
   * Cache DOM elements
   */
  cacheElements(containerElement) {
    this.elements = {
      system: containerElement.querySelector('.explanation-system'),
      display: containerElement.querySelector('.explanation-display'),
      content: containerElement.querySelector('#explanationContent'),
      loading: containerElement.querySelector('#loadingIndicator'),
      controls: containerElement.querySelector('.explanation-controls'),
      level1Btn: containerElement.querySelector('#level1Btn'),
      level2Btn: containerElement.querySelector('#level2Btn'),
      level3Btn: containerElement.querySelector('#level3Btn'),
      offlineIndicator: containerElement.querySelector('#offlineIndicator'),
      infoMessage: containerElement.querySelector('#infoMessage')
    };
  }

  /**
   * Attach button event listeners
   */
  attachButtonListeners(explanationLinks) {
    if (this.elements.level1Btn) {
      this.elements.level1Btn.addEventListener('click', () => this.showExplanation(1));
    }

    if (this.elements.level2Btn) {
      this.elements.level2Btn.addEventListener('click', () => this.showExplanation(2));
    }

    if (this.elements.level3Btn) {
      this.elements.level3Btn.addEventListener('click', () => this.showExplanation(3));
    }
  }

  /**
   * Setup online/offline listener
   */
  setupOnlineListener() {
    window.addEventListener('online', () => {
      this.state.isOnline = true;
      this.updateOfflineIndicator();
      console.log('System is back online');
    });

    window.addEventListener('offline', () => {
      this.state.isOnline = false;
      this.updateOfflineIndicator();
      console.log('System is offline');
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPLANATION DISPLAY LOGIC
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show explanation for specified level
   * Progressive disclosure: buttons appear as user advances through levels
   */
  async showExplanation(level) {
    try {
      if (this.state.typingInProgress) {
        console.warn('Typing in progress, please wait');
        return;
      }

      // Show loading indicator
      this.showLoading(true);

      // Get explanation content
      let explanationText = null;

      if (level === 1) {
        // Level 1: From Firestore (already loaded)
        explanationText = this.state.explanations.level1;
      } else if (level === 2) {
        // Level 2: From Cloudflare
        if (!this.state.isOnline) {
          this.showInfo('Deep explanations require internet connection', 'warning');
          this.showLoading(false);
          return;
        }
        explanationText = await this.fetchExplanationFromCloudflare(this.state.explanations.level2Url);
      } else if (level === 3) {
        // Level 3: From Cloudflare
        if (!this.state.isOnline) {
          this.showInfo('Super deep explanations require internet connection', 'warning');
          this.showLoading(false);
          return;
        }
        explanationText = await this.fetchExplanationFromCloudflare(this.state.explanations.level3Url);
      }

      if (!explanationText) {
        this.showInfo('Explanation not available', 'error');
        this.showLoading(false);
        return;
      }

      // If transitioning to a different level, add blink effect
      if (this.state.currentLevel !== level) {
        await this.blinkTransition();
      }

      // Update current level
      this.state.currentLevel = level;

      // Display with typing effect
      this.showLoading(false);
      await this.displayWithTypingEffect(explanationText);

      // Reveal next level button (progressive disclosure)
      this.revealNextLevelButton(level);

      // Update button states
      this.updateButtonStates(level);

    } catch (error) {
      console.error(`Error showing explanation level ${level}:`, error);
      this.showInfo(`Error: ${error.message}`, 'error');
      this.showLoading(false);
    }
  }

  /**
   * Fetch explanation from Cloudflare
   */
  async fetchExplanationFromCloudflare(url) {
    try {
      if (!url) {
        throw new Error('No URL provided');
      }

      // Check cache first
      if (this.state.cache.has(url)) {
        console.log('Retrieved from cache:', url);
        return this.state.cache.get(url);
      }

      // Fetch from Cloudflare
      const result = await this.cloudflareHandler.retrieveByUrl(url);

      if (result.content) {
        // Cache it
        if (this.config.cacheExplanations) {
          this.state.cache.set(url, result.content);
        }
        return result.content;
      } else {
        throw new Error(result.error || 'Failed to retrieve explanation');
      }
    } catch (error) {
      console.error('Error fetching from Cloudflare:', error);
      throw error;
    }
  }

  /**
   * Display text with typing effect
   * Creates realistic AI-generated feel
   */
  async displayWithTypingEffect(text) {
    return new Promise((resolve) => {
      this.state.typingInProgress = true;
      this.elements.content.innerHTML = ''; // Clear previous content

      let index = 0;
      let currentParagraph = document.createElement('p');
      currentParagraph.style.cssText = this.getParagraphStyles();
      this.elements.content.appendChild(currentParagraph);

      const typeNextCharacter = () => {
        if (index < text.length) {
          const char = text[index];

          // Handle line breaks
          if (char === '\n') {
            currentParagraph = document.createElement('p');
            currentParagraph.style.cssText = this.getParagraphStyles();
            this.elements.content.appendChild(currentParagraph);
          } else {
            currentParagraph.textContent += char;
          }

          index++;
          setTimeout(typeNextCharacter, this.config.typingSpeed);
        } else {
          // Typing complete
          this.state.typingInProgress = false;
          resolve();
        }
      };

      typeNextCharacter();
    });
  }

  /**
   * Blink transition effect when switching levels
   * Creates visual feedback that content is changing
   */
  async blinkTransition() {
    return new Promise((resolve) => {
      // Fade out
      this.elements.content.style.opacity = '0';
      this.elements.content.style.transition = `opacity ${this.config.transitionDuration}ms ease`;

      setTimeout(() => {
        this.elements.content.innerHTML = '';
        this.elements.content.style.opacity = '1';
        resolve();
      }, this.config.transitionDuration);
    });
  }

  /**
   * Reveal next level button (progressive disclosure)
   */
  revealNextLevelButton(currentLevel) {
    if (currentLevel === 1 && this.elements.level2Btn) {
      // Animate level 2 button appearance
      this.elements.level2Btn.classList.remove('hidden');
      this.animateButtonAppearance(this.elements.level2Btn);
    }

    if (currentLevel === 2 && this.elements.level3Btn) {
      // Animate level 3 button appearance
      this.elements.level3Btn.classList.remove('hidden');
      this.animateButtonAppearance(this.elements.level3Btn);
    }
  }

  /**
   * Animate button appearance
   */
  animateButtonAppearance(button) {
    button.style.opacity = '0';
    button.style.transform = 'translateY(-10px)';
    button.style.transition = 'all 0.3s ease';

    setTimeout(() => {
      button.style.opacity = '1';
      button.style.transform = 'translateY(0)';
    }, 50);
  }

  /**
   * Update button active states
   */
  updateButtonStates(activeLevel) {
    // Reset all buttons
    [this.elements.level1Btn, this.elements.level2Btn, this.elements.level3Btn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    // Activate current level button
    if (activeLevel === 1 && this.elements.level1Btn) {
      this.elements.level1Btn.classList.add('active');
    } else if (activeLevel === 2 && this.elements.level2Btn) {
      this.elements.level2Btn.classList.add('active');
    } else if (activeLevel === 3 && this.elements.level3Btn) {
      this.elements.level3Btn.classList.add('active');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Show/hide loading indicator
   */
  showLoading(show) {
    if (this.elements.loading) {
      this.elements.loading.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Show info message
   */
  showInfo(message, type = 'info') {
    if (this.elements.infoMessage) {
      this.elements.infoMessage.textContent = message;
      this.elements.infoMessage.className = `explanation-info explanation-info-${type}`;
      this.elements.infoMessage.style.display = 'block';

      // Auto-hide after 5 seconds
      setTimeout(() => {
        this.elements.infoMessage.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Update offline indicator
   */
  updateOfflineIndicator() {
    if (this.elements.offlineIndicator) {
      if (this.state.isOnline) {
        this.elements.offlineIndicator.classList.add('hidden');
      } else {
        this.elements.offlineIndicator.classList.remove('hidden');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get current state
   */
  getState() {
    return {
      currentQuestionId: this.state.currentQuestionId,
      currentLevel: this.state.currentLevel,
      isOnline: this.state.isOnline,
      cacheSize: this.state.cache.size,
      hasLevel1: !!this.state.explanations.level1,
      hasLevel2: !!this.state.explanations.level2Url,
      hasLevel3: !!this.state.explanations.level3Url
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.state.cache.clear();
    return { status: 'cleared', size: 0 };
  }

  /**
   * Pre-cache explanation
   */
  async precacheExplanation(level) {
    try {
      let url;
      if (level === 2) {
        url = this.state.explanations.level2Url;
      } else if (level === 3) {
        url = this.state.explanations.level3Url;
      } else {
        return { status: 'error', message: 'Invalid level' };
      }

      if (!url) {
        return { status: 'error', message: 'No URL available for this level' };
      }

      const content = await this.fetchExplanationFromCloudflare(url);
      return {
        status: 'cached',
        level: level,
        size: content.length,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.state.cache.size,
      items: Array.from(this.state.cache.keys()),
      timestamp: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STYLING METHODS
  // ═══════════════════════════════════════════════════════════════════════

  getSystemStyles() {
    return `
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.5) 0%, rgba(30, 41, 59, 0.3) 100%);
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.2);
    `;
  }

  getDisplayStyles() {
    return `
      background: rgba(15, 23, 42, 0.7);
      border-radius: 8px;
      padding: 20px;
      min-height: 200px;
      position: relative;
      border: 1px solid rgba(148, 163, 184, 0.15);
    `;
  }

  getContentStyles() {
    return `
      color: #e2e8f0;
      line-height: 1.8;
      font-size: 15px;
      font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
    `;
  }

  getLoadingStyles() {
    return `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 200px;
      color: #94a3b8;
    `;
  }

  getSpinnerStyles() {
    return `
      width: 30px;
      height: 30px;
      border: 3px solid rgba(148, 163, 184, 0.2);
      border-top: 3px solid rgb(59, 130, 246);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    `;
  }

  getControlsStyles() {
    return `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      padding: 12px;
      background: rgba(30, 41, 59, 0.5);
      border-radius: 8px;
    `;
  }

  getLevelButtonStyles(level) {
    return `
      padding: 10px 16px;
      border: 2px solid transparent;
      border-radius: 6px;
      background: rgba(59, 130, 246, 0.6);
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      white-space: nowrap;
    `;
  }

  getOfflineIndicatorStyles() {
    return `
      padding: 8px 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 6px;
      color: #fca5a5;
      font-size: 13px;
      margin-left: auto;
    `;
  }

  getInfoStyles() {
    return `
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
    `;
  }

  getParagraphStyles() {
    return `
      margin: 12px 0;
      line-height: 1.8;
    `;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS HELPER - Add to your stylesheet
// ═══════════════════════════════════════════════════════════════════════════

const explanationSystemCSS = `
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

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .explanation-controls {
      flex-direction: column;
    }

    .exp-btn {
      width: 100%;
    }

    .explanation-display {
      min-height: 150px;
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExplanationDisplaySystem;
}
