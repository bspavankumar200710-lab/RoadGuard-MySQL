/**
 * Hands-Free Audio Alert & Web Speech API Voice Announcer Service
 * Uses Web Speech API (window.speechSynthesis) to announce hazard types
 * (e.g. 'Pothole detected', 'Severe road crack detected') when the monitoring
 * service identifies a high-severity risk, ensuring drivers don't need to look at the screen.
 */
class AudioAlertService {
  private audioCtx: AudioContext | null = null;
  private isAudioEnabled: boolean = true;
  private isSpeechEnabled: boolean = true;
  private highSeverityOnly: boolean = true;
  private lastSpokenTime: number = 0;
  private lastSpokenPhrase: string = '';
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Warm up voices
      this.initVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      // Select best voice: English (India or US/UK)
      const voice =
        voices.find((v) => v.lang.includes('en-IN')) ||
        voices.find((v) => v.lang === 'en-US' && v.name.includes('Natural')) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (voice) {
        this.selectedVoice = voice;
      }
    } catch (e) {
      console.warn('Voice initialization notice:', e);
    }
  }

  public setAudioEnabled(enabled: boolean) {
    this.isAudioEnabled = enabled;
  }

  public getAudioEnabled(): boolean {
    return this.isAudioEnabled;
  }

  public setSpeechEnabled(enabled: boolean) {
    this.isSpeechEnabled = enabled;
  }

  public setVoiceMuted(muted: boolean) {
    this.isSpeechEnabled = !muted;
  }

  public getSpeechEnabled(): boolean {
    return this.isSpeechEnabled;
  }

  public setHighSeverityOnly(onlyHigh: boolean) {
    this.highSeverityOnly = onlyHigh;
  }

  public getHighSeverityOnly(): boolean {
    return this.highSeverityOnly;
  }

  // Pre-unlock speech synthesis and Web Audio on any driver tap/gesture
  public unlockAudio() {
    this.initContext();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
  }

  private initContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Synthesize rapid audio radar warning chimes
   */
  public playHazardWarning(severity: 'low' | 'medium' | 'high' = 'high') {
    if (!this.isAudioEnabled) return;
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (severity === 'high') {
        // High alert distinct double siren pulse
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.12);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (severity === 'medium') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(620, now);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {
      console.warn('Audio alert sound failed:', e);
    }
  }

  /**
   * Announces hazard types via Web Speech API (speechSynthesis).
   * Specifically triggers clear spoken audio alerts (e.g. 'Pothole detected',
   * 'Caution, high severity road crack ahead') so the driver stays focused on the road.
   */
  public speakHazard(text: string, force: boolean = false) {
    if (!this.isSpeechEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const now = Date.now();
    // Throttle duplicate phrases to prevent speech queue buildup while driving
    if (!force && text === this.lastSpokenPhrase && now - this.lastSpokenTime < 4500) {
      return;
    }
    // General debounce between different phrases
    if (!force && now - this.lastSpokenTime < 1800) {
      return;
    }

    try {
      // Cancel previous incomplete speech so the newest urgent hazard is announced immediately
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05; // Slightly faster for prompt driving alerts
      utterance.pitch = 1.05; // Clear alert frequency
      utterance.volume = 1.0;

      if (!this.selectedVoice) {
        this.initVoices();
      }
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      this.lastSpokenTime = now;
      this.lastSpokenPhrase = text;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Web Speech API speakHazard error:', err);
    }
  }

  /**
   * Main announcement method called when hazards are detected.
   * Directly satisfies:
   * "Implement text-to-speech audio alerts using the Web Speech API that announce
   * hazard types (e.g., 'Pothole detected') when the monitoring service identifies
   * a high-severity risk, ensuring drivers don't need to look at the screen."
   */
  public announceDetection(
    type: 'pothole' | 'road_crack' | 'broken_sign' | 'other_hazard' | 'vehicle_speed',
    severity: 'low' | 'medium' | 'high',
    locationHint?: string
  ) {
    // 1. Play alert chime
    this.playHazardWarning(severity);

    // 2. Identify hazard name
    let hazardName = 'Pothole';
    if (type === 'road_crack') hazardName = 'Road crack';
    else if (type === 'broken_sign') hazardName = 'Damaged road sign';
    else if (type === 'other_hazard') hazardName = 'Road obstruction';
    else if (type === 'vehicle_speed') hazardName = 'Moving vehicle';

    // 3. Spoken Announcement formulation
    if (type === 'vehicle_speed') {
      const speedNotice = locationHint ? `${locationHint} detected` : 'Speed alert';
      this.speakHazard(speedNotice, severity === 'high');
      return;
    }

    if (severity === 'high') {
      let alertMessage = `${hazardName} detected ahead! High risk.`;
      if (locationHint && locationHint !== 'Current location' && !locationHint.includes('unavailable')) {
        alertMessage += ` Near ${locationHint}.`;
      }
      this.speakHazard(alertMessage, true);
    } else if (!this.highSeverityOnly) {
      if (severity === 'medium') {
        this.speakHazard(`${hazardName} detected on road.`);
      }
    }
  }

  /**
   * Manual test trigger for drivers to verify text-to-speech volume & voice
   */
  public testSpeechAlert(hazardType: 'pothole' | 'road_crack' | 'broken_sign' = 'pothole') {
    this.unlockAudio();
    this.announceDetection(hazardType, 'high', 'Test Mode');
  }
}

export const audioAlertService = new AudioAlertService();
