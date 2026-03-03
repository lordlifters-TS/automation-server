import { Request, Response } from 'express';
import { OpenAIService } from '../services/openaiservice.js';
import { SummarizeRequest, ClassifyRequest, AutomationRequest } from '../types/index.js';

const openAIService = new OpenAIService();

export class AutomationController {
  async summarize(req: Request, res: Response): Promise<void> {
    try {
      const { text } = req.body as SummarizeRequest;
      
      if (!text) {
        res.status(400).json({
          success: false,
          error: 'Text is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`📝 Summarizing text (${text.length} characters)`);
      const summary = await openAIService.summarize(text);
      
      res.json({
        success: true,
        data: {
          summary,
          original_length: text.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ Summarize Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async classify(req: Request, res: Response): Promise<void> {
    try {
      const { text, categories } = req.body as ClassifyRequest;
      
      if (!text) {
        res.status(400).json({
          success: false,
          error: 'Text is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (!categories || !Array.isArray(categories) || categories.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Categories array is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`🏷️ Classifying into: ${categories.join(', ')}`);
      const classification = await openAIService.classify(text, categories);
      
      res.json({
        success: true,
        data: {
          classification,
          categories
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ Classification Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async runAutomation(req: Request, res: Response): Promise<void> {
    try {
      const { task, data } = req.body as AutomationRequest;
      
      if (!task) {
        res.status(400).json({
          success: false,
          error: 'Task is required',
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`🤖 Running automation: ${task}`);
      const result = await openAIService.runAutomation(task, data || {});
      
      res.json({
        success: true,
        data: {
          result,
          task
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ Automation Error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}