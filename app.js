'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const DURATIONS = { work: 25 * 60, short: 5 * 60, long: 15 * 60 };
const RING_CIRC = 553; // 2π × 88

const MESSAGES = {
  idle:       "Ready when you are… which, knowing you, might be a while.",
  running:    "Eyes on the clock. No sneaky phone checks.",
  paused:     "Paused? You literally just started.",
  breakStart: "OK fine, you earned a break. Five minutes. NOT fifteen.",
  oneDone:    "One goal down! Two more. Put. The. Confetti. Away.",
  twoDone:    "Almost there… don't you dare quit now, Ben.",
  allDone:    "ACTUALLY impressive. You finished everything. Go touch grass.",
  pomoDone:   "Session done! One tomato earned. Don't let it go to your head.",
  longBreak:  "Long break time. You've been working hard — genuinely.",
  nothingSet: "You haven't even written your goals yet. Classic procrastination move.",
};

const ANTI_CELEBRATE_MSGS = [
  "Chill, it's just one goal. You've got two more.",
  "OK but that was the easy one, wasn't it.",
  "Good start. Don't use this as an excuse to take a 2-hour break.",
  "Nice. Now do the next one before the dopamine wears off.",
];

// ── State ──────────────────────────────────────────────────────────────────────
let timerMode = 'work';
let timerRunning = false;
let timeLeft = DURATIONS.work;
let totalTime = DURATIONS.work;
let intervalId = null;
let pomosToday = 0;
let sessionPhase = 'idle'; // idle | running | paused

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekDays() {
  const days = [];
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const mondayOffset = (dow === 0 ? -6 : 1 - dow);
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + mondayOffset + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ── LocalStorage Helpers ───────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(localStorage.getItem('lockin_state') || '{}'); }
  catch { return {}; }
}

function saveState(s) {
  localStorage.setItem('lockin_state', JSON.stringify(s));
}

function getDay(date) {
  const s = loadState();
  return s[date] || { sessions: 0, goals: ['', '', ''], completed: [false, false, false] };
}

function saveDay(date, data) {
  const s = loadState();
  s[date] = data;
  saveState(s);
}

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const timerDisplay   = document.getElementById('timerDisplay');
const timerLabel     = document.getElementById('timerLabel');
const ringProgress   = document.getElementById('ringProgress');
const startBtn       = document.getElementById('startBtn');
const resetBtn       = document.getElementById('resetBtn');
const skipBtn        = document.getElementById('skipBtn');
const tomatoDisplay  = document.getElementById('tomatoDisplay');
const motivationBanner = document.getElementById('motivationBanner');
const goalsList      = document.getElementById('goalsList');
const goalsProgressBar = document.getElementById('goalsProgressBar');
const goalsProgressLabel = document.getElementById('goalsProgressLabel');
const weekGrid       = document.getElementById('weekGrid');
const weekStats      = document.getElementById('weekStats');
const toast          = document.getElementById('toast');
const modalOverlay   = document.getElementById('modalOverlay');
const modalEmoji     = document.getElementById('modalEmoji');
const modalTitle     = document.getElementById('modalTitle');
const modalMsg       = document.getElementById('modalMsg');
const modalCloseBtn  = document.getElementById('modalCloseBtn');
const dateDisplay    = document.getElementById('dateDisplay');
const modeTabs       = document.querySelectorAll('.mode-tab');

// ── Timer ─────────────────────────────────────────────────────────────────────
function setMode(mode) {
  timerMode = mode;
  timeLeft = DURATIONS[mode];
  totalTime = DURATIONS[mode];
  timerRunning = false;
  sessionPhase = 'idle';
  clearInterval(intervalId);
  modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  updateTimerUI();
  startBtn.textContent = 'Start';
  if (mode === 'work') {
    setMotivation('idle');
    ringProgress.classList.remove('break-mode');
  } else {
    setMotivation(mode === 'long' ? 'longBreak' : 'breakStart');
    ringProgress.classList.add('break-mode');
  }
}

function toggleTimer() {
  if (timerRunning) {
    clearInterval(intervalId);
    timerRunning = false;
    sessionPhase = 'paused';
    startBtn.textContent = 'Resume';
    if (timerMode === 'work') setMotivation('paused');
  } else {
    timerRunning = true;
    sessionPhase = 'running';
    startBtn.textContent = 'Pause';
    if (timerMode === 'work') setMotivation('running');
    intervalId = setInterval(tick, 1000);
  }
}

