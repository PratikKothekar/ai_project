const form = document.querySelector('#chat-form');
const input = document.querySelector('#message-input');
const sendButton = document.querySelector('#send-button');
const messageList = document.querySelector('#message-list');
const welcomeScreen = document.querySelector('#welcome-screen');
const typingIndicator = document.querySelector('#typing-indicator');
const charCount = document.querySelector('#char-count');
const newChatButton = document.querySelector('#new-chat-button');
const clearChatButton = document.querySelector('#clear-chat-button');
const exportButton = document.querySelector('#export-button');
const themeButton = document.querySelector('#theme-button');
const sidebar = document.querySelector('#sidebar');
const mobileMenuButton = document.querySelector('#mobile-menu');
const historyList = document.querySelector('#chat-history');
const historySearch = document.querySelector('#history-search');
const pageTitle = document.querySelector('#page-title');
const renameDialog = document.querySelector('#rename-dialog');
const renameForm = document.querySelector('#rename-form');
const renameInput = document.querySelector('#rename-input');
const quizTopicSelect = document.querySelector('#quiz-topic');
const quizArea = document.querySelector('#quiz-area');
const roadmapGrid = document.querySelector('#roadmap-grid');
const SESSION_KEY = 'skillsbuild-chat-sessions-v3';
const THEME_KEY = 'skillsbuild-theme-v1';
const PROGRESS_KEY = 'skillsbuild-roadmap-progress-v1';
let sessions = loadSessions();
let roadmapProgress = loadStored(PROGRESS_KEY, {});
let currentId = null;
let currentMessages = [];
let renamedSessionId = null;
let loadedRoadmaps = false;

