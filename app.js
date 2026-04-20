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

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ── State ──────────────────────────────────────────────────────────────────────
let timerMode = 'work';
let timerRunning = false;
let timeLeft = DURATIONS.work;
let totalTime = DURATIONS.work;
let intervalId = null;
let pomosToday = 0;
let sessionPhase = 'idle';

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateToKey(d) {
  return d.toISOString().slice(0, 10);
}

function getWeekDays() {
  const days = [];
  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + mondayOffset + i);
    days.push(dateToKey(d));
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

function loadTodos() {
  try { return JSON.parse(localStorage.getItem('lockin_todos') || '[]'); }
  catch { return []; }
}

function saveTodos(todos) {
  localStorage.setItem('lockin_todos', JSON.stringify(todos));
}

function loadBestStreak() {
  return parseInt(localStorage.getItem('lockin_best_streak') || '0', 10);
}

function saveBestStreak(n) {
  localStorage.setItem('lockin_best_streak', String(n));
}

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const timerDisplay      = document.getElementById('timerDisplay');
const timerLabel        = document.getElementById('timerLabel');
const ringProgress      = document.getElementById('ringProgress');
const startBtn          = document.getElementById('startBtn');
const resetBtn          = document.getElementById('resetBtn');
const skipBtn           = document.getElementById('skipBtn');
const tomatoDisplay     = document.getElementById('tomatoDisplay');
const motivationBanner  = document.getElementById('motivationBanner');
const goalsList         = document.getElementById('goalsList');
const goalsProgressBar  = document.getElementById('goalsProgressBar');
const goalsProgressLabel= document.getElementById('goalsProgressLabel');
const weekGrid          = document.getElementById('weekGrid');
const weekStats         = document.getElementById('weekStats');
const weekView          = document.getElementById('weekView');
const calendarView      = document.getElementById('calendarView');
const calGrid           = document.getElementById('calGrid');
const calMonthLabel     = document.getElementById('calMonthLabel');
const calPrev           = document.getElementById('calPrev');
const calNext           = document.getElementById('calNext');
const toast             = document.getElementById('toast');
const modalOverlay      = document.getElementById('modalOverlay');
const modalEmoji        = document.getElementById('modalEmoji');
const modalTitle        = document.getElementById('modalTitle');
const modalMsg          = document.getElementById('modalMsg');
const modalCloseBtn     = document.getElementById('modalCloseBtn');
const dateDisplay       = document.getElementById('dateDisplay');
const modeTabs          = document.querySelectorAll('.mode-tab');
const viewTabs          = document.querySelectorAll('.view-tab');
const streakCount       = document.getElementById('streakCount');
const streakBest        = document.getElementById('streakBest');
const streakDisplay     = document.getElementById('streakDisplay');
const notifBtn          = document.getElementById('notifBtn');
const todoInput         = document.getElementById('todoInput');
const todoAddBtn        = document.getElementById('todoAddBtn');
const todoList          = document.getElementById('todoList');
const todoCount         = document.getElementById('todoCount');
const todoClearDone     = document.getElementById('todoClearDone');

// ── Streak ────────────────────────────────────────────────────────────────────
function calculateStreak() {
  const state = loadState();
  const today = todayKey();
  let streak = 0;
  const d = new Date();

  for (let i = 0; i < 366; i++) {
    const key = dateToKey(d);
    const data = state[key];
    const hasActivity = data && (data.sessions > 0 || (data.completed || []).some(Boolean));

    if (hasActivity) {
      streak++;
    } else if (key === today) {
      // Today is still in progress — don't break streak, just skip
    } else {
      break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function updateStreak() {
  const current = calculateStreak();
  let best = loadBestStreak();
  if (current > best) { best = current; saveBestStreak(best); }

  streakCount.textContent = current;
  streakBest.textContent = '🏆 ' + best;
  streakDisplay.classList.toggle('on-fire', current >= 3);
}

// ── Notifications ─────────────────────────────────────────────────────────────
function updateNotifBtn() {
  if (!('Notification' in window)) {
    notifBtn.textContent = '🔕';
    notifBtn.classList.add('denied');
    notifBtn.title = 'Notifications not supported';
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    notifBtn.textContent = '🔔';
    notifBtn.classList.add('enabled');
    notifBtn.classList.remove('denied');
    notifBtn.title = 'Notifications on';
  } else if (perm === 'denied') {
    notifBtn.textContent = '🔕';
    notifBtn.classList.add('denied');
    notifBtn.classList.remove('enabled');
    notifBtn.title = 'Notifications blocked — allow in browser settings';
  } else {
    notifBtn.textContent = '🔔';
    notifBtn.classList.remove('enabled', 'denied');
    notifBtn.title = 'Click to enable notifications';
  }
}

notifBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked. Allow them in your browser settings.');
    return;
  }
  if (Notification.permission !== 'granted') {
    await Notification.requestPermission();
  }
  updateNotifBtn();
});

