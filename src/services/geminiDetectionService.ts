import { IAIDetectionService, DetectionInputSource } from './aiDetectionService';
import { DetectionResult, DetectionMode } from '../types/detection';
import { analyzeFrameLocally } from './localImageAnalyzer';
import { agentLearningService } from './agentLearningService';

export class GeminiDetectionService implements IAIDetectionService {
  public readonly id = 'gemini-vision';
  public readonly name = 'Google Gemini 3.8 Flash Vision (Self-Improving Agent)';
  public readonly version = 'v2.4';
  public readonly isReady = true;

  /**
   * Sends the road camera snapshot to the server-side Gemini API endpoint,
   * injecting learned feedback and mistake corrections dynamically.
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

    const learnedDirectives = agentLearningService.getLearnedPromptDirectives();

    try {
      const response = await fetch('/api/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          mode,
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
        modelUsed: data.modelUsed || 'gemini-3.8-flash',
      };
    } catch (err: any) {
      console.warn('[GeminiDetectionService] Network issue, switching to local vision analyzer:', err?.message);
      return analyzeFrameLocally(imageBase64, mode, Math.round(performance.now() - startTime));
    }
  }
}

export const geminiDetectionService = new GeminiDetectionService();
