import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
    model: "gpt-5",
    reasoning: { effort: "low" },
    instructions: "Talk like a pirate.",
    input: "Are semicolons optional in JavaScript?",
});

console.log(response.output_text);

import { config } from 'dotenv';
config();

// Available OpenAI models
export enum OpenAIModel {
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo-preview',
  GPT_4_32K = 'gpt-4-32k',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  GPT_3_5_TURBO_16K = 'gpt-3.5-turbo-16k',
  GPT_4_O = 'gpt-4o', // Latest model
  GPT_4_O_MINI = 'gpt-4o-mini'
}

// Available response formats
export type ResponseFormat = 'text' | 'json_object' | 'json';

// Interface for OpenAI configuration
interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  model: OpenAIModel;
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  responseFormat: ResponseFormat;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

class OpenAIConfiguration {
  private static instance: OpenAIConfiguration;
  private config: OpenAIConfig;

  private constructor() {
    // Load configuration from environment variables with defaults
    this.config = {
      apiKey: process.env.OPENAI_API_KEY || '',
      organization: process.env.OPENAI_ORGANIZATION,
      model: (process.env.OPENAI_MODEL as OpenAIModel) || OpenAIModel.GPT_3_5_TURBO,
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '500'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      topP: parseFloat(process.env.OPENAI_TOP_P || '1.0'),
      frequencyPenalty: parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      presencePenalty: parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      responseFormat: (process.env.OPENAI_RESPONSE_FORMAT as ResponseFormat) || 'text',
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '1000')
    };
  }

  public static getInstance(): OpenAIConfiguration {
    if (!OpenAIConfiguration.instance) {
      OpenAIConfiguration.instance = new OpenAIConfiguration();
    }
    return OpenAIConfiguration.instance;
  }

  // Get full configuration
  public getConfig(): OpenAIConfig {
    return { ...this.config };
  }

  // Get API key
  public getApiKey(): string {
    return this.config.apiKey;
  }

  // Get model
  public getModel(): OpenAIModel {
    return this.config.model;
  }

  // Get max tokens
  public getMaxTokens(): number {
    return this.config.maxTokens;
  }

  // Get temperature
  public getTemperature(): number {
    return this.config.temperature;
  }

  // Check if API key is valid (not empty)
  public hasValidApiKey(): boolean {
    return this.config.apiKey.startsWith('sk-') && this.config.apiKey.length > 20;
  }

  // Get headers for API requests
  public getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    return headers;
  }

  // Get request configuration
  public getRequestConfig(prompt: string, systemPrompt?: string): any {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const config: any = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty
    };

    // Add response format if specified
    if (this.config.responseFormat === 'json_object') {
      config.response_format = { type: 'json_object' };
    }

    return config;
  }

  // Update configuration dynamically
  public updateConfig(updates: Partial<OpenAIConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // Reset to environment variables
  public resetToEnv(): void {
    this.config = {
      apiKey: process.env.OPENAI_API_KEY || '',
      organization: process.env.OPENAI_ORGANIZATION,
      model: (process.env.OPENAI_MODEL as OpenAIModel) || OpenAIModel.GPT_3_5_TURBO,
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '500'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      topP: parseFloat(process.env.OPENAI_TOP_P || '1.0'),
      frequencyPenalty: parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      presencePenalty: parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      responseFormat: (process.env.OPENAI_RESPONSE_FORMAT as ResponseFormat) || 'text',
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
      retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '1000')
    };
  }

  // Get model display name
  public getModelDisplayName(): string {
    const displayNames: Record<OpenAIModel, string> = {
      [OpenAIModel.GPT_4]: 'GPT-4',
      [OpenAIModel.GPT_4_TURBO]: 'GPT-4 Turbo',
      [OpenAIModel.GPT_4_32K]: 'GPT-4 32K',
      [OpenAIModel.GPT_3_5_TURBO]: 'GPT-3.5 Turbo',
      [OpenAIModel.GPT_3_5_TURBO_16K]: 'GPT-3.5 Turbo 16K',
      [OpenAIModel.GPT_4_O]: 'GPT-4o (Latest)',
      [OpenAIModel.GPT_4_O_MINI]: 'GPT-4o Mini'
    };
    return displayNames[this.config.model] || this.config.model;
  }

  // Get rate limit information
  public getRateLimits(): { requestsPerMinute: number; tokensPerMinute: number } {
    // Based on model tier
    const limits: Record<OpenAIModel, { rpm: number; tpm: number }> = {
      [OpenAIModel.GPT_4]: { rpm: 200, tpm: 40000 },
      [OpenAIModel.GPT_4_TURBO]: { rpm: 500, tpm: 80000 },
      [OpenAIModel.GPT_4_32K]: { rpm: 200, tpm: 40000 },
      [OpenAIModel.GPT_3_5_TURBO]: { rpm: 3500, tpm: 90000 },
      [OpenAIModel.GPT_3_5_TURBO_16K]: { rpm: 3500, tpm: 180000 },
      [OpenAIModel.GPT_4_O]: { rpm: 500, tpm: 80000 },
      [OpenAIModel.GPT_4_O_MINI]: { rpm: 3500, tpm: 180000 }
    };
    
    const modelLimits = limits[this.config.model] || { rpm: 200, tpm: 40000 };
    
    return {
      requestsPerMinute: modelLimits.rpm,
      tokensPerMinute: modelLimits.tpm
    };
  }
}

// Export a singleton instance
export const openAIConfig = OpenAIConfiguration.getInstance();

// Export individual configuration getters for convenience
export const getOpenAIConfig = () => openAIConfig.getConfig();
export const getApiKey = () => openAIConfig.getApiKey();
export const hasValidApiKey = () => openAIConfig.hasValidApiKey();
export const getModel = () => openAIConfig.getModel();
export const getHeaders = () => openAIConfig.getHeaders();
export const getRequestConfig = (prompt: string, systemPrompt?: string) => 
  openAIConfig.getRequestConfig(prompt, systemPrompt);