function loadSessions() {
  const current = loadStored(SESSION_KEY, null);
  const legacy = Array.isArray(current) ? current : loadStored('skillsbuild-chat-sessions-v2', []);
  return Array.isArray(legacy) ? legacy.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && Array.isArray(item.messages)) : [];
}
function loadStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : fallback;
  } catch { return fallback; }
}
function saveStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be unavailable. */ }
}
function titleFor(messages) {
  return (messages.find(item => item.role === 'user')?.text || 'New conversation')
    .replace(/\s+/g, ' ').slice(0, 42);
}
function persistCurrent() {
  if (!currentMessages.length) return;
  const previous = sessions.find(item => item.id === currentId);
  const session = { id: currentId || crypto.randomUUID(), title: previous?.title || titleFor(currentMessages), messages: currentMessages, updatedAt: Date.now() };
  currentId = session.id;
  sessions = [session, ...sessions.filter(item => item.id !== session.id)].slice(0, 30);
  saveStored(SESSION_KEY, sessions);
  renderHistory();
}
function closeMobileNav() {
  sidebar.classList.remove('open');
  mobileMenuButton.setAttribute('aria-expanded', 'false');
}
function renderHistory() {
  const filter = historySearch.value.trim().toLowerCase();
  historyList.replaceChildren();
  const visible = sessions.slice(0, 30).filter(item => item.title.toLowerCase().includes(filter));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = filter ? 'No matching conversations.' : 'Your chats will appear here.';
    historyList.append(empty);
    return;
  }
  visible.forEach(session => {
    const row = document.createElement('div');
    row.className = 'history-row' + (session.id === currentId ? ' active' : '');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-item';
    open.title = session.title;
    open.setAttribute('aria-label', 'Open ' + session.title);
    const label = document.createElement('span');
    label.textContent = session.title;
    open.append(label);
    open.addEventListener('click', () => openSession(session.id));
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'history-action';
    rename.textContent = 'Rename';
    rename.setAttribute('aria-label', 'Rename ' + session.title);
    rename.addEventListener('click', () => beginRename(session));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-action';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', 'Delete ' + session.title);
    remove.addEventListener('click', () => deleteSession(session.id));
    row.append(open, rename, remove);
    historyList.append(row);
  });
}
function beginRename(session) {
  renamedSessionId = session.id;
  renameInput.value = session.title;
  renameDialog.showModal();
  renameInput.focus();
  renameInput.select();
}
renameForm.addEventListener('submit', event => {
  event.preventDefault();
  const value = renameInput.value.trim().slice(0, 60);
  if (!value || !renamedSessionId) return;
  sessions = sessions.map(item => item.id === renamedSessionId ? { ...item, title: value } : item);
  if (currentId === renamedSessionId) pageTitle.textContent = value;
  saveStored(SESSION_KEY, sessions);
  renamedSessionId = null;
  renameDialog.close();
  renderHistory();
});
renameDialog.addEventListener('close', () => { renamedSessionId = null; });
function deleteSession(id) {
  const session = sessions.find(item => item.id === id);
  if (!session || !window.confirm('Delete "' + session.title + '" from recent chats?')) return;
  sessions = sessions.filter(item => item.id !== id);
  saveStored(SESSION_KEY, sessions);
  if (currentId === id) clearConversation();
  renderHistory();
}
function openSession(id) {
  const session = sessions.find(item => item.id === id);
  if (!session) return;
  currentId = session.id;
  currentMessages = (session.messages || []).map(item => ({ ...item }));
  messageList.replaceChildren();
  currentMessages.forEach(item => addMessage(item.role, item.text, item.meta || {}, { restoring: true }));
  welcomeScreen.hidden = currentMessages.length > 0;
  clearChatButton.hidden = currentMessages.length === 0;
  exportButton.hidden = currentMessages.length === 0;
  pageTitle.textContent = session.title;
  renderHistory();
  closeMobileNav();
  input.focus();
}
function clearConversation() {
  currentId = null;
  currentMessages = [];
  messageList.replaceChildren();
  welcomeScreen.hidden = false;
  clearChatButton.hidden = true;
  exportButton.hidden = true;
  pageTitle.textContent = 'Chat assistant';
  input.value = '';
  input.dispatchEvent(new Event('input'));
  renderHistory();
  input.focus();
  closeMobileNav();
}
function clearHistory() {
  if (!sessions.length || !window.confirm('Clear all saved conversations from this browser?')) return;
  sessions = [];
  saveStored(SESSION_KEY, sessions);
  clearConversation();
}
function scrollToLatest() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function setLoading(loading) {
  sendButton.disabled = loading;
  input.disabled = loading;
  newChatButton.disabled = loading;
  clearChatButton.disabled = loading;
  typingIndicator.hidden = !loading;
  if (loading) scrollToLatest();
}
function appendSources(container, sources) {
  if (!Array.isArray(sources) || !sources.length) return;
  const section = document.createElement('div');
  section.className = 'source-links';
  const label = document.createElement('span');
  label.textContent = 'Further reading';
  section.append(label);
  sources.forEach(source => {
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.title;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    section.append(link);
  });
  container.append(section);
}
function saveCurrentMetadata() {
  const session = sessions.find(item => item.id === currentId);
  if (!session) return;
  session.messages = currentMessages;
  saveStored(SESSION_KEY, sessions);
}
function sendFeedback(button, rating, topic, meta) {
  button.disabled = true;
  meta.feedback = rating;
  saveCurrentMetadata();
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, topic: topic || 'general' }),
  }).then(response => {
    if (!response.ok) throw new Error('Feedback could not be saved.');
    button.closest('.feedback-tools').textContent = 'Thanks for helping improve this guide.';
  }).catch(() => {
    meta.feedback = null;
    button.disabled = false;
    button.closest('.feedback-tools').textContent = 'Feedback could not be saved. Please try again.';
  });
}
function addMessage(role, text, meta, options) {
  meta = meta || {};
  options = options || {};
  const article = document.createElement('article');
  article.className = 'message ' + role;
  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'A';
    article.append(avatar);
  }
  const content = document.createElement('div');
  content.className = 'message-content';
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'SkillsBuild Assistant';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  content.append(label, bubble);
  if (role === 'assistant') {
    if (meta.topic_label || meta.confidence) {
      const detail = document.createElement('p');
      detail.className = 'match-detail';
      if (meta.needs_clarification) detail.textContent = 'I am not sure I matched your question. Match strength: ' + Math.round((meta.confidence || 0) * 100) + '%.';
      else if (meta.topic_label) detail.textContent = 'Topic: ' + meta.topic_label + ' · Match strength: ' + Math.round((meta.confidence || 0) * 100) + '%';
      content.append(detail);
    }
    if (Array.isArray(meta.matched_terms) && meta.matched_terms.length) {
      const matched = document.createElement('p');
      matched.className = 'matched-terms';
      matched.textContent = 'Matched: ' + meta.matched_terms.join(', ');
      content.append(matched);
    }
    appendSources(content, meta.sources);
    if (meta.provider_message) {
      const providerNotice = document.createElement('p');
      providerNotice.className = 'provider-note';
      providerNotice.textContent = meta.provider_message;
      content.append(providerNotice);
    }
    if (Array.isArray(meta.suggested_topic_labels) && meta.suggested_topic_labels.length) {
      const choices = document.createElement('div');
      choices.className = 'topic-choices';
      meta.suggested_topic_labels.forEach(topic => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'topic-choice';
        choice.textContent = 'Ask about ' + topic;
        choice.addEventListener('click', () => sendMessage('Explain ' + topic + '.'));
        choices.append(choice);
      });
      content.append(choices);
    }
    const tools = document.createElement('div');
    tools.className = 'message-tools';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy answer';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy answer'; }, 1400);
      } catch { copy.textContent = 'Select and copy the answer'; }
    });
    tools.append(copy);
    const feedback = document.createElement('div');
    feedback.className = 'feedback-tools';
    if (meta.feedback) feedback.textContent = 'Thanks for helping improve this guide.';
    else {
      const prompt = document.createElement('span');
      prompt.textContent = 'Was this useful?';
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.textContent = 'Yes';
      yes.setAttribute('aria-label', 'Mark answer useful');
      yes.addEventListener('click', () => sendFeedback(yes, 'up', meta.topic, meta));
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = 'Not quite';
      no.setAttribute('aria-label', 'Mark answer not useful');
      no.addEventListener('click', () => sendFeedback(no, 'down', meta.topic, meta));
      feedback.append(prompt, yes, no);
    }
    tools.append(feedback);
    content.append(tools);
  }
  article.append(content);
  messageList.append(article);
  clearChatButton.hidden = false;
  exportButton.hidden = false;
  if (!options.restoring) {
    currentMessages.push({ role, text, meta });
    persistCurrent();
  }
  scrollToLatest();
}
async function sendMessage(message) {
  const cleanMessage = message.trim();
  if (!cleanMessage || sendButton.disabled) return;
  welcomeScreen.hidden = true;
  addMessage('user', cleanMessage, {});
  input.value = '';
  input.dispatchEvent(new Event('input'));
  input.style.height = 'auto';
  setLoading(true);
  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cleanMessage }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The assistant could not process that message.');
    if (typeof data.response !== 'string') throw new Error('The assistant returned an unexpected response.');
    addMessage('assistant', data.response, data);
  } catch (error) {
    addMessage('assistant', error.message || 'Unable to connect. Please try again.', { topic: 'general' });
  } finally {
    setLoading(false);
    input.focus();
  }
}
function exportConversation() {
  const lines = currentMessages.map(item => (item.role === 'user' ? 'You' : 'SkillsBuild Assistant') + ':\n' + item.text);
  const blob = new Blob(['IBM SkillsBuild Learning Assistant\n\n' + lines.join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'skillsbuild-conversation.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function loadRoadmaps() {
  if (loadedRoadmaps) return;
  roadmapGrid.replaceChildren();
  try {
    const response = await fetch('/api/roadmaps');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Learning paths could not be loaded.');
    data.roadmaps.forEach(path => {
      const card = document.createElement('article');
      card.className = 'roadmap-card';
      const heading = document.createElement('h2');
      heading.textContent = path.title;
      const description = document.createElement('p');
      description.textContent = path.description;
      const list = document.createElement('ol');
      list.className = 'roadmap-steps';
      path.steps.forEach(step => {
        const row = document.createElement('li');
        const label = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = Boolean(roadmapProgress[path.id + ':' + step.id]);
        check.addEventListener('change', () => {
          roadmapProgress[path.id + ':' + step.id] = check.checked;
          saveStored(PROGRESS_KEY, roadmapProgress);
          updateProgress(card, path);
        });
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = step.title;
        const detail = document.createElement('small');
        detail.textContent = step.detail;
        text.append(title, detail);
        label.append(check, text);
        row.append(label);
        list.append(row);
      });
      const progress = document.createElement('p');
      progress.className = 'path-progress';
      card.append(heading, description, progress, list);
      roadmapGrid.append(card);
      updateProgress(card, path);
    });
    loadedRoadmaps = true;
  } catch (error) {
    roadmapGrid.textContent = error.message || 'Learning paths could not be loaded.';
  }
}
function updateProgress(card, path) {
  const done = path.steps.filter(step => roadmapProgress[path.id + ':' + step.id]).length;
  const text = card.querySelector('.path-progress');
  text.textContent = done + ' of ' + path.steps.length + ' steps complete';
  text.setAttribute('aria-label', text.textContent);
}
async function loadQuizTopics() {
  if (quizTopicSelect.options.length) return;
  try {
    const response = await fetch('/api/quiz/topics');
    const data = await response.json();
    if (!response.ok) {
      quizArea.textContent = data.error || 'Quiz topics could not be loaded.';
      return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a topic';
    quizTopicSelect.append(placeholder);
    data.topics.forEach(topic => {
      const option = document.createElement('option');
      option.value = topic.id;
      option.textContent = topic.title;
      quizTopicSelect.append(option);
    });
  } catch (error) {
    quizArea.textContent = 'Quiz topics could not be loaded. Check your connection and try again.';
  }
}
async function startQuiz() {
  const topic = quizTopicSelect.value;
  if (!topic) {
    quizArea.textContent = 'Choose a topic to begin.';
    return;
  }
  quizArea.replaceChildren();
  try {
    const response = await fetch('/api/quiz?topic=' + encodeURIComponent(topic));
    const quiz = await response.json();
    if (!response.ok) throw new Error(quiz.error || 'Quiz could not be loaded.');
    const quizForm = document.createElement('form');
    quizForm.className = 'quiz-form';
    quiz.questions.forEach((question, index) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = (index + 1) + '. ' + question.prompt;
      fieldset.append(legend);
      question.options.forEach((option, optionIndex) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = question.id;
        radio.value = String(optionIndex);
        radio.required = true;
        const text = document.createElement('span');
        text.textContent = option;
        label.append(radio, text);
        fieldset.append(label);
      });
      quizForm.append(fieldset);
    });
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'send-button';
    submit.textContent = 'Check answers';
    quizForm.append(submit);
    quizForm.addEventListener('submit', event => {
      event.preventDefault();
      submitQuiz(topic, quiz.questions, new FormData(quizForm));
    });
    quizArea.append(quizForm);
  } catch (error) {
    quizArea.textContent = error.message || 'Quiz could not be loaded.';
  }
}
async function submitQuiz(topic, questions, formData) {
  const answers = {};
  questions.forEach(question => { answers[question.id] = Number(formData.get(question.id)); });
  try {
    const response = await fetch('/api/quiz/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, answers }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Your answers could not be checked.');
    const resultBox = document.createElement('section');
    resultBox.className = 'quiz-result';
    const heading = document.createElement('h2');
    heading.textContent = 'You scored ' + result.score + ' of ' + result.total;
    resultBox.append(heading);
    result.results.forEach((item, index) => {
      const explanation = document.createElement('p');
      explanation.textContent = (item.correct ? 'Correct: ' : 'Review: ') + questions[index].prompt + ' ' + item.explanation;
      resultBox.append(explanation);
    });
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'toolbar-button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', startQuiz);
    resultBox.append(retry);
    quizArea.replaceChildren(resultBox);
  } catch (error) {
    quizArea.textContent = error.message || 'Your answers could not be checked.';
  }
}
function setView(view) {
  const views = { chat: document.querySelector('#chat-panel'), roadmaps: document.querySelector('#roadmaps-panel'), quiz: document.querySelector('#quiz-panel') };
  Object.keys(views).forEach(name => { views[name].hidden = name !== view; });
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  pageTitle.textContent = view === 'chat' ? 'Chat assistant' : view === 'roadmaps' ? 'Learning paths' : 'Practice quizzes';
  closeMobileNav();
  if (view === 'roadmaps') loadRoadmaps();
  if (view === 'quiz') loadQuizTopics();
  const hasMessages = view === 'chat' && currentMessages.length > 0;
  clearChatButton.hidden = !hasMessages;
  exportButton.hidden = !hasMessages;
}
form.addEventListener('submit', event => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', () => {
  charCount.textContent = input.value.length + ' / 2000';
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 128) + 'px';
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  setView('chat');
  sendMessage(button.dataset.prompt || '');
}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
newChatButton.addEventListener('click', () => { clearConversation(); setView('chat'); });
clearChatButton.addEventListener('click', clearConversation);
exportButton.addEventListener('click', exportConversation);
document.querySelector('#clear-history-button').addEventListener('click', clearHistory);
historySearch.addEventListener('input', renderHistory);
mobileMenuButton.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  mobileMenuButton.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
  if (window.innerWidth <= 760 && sidebar.classList.contains('open') && !sidebar.contains(event.target) && !mobileMenuButton.contains(event.target)) closeMobileNav();
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    historySearch.focus();
  }
  if (event.key === 'Escape') closeMobileNav();
});
document.querySelector('#start-quiz').addEventListener('click', startQuiz);
function setTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  themeButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  themeButton.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  saveStored(THEME_KEY, theme);
}
themeButton.addEventListener('click', () => setTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
setTheme(loadStored(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light');
renderHistory();
