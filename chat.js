/*
 * chat.js — Real-time chat panel connected to backend AI endpoint.
 */
(function () {
  'use strict';

  const T = window.TROPOS;
  const $ = (id) => document.getElementById(id);
  const sel = T.getSelection();
  const log = $('chat-log');
  const form = $('chat-form');
  const input = $('chat-input');
  const sendBtn = $('chat-send');
  const status = $('chat-status');
  const panel = document.querySelector('.chat-panel');
  const history = [];
  let pending = false;

  $('chat-context').textContent = `Asking about ozone in ${sel.region} (${sel.start}–${sel.end}).`;

  function addMessage(kind, text, retry) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (kind === 'user' ? 'user' : kind === 'error' ? 'assistant error' : 'assistant');
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = kind === 'user' ? 'You' : kind === 'error' ? 'System Error' : 'Tropos AI';
    const body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = text;
    wrap.append(who, body);
    if (retry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.textContent = 'Try again';
      btn.addEventListener('click', () => { wrap.remove(); retry(); });
      wrap.append(btn);
    }
    log.append(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  async function deliver(text) {
    pending = true;
    sendBtn.disabled = true;
    form.setAttribute('aria-busy', 'true');

    const prior = history.slice(-10);
    history.push({ role: 'user', content: text });

    const typing = document.createElement('div');
    typing.className = 'chat-msg assistant';
    typing.setAttribute('aria-hidden', 'true');
    typing.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    status.textContent = 'Tropos is thinking…';

    try {
      // Connects directly to server.js endpoint which calls the live Groq API
      const json = await T.request(T.CONFIG.endpoints.chat, {
        method: 'POST',
        timeoutMs: 30000,
        body: {
          message: text,
          context: { region: sel.region, start: sel.start, end: sel.end, dataSource: T.state.view2d.status },
          history: prior,
        },
      });
      const reply = json && typeof json.reply === 'string' ? json.reply.trim() : '';
      if (!reply) throw new Error('Received an empty reply from the AI service');
      typing.remove();
      history.push({ role: 'assistant', content: reply });
      addMessage('assistant', reply);
    } catch (err) {
      typing.remove();
      history.pop();
      addMessage('error', `Could not reach AI backend (${err.message}). Make sure 'node server.js' is running in your terminal.`, () => deliver(text));
    } finally {
      typing.remove();
      status.textContent = '';
      pending = false;
      sendBtn.disabled = false;
      form.removeAttribute('aria-busy');
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || pending) { input.focus(); return; }
    input.value = '';
    addMessage('user', text);
    deliver(text);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  addMessage('assistant', `Hi! Ask me anything about tropospheric ozone in ${sel.region} from ${sel.start} to ${sel.end}.`);
})();