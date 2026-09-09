/**
 * ChronoPulse - Precision Stopwatch Application Logic
 * Modern Vanilla JS implementation using delta timing & Web Audio API
 */

class StopwatchApp {
  constructor() {
    // Timing State
    this.isRunning = false;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.lastLapTimestamp = 0;
    this.animationFrameId = null;
    this.laps = [];

    // Audio & Preferences
    this.soundEnabled = localStorage.getItem('chrono_sound') !== 'false';
    this.audioCtx = null;

    // SVG Ring constants (r = 148 => 2 * pi * 148 ≈ 929.91)
    this.RING_CIRCUMFERENCE = 2 * Math.PI * 148;

    // Cache DOM Elements
    this.dom = {
      timerSection: document.querySelector('.timer-section'),
      statusBadge: document.getElementById('statusBadge'),
      statusText: document.querySelector('#statusBadge .status-text'),
      progressCircle: document.getElementById('progressCircle'),
      hours: document.getElementById('hours'),
      minutes: document.getElementById('minutes'),
      seconds: document.getElementById('seconds'),
      milliseconds: document.getElementById('milliseconds'),
      currentLapContainer: document.getElementById('currentLapContainer'),
      currentLapDisplay: document.getElementById('currentLapDisplay'),
      
      // Control Buttons
      startPauseBtn: document.getElementById('startPauseBtn'),
      startPauseIcon: document.getElementById('startPauseIcon'),
      startPauseText: document.getElementById('startPauseText'),
      lapBtn: document.getElementById('lapBtn'),
      resetBtn: document.getElementById('resetBtn'),
      soundToggleBtn: document.getElementById('soundToggleBtn'),
      soundIcon: document.getElementById('soundIcon'),
      
      // Laps UI
      lapsSection: document.getElementById('lapsSection'),
      lapsCountBadge: document.getElementById('lapsCountBadge'),
      lapsActions: document.getElementById('lapsActions'),
      lapStatsGrid: document.getElementById('lapStatsGrid'),
      statFastest: document.getElementById('statFastest'),
      statAverage: document.getElementById('statAverage'),
      statSlowest: document.getElementById('statSlowest'),
      emptyLapsState: document.getElementById('emptyLapsState'),
      lapsTable: document.getElementById('lapsTable'),
      lapsTableBody: document.getElementById('lapsTableBody'),
      copyLapsBtn: document.getElementById('copyLapsBtn'),
      exportCsvBtn: document.getElementById('exportCsvBtn'),
      clearLapsBtn: document.getElementById('clearLapsBtn'),

      // Toast
      toast: document.getElementById('toast'),
      toastMessage: document.getElementById('toastMessage')
    };

    this.init();
  }

  /**
   * Initialize UI and event listeners
   */
  init() {
    this.setupRing();
    this.setupEventListeners();
    this.updateSoundIcon();
    this.renderDisplay(0);
  }

  /**
   * Set up SVG progress ring initial geometry
   */
  setupRing() {
    if (this.dom.progressCircle) {
      this.dom.progressCircle.style.strokeDasharray = `${this.RING_CIRCUMFERENCE}`;
      this.dom.progressCircle.style.strokeDashoffset = `${this.RING_CIRCUMFERENCE}`;
    }
  }

