const STORAGE_KEY = "momentum-tasks-v5";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const defaultCats = [
  { id: "travail", label: "Travail", icon: "💼" },
  { id: "perso", label: "Perso", icon: "🏠" },
  { id: "etudes", label: "Études", icon: "📚" },
  { id: "sante", label: "Santé", icon: "🧘‍♂️" },
  { id: "idees", label: "Idées", icon: "💡" },
  { id: "autre", label: "Autre", icon: "📌" }
];
function loadCategories() {
  try {
    const s = localStorage.getItem("momentum-cats-v5");
    if(s) return JSON.parse(s);
  } catch(e) {}
  return [...defaultCats];
}

const PRIORITY_LABELS = { high: "🔥 Haute", medium: "⚡ Moyenne", low: "💤 Basse" };

const state = {
  tasks: loadTasks(),
  xp: Number(localStorage.getItem("momentum-xp")) || 0,
  view: localStorage.getItem("momentum-view-v5") || "cards",
  theme: localStorage.getItem("momentum-theme-v5") || "auto",
  searchTerm: "", categoryFilter: "all", tagFilter: null, editingTaskId: null,
  pomoTask: null, pomoTimeLeft: 25 * 60, pomoInterval: null, pomoActive: false,
  calendarExpanded: false,
  zenIndex: 0,
  categories: loadCategories()
};

const body = document.body;
const themeSelect = document.getElementById("themeSelect");
const viewBtns = document.querySelectorAll(".view-btn");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const boardContainer = document.getElementById("boardContainer");
const template = document.getElementById("taskItemTemplate");
const calendarList = document.getElementById("calendarList");
const tagsList = document.getElementById("tagsList");
const archiveDoneBtn = document.getElementById("archiveDoneBtn");

const pomoPanel = document.getElementById("pomodoroPanel");
const pomoTaskName = document.getElementById("pomoTaskName");
const pomoTime = document.getElementById("pomoTime");
const pomoActionBtn = document.getElementById("pomoActionBtn");
const pomoCloseBtn = document.getElementById("pomoCloseBtn");

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskCategory = document.getElementById("taskCategory");
const taskPriority = document.getElementById("taskPriority");
const taskDueDate = document.getElementById("taskDueDate");
const taskRecurrence = document.getElementById("taskRecurrence");

let analyticsChartBar = null;
let analyticsChartPie = null;

hydrateState();
setupListeners();
applyTheme();
setInterval(applyTheme, 60000);
render();

function renderCategories() {
  const opts = state.categories.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join("");
  document.getElementById("taskCategory").innerHTML = opts + `<option value="new">➕ NOUVELLE CATÉGORIE...</option>`;
  document.getElementById("categoryFilter").innerHTML = `<option value="all">Toutes les catégories</option>` + opts;
  const tplSelect = template.content.querySelector(".edit-category");
  if(tplSelect) tplSelect.innerHTML = opts;
}

function hydrateState() {
  body.dataset.view = state.view;
  themeSelect.value = state.theme;
  viewBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.view));
  renderCategories();
}

function applyTheme() {
  const hour = new Date().getHours();
  const greetingEl = document.getElementById("greetingText");
  if(hour >= 5 && hour < 12) greetingEl.textContent = "☀️ Bonjour, on s'y met !";
  else if(hour >= 12 && hour < 18) greetingEl.textContent = "🚀 Bon après-midi !";
  else greetingEl.textContent = "🌙 Bonsoir, relaxons-nous.";

  let activeTheme = state.theme;
  if(state.theme === "auto") {
    activeTheme = (hour >= 19 || hour < 7) ? "neon" : "pastel";
  }
  document.body.dataset.theme = activeTheme;
}

function addXP(priority) {
  const gains = { high: 50, medium: 25, low: 10 };
  state.xp += gains[priority] || 10;
  localStorage.setItem("momentum-xp", state.xp);
  updateXPUI();
}