function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '' });
  } catch {}
}

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
    renderCalendar();
    updateStreak();
    setMotivation('pomoDone');
    const msg = MESSAGES.pomoDone + '\n\nThat\'s ' + pomosToday + ' tomato' + (pomosToday > 1 ? 'es' : '') + ' today. Keep stacking.';
    showModal('🍅', 'Session Complete!', msg);
    playBeep();
    sendNotification('🍅 Session complete!', 'Nice work, Ben. Take a 5-minute break — then back at it.');
    setMode('short');
  } else {
    setMode('work');
    sendNotification('⏰ Break over!', 'Back to work, Ben. No more stalling.');
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
  ringProgress.style.strokeDashoffset = RING_CIRC * (1 - progress);
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
      sendNotification('🏆 All 3 goals done!', 'That\'s a perfect day, Ben. Genuinely proud.');
      updateStreak();
      renderCalendar();
    } else if (doneCount === 2) {
      showModal('💪', 'Two Down!', MESSAGES.twoDone);
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
  goalsProgressBar.style.width = (done / 3 * 100) + '%';
  goalsProgressLabel.textContent = `${done} / 3 complete`;
}

// ── Week View ─────────────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function renderWeek() {
  const days = getWeekDays();
  const today = todayKey();
  const state = loadState();

  let totalPomos = 0, totalGoals = 0, maxPomos = 0;

  days.forEach(d => {
    const data = state[d] || { sessions: 0, completed: [false, false, false] };
    if (data.sessions > maxPomos) maxPomos = data.sessions;
    totalPomos += data.sessions;
    totalGoals += (data.completed || []).filter(Boolean).length;
  });

  weekGrid.innerHTML = '';
  days.forEach((date, i) => {
    const data = state[date] || { sessions: 0, completed: [false, false, false] };
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

// ── Calendar View ─────────────────────────────────────────────────────────────
function renderCalendar() {
  const state = loadState();
  const today = todayKey();
  const now = new Date();

  calMonthLabel.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);

  // Monday-first offset (0=Mon … 6=Sun)
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  calGrid.innerHTML = '';

  // Empty leading cells
  for (let i = 0; i < startOffset; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day empty';
    calGrid.appendChild(cell);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(calYear, calMonth, day);
    const key = dateToKey(d);
    const isFuture = d > now && key !== today;
    const data = state[key];

    const cell = document.createElement('div');
    cell.textContent = day;

    if (isFuture) {
      cell.className = 'cal-day future';
    } else if (!data || (data.sessions === 0 && !(data.completed || []).some(Boolean))) {
      cell.className = 'cal-day no-data';
    } else if ((data.completed || []).every(Boolean)) {
      cell.className = 'cal-day perfect';
      cell.title = `Perfect day! ${data.sessions || 0} pomodoros`;
    } else {
      cell.className = 'cal-day active';
      cell.title = `${data.sessions || 0} pomodoros, ${(data.completed || []).filter(Boolean).length}/3 goals`;
    }

    if (key === today) cell.classList.add('is-today');
    calGrid.appendChild(cell);
  }
}

// ── View Tab Switching ────────────────────────────────────────────────────────
viewTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    viewTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    weekView.classList.toggle('hidden', view !== 'week');
    calendarView.classList.toggle('hidden', view !== 'calendar');
    if (view === 'calendar') renderCalendar();
  });
});

calPrev.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

calNext.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

// ── Todo List ─────────────────────────────────────────────────────────────────
function renderTodos() {
  const todos = loadTodos();
  todoList.innerHTML = '';

  todos.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'todo-item' + (item.done ? ' done' : '');

    const check = document.createElement('button');
    check.className = 'todo-check' + (item.done ? ' checked' : '');
    check.textContent = item.done ? '✓' : '';
    check.addEventListener('click', () => toggleTodo(i));

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = item.text;

    const del = document.createElement('button');
    del.className = 'todo-delete';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', () => deleteTodo(i));

    row.append(check, text, del);
    todoList.appendChild(row);
  });

  const remaining = todos.filter(t => !t.done).length;
  todoCount.textContent = remaining === 0 && todos.length > 0
    ? 'all done!'
    : `${remaining} left`;
}

function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  const todos = loadTodos();
  todos.push({ text, done: false, created: Date.now() });
  saveTodos(todos);
  todoInput.value = '';
  renderTodos();
}

function toggleTodo(index) {
  const todos = loadTodos();
  todos[index].done = !todos[index].done;
  saveTodos(todos);
  renderTodos();
}

function deleteTodo(index) {
  const todos = loadTodos();
  todos.splice(index, 1);
  saveTodos(todos);
  renderTodos();
}

todoAddBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
todoClearDone.addEventListener('click', () => {
  saveTodos(loadTodos().filter(t => !t.done));
  renderTodos();
});

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(emoji, title, msg) {
  modalEmoji.textContent = emoji;
  modalTitle.textContent = title;
  modalMsg.textContent = msg;
  modalOverlay.classList.add('open');
}

modalCloseBtn.addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('open');
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Audio Beep ────────────────────────────────────────────────────────────────
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

// ── Timer Controls ────────────────────────────────────────────────────────────
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
function updateDate() {
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  dateDisplay.textContent = new Date().toLocaleDateString(undefined, opts);
}

updateDate();
const day = getDay(todayKey());
pomosToday = day.sessions || 0;
updateTomatoes();
updateStreak();
updateNotifBtn();
setMode('work');
renderGoals();
renderWeek();
renderTodos();
