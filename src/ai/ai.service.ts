import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AIService {
  private aiServiceUrl: string;
  private aiServiceApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL') || 'http://localhost:8000';
    this.aiServiceApiKey = this.configService.get<string>('AI_SERVICE_API_KEY') || 'default-api-key';
    
    // Log configuration status
    if (this.aiServiceApiKey === 'default-api-key') {
      console.warn('⚠️  AI Service API key not configured. Using default (not secure for production).');
      console.warn('   Set AI_SERVICE_API_KEY in .env file.');
    }
    
    if (!this.configService.get<string>('AI_SERVICE_URL')) {
      console.warn('⚠️  AI_SERVICE_URL not set. Using default: http://localhost:8000');
    }
  }

  /**
   * Send message to AI Mentor
   */
  async mentorChat(data: {
    message: string;
    userId?: string;
    hackathonId?: string;
    conversationHistory?: Array<{ role: string; content: string; timestamp?: string }>;
    context?: Record<string, any>;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/mentor`,
          {
            message: data.message,
            userId: data.userId,
            hackathonId: data.hackathonId,
            conversationHistory: data.conversationHistory || [],
            context: data.context || {},
          },
          {
            headers: {
              'X-API-Key': this.aiServiceApiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const result = response.data;
      
      // Check if the AI service returned an error response (even with 200 status)
      if (result.response && (
        result.response.includes('encountered an error') ||
        result.response.includes('quota') ||
        result.response.includes('Error code')
      )) {
        // AI service returned an error response due to OpenAI quota/error
        // Provide helpful fallback based on user's question
        const userMessage = data.message?.toLowerCase() || '';
        let helpfulResponse = "I'm your AI Mentor! I can help you with hackathon rules, submission requirements, and provide feedback. ";
        
        if (userMessage.includes('evaluation') || userMessage.includes('criteria') || userMessage.includes('scoring')) {
          helpfulResponse += "Evaluation criteria typically include: innovation (25-30%), technical implementation (25-30%), problem-solving approach (20-25%), and presentation quality (15-20%). Check the specific hackathon guidelines for exact percentages.";
        } else if (userMessage.includes('minimum') || userMessage.includes('score') || userMessage.includes('percentage')) {
          helpfulResponse += "Minimum scoring percentages vary by hackathon. Generally, projects need at least 60-70% to pass initial review. Higher scores (80%+) are typically required for top placements. Check your hackathon's specific requirements.";
        } else if (userMessage.includes('requirement') || userMessage.includes('need')) {
          helpfulResponse += "Common requirements include: working prototype/demo, clear problem statement, technical documentation, GitHub repository link, and project files. Review your hackathon's specific requirements in the details section.";
        } else if (userMessage.includes('submit') || userMessage.includes('upload') || userMessage.includes('completeness')) {
          helpfulResponse += "To ensure submission completeness: 1) Fill in project title and description, 2) Add your GitHub repository link (required), 3) Upload project files (required), 4) Review AI analysis, 5) Submit for review. Make sure all required fields are completed and your project meets the hackathon requirements.";
        } else if (userMessage.includes('check') || userMessage.includes('verify')) {
          helpfulResponse += "To check your submission: Review that you have completed all required fields (title, description, GitHub link, files), ensure your project meets the hackathon requirements, and verify all files are uploaded correctly.";
        } else {
          helpfulResponse += "I'm currently experiencing technical difficulties with the AI service. Please check the hackathon guidelines or contact the organizers for assistance with your question.";
        }
        
        return {
          response: helpfulResponse,
          suggestions: [
            'Review hackathon requirements',
            'Check submission guidelines',
            'Contact organizers for assistance'
          ],
          timestamp: new Date().toISOString(),
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('AI Mentor error:', error);
      
      // Return helpful fallback response if AI service is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
        // Try to provide a helpful response based on common questions
        const userMessage = data.message?.toLowerCase() || '';
        let helpfulResponse = "I'm your AI Mentor! I can help you with hackathon rules, submission requirements, and provide feedback. ";
        
        if (userMessage.includes('evaluation') || userMessage.includes('criteria') || userMessage.includes('scoring')) {
          helpfulResponse += "Evaluation criteria typically include: innovation (25-30%), technical implementation (25-30%), problem-solving approach (20-25%), and presentation quality (15-20%). Check the specific hackathon guidelines for exact percentages.";
        } else if (userMessage.includes('minimum') || userMessage.includes('score') || userMessage.includes('percentage')) {
          helpfulResponse += "Minimum scoring percentages vary by hackathon. Generally, projects need at least 60-70% to pass initial review. Higher scores (80%+) are typically required for top placements. Check your hackathon's specific requirements.";
        } else if (userMessage.includes('requirement') || userMessage.includes('need')) {
          helpfulResponse += "Common requirements include: working prototype/demo, clear problem statement, technical documentation, GitHub repository link, and project files. Review your hackathon's specific requirements in the details section.";
        } else if (userMessage.includes('submit') || userMessage.includes('upload') || userMessage.includes('completeness')) {
          helpfulResponse += "To ensure submission completeness: 1) Fill in project title and description, 2) Add your GitHub repository link (required), 3) Upload project files (required), 4) Review AI analysis, 5) Submit for review. Make sure all required fields are completed.";
        } else {
          helpfulResponse += "The AI service is currently unavailable. Please start the AI service (python3 ai-service/main.py) or check the hackathon guidelines for assistance.";
        }
        
        return {
          response: helpfulResponse,
          suggestions: [
            'Review hackathon requirements',
            'Check submission guidelines',
            'Contact organizers for assistance'
          ],
          timestamp: new Date().toISOString(),
        };
      }

      throw new HttpException(
        error.response?.data?.detail || 'Failed to get AI mentor response',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Analyze project before submission (for pre-submission review)
   */
  async analyzeProject(data: {
    hackathonId: string;
    title: string;
    description: string;
    requirements?: any;
  }) {
    try {
      // Use a temporary submissionId for pre-submission analysis
      const tempSubmissionId = `temp-${Date.now()}`;
      
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/analyze`,
          {
            submissionId: tempSubmissionId,
            hackathonId: data.hackathonId,
            title: data.title,
            description: data.description,
            requirements: data.requirements || {},
          },
          {
            headers: {
              'X-API-Key': this.aiServiceApiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const result = response.data;
      
      // Check if the AI service returned an error response (even with 200 status)
      if (result.explanation && (
        result.explanation.includes('Error during AI analysis') ||
        result.explanation.includes('quota') ||
        result.explanation.includes('Error code')
      )) {
        // AI service returned a fallback response due to OpenAI error
        // Clean up the explanation and filter weaknesses
        let cleanExplanation = result.explanation
          .replace(/Error during AI analysis:.*?\. /, '')
          .replace(/Error code:.*?\. /, '')
          .replace(/.*quota.*?\. /i, '')
          .trim();
        
        // If explanation is empty or too short, provide a default
        if (!cleanExplanation || cleanExplanation.length < 20) {
          cleanExplanation = 'Your project will be reviewed manually after submission. The AI analysis service is temporarily unavailable.';
        }
        
        // Filter out error-related weaknesses
        const filteredWeaknesses = (result.weaknesses || []).filter(
          (w: string) => !w.toLowerCase().includes('ai analysis unavailable') &&
                         !w.toLowerCase().includes('ai analysis failed') &&
                         !w.toLowerCase().includes('quota')
        );
        
        return {
          ...result,
          weaknesses: filteredWeaknesses.length > 0 ? filteredWeaknesses : [],
          explanation: cleanExplanation,
        };
      }
      
      return result;
    } catch (error: any) {
      console.error('AI Project Analyzer error:', error);
      
      // Return fallback response if AI service is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
        return {
          submissionId: `temp-${Date.now()}`,
          matchPercentage: 75.0,
          decision: 'PASS_TO_OFFLINE_REVIEW',
          explanation: 'AI service is currently unavailable. Your project will be reviewed manually after submission.',
          strengths: ['Project structure is complete'],
          weaknesses: [], // Don't include "AI analysis unavailable" as a project weakness
          suggestions: ['Configure AI service for detailed analysis', 'Ensure all required fields are filled', 'Add more details to your description'],
        };
      }

      throw new HttpException(
        error.response?.data?.detail || 'Failed to analyze project',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Analyze submission (used by submissions service)
   */
  async analyzeSubmission(data: {
    submissionId: string;
    hackathonId: string;
    title: string;
    description: string;
    requirements: any;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiServiceUrl}/analyze`,
          {
            submissionId: data.submissionId,
            hackathonId: data.hackathonId,
            title: data.title,
            description: data.description,
            requirements: data.requirements,
          },
          {
            headers: {
              'X-API-Key': this.aiServiceApiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      console.error('AI Analyzer error:', error);
      
      // Return fallback response if AI service is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
        return {
          submissionId: data.submissionId,
          matchPercentage: 75.0,
          decision: 'PASS_TO_OFFLINE_REVIEW',
          explanation: 'AI service is currently unavailable. Submission passed for manual review.',
          strengths: ['Submission structure is complete'],
          weaknesses: ['AI analysis unavailable'],
          suggestions: ['Configure AI service for detailed analysis'],
        };
      }

      throw new HttpException(
        error.response?.data?.detail || 'Failed to analyze submission',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

