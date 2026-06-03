/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MANAGER - Core Orchestration System for Multi-Provider AI Integration
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Responsibilities:
 * - Manage multiple AI providers (GPT-4, Claude, GPT-3.5, Hugging Face)
 * - Smart provider switching based on availability & limits
 * - Rate limiting and quota management
 * - Error handling & retry logic
 * - Generate explanations at multiple levels
 * - Track usage and provider status
 */

class AIManager {
  constructor(config = {}) {
    // ─── Configuration ─────────────────────────────────────────────────
    this.config = {
      openaiKey: config.openaiKey || '',
      claudeKey: config.claudeKey || '',
      huggingFaceKey: config.huggingFaceKey || '',
      cohereKey: config.cohereKey || '',
      replicateKey: config.replicateKey || '',
      ...config
    };

    // ─── Provider Definitions ──────────────────────────────────────────
    this.providers = {
      'gpt4-turbo': {
        name: 'OpenAI GPT-4 Turbo',
        type: 'openai',
        model: 'gpt-4-turbo',
        apiKey: this.config.openaiKey,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        maxTokens: 4096,
        rateLimit: { calls: 200, period: 'day' }, // per day
        priority: 1, // Primary
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'claude': {
        name: 'Claude (Anthropic)',
        type: 'claude',
        model: 'claude-sonnet-4-6',
        apiKey: this.config.claudeKey,
        endpoint: 'https://api.anthropic.com/v1/messages',
        maxTokens: 4096,
        rateLimit: { calls: 150, period: 'day' },
        priority: 2, // Backup for deep explanations
        enabled: !!this.config.claudeKey,
        status: 'active',
        currentUsage: 0
      },
      'gpt35': {
        name: 'OpenAI GPT-3.5',
        type: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: this.config.openaiKey,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        maxTokens: 2048,
        rateLimit: { calls: 500, period: 'day' },
        priority: 3, // Overflow for lighter explanations
        enabled: !!this.config.openaiKey,
        status: 'active',
        currentUsage: 0
      },
      'huggingface': {
        name: 'Hugging Face / Self-hosted LLM',
        type: 'huggingface',
        model: 'mistralai/Mistral-7B-Instruct-v0.1',
        apiKey: this.config.huggingFaceKey,
        endpoint: 'https://api-inference.huggingface.co/models/',
        maxTokens: 2048,
        rateLimit: { calls: 1000, period: 'day' }, // Unlimited fallback
        priority: 4, // Fallback
        enabled: !!this.config.huggingFaceKey,
        status: 'active',
        currentUsage: 0
      },
      'cohere': {
        name: 'Cohere API',
        type: 'cohere',
        model: 'command',
        apiKey: this.config.cohereKey,
        endpoint: 'https://api.cohere.com/v1/generate',
        maxTokens: 2048,
        rateLimit: { calls: 200, period: 'day' },
        priority: 5, // Future expansion
        enabled: !!this.config.cohereKey,
        status: 'active',
        currentUsage: 0
      },
      'replicate': {
        name: 'Replicate',
        type: 'replicate',
        model: 'meta/meta-llama-3-70b-instruct',
        apiKey: this.config.replicateKey,
        endpoint: 'https://api.replicate.com/v1/predictions',
        maxTokens: 2048,
        rateLimit: { calls: 300, period: 'day' },
        priority: 6, // Future expansion
        enabled: !!this.config.replicateKey,
        status: 'active',
        currentUsage: 0
      }
    };

    // ─── Request Queue & Retry Logic ───────────────────────────────────
    this.requestQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms

    // ─── Usage Tracking ────────────────────────────────────────────────
    this.usageLog = {};
    this.loadUsageLog();

    // ─── State Management ──────────────────────────────────────────────
    this.currentProviderIndex = 0;
    this.failedProviders = [];
    this.pendingRequests = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CORE METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate explanation at specified level
   * @param {string} question - The question to explain
   * @param {string} correctAnswer - The correct answer
   * @param {number} level - Explanation level (1=basic, 2=deep, 3=super deep)
   * @param {string} context - Optional context from related questions
   * @param {string} preferredProvider - Optional preferred provider
   * @returns {Promise<Object>} - { text, provider, tokens, timestamp }
   */
  async generateExplanation(question, correctAnswer, level = 1, context = '', preferredProvider = null) {
    try {
      const prompt = this.buildPrompt(question, correctAnswer, level, context);
      
      // Determine which provider to use
      let provider = preferredProvider 
        ? this.providers[preferredProvider] 
        : this.selectBestProvider();

      if (!provider) {
        throw new Error('No available AI providers');
      }

      // Check rate limits
      if (!this.checkRateLimit(provider.name)) {
        console.warn(`${provider.name} rate limit reached, trying next provider`);
        return this.generateExplanation(question, correctAnswer, level, context, this.getNextProvider(preferredProvider));
      }

      // Generate with retries
      let result = null;
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          result = await this.callProvider(provider, prompt);
          break;
        } catch (error) {
          console.warn(`Attempt ${attempt + 1} failed for ${provider.name}:`, error);
          if (attempt === this.maxRetries - 1) {
            // Mark provider as failed and try next
            this.failedProviders.push(provider.name);
            return this.generateExplanation(question, correctAnswer, level, context, this.getNextProvider(preferredProvider));
          }
          await this.delay(this.retryDelay * (attempt + 1));
        }
      }

      // Track usage
      this.recordUsage(provider.name);

      return {
        text: result,
        provider: provider.name,
        level: level,
        timestamp: new Date(),
        status: 'success'
      };
    } catch (error) {
      console.error('Error generating explanation:', error);
      return {
        text: null,
        provider: null,
        level: level,
        error: error.message,
        status: 'error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Build optimized prompt based on explanation level
   */
  buildPrompt(question, correctAnswer, level = 1, context = '') {
    let basePrompt = `Question: ${question}\nCorrect Answer: ${correctAnswer}`;
    
    if (context) {
      basePrompt += `\n\nRelated Context:\n${context}`;
    }

    let instructions = '';

    switch(level) {
      case 1: // Basic explanation
        instructions = `Provide a SHORT, clear explanation (2-3 sentences) suitable for offline download. Focus on key concepts.`;
        break;
      case 2: // Deep explanation
        instructions = `Provide a DETAILED explanation (4-6 paragraphs) with examples and deeper understanding. Include:
          - Core concept explanation
          - Relevant examples
          - Common misconceptions
          - Memory aids`;
        break;
      case 3: // Super deep explanation
        instructions = `Provide a COMPREHENSIVE, in-depth explanation (7-10 paragraphs+) for complete mastery. Include:
          - Detailed concept breakdown
          - Real-world applications
          - Advanced examples
          - Step-by-step reasoning
          - Interconnected concepts
          - Advanced memory techniques`;
        break;
      default:
        instructions = `Provide a clear explanation.`;
    }

    return `${basePrompt}\n\nInstruction: ${instructions}\n\nFormat the response in a clear, educational manner.`;
  }

  /**
   * Call the selected provider's API
   */
  async callProvider(provider, prompt) {
    switch(provider.type) {
      case 'openai':
        return this.callOpenAI(provider, prompt);
      case 'claude':
        return this.callClaude(provider, prompt);
      case 'huggingface':
        return this.callHuggingFace(provider, prompt);
      case 'cohere':
        return this.callCohere(provider, prompt);
      case 'replicate':
        return this.callReplicate(provider, prompt);
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  /**
   * Call OpenAI API (GPT-4, GPT-3.5)
   */
  async callOpenAI(provider, prompt) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You are an expert educational tutor explaining concepts clearly and comprehensively.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: provider.maxTokens,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Call Claude API (Anthropic)
   */
  async callClaude(provider, prompt) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: provider.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        system: 'You are an expert educational tutor explaining concepts clearly and comprehensively.'
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Call Hugging Face Inference API
   */
  async callHuggingFace(provider, prompt) {
    const response = await fetch(`${provider.endpoint}${provider.model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: provider.maxTokens,
          temperature: 0.7,
          do_sample: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data[0].generated_text || data[0].summary_text;
  }

  /**
   * Call Cohere API
   */
  async callCohere(provider, prompt) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        prompt: prompt,
        max_tokens: provider.maxTokens,
        temperature: 0.7,
        num_generations: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.generations[0].text;
  }

  /**
   * Call Replicate API
   */
  async callReplicate(provider, prompt) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'e13303f525e3cf8c86f8601e84b2b71eae480438',
        input: { prompt: prompt }
      })
    });

    if (!response.ok) {
      throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Poll for completion if needed
    return data.output ? data.output.join('') : data.output;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROVIDER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Select best available provider based on priority and status
   */
  selectBestProvider() {
    const availableProviders = Object.values(this.providers)
      .filter(p => p.enabled && p.status === 'active' && !this.failedProviders.includes(p.name))
      .sort((a, b) => a.priority - b.priority);

    return availableProviders[0] || null;
  }

  /**
   * Get next available provider (for fallback)
   */
  getNextProvider(currentProvider) {
    const providers = Object.keys(this.providers);
    const current = currentProvider ? providers.indexOf(currentProvider) : 0;
    
    for (let i = current + 1; i < providers.length; i++) {
      const providerKey = providers[i];
      const provider = this.providers[providerKey];
      if (provider.enabled && provider.status === 'active' && !this.failedProviders.includes(provider.name)) {
        return providerKey;
      }
    }
    return null;
  }

  /**
   * Check if provider has reached rate limit
   */
  checkRateLimit(providerName) {
    const today = new Date().toDateString();
    const key = `${providerName}_${today}`;
    
    const usage = this.usageLog[key] || 0;
    
    // Find provider
    const provider = Object.values(this.providers).find(p => p.name === providerName);
    if (!provider) return false;

    return usage < provider.rateLimit.calls;
  }

  /**
   * Record usage for rate limiting
   */
  recordUsage(providerName) {
    const today = new Date().toDateString();
    const key = `${providerName}_${today}`;
    
    this.usageLog[key] = (this.usageLog[key] || 0) + 1;
    this.saveUsageLog();
  }

  /**
   * Get usage statistics
   */
  getUsageStats(providerName = null) {
    const today = new Date().toDateString();
    
    if (providerName) {
      const key = `${providerName}_${today}`;
      const provider = Object.values(this.providers).find(p => p.name === providerName);
      const usage = this.usageLog[key] || 0;
      return {
        provider: providerName,
        used: usage,
        limit: provider ? provider.rateLimit.calls : 0,
        remaining: provider ? provider.rateLimit.calls - usage : 0,
        percentage: provider ? (usage / provider.rateLimit.calls * 100).toFixed(2) : 0
      };
    }

    // Get all providers' stats
    const stats = {};
    Object.values(this.providers).forEach(provider => {
      const key = `${provider.name}_${today}`;
      const usage = this.usageLog[key] || 0;
      stats[provider.name] = {
        used: usage,
        limit: provider.rateLimit.calls,
        remaining: provider.rateLimit.calls - usage,
        percentage: (usage / provider.rateLimit.calls * 100).toFixed(2)
      };
    });
    return stats;
  }

  /**
   * Get provider status
   */
  getProviderStatus() {
    return Object.entries(this.providers).map(([key, provider]) => ({
      key: key,
      name: provider.name,
      enabled: provider.enabled,
      status: provider.status,
      priority: provider.priority,
      type: provider.type,
      hasApiKey: !!provider.apiKey
    }));
  }

  /**
   * Set provider status (enable/disable)
   */
  setProviderStatus(providerKey, enabled) {
    if (this.providers[providerKey]) {
      this.providers[providerKey].enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Update API keys
   */
  updateApiKeys(keys) {
    Object.entries(keys).forEach(([providerKey, apiKey]) => {
      if (this.providers[providerKey]) {
        this.providers[providerKey].apiKey = apiKey;
        this.providers[providerKey].enabled = !!apiKey;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Delay utility for retry logic
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Save usage log to localStorage
   */
  saveUsageLog() {
    try {
      localStorage.setItem('aiManagerUsageLog', JSON.stringify(this.usageLog));
    } catch (e) {
      console.warn('Could not save usage log:', e);
    }
  }

  /**
   * Load usage log from localStorage
   */
  loadUsageLog() {
    try {
      const saved = localStorage.getItem('aiManagerUsageLog');
      if (saved) {
        this.usageLog = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not load usage log:', e);
    }
  }

  /**
   * Reset daily usage logs (call at midnight or on demand)
   */
  resetDailyUsage() {
    const today = new Date().toDateString();
    Object.keys(this.usageLog).forEach(key => {
      if (!key.includes(today)) {
        delete this.usageLog[key];
      }
    });
    this.saveUsageLog();
  }

  /**
   * Get system health check
   */
  getHealthStatus() {
    const enabledProviders = Object.values(this.providers).filter(p => p.enabled).length;
    const activeProviders = Object.values(this.providers).filter(p => p.status === 'active').length;
    const totalProviders = Object.values(this.providers).length;

    return {
      enabled: enabledProviders,
      active: activeProviders,
      total: totalProviders,
      failedProviders: this.failedProviders,
      timestamp: new Date(),
      health: activeProviders > 0 ? 'healthy' : 'degraded'
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER MODULES
// ═══════════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIManager;
}
