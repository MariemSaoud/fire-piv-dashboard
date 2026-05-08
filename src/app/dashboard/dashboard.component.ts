import { Component, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface LogLine {
  timestamp: string;
  level: string;
  message: string;
}

interface Stats {
  re: number;
  frames: number;
  maxSpeed: string;
  regime: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {

  reValues = [100, 200, 400, 600, 1000, 1500, 2500, 3500, 4500, 6000];
  activeRe: number | null = null;

  videoUrl: SafeUrl | null = null;
  videoFileName = '';
  logLines: LogLine[] = [];
  logFileName = '';
  logError = false;
  stats: Stats | null = null;

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  activeFrameIndex: number = -1;
  frameLogIndices: number[] = [];
  videoFps: number = 15;
  private _frameCount = 0;

  constructor(private sanitizer: DomSanitizer, private cdr: ChangeDetectorRef) {}

  selectRe(re: number) {
    this.activeRe = re;
    this.logLines = [];
    this.logError = false;
    this.activeFrameIndex = -1;
    this.frameLogIndices = [];
    this._frameCount = 0;
    this.videoFps = 15;

    this.videoFileName = `smoke_Re_${re}.mp4`;
    this.logFileName = `Sim_Re_${re}.log`;

    this.videoUrl = this.sanitizer.bypassSecurityTrustUrl(
      `assets/videos/smoke_Re_${re}.mp4`
    );

    this.stats = {
      re,
      frames: 0,
      maxSpeed: '—',
      regime: re < 500 ? 'Laminar' : re < 2000 ? 'Transitional' : 'Turbulent'
    };

    fetch(`assets/logs/Sim_Re_${re}.log`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        this.parseLog(text);
        this.cdr.detectChanges();
      })
      .catch(() => {
        this.logError = true;
        this.cdr.detectChanges();
      });
  }

  onVideoMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (this._frameCount > 0 && video.duration > 0) {
      this.videoFps = this._frameCount / video.duration;
    }
  }

  onTimeUpdate(event: Event): void {
    const video = event.target as HTMLVideoElement;
    const currentFrame = Math.floor(video.currentTime * this.videoFps) + 1;

    const logIndex = this.frameLogIndices[currentFrame];
    if (logIndex !== undefined && logIndex !== this.activeFrameIndex) {
      this.activeFrameIndex = logIndex;

      setTimeout(() => {
        const el = document.getElementById(`log-line-${logIndex}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 0);

      this.cdr.detectChanges();
    }
  }

  private parseLog(text: string) {
    const lines = text.split('\n').filter(l => l.trim());
    let maxSpeed = 0;
    let frameCount = 0;
    this.frameLogIndices = [];

    this.logLines = lines.map((raw, index) => {
      const tsMatch    = raw.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)/);
      const lvlMatch   = raw.match(/\b(INFO|WARNING|WARN|ERROR|CRITICAL)\b/);
      const frameMatch = raw.match(/Frame\s+(\d+)/);
      const speedMatch = raw.match(/Max Speed:\s*([\d.]+)/);

      if (frameMatch) {
        frameCount = Math.max(frameCount, +frameMatch[1]);
        this.frameLogIndices[+frameMatch[1]] = index;
      }
      if (speedMatch) maxSpeed = Math.max(maxSpeed, +speedMatch[1]);

      const timestamp = tsMatch  ? tsMatch[1]  : '';
      const level     = lvlMatch ? lvlMatch[1] : 'INFO';
      const message   = raw
        .replace(tsMatch?.[0]  ?? '', '')
        .replace(lvlMatch?.[0] ?? '', '')
        .replace(/\s*-\s*/g, ' ')
        .trim();

      return { timestamp, level, message };
    });

    if (this.stats) {
      this.stats.frames   = frameCount;
      this.stats.maxSpeed = maxSpeed > 0 ? maxSpeed.toFixed(3) + ' m/s' : '—';
    }

    this._frameCount = frameCount;
  }

  levelClass(level: string): string {
    switch (level) {
      case 'WARNING': case 'WARN':     return 'lvl-warn';
      case 'ERROR':   case 'CRITICAL': return 'lvl-err';
      default: return 'lvl-info';
    }
  }

  highlightMessage(msg: string): string {
    return msg
      .replace(/([\d.]+)\s*(m\/s|Pa|kg)/g, '<span class="metric">$1 $2</span>')
      .replace(/Frame\s+(\d+)/g, 'Frame <span class="frame-num">$1</span>');
  }
}
