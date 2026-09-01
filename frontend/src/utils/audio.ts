/**
 * Web Audio API Notification Chime Generator
 * Synthesizes a crisp, high-tech neon notification chime on demand without external audio assets.
 */
class NotificationAudio {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public playMentionChime() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Primary oscillator: high crisp tone (880Hz -> 1760Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Harmonic oscillator: soft harmonic undertone (587.33Hz - D5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.05);

      gain2.gain.setValueAtTime(0.2, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);

      osc2.start(now + 0.05);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn('Audio notification failed:', e);
    }
  }
}

export const notificationAudio = new NotificationAudio();
