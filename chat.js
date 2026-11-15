/*
 * chat.js — chat panel for visualization.html.
 * Backend contract (assumed; see config.js):
 *   POST /api/chat
 *     body:  { message, context: { region, start, end, dataSource }, history: [{ role, content }] }
 *     reply: { reply: "text" }
 * dataSource is "live" | "sample" | "loading" so the backend can tell whether the user
 * is looking at real numbers. History is kept in memory only (cleared on reload).
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

  $('chat-context').textContent = `Your questions are sent with the current selection: ${sel.region}, ${sel.start}–${sel.end}.`;

  function addMessage(kind, text, retry) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (kind === 'user' ? 'user' : kind === 'error' ? 'assistant error' : 'assistant');
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = kind === 'user' ? 'You' : kind === 'error' ? 'Error' : 'Tropos';
    const body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = text; // textContent on purpose: never render backend text as HTML
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

  function restoreFocus() {
    // Don't steal focus if the user has deliberately moved elsewhere on the page.
    const active = document.activeElement;
    if (!active || active === document.body || panel.contains(active)) input.focus();
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
    status.textContent = 'Tropos is typing…';

    try {
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
      if (!reply) throw new Error('the assistant sent an empty reply');
      typing.remove();
      history.push({ role: 'assistant', content: reply });
      addMessage('assistant', reply);
    } catch (err) {
      typing.remove();
      history.pop(); // the failed question is not part of the conversation, so a retry won't duplicate it
      addMessage('error', `I couldn't get an answer (${err.message}).`, () => deliver(text));
    } finally {
      typing.remove();
      status.textContent = '';
      pending = false;
      sendBtn.disabled = false;
      form.removeAttribute('aria-busy');
      restoreFocus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || pending) { input.focus(); return; } // keep any typed text while a reply is pending
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

  addMessage('assistant', `Hi! Ask me anything about ozone in ${sel.region} from ${sel.start} to ${sel.end}.`);
})();