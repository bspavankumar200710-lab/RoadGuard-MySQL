import { IAIDetectionService, DetectionInputSource } from './aiDetectionService';
import { DetectionResult, DetectionMode } from '../types/detection';
import { analyzeFrameLocally } from './localImageAnalyzer';
import { agentLearningService } from './agentLearningService';

export class GeminiDetectionService implements IAIDetectionService {
  public readonly id: string;
  public readonly name: string;
  public readonly version: string;
  public readonly isReady = true;
  private useFeedbackRules: boolean;

  constructor(
    id: string = 'gemini-feedback',
    name: string = 'Feedback-Guided Gemini Vision (Verified Rules)',
    useFeedbackRules: boolean = true
  ) {
    this.id = id;
    this.name = name;
    this.version = 'v2.4-verified';
    this.useFeedbackRules = useFeedbackRules;
  }

  /**
   * Sends road camera frame or uploaded photograph to /api/detect.
   * If useFeedbackRules is true, incorporates verified reviewer rules & gating.
   * If useFeedbackRules is false (Standard Gemini mode), uses clean baseline prompt.
   */
  public async detectRoadProblems(
    source: DetectionInputSource,
    mimeType: string = 'image/jpeg',
    mode: DetectionMode = 'both'
  ): Promise<DetectionResult> {
    const startTime = performance.now();
    let imageBase64: string;

    if (typeof source === 'string') {
      imageBase64 = source;
    } else if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth || 640;
      canvas.height = source.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      imageBase64 = canvas.toDataURL(mimeType, 0.85);
    } else if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
      imageBase64 = source.toDataURL(mimeType, 0.85);
    } else {
      imageBase64 = '';
    }

    const learnedDirectives = this.useFeedbackRules
      ? agentLearningService.getLearnedPromptDirectives()
      : '';

    const apiEndpoint = typeof window !== 'undefined' ? '/api/detect' : 'http://127.0.0.1:3000/api/detect';
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          mode,
          useFeedbackRules: this.useFeedbackRules,
          learnedDirectives,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (!response.ok || !isJson) {
        console.warn(
          `[GeminiDetectionService] Server returned non-JSON or status ${response.status}. Using client vision fallback.`
        );
        return analyzeFrameLocally(imageBase64, mode, Math.round(performance.now() - startTime));
      }

      const data: DetectionResult = await response.json();
      return {
        detected: Boolean(data.detected),
        objects: Array.isArray(data.objects) ? data.objects : [],
        latencyMs: Math.round(performance.now() - startTime),
        modelUsed: data.modelUsed || this.name,
      };
    } catch (err: any) {
      console.warn('[GeminiDetectionService] Network issue, switching to local vision analyzer:', err?.message);
      return analyzeFrameLocally(imageBase64, mode, Math.round(performance.now() - startTime));
    }
  }
}

// Mode A: Standard Gemini Vision (clean baseline instructions without feedback rules)
export const geminiStandardService = new GeminiDetectionService(
  'gemini-standard',
  'Standard Gemini Vision (Baseline)',
  false
);

// Mode B: Feedback-Guided Gemini Vision (verified driver corrections & gating)
export const geminiFeedbackService = new GeminiDetectionService(
  'gemini-feedback',
  'Feedback-Guided Gemini Vision (Verified Rules)',
  true
);

// Backward-compatible alias
export const geminiDetectionService = geminiFeedbackService;