function tick() {
  if (timeLeft <= 0) {
    clearInterval(intervalId);
    timerRunning = false;
    sessionPhase = 'idle';
    startBtn.textContent = 'Start';
    onTimerComplete();
    return;
  }
  timeLeft--;
  updateTimerUI();
}

function onTimerComplete() {
  if (timerMode === 'work') {
    pomosToday++;
    const today = getDay(todayKey());
    today.sessions = pomosToday;
    saveDay(todayKey(), today);
    updateTomatoes();
    renderWeek();
    setMotivation('pomoDone');
    showModal('🍅', 'Session Complete!', MESSAGES.pomoDone + '\n\nThat\'s ' + pomosToday + ' tomato' + (pomosToday > 1 ? 'es' : '') + ' today. Keep stacking.');
    playBeep();
    setMode('short');
  } else {
    setMode('work');
    showToast('Break over! Back to it, Ben.');
  }
}

function updateTimerUI() {
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  timerDisplay.textContent = `${mins}:${secs}`;
  const labels = { work: 'Work', short: 'Break', long: 'Long Break' };
  timerLabel.textContent = labels[timerMode];
  const progress = (totalTime - timeLeft) / totalTime;
  const offset = RING_CIRC * (1 - progress);
  ringProgress.style.strokeDashoffset = offset;
}

function updateTomatoes() {
  tomatoDisplay.innerHTML = Array.from({ length: pomosToday }, () =>
    '<span class="tomato">🍅</span>'
  ).join('');
}

function setMotivation(key, custom) {
  const msg = custom || MESSAGES[key] || '';
  motivationBanner.textContent = msg;
  motivationBanner.className = 'motivation-banner';
  if (key === 'allDone') motivationBanner.classList.add('success');
  else if (key === 'paused' || key === 'nothingSet') motivationBanner.classList.add('warn');
}

// ── Goals ─────────────────────────────────────────────────────────────────────
function renderGoals() {
  const day = getDay(todayKey());
  goalsList.innerHTML = '';

  day.goals.forEach((text, i) => {
    const done = day.completed[i];
    const item = document.createElement('div');
    item.className = 'goal-item' + (done ? ' completed' : '');

    const num = document.createElement('span');
    num.className = 'goal-number';
    num.textContent = i + 1;

    const check = document.createElement('button');
    check.className = 'goal-checkbox' + (done ? ' checked' : '');
    check.textContent = done ? '✓' : '';
    check.title = done ? 'Mark incomplete' : 'Mark complete';
    check.addEventListener('click', () => toggleGoal(i));

    const wrap = document.createElement('div');
    wrap.className = 'goal-text-wrap';

    const input = document.createElement('input');
    input.className = 'goal-input';
    input.type = 'text';
    input.value = text;
    input.placeholder = `Goal ${i + 1} — write it here`;
    input.disabled = done;
    input.addEventListener('change', () => updateGoalText(i, input.value));
    input.addEventListener('blur', () => updateGoalText(i, input.value));

    wrap.appendChild(input);
    item.append(num, check, wrap);
    goalsList.appendChild(item);
  });

  updateGoalsProgress(day);
}

function updateGoalText(index, value) {
  const day = getDay(todayKey());
  day.goals[index] = value.trim();
  saveDay(todayKey(), day);
}

function toggleGoal(index) {
  const day = getDay(todayKey());
  const allEmpty = day.goals.every(g => !g.trim());
  if (allEmpty) { setMotivation('nothingSet'); return; }
  if (!day.goals[index].trim()) { showToast("Write the goal first, then check it off."); return; }

  day.completed[index] = !day.completed[index];
  saveDay(todayKey(), day);

  const doneCount = day.completed.filter(Boolean).length;

  if (day.completed[index]) {
    if (doneCount === 3) {
      showModal('🏆', 'All 3 Goals Done!', MESSAGES.allDone);
      setMotivation('allDone');
    } else if (doneCount === 2) {
      const msg = MESSAGES.twoDone;
      showModal('💪', 'Two Down!', msg);
      setMotivation('twoDone');
    } else {
      const msg = ANTI_CELEBRATE_MSGS[Math.floor(Math.random() * ANTI_CELEBRATE_MSGS.length)];
      showModal('✅', 'Goal Done!', msg);
      setMotivation('oneDone');
    }
  }

  renderGoals();
  renderWeek();
}