function updateXPUI() {
  const currentLevel = Math.floor(Math.sqrt(state.xp / 100)) + 1;
  const nextLevelXP = Math.pow(currentLevel, 2) * 100;
  const prevLevelXP = Math.pow(currentLevel - 1, 2) * 100;
  let progress = ((state.xp - prevLevelXP) / (nextLevelXP - prevLevelXP)) * 100;
  progress = Math.max(0, Math.min(100, progress));
  
  document.getElementById("levelText").textContent = `Niveau ${currentLevel}`;
  document.getElementById("xpText").textContent = `${state.xp} / ${nextLevelXP} XP`;
  document.getElementById("xpFill").style.width = `${progress}%`;
}

function setupListeners() {
  themeSelect.addEventListener("change", e => {
    state.theme = e.target.value;
    localStorage.setItem("momentum-theme-v5", state.theme);
    applyTheme();
  });

  viewBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      body.dataset.view = state.view;
      localStorage.setItem("momentum-view-v5", state.view);
      viewBtns.forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
      render();
    });
  });

  searchInput.addEventListener("input", e => { state.searchTerm = e.target.value.trim().toLowerCase(); render(); });
  categoryFilter.addEventListener("change", e => { state.categoryFilter = e.target.value; render(); });

  taskCategory.addEventListener("change", e => {
    if(e.target.value === "new") {
      const label = prompt("Nom de la nouvelle catégorie ?");
      if(label && label.trim() !== "") {
        const id = label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const icon = prompt("Un émoji ? (Laissez vide pour 📌)") || "📌";
        state.categories.push({ id, label, icon });
        localStorage.setItem("momentum-cats-v5", JSON.stringify(state.categories));
        renderCategories();
        e.target.value = id;
        render();
      } else {
        e.target.value = state.categories[0].id;
      }
    }
  });

  taskForm.addEventListener("submit", e => {
    e.preventDefault();
    if(!taskInput.value.trim()) return;
    state.tasks.unshift({
      id: crypto.randomUUID(),
      text: taskInput.value.trim(),
      category: taskCategory.value,
      priority: taskPriority.value,
      dueDate: taskDueDate.value,
      recurrence: taskRecurrence.value,
      status: "todo",
      subtasks: [],
      archived: false,
      xpClaimed: false,
      createdAt: new Date().toISOString()
    });
    taskInput.value = ""; taskDueDate.value = ""; taskRecurrence.value = "none";
    saveTasks(); render();
  });

  archiveDoneBtn.addEventListener("click", () => {
    state.tasks.forEach(t => { if(t.status === "done") t.archived = true; });
    saveTasks(); render();
  });

  const calSection = document.getElementById("calendarSection");
  if(calSection) {
    calSection.addEventListener("click", () => {
      state.calendarExpanded = !state.calendarExpanded;
      renderCalendar();
    });
  }

  boardContainer.addEventListener("click", e => {
    const item = e.target.closest(".task-item");
    if(!item) return;
    const id = item.dataset.id;
    const task = state.tasks.find(t => t.id === id);
    if(!task) return;

    if(e.target.closest(".delete-btn")) {
      state.tasks = state.tasks.filter(t => t.id !== id);
      saveTasks(); render();
    } else if(e.target.closest(".edit-btn")) {
      state.editingTaskId = id; render();
    } else if(e.target.closest(".cancel-btn")) {
      state.editingTaskId = null; render();
    } else if(e.target.closest(".save-btn")) {
      task.text = item.querySelector(".edit-input").value;
      task.category = item.querySelector(".edit-category").value;
      task.priority = item.querySelector(".edit-priority").value;
      task.dueDate = item.querySelector(".edit-due-date").value;
      task.recurrence = item.querySelector(".edit-recurrence").value;
      state.editingTaskId = null;
      saveTasks(); render();
    } else if(e.target.closest(".add-subtask-btn")) {
      const row = item.querySelector(".subtask-input-row");
      row.hidden = !row.hidden;
      if(!row.hidden) row.querySelector(".subtask-add-input").focus();
    } else if(e.target.closest(".pomo-start-btn")) {
      startPomodoro(task);
    } else if(e.target.closest(".subtask-delete")) {
      const idx = e.target.closest(".subtask-item").dataset.index;
      task.subtasks.splice(idx, 1);
      saveTasks(); render();
    } else if(e.target.matches(".hashtag")) {
      const t = e.target.textContent.toLowerCase();
      state.tagFilter = state.tagFilter === t ? null : t;
      render();
    }
  });

  boardContainer.addEventListener("change", e => {
    const item = e.target.closest(".task-item");
    if(!item) return;
    const id = item.dataset.id;
    const task = state.tasks.find(t => t.id === id);
    if(!task) return;

    if(e.target.matches(".task-toggle")) {
      task.status = e.target.checked ? "done" : "todo";
      if(task.status === "done") {
        task.completedAt = new Date().toISOString();
        if(!task.xpClaimed) { addXP(task.priority); task.xpClaimed = true; }
        if(task.recurrence && task.recurrence !== "none") handleRecurrence(task);
      }
      saveTasks(); render();
    } else if(e.target.matches(".subtask-toggle")) {
      const idx = e.target.closest(".subtask-item").dataset.index;
      task.subtasks[idx].done = e.target.checked;
      saveTasks(); render();
    }
  });

  boardContainer.addEventListener("keydown", e => {
    if(e.target.matches(".subtask-add-input") && e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if(val) {
        const id = e.target.closest(".task-item").dataset.id;
        const task = state.tasks.find(t => t.id === id);
        task.subtasks.push({ text: val, done: false });
        e.target.value = "";
        saveTasks(); render();
      }
    }
  });

  setupDragAndDrop();

  pomoActionBtn.addEventListener("click", () => {
    if(state.pomoActive) pausePomodoro(); else resumePomodoro();
  });
  pomoCloseBtn.addEventListener("click", () => {
    pausePomodoro(); pomoPanel.hidden = true; state.pomoTask = null;
  });
}

