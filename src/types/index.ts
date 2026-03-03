export interface SummarizeRequest {
  text: string;
}

export interface ClassifyRequest {
  text: string;
  categories: string[];
}

export interface AutomationRequest {
  task: string;
  data?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}