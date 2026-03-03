import { Request, Response } from 'express';

export class TestController {
  healthCheck(req: Request, res: Response): void {
    res.json({
      status: 'online',
      message: 'AI Automation Server is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      endpoints: this.getEndpointsList()
    });
  }

  testGet(req: Request, res: Response): void {
    res.json({
      message: 'GET endpoint is working!',
      timestamp: new Date().toISOString(),
      headers: req.headers
    });
  }

  testPost(req: Request, res: Response): void {
    console.log('📥 Test POST received:', req.body);
    res.json({
      message: 'POST endpoint is working!',
      received: req.body,
      timestamp: new Date().toISOString()
    });
  }

  private getEndpointsList() {
    return [
      { path: '/', method: 'GET', description: 'Health check' },
      { path: '/api/test', method: 'GET', description: 'Test GET' },
      { path: '/api/test-post', method: 'POST', description: 'Test POST' },
      { path: '/api/automation/summarize', method: 'POST', description: 'Summarize text' },
      { path: '/api/automation/classify', method: 'POST', description: 'Classify text' },
      { path: '/api/automation/run', method: 'POST', description: 'Run automation' }
    ];
  }
}