function handleRecurrence(task) {
  const isAlreadyCloned = state.tasks.some(t => t.originalId === task.id && t.status === "todo");
  if(isAlreadyCloned) return;
  const clone = { ...task, id: crypto.randomUUID(), originalId: task.id, status: "todo", createdAt: new Date().toISOString(), xpClaimed: false };
  clone.subtasks = clone.subtasks.map(s => ({...s, done: false}));
  if(task.dueDate) {
    const d = new Date(task.dueDate);
    if(task.recurrence === "daily") d.setDate(d.getDate() + 1);
    if(task.recurrence === "weekly") d.setDate(d.getDate() + 7);
    if(task.recurrence === "monthly") d.setMonth(d.getMonth() + 1);
    clone.dueDate = d.toISOString().split("T")[0];
  }
  state.tasks.push(clone);
}

function setupDragAndDrop() {
  let draggedTaskId = null;
  boardContainer.addEventListener("dragstart", e => {
    const item = e.target.closest(".task-item");
    if(item) { draggedTaskId = item.dataset.id; setTimeout(() => item.classList.add("dragging"), 0); }
  });
  boardContainer.addEventListener("dragend", e => {
    const item = e.target.closest(".task-item");
    if(item) item.classList.remove("dragging");
    draggedTaskId = null;
  });
  boardContainer.addEventListener("dragover", e => {
    e.preventDefault();
    const list = e.target.closest(".task-list");
    if (!list) return;
    const afterElement = getDragAfterElement(list, e.clientY);
    const draggingElement = document.querySelector(".dragging");
    if(!draggingElement) return;
    if (afterElement == null) list.appendChild(draggingElement);
    else list.insertBefore(draggingElement, afterElement);
  });
  boardContainer.addEventListener("drop", e => {
    e.preventDefault();
    const list = e.target.closest(".task-list");
    if(list && draggedTaskId) {
      const task = state.tasks.find(t => t.id === draggedTaskId);
      if(state.view === "kanban") {
        const colStatus = list.dataset.status;
        if(colStatus) {
           task.status = colStatus;
           if(task.status === "done" && !task.xpClaimed) { task.completedAt = new Date().toISOString(); addXP(task.priority); task.xpClaimed = true; if(task.recurrence && task.recurrence !== 'none') handleRecurrence(task); }
        }
      }
      const domIds = Array.from(list.querySelectorAll(".task-item")).map(el => el.dataset.id);
      const taskItems = state.tasks.filter(t => domIds.includes(t.id));
      const otherTasks = state.tasks.filter(t => !domIds.includes(t.id));
      taskItems.sort((a,b) => domIds.indexOf(a.id) - domIds.indexOf(b.id));
      state.tasks = [...taskItems, ...otherTasks];
      saveTasks(); render();
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getVisibleTasks() {
  return state.tasks.filter(task => {
    if(state.view === "archives") return task.archived;
    if(task.archived) return false;
    if(state.categoryFilter !== 'all' && task.category !== state.categoryFilter) return false;
    if(state.tagFilter && !task.text.toLowerCase().includes(state.tagFilter.toLowerCase())) return false;
    if(state.searchTerm && !task.text.toLowerCase().includes(state.searchTerm)) return false;
    return true;
  });
}

function getDueDiff(dueDate) {
  if(!dueDate) return null;
  const d = new Date(dueDate); d.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((d.getTime() - now.getTime()) / MS_PER_DAY);
}

function render() {
  updateXPUI();
  updateStats();
  renderCalendar();
  renderTags();
  
  if(analyticsChartBar) { analyticsChartBar.destroy(); analyticsChartBar = null; }
  if(analyticsChartPie) { analyticsChartPie.destroy(); analyticsChartPie = null; }

  const tasks = getVisibleTasks();
  boardContainer.innerHTML = "";
  
  if(state.view === "archives") renderList(tasks, true);
  else if(state.view === "kanban") renderKanban(tasks);
  else if(state.view === "zen") renderZen(tasks);
  else if(state.view === "analytics") renderAnalytics();
  else renderList(tasks);
}

function renderZen(tasks) {
  const active = tasks.filter(t => t.status === "todo")
    .sort((a,b) => {
       const uA = getDueDiff(a.dueDate)===null ? 999 : getDueDiff(a.dueDate);
       const uB = getDueDiff(b.dueDate)===null ? 999 : getDueDiff(b.dueDate);
       if(uA !== uB) return uA - uB;
       const pA = a.priority==='high'?3:(a.priority==='medium'?2:1);
       const pB = b.priority==='high'?3:(b.priority==='medium'?2:1);
       return pB - pA;
    });

  if(active.length === 0) {
    boardContainer.innerHTML = `<div class="zen-card empty"><h2>🎉 Tout est fait !</h2><p>Vous n'avez plus aucune tâche en attente.</p><div class="zen-actions"><button class="zen-btn neutral" onclick="exitZen()">Quitter la zone Zen</button></div></div>`;
    return;
  }
  
  if(state.zenIndex >= active.length) state.zenIndex = 0;
  const t = active[state.zenIndex];
  
  const node = document.createElement("div");
  node.className = "zen-card";
  node.innerHTML = `
    <span class="zen-badge">${PRIORITY_LABELS[t.priority]}</span>
    <h2>${processTextWithTags(t.text)}</h2>
    <p class="zen-meta">${t.dueDate ? "⏳ Prévu pour le " + new Date(t.dueDate).toLocaleDateString() : "💡 Aucune échéance pressante"}</p>
    <div class="zen-actions">
      <button class="zen-btn primary" onclick="markZenDone('${t.id}')">✔️ C'est Fait !</button>
      <button class="zen-btn secondary" onclick="skipZen()">⏭️ Passer</button>
      <button class="zen-btn neutral" onclick="exitZen()">❌ Sortir</button>
    </div>
  `;
  boardContainer.appendChild(node);
}

window.markZenDone = (id) => {
  const t = state.tasks.find(x => x.id === id);
  if(t) {
    t.status = "done"; t.completedAt = new Date().toISOString(); 
    if(!t.xpClaimed) { addXP(t.priority); t.xpClaimed = true; }
    if(t.recurrence && t.recurrence !== "none") handleRecurrence(t);
    saveTasks();
  }
  render();
};
window.skipZen = () => { state.zenIndex++; render(); };
window.exitZen = () => { 
  state.view = "cards"; 
  document.body.dataset.view = "cards"; 
  localStorage.setItem("momentum-view-v5", "cards");
  document.querySelectorAll(".view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === "cards"));
  render(); 
};

function renderAnalytics() {
  const doneTasks = state.tasks.filter(t => t.status === "done" && t.completedAt);
  const weekData = [0,0,0,0,0,0,0];
  doneTasks.forEach(t => { const d = new Date(t.completedAt).getDay(); weekData[d]++; });
  const shiftedDays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const shiftedData = [weekData[1], weekData[2], weekData[3], weekData[4], weekData[5], weekData[6], weekData[0]];

  const tagCounts = {};
  state.tasks.forEach(t => {
     const matches = t.text.match(/#[a-zA-Z0-9_]+/g);
     if(matches) matches.forEach(m => {
       const tg = m.toLowerCase(); tagCounts[tg] = (tagCounts[tg] || 0) + 1;
     });
  });
  const tagKeys = Object.keys(tagCounts);
  const tagVals = tagKeys.map(k => tagCounts[k]);

  boardContainer.innerHTML = `
    <div class="analytics-container">
      <h2>📊 Vos Statistiques & Performances</h2>
      <div class="charts-wrapper">
        <div class="chart-box">
          <h3 style="text-align:center; font-size:1rem; margin-top:0;">Tâches complétées / Jour</h3>
          <canvas id="barChart"></canvas>
        </div>
        <div class="chart-box">
          <h3 style="text-align:center; font-size:1rem; margin-top:0;">Répartition de vos #Tags</h3>
          ${tagKeys.length === 0 ? "<p style='text-align:center; color:var(--muted); margin-top:2rem;'>Aucun tag n'a encore été utilisé.</p>" : "<canvas id='pieChart'></canvas>"}
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    if(typeof Chart === 'undefined') return;
    const ctxBar = document.getElementById('barChart');
    if(ctxBar) {
      analyticsChartBar = new Chart(ctxBar, {
        type: 'bar',
        data: { labels: shiftedDays, datasets: [{ label: 'Terminées', data: shiftedData, backgroundColor: '#3b82c4', borderRadius: 6 }] },
        options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: {display:false} } }
      });
    }
    const ctxPie = document.getElementById('pieChart');
    if(ctxPie && tagKeys.length > 0) {
      analyticsChartPie = new Chart(ctxPie, {
        type: 'doughnut',
        data: { labels: tagKeys, datasets: [{ data: tagVals, backgroundColor: ['#eb6a48', '#f0aa30', '#14967c', '#3b82c4', '#df5b8f', '#8e44ad', '#34495e'] }] },
        options: { plugins: { legend: { position: 'bottom' } }, borderAlign: 'inner' }
      });
    }
  }, 100);
}

function renderKanban(tasks) {
  const board = document.createElement("div"); board.className = "kanban-board";
  [ { id: "todo", title: "À faire" }, { id: "done", title: "Terminé" } ].forEach(c => {
    const col = document.createElement("div"); col.className = "kanban-col";
    col.innerHTML = `<h3>${c.title}</h3><div class="task-list" data-status="${c.id}"></div>`;
    const ul = col.querySelector(".task-list");
    tasks.filter(t => t.status === c.id).forEach(task => ul.appendChild(createTaskNode(task)));
    board.appendChild(col);
  });
  boardContainer.appendChild(board);
}

function renderList(tasks, isArchive = false) {
  const groups = {
    overdue: { title: "🔴 En retard", tasks: [] },
    today:   { title: "🟠 Aujourd'hui", tasks: [] },
    week:    { title: "🟡 Cette semaine", tasks: [] },
    later:   { title: "⚪ Plus tard / Sans date", tasks: [] },
    done:    { title: "🟢 Terminées", tasks: [] }
  };
  
  tasks.forEach(task => {
    if(task.status === "done" && !isArchive) { groups.done.tasks.push(task); return; }
    if(isArchive) { groups.later.tasks.push(task); return; }
    const diff = getDueDiff(task.dueDate);
    if(diff === null) groups.later.tasks.push(task);
    else if(diff < 0) groups.overdue.tasks.push(task);
    else if(diff === 0) groups.today.tasks.push(task);
    else if(diff <= 7) groups.week.tasks.push(task);
    else groups.later.tasks.push(task);
  });
  
  let empty = true;
  Object.values(groups).forEach(g => {
    if(g.tasks.length === 0) return;
    empty = false;
    const sep = document.createElement("div"); sep.className = "group-separator";
    sep.textContent = g.title + " (" + g.tasks.length + ")";
    boardContainer.appendChild(sep);
    const ul = document.createElement("div"); ul.className = "task-list";
    g.tasks.forEach(t => ul.appendChild(createTaskNode(t)));
    boardContainer.appendChild(ul);
  });
  if(empty) boardContainer.innerHTML = "<p style='text-align:center; color:var(--muted); margin-top: 2rem;'>Aucun élément à afficher ici.</p>";
}

function processTextWithTags(text) {
  return text.split(/(#[a-zA-Z0-9_]+)/g).map(part => {
    if(part.startsWith("#")) return `<span class="hashtag">${part}</span>`;
    return part;
  }).join("");
}

function createTaskNode(task) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.id = task.id; node.dataset.cat = task.category;
  if(task.status === "done") node.classList.add("done");
  
  const isEditing = state.editingTaskId === task.id;
  node.querySelector(".task-toggle").checked = task.status === "done";
  node.querySelector(".task-text").innerHTML = processTextWithTags(task.text);
  
  const catObj = state.categories.find(c => c.id === task.category) || {label: "Autre", icon: "📌"};
  node.querySelector(".category-badge").textContent = `${catObj.icon} ${catObj.label}`;
  node.querySelector(".priority-badge").textContent = PRIORITY_LABELS[task.priority];
  
  const due = node.querySelector(".due-badge");
  if(task.dueDate) {
    const diff = getDueDiff(task.dueDate);
    due.textContent = diff < 0 ? `En retard (${Math.abs(diff)}j)` : (diff === 0 ? "Aujourd'hui" : `Dans ${diff}j`);
  } else due.hidden = true;
  
  if(task.recurrence && task.recurrence !== 'none') node.querySelector(".recur-badge").hidden = false;
  
  const subtasksCont = node.querySelector(".subtasks-container");
  (task.subtasks || []).forEach((st, i) => {
    const sd = document.createElement("div"); sd.className = "subtask-item"; if(st.done) sd.classList.add("done");
    sd.dataset.index = i;
    sd.innerHTML = `<input type="checkbox" class="subtask-toggle" ${st.done? "checked":""}> <span class="subtask-text">${st.text}</span> <button class="subtask-delete">x</button>`;
    subtasksCont.appendChild(sd);
  });

  if(isEditing) {
    node.querySelector(".edit-input").value = task.text;
    node.querySelector(".edit-category").value = task.category;
    node.querySelector(".edit-priority").value = task.priority;
    node.querySelector(".edit-due-date").value = task.dueDate || "";
    node.querySelector(".edit-recurrence").value = task.recurrence || "none";
    node.querySelector(".task-view").hidden = true;
    node.querySelector(".task-actions-view").hidden = true;
    node.querySelector(".task-editor").hidden = false;
    node.querySelector(".task-actions-edit").hidden = false;
  }
  return node;
}

function updateStats() {
  const active = state.tasks.filter(t => !t.archived);
  document.getElementById("todoTasks").textContent = active.filter(t => t.status === "todo").length;
  document.getElementById("completedTasks").textContent = active.filter(t => t.status === "done").length;
}

function renderTags() {
  const allTags = new Set();
  state.tasks.filter(t => !t.archived).forEach(t => {
     const matches = t.text.match(/#[a-zA-Z0-9_]+/g);
     if(matches) matches.forEach(m => allTags.add(m.toLowerCase()));
  });
  tagsList.innerHTML = "";
  if(allTags.size===0) tagsList.innerHTML = "<p style='font-size:0.85rem;color:var(--muted)'>Aucun tag.</p>";
  allTags.forEach(tag => {
     const b = document.createElement("button"); b.className = "tag-btn";
     b.textContent = tag;
     if(state.tagFilter === tag) b.classList.add("active");
     b.onclick = () => { state.tagFilter = state.tagFilter === tag ? null : tag; render(); };
     tagsList.appendChild(b);
  });
}

function renderCalendar() {
  calendarList.innerHTML = "";
  let upcoming = state.tasks.filter(t => t.status !== "done" && t.dueDate && !t.archived && getDueDiff(t.dueDate) >= 0)
    .sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
    
  if(state.calendarExpanded) {
    upcoming = upcoming.filter(t => getDueDiff(t.dueDate) <= 7);
  } else {
    upcoming = upcoming.slice(0, 3);
  }

  if(upcoming.length === 0) { calendarList.innerHTML = "<li class='calendar-item'>Rien de prévu.</li>"; return; }
  upcoming.forEach(t => {
    const li = document.createElement("li"); li.className = "calendar-item";
    const d = new Date(t.dueDate).toLocaleDateString("fr-FR", {day:"2-digit", month:"short"});
    li.innerHTML = `<span>${t.text.split(" ")[0]}...</span> <strong style="color:var(--ocean)">${d}</strong>`;
    calendarList.appendChild(li);
  });
}

// Pomodoro Timer Logic
function updatePomoUI() {
  const m = Math.floor(state.pomoTimeLeft / 60).toString().padStart(2, "0");
  const s = (state.pomoTimeLeft % 60).toString().padStart(2, "0");
  pomoTime.textContent = `${m}:${s}`;
}
function startPomodoro(task) {
  state.pomoTask = task; pomoTaskName.textContent = task.text;
  state.pomoTimeLeft = 25 * 60; pomoPanel.hidden = false;
  resumePomodoro();
}
function resumePomodoro() {
  if(!state.pomoTask) return;
  state.pomoActive = true; pomoActionBtn.innerHTML = "⏸ Pause";
  clearInterval(state.pomoInterval);
  state.pomoInterval = setInterval(() => {
    state.pomoTimeLeft--;
    if(state.pomoTimeLeft <= 0) {
      clearInterval(state.pomoInterval); state.pomoActive = false;
      pomoActionBtn.innerHTML = "▶ Démarrer"; state.pomoTimeLeft = 0;
      updatePomoUI(); new Notification("Pomodoro terminé ! Prenez une pause.");
    } else updatePomoUI();
  }, 1000);
}
function pausePomodoro() {
  state.pomoActive = false; pomoActionBtn.innerHTML = "▶ Démarrer";
  clearInterval(state.pomoInterval);
}

function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks)); }
function loadTasks() {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if(!saved) saved = localStorage.getItem("momentum-tasks-v3");
    if(saved) {
      const parsed = JSON.parse(saved);
      return parsed.map(t => { 
        if(t.status === "done" && !t.completedAt) t.completedAt = new Date().toISOString(); 
        return t; 
      });
    }
  } catch(e) {}
  
  return [];
}