function updateGoalsProgress(day) {
  const done = day.completed.filter(Boolean).length;
  const pct = (done / 3) * 100;
  goalsProgressBar.style.width = pct + '%';
  goalsProgressLabel.textContent = `${done} / 3 complete`;
}

// ── Weekly Analysis ───────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function renderWeek() {
  const days = getWeekDays();
  const today = todayKey();
  const state = loadState();

  let totalPomos = 0;
  let totalGoals = 0;
  let maxPomos = 0;

  days.forEach(d => {
    const data = state[d] || { sessions: 0, completed: [false, false, false] };
    if (data.sessions > maxPomos) maxPomos = data.sessions;
    totalPomos += data.sessions;
    totalGoals += (data.completed || []).filter(Boolean).length;
  });

  weekGrid.innerHTML = '';
  days.forEach((date, i) => {
    const data = state[date] || { sessions: 0, goals: ['', '', ''], completed: [false, false, false] };
    const sessions = data.sessions || 0;
    const completed = data.completed || [false, false, false];
    const isToday = date === today;
    const barH = maxPomos > 0 ? Math.round((sessions / maxPomos) * 60) : 0;

    const col = document.createElement('div');
    col.className = 'day-col';

    const label = document.createElement('div');
    label.className = 'day-label';
    label.textContent = DAY_LABELS[i];

    const barWrap = document.createElement('div');
    barWrap.className = 'day-bar-wrap';
    barWrap.title = `${sessions} session${sessions !== 1 ? 's' : ''}`;

    const bar = document.createElement('div');
    bar.className = 'day-bar' + (isToday ? ' today' : '');
    bar.style.height = barH + 'px';

    barWrap.appendChild(bar);

    const dots = document.createElement('div');
    dots.className = 'day-goals-dots';
    completed.forEach(done => {
      const dot = document.createElement('div');
      dot.className = 'goal-dot' + (done ? ' done' : '');
      dots.appendChild(dot);
    });

    const count = document.createElement('div');
    count.className = 'day-sessions-count';
    count.textContent = sessions > 0 ? sessions + '🍅' : '—';

    col.append(label, barWrap, dots, count);
    weekGrid.appendChild(col);
  });

  const doneGoalDays = days.filter(d => {
    const data = state[d] || { completed: [false, false, false] };
    return (data.completed || []).every(Boolean);
  }).length;

  weekStats.innerHTML = `
    <div class="stat-box">
      <div class="stat-value">${totalPomos}</div>
      <div class="stat-label">Pomodoros</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${totalGoals}</div>
      <div class="stat-label">Goals Done</div>
    </div>
    <div class="stat-box">
      <div class="stat-value">${doneGoalDays}</div>
      <div class="stat-label">Perfect Days</div>
    </div>
  `;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(emoji, title, msg) {
  modalEmoji.textContent = emoji;
  modalTitle.textContent = title;
  modalMsg.textContent = msg;
  modalOverlay.classList.add('open');
}

modalCloseBtn.addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Audio Beep (Web Audio API) ────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch {}
}

// ── Date display ──────────────────────────────────────────────────────────────
function updateDate() {
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  dateDisplay.textContent = new Date().toLocaleDateString(undefined, opts);
}

// ── Daily Reset ───────────────────────────────────────────────────────────────
function checkDailyReset() {
  const day = getDay(todayKey());
  pomosToday = day.sessions || 0;
  updateTomatoes();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
startBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', () => {
  clearInterval(intervalId);
  timerRunning = false;
  sessionPhase = 'idle';
  timeLeft = DURATIONS[timerMode];
  totalTime = DURATIONS[timerMode];
  startBtn.textContent = 'Start';
  updateTimerUI();
  setMotivation('idle');
});
skipBtn.addEventListener('click', () => {
  clearInterval(intervalId);
  timerRunning = false;
  if (timerMode === 'work') {
    setMode('short');
    showToast('Skipped to break. You sure you earned it?');
  } else {
    setMode('work');
    showToast('Break skipped. Respect.');
  }
});

modeTabs.forEach(tab => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateDate();
checkDailyReset();
setMode('work');
renderGoals();
renderWeek();