  /**
   * Bind DOM & Window events
   */
  setupEventListeners() {
    this.dom.startPauseBtn.addEventListener('click', () => this.toggleStartPause());
    this.dom.lapBtn.addEventListener('click', () => this.recordLap());
    this.dom.resetBtn.addEventListener('click', () => this.reset());
    this.dom.soundToggleBtn.addEventListener('click', () => this.toggleSound());
    this.dom.copyLapsBtn.addEventListener('click', () => this.copyLapsToClipboard());
    this.dom.exportCsvBtn.addEventListener('click', () => this.exportLapsToCSV());
    this.dom.clearLapsBtn.addEventListener('click', () => this.clearLaps());

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleStartPause();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (this.isRunning) this.recordLap();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (this.elapsedTime > 0 || this.isRunning) this.reset();
      }
    });
  }

  /**
   * Toggle between Start and Pause
   */
  toggleStartPause() {
    this.initAudioContext();

    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  /**
   * Start stopwatch
   */
  start() {
    this.isRunning = true;
    this.startTime = performance.now() - this.elapsedTime;
    
    // UI State updates
    this.dom.timerSection.classList.remove('paused');
    this.dom.timerSection.classList.add('running');
    this.dom.statusText.textContent = 'RUNNING';

    this.dom.startPauseBtn.classList.add('is-running');
    this.dom.startPauseIcon.className = 'fa-solid fa-pause';
    this.dom.startPauseText.textContent = 'Pause';

    this.dom.lapBtn.disabled = false;
    this.dom.resetBtn.disabled = false;

    this.playSound('start');
    this.tick();
  }

  /**
   * Pause stopwatch
   */
  pause() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);

    // UI State updates
    this.dom.timerSection.classList.remove('running');
    this.dom.timerSection.classList.add('paused');
    this.dom.statusText.textContent = 'PAUSED';

    this.dom.startPauseBtn.classList.remove('is-running');
    this.dom.startPauseIcon.className = 'fa-solid fa-play';
    this.dom.startPauseText.textContent = 'Resume';

    this.dom.lapBtn.disabled = true;

    this.playSound('pause');
  }

  /**
   * Reset stopwatch
   */
  reset() {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);

    this.elapsedTime = 0;
    this.startTime = 0;
    this.lastLapTimestamp = 0;
    this.laps = [];

    // UI resets
    this.dom.timerSection.classList.remove('running', 'paused');
    this.dom.statusText.textContent = 'READY';

    this.dom.startPauseBtn.classList.remove('is-running');
    this.dom.startPauseIcon.className = 'fa-solid fa-play';
    this.dom.startPauseText.textContent = 'Start';

    this.dom.lapBtn.disabled = true;
    this.dom.resetBtn.disabled = true;

    this.renderDisplay(0);
    this.updateProgressRing(0);
    this.renderLaps();

    this.playSound('reset');
  }

  /**
   * Main animation tick loop using performance.now()
   */
  tick() {
    if (!this.isRunning) return;

    this.elapsedTime = performance.now() - this.startTime;
    this.renderDisplay(this.elapsedTime);
    this.updateProgressRing(this.elapsedTime);

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  /**
   * Parse milliseconds into { hours, minutes, seconds, centiseconds }
   */
  formatTimeParts(totalMs) {
    const totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    // 2-digit centiseconds (100th of a second)
    const centiseconds = Math.floor((totalMs % 1000) / 10);

    return {
      hh: String(hours).padStart(2, '0'),
      mm: String(minutes).padStart(2, '0'),
      ss: String(seconds).padStart(2, '0'),
      cs: String(centiseconds).padStart(2, '0')
    };
  }

  /**
   * Format milliseconds into human string HH:MM:SS.CS or MM:SS.CS
   */
  formatTimeString(ms, includeHours = false) {
    const { hh, mm, ss, cs } = this.formatTimeParts(ms);
    if (includeHours || parseInt(hh, 10) > 0) {
      return `${hh}:${mm}:${ss}.${cs}`;
    }
    return `${mm}:${ss}.${cs}`;
  }

  /**
   * Update the digital digits on screen
   */
  renderDisplay(ms) {
    const { hh, mm, ss, cs } = this.formatTimeParts(ms);
    this.dom.hours.textContent = hh;
    this.dom.minutes.textContent = mm;
    this.dom.seconds.textContent = ss;
    this.dom.milliseconds.textContent = cs;

    // Current active lap duration
    const currentLapMs = ms - this.lastLapTimestamp;
    this.dom.currentLapDisplay.textContent = this.formatTimeString(currentLapMs);
  }

  /**
   * Update SVG progress circle based on a 60-second cycle
   */
  updateProgressRing(ms) {
    if (!this.dom.progressCircle) return;
    // 60,000 milliseconds = 1 full revolution
    const cycleMs = ms % 60000;
    const progress = cycleMs / 60000;
    const offset = this.RING_CIRCUMFERENCE - (progress * this.RING_CIRCUMFERENCE);
    this.dom.progressCircle.style.strokeDashoffset = `${offset}`;
  }

  /**
   * Record a lap split
   */
  recordLap() {
    if (!this.isRunning) return;

    const currentTotal = this.elapsedTime;
    const lapDuration = currentTotal - this.lastLapTimestamp;
    this.lastLapTimestamp = currentTotal;

    const lapRecord = {
      id: this.laps.length + 1,
      duration: lapDuration,
      totalTime: currentTotal
    };

    // Add new lap at the beginning so newest is displayed on top
    this.laps.unshift(lapRecord);
    this.renderLaps();
    this.playSound('lap');
  }

  /**
   * Render Laps Table and Analytics
   */
  renderLaps() {
    const count = this.laps.length;
    this.dom.lapsCountBadge.textContent = `${count} ${count === 1 ? 'Lap' : 'Laps'}`;

    if (count === 0) {
      this.dom.emptyLapsState.style.display = 'flex';
      this.dom.lapsTable.style.display = 'none';
      this.dom.lapsActions.style.display = 'none';
      this.dom.lapStatsGrid.style.display = 'none';
      this.dom.lapsTableBody.innerHTML = '';
      return;
    }

    this.dom.emptyLapsState.style.display = 'none';
    this.dom.lapsTable.style.display = 'table';
    this.dom.lapsActions.style.display = 'flex';

    // Calculate Fastest, Slowest, and Average when count >= 2
    let fastestLapId = null;
    let slowestLapId = null;
    let minDuration = Infinity;
    let maxDuration = -Infinity;
    let totalLapDuration = 0;

    this.laps.forEach(lap => {
      totalLapDuration += lap.duration;
      if (lap.duration < minDuration) {
        minDuration = lap.duration;
        fastestLapId = lap.id;
      }
      if (lap.duration > maxDuration) {
        maxDuration = lap.duration;
        slowestLapId = lap.id;
      }
    });

    if (count >= 2) {
      this.dom.lapStatsGrid.style.display = 'grid';
      this.dom.statFastest.textContent = this.formatTimeString(minDuration);
      this.dom.statSlowest.textContent = this.formatTimeString(maxDuration);
      this.dom.statAverage.textContent = this.formatTimeString(Math.round(totalLapDuration / count));
    } else {
      this.dom.lapStatsGrid.style.display = 'none';
    }

    // Build Table Rows
    const rowsHtml = this.laps.map(lap => {
      let badgeHtml = '';
      if (count >= 2) {
        if (lap.id === fastestLapId) {
          badgeHtml = '<span class="badge badge-fastest"><i class="fa-solid fa-bolt"></i> Fastest</span>';
        } else if (lap.id === slowestLapId) {
          badgeHtml = '<span class="badge badge-slowest"><i class="fa-solid fa-clock"></i> Slowest</span>';
        }
      }

      return `
        <tr>
          <td class="td-lap">#${String(lap.id).padStart(2, '0')}</td>
          <td class="td-split">+${this.formatTimeString(lap.duration)}</td>
          <td class="td-total">${this.formatTimeString(lap.totalTime, true)}</td>
          <td class="td-badge">${badgeHtml}</td>
        </tr>
      `;
    }).join('');

    this.dom.lapsTableBody.innerHTML = rowsHtml;
  }

  /**
   * Clear lap history
   */
  clearLaps() {
    this.laps = [];
    this.lastLapTimestamp = this.elapsedTime;
    this.renderLaps();
    this.showToast('Lap history cleared');
  }

  /**
   * Copy laps data to clipboard in neat tabular text
   */
  async copyLapsToClipboard() {
    if (this.laps.length === 0) return;

    let text = 'CHRONOPULSE STOPWATCH - LAP TIMES\n';
    text += '=====================================\n';
    text += 'Lap\tLap Time\tTotal Time\n';

    // Export in chronological order (lap 1 -> lap N)
    const sorted = [...this.laps].sort((a, b) => a.id - b.id);
    sorted.forEach(l => {
      text += `#${l.id}\t+${this.formatTimeString(l.duration)}\t${this.formatTimeString(l.totalTime, true)}\n`;
    });

    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Laps copied to clipboard!');
    } catch (err) {
      this.showToast('Could not copy to clipboard');
    }
  }

  /**
   * Export laps to CSV file
   */
  exportLapsToCSV() {
    if (this.laps.length === 0) return;

    let csvContent = 'Lap Number,Lap Time,Total Elapsed Time\n';
    const sorted = [...this.laps].sort((a, b) => a.id - b.id);

    sorted.forEach(l => {
      csvContent += `${l.id},${this.formatTimeString(l.duration)},${this.formatTimeString(l.totalTime, true)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `chronopulse_laps_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.showToast('Exported laps to CSV!');
  }

  /**
   * Web Audio API sound effects synthesizer
   */
  initAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'start') {
      // Crisp rising ping
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'pause') {
      // Descending tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'lap') {
      // High bell ping
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1046.5, now); // C6
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'reset') {
      // Soft double click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('chrono_sound', this.soundEnabled);
    this.updateSoundIcon();
    this.showToast(this.soundEnabled ? 'Sound Enabled' : 'Sound Muted');
  }

  updateSoundIcon() {
    if (this.soundEnabled) {
      this.dom.soundIcon.className = 'fa-solid fa-volume-high';
      this.dom.soundToggleBtn.classList.remove('muted');
    } else {
      this.dom.soundIcon.className = 'fa-solid fa-volume-xmark';
      this.dom.soundToggleBtn.classList.add('muted');
    }
  }

  /**
   * Display toast notification
   */
  showToast(message) {
    this.dom.toastMessage.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toast.classList.remove('show');
    }, 2400);
  }
}

// Instantiate on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.chronoApp = new StopwatchApp();
});
