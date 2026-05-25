import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
  OnDestroy,
  ElementRef,
  viewChild,
} from '@angular/core';
import { FormControl } from '@angular/forms';

/**
 * Microphone toggle button that uses the Web Speech API to transcribe
 * voice into a linked FormControl. Appends transcribed text to the current value.
 *
 * Usage:
 *   <app-voice-dictation [control]="form.controls.history" />
 *
 * Browser support: Chrome, Edge (Chromium). Safari partial. Firefox unsupported.
 */
@Component({
  selector: 'app-voice-dictation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (supported) {
      <button
        type="button"
        (click)="toggle()"
        [title]="recording() ? 'Stop dictation' : 'Start voice dictation'"
        [class]="btnCls()"
      >
        <!-- Mic icon -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
             class="size-3.5">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
        @if (recording()) {
          <span class="size-1.5 rounded-full bg-danger-fg animate-pulse"></span>
        }
      </button>
    }
  `,
})
export class VoiceDictationComponent implements OnDestroy {
  /** The form control to append transcription into */
  readonly control = input.required<FormControl<string>>();

  /** Language for recognition (BCP-47) */
  readonly lang = input<string>('en-IN');

  protected readonly recording = signal(false);
  protected readonly supported: boolean;

  private recognition: any = null;

  constructor() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    this.supported = !!SR;
    if (SR) {
      this.recognition = new SR();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = this.lang();

      this.recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          const ctrl = this.control();
          const current = ctrl.value || '';
          const separator = current && !current.endsWith(' ') && !current.endsWith('\n') ? ' ' : '';
          ctrl.setValue(current + separator + transcript.trim());
          ctrl.markAsDirty();
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== 'aborted') {
          this.recording.set(false);
        }
      };

      this.recognition.onend = () => {
        this.recording.set(false);
      };
    }
  }

  toggle() {
    if (!this.recognition) return;
    if (this.recording()) {
      this.recognition.stop();
      this.recording.set(false);
    } else {
      this.recognition.lang = this.lang();
      this.recognition.start();
      this.recording.set(true);
    }
  }

  protected btnCls(): string {
    const base = 'inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] font-medium transition-colors';
    return this.recording()
      ? `${base} bg-danger-bg text-danger-fg border border-danger-fg/30`
      : `${base} text-ink-muted hover:text-ink hover:bg-surface-subtle border border-transparent`;
  }

  ngOnDestroy() {
    if (this.recording()) {
      this.recognition?.stop();
    }
  }
}
