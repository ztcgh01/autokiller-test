// ==UserScript==
// @name         AUTO_KILLER OneClick Bridge (Firefox)
// @namespace    local.zeta.gpt.oneclick
// @version      2.23.13F
// @description  Firefox에서 ZETA → 역병킬러 GPT → ZETA를 한 번의 작업 클릭으로 자동 왕복합니다.
// @match        https://*.zeta-ai.io/*
// @match        https://zeta-ai.io/*
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @run-at       document-start
// @noframes
// @connect      ztcgh01.github.io
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '2.23.13F';
  const CORE_URL = 'https://ztcgh01.github.io/autokiller-test/auto_killer.core.js';
  const RESPONSE_KEY = 'zk_oneclick_response_v1';
  const SESSION_KEY = 'zk_oneclick_gpt_job_v1';
  const pageWindow = typeof unsafeWindow === 'object' ? unsafeWindow : window;
  const host = location.hostname;
  const isZeta = /zeta-ai\.io$/i.test(host);
  const isGpt = /(^|\.)chatgpt\.com$/i.test(host);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function gmSet(key, value) {
    if (typeof GM === 'object' && typeof GM.setValue === 'function') return GM.setValue(key, value);
    if (typeof GM_setValue === 'function') return GM_setValue(key, value);
    throw new Error('GM 저장 기능 없음');
  }
  async function gmGet(key, fallback = null) {
    if (typeof GM === 'object' && typeof GM.getValue === 'function') return GM.getValue(key, fallback);
    if (typeof GM_getValue === 'function') {
      const value = GM_getValue(key, fallback);
      return value === undefined ? fallback : value;
    }
    return fallback;
  }
  async function gmDelete(key) {
    if (typeof GM === 'object' && typeof GM.deleteValue === 'function') return GM.deleteValue(key);
    if (typeof GM_deleteValue === 'function') return GM_deleteValue(key);
  }

  function decodeTransfer(value) {
    try {
      const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) { return null; }
  }

  function statusUi() {
    let root = document.getElementById('__ak_oneclick_status__');
    if (root) return root;
    root = document.createElement('div');
    root.id = '__ak_oneclick_status__';
    root.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:10px 14px;border-radius:999px;font:700 12px/1.25 system-ui,sans-serif;box-shadow:0 4px 16px #0005;max-width:84vw;text-align:center';
    root.textContent = 'AUTO_KILLER · 준비 중…';
    (document.body || document.documentElement).appendChild(root);
    return root;
  }

  async function waitFor(selector, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  function assistantTurns() {
    return [...document.querySelectorAll('[data-testid^="conversation-turn-"][data-turn="assistant"]')];
  }
  function currentTurnId(turn) {
    return turn?.getAttribute('data-turn-id') || turn?.getAttribute('data-turn-id-container') || '';
  }
  function assistantText(turn) {
    if (!turn) return '';
    const message = turn.querySelector('[data-message-author-role="assistant"]');
    const content = message?.querySelector('.markdown') || message?.querySelector('[class*="markdown"]') || message;
    return content?.innerText?.trim() || '';
  }

  async function insertPrompt(prompt, text) {
    prompt.focus();
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); } catch (error) {}
    if (!inserted) {
      if ('value' in prompt) prompt.value = text;
      else prompt.textContent = text;
    }
    try {
      prompt.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    } catch (error) {
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function bootZeta() {
    pageWindow.__AUTO_KILLER_ONECLICK_BRIDGE__ = true;

    let lastResponseId = '';
    const receiveResponse = async () => {
      try {
        const response = await gmGet(RESPONSE_KEY, null);
        if (!response?.id || response.id === lastResponseId) return;
        if (response.room !== location.href.split('#')[0]) return;
        lastResponseId = response.id;

        // GPT 쪽 Userscripts GM 저장소의 결과를, 페이지 realm에서 실행 중인
        // AUTO_KILLER core가 실제로 읽는 localStorage 공유 키로 미러링한다.
        // Firefox에서는 sandbox CustomEvent.detail 객체가 page realm과 안정적으로
        // 공유되지 않을 수 있으므로, JSON 문자열 기반 localStorage를 주 경로로 쓴다.
        pageWindow.localStorage.setItem(
          'zk_bookmarklet_zk_response_v2',
          JSON.stringify(response)
        );

        // core는 1초 폴링 + focus/visibilitychange로 위 키를 자동 적용한다.
        // 결과 적용 경로는 localStorage pending 하나만 사용한다.

        await gmDelete(RESPONSE_KEY);
      } catch (error) {
        console.error('[AUTO_KILLER OneClick] ZETA 결과 수신 실패', error);
      }
    };

    setInterval(receiveResponse, 700);
    window.addEventListener('focus', receiveResponse);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) receiveResponse(); });

    const script = document.createElement('script');
    script.src = `${CORE_URL}?oneclick=${encodeURIComponent(VERSION)}&t=${Date.now()}`;
    script.async = false;
    script.onerror = () => alert('AUTO_KILLER 본체 로드 실패. GitHub core 주소를 확인해주세요.');
    (document.head || document.documentElement).appendChild(script);
  }

  async function bootGpt() {
    const status = statusUi();
    const say = text => { status.textContent = `AUTO_KILLER · ${text}`; };
    const fail = text => { status.textContent = `AUTO_KILLER · ${text}`; alert(text); };

    const match = location.hash.match(/(?:^#|[&#])akjob=([^&]+)/);
    let job = match ? decodeTransfer(decodeURIComponent(match[1])) : null;
    if (job) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(job)); } catch (error) {}
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (error) {}
    } else {
      try { job = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (error) {}
    }
    if (!job?.id || job.schema !== 4) return;
    if (pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__) return;
    pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = true;

    say('GPT 입력창 기다리는 중…');
    const prompt = await waitFor('#prompt-textarea', 30000);
    if (!prompt) { fail('GPT 입력창을 못 찾았어요.'); return; }

    const turns = assistantTurns();
    const baseline = turns[turns.length - 1] || null;
    const submitted = { ...job, stage: 'submitted', baselineTurnId: currentTurnId(baseline), submittedAt: Date.now() };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(submitted)); } catch (error) {}

    say('프롬프트 자동 입력 중…');
    await insertPrompt(prompt, job.text);
    await sleep(500);

    const submit = await waitFor('#composer-submit-button,button[data-testid="send-button"]', 10000);
    if (!submit) { fail('전송 버튼을 못 찾았어요.'); return; }
    let attempts = 0;
    while (submit.disabled && attempts++ < 30) await sleep(200);
    if (submit.disabled) { fail('전송 버튼이 활성화되지 않았어요.'); return; }

    say('자동 전송 · 답변 기다리는 중…');
    submit.click();

    let checks = 0;
    const timer = setInterval(async () => {
      if (++checks > 450) {
        clearInterval(timer);
        fail('답변 대기 시간이 초과됐어요.');
        return;
      }
      const answerTurns = assistantTurns();
      const answer = answerTurns[answerTurns.length - 1] || null;
      if (!answer) return;
      const turnId = currentTurnId(answer);
      if (!turnId || turnId === submitted.baselineTurnId) return;
      const copy = answer.querySelector('button[data-testid="copy-turn-action-button"]');
      if (!copy || copy.disabled) return;
      const text = assistantText(answer);
      if (!text) return;

      clearInterval(timer);
      const response = { id: submitted.id, type: submitted.type || 'review', room: submitted.room, text, time: Date.now() };
      try {
        say('완료 · ZETA에 결과 전달 중…');
        await gmSet(RESPONSE_KEY, response);
        try { sessionStorage.removeItem(SESSION_KEY); } catch (error) {}
        await sleep(500);
        say('완료 · ZETA로 돌아가는 중…');
        try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (error) {}
        window.close();
        setTimeout(() => {
          status.textContent = 'AUTO_KILLER · 완료 · 원래 ZETA 탭으로 돌아가면 자동 적용돼요.';
        }, 900);
      } catch (error) {
        fail('결과 전달 실패: ' + (error?.message || error));
      }
    }, 800);
  }

  if (isZeta) bootZeta();
  else if (isGpt) bootGpt().catch(error => alert('AUTO_KILLER GPT 처리 오류: ' + (error?.message || error)));
})();
