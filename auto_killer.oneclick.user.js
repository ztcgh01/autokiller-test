// ==UserScript==
// @name         AUTO_KILLER OneClick Bridge (Firefox Test)
// @namespace    local.zeta.gpt.oneclick
// @version      2.23.10H1
// @description  ZETA에서 한 번 눌러 GPT 처리와 ZETA 복귀까지 자동으로 이어주는 AUTO_KILLER 테스트 브리지입니다.
// @match        https://*.zeta-ai.io/*
// @match        https://zeta-ai.io/*
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @connect      ztcgh01.github.io
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function autoKillerOneClickBridge() {
  'use strict';

  const VERSION = '2.23.10H1';
  const CORE_URL = 'https://ztcgh01.github.io/autokiller-test/auto_killer.core.js';
  const SESSION_KEY = '__AUTO_KILLER_ONECLICK_JOB_V1__';
  const SESSION_TTL = 30 * 60 * 1000;
  const pageWindow = typeof unsafeWindow === 'object' ? unsafeWindow : window;
  const host = location.hostname;
  const isZeta = /zeta-ai\.io$/i.test(host);
  const isGpt = /(^|\.)chatgpt\.com$/i.test(host);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function encode(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decode(value) {
    try {
      const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      return null;
    }
  }

  function jobIsFresh(job) {
    if (!job?.id) return false;
    const timestamp = Number(String(job.id).split('-')[0]);
    if (!Number.isFinite(timestamp)) return true;
    return Date.now() - timestamp < SESSION_TTL;
  }

  function getStoredJob() {
    try {
      const job = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!jobIsFresh(job)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return job;
    } catch (error) {
      return null;
    }
  }

  function setStoredJob(job) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(job)); }
    catch (error) {}
  }

  function clearStoredJob() {
    try { sessionStorage.removeItem(SESSION_KEY); }
    catch (error) {}
  }

  function xhrLoad(url, onSuccess, onFailure) {
    const requestUrl = `${url}?oneclick=${encodeURIComponent(VERSION)}&t=${Date.now()}`;
    const legacy = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
    const modern = typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest.bind(GM) : null;

    if (legacy) {
      legacy({
        method: 'GET', url: requestUrl, timeout: 15000,
        onload: response => response.status >= 200 && response.status < 300 && response.responseText
          ? onSuccess(response.responseText)
          : onFailure(new Error(`HTTP ${response.status || '응답 없음'}`)),
        onerror: () => onFailure(new Error('본체 연결 실패')),
        ontimeout: () => onFailure(new Error('본체 연결 시간 초과'))
      });
      return;
    }

    if (modern) {
      Promise.resolve(modern({ method: 'GET', url: requestUrl, timeout: 15000 }))
        .then(response => {
          if (response.status < 200 || response.status >= 300 || !response.responseText) {
            throw new Error(`HTTP ${response.status || '응답 없음'}`);
          }
          onSuccess(response.responseText);
        })
        .catch(onFailure);
      return;
    }

    onFailure(new Error('GM 요청 API를 사용할 수 없음'));
  }

  function bootZetaCore() {
    if (pageWindow.__AUTO_KILLER_CORE_LOADING__ || pageWindow.__AUTO_KILLER_CORE_LOADED__) return;
    pageWindow.__AUTO_KILLER_BOOKMARKLET__ = true;
    pageWindow.__AUTO_KILLER_ONECLICK_BRIDGE__ = true;
    pageWindow.__AUTO_KILLER_CORE_LOADING__ = true;

    // core는 북마클릿 모드에서 GM.setValue/getValue/deleteValue를 사용한다.
    // 외부 core를 new Function으로 실행할 때 GM 매개변수를 undefined로 넘기면
    // window.GM 폴리필이 생겨도 매개변수가 전역 GM을 가려 초기화 단계에서 실패한다.
    const gmCompat = {
      setValue: async (key, value) => pageWindow.localStorage.setItem(`zk_bookmarklet_${key}`, JSON.stringify(value)),
      getValue: async (key, fallback) => {
        try {
          const value = pageWindow.localStorage.getItem(`zk_bookmarklet_${key}`);
          return value === null ? fallback : JSON.parse(value);
        } catch (error) { return fallback; }
      },
      deleteValue: async key => pageWindow.localStorage.removeItem(`zk_bookmarklet_${key}`)
    };
    try { pageWindow.GM = gmCompat; } catch (error) {}

    xhrLoad(CORE_URL, source => {
      try {
        const run = new Function('window', 'globalThis', 'document', 'GM', 'GM_info', `${source}\n//# sourceURL=${CORE_URL}`);
        run.call(pageWindow, pageWindow, pageWindow, pageWindow.document, gmCompat, { script: { version: VERSION } });
        pageWindow.__AUTO_KILLER_CORE_LOADED__ = true;
      } catch (error) {
        pageWindow.__AUTO_KILLER_CORE_LOADING__ = false;
        console.error('[AUTO_KILLER OneClick] ZETA 본체 실행 실패', error);
        alert('AUTO_KILLER 본체 실행에 실패했어요: ' + (error?.message || error));
      }
    }, error => {
      pageWindow.__AUTO_KILLER_CORE_LOADING__ = false;
      console.error('[AUTO_KILLER OneClick] ZETA 본체 로드 실패', error);
      alert('AUTO_KILLER 본체를 불러오지 못했어요. GitHub 테스트 파일을 확인해주세요.');
    });
  }

  function statusUi() {
    let root = document.getElementById('__ak_oneclick_status__');
    if (root) return root;
    root = document.createElement('div');
    root.id = '__ak_oneclick_status__';
    root.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:10px 14px;border-radius:999px;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 4px 16px #0005;max-width:84vw;text-align:center';
    root.textContent = 'AUTO_KILLER · 준비 중…';
    (document.body || document.documentElement).appendChild(root);
    return root;
  }

  async function waitFor(selector, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(200);
    }
    return null;
  }

  function assistantTurns() {
    return [...document.querySelectorAll('[data-testid^="conversation-turn-"][data-turn="assistant"]')];
  }

  function assistantText(turn) {
    if (!turn) return '';
    const message = turn.querySelector('[data-message-author-role="assistant"]');
    const content = message?.querySelector('.markdown') || message?.querySelector('[class*="markdown"]') || message;
    return content?.innerText?.trim() || '';
  }

  function currentTurnId(turn) {
    return turn?.getAttribute('data-turn-id') || turn?.getAttribute('data-turn-id-container') || '';
  }

  async function insertPrompt(prompt, text) {
    prompt.focus();
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, text); }
    catch (error) {}

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

  function watchForAnswer(submitted, say, fail) {
    say('GPT 답변 기다리는 중…');
    let checks = 0;
    const timer = setInterval(() => {
      if (++checks > 450) {
        clearInterval(timer);
        fail('답변 대기 시간이 초과됐어요.');
        return;
      }

      const turns = assistantTurns();
      const answer = turns[turns.length - 1] || null;
      if (!answer) return;
      const turnId = currentTurnId(answer);
      if (!turnId || turnId === submitted.baselineTurnId) return;

      const copy = answer.querySelector('button[data-testid="copy-turn-action-button"]');
      if (!copy || copy.disabled) return;
      const text = assistantText(answer);
      if (!text) return;

      clearInterval(timer);
      clearStoredJob();
      const response = {
        id: submitted.id,
        type: submitted.type || 'review',
        room: submitted.room,
        text,
        time: Date.now()
      };
      say('완료 · ZETA로 자동 복귀 중…');
      setTimeout(() => {
        location.replace(`${submitted.room.split('#')[0]}#akresult=${encode(response)}`);
      }, 450);
    }, 800);
  }

  async function runGptBridge() {
    const hashMatch = location.hash.match(/(?:^#|[&#])akjob=([^&]+)/);
    let job = hashMatch ? decode(decodeURIComponent(hashMatch[1])) : null;

    if (job) {
      setStoredJob(job);
      try { history.replaceState(null, '', location.href.split('#')[0]); }
      catch (error) {}
    } else {
      job = getStoredJob();
    }

    if (!job?.id || job.schema !== 4) return;

    const status = statusUi();
    const say = text => { status.textContent = `AUTO_KILLER · ${text}`; };
    const fail = text => {
      status.textContent = `AUTO_KILLER · ${text}`;
      console.error('[AUTO_KILLER OneClick]', text);
      alert(text);
    };

    if (pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__) return;
    pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = true;

    if (job.stage === 'submitted') {
      say('중단된 답변 감시를 자동으로 이어가요…');
      watchForAnswer(job, say, fail);
      return;
    }

    say('GPT 입력창 기다리는 중…');
    const prompt = await waitFor('#prompt-textarea', 30000);
    if (!prompt) {
      pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = false;
      fail('GPT 입력창을 못 찾았어요.');
      return;
    }

    const turns = assistantTurns();
    const baseline = turns[turns.length - 1] || null;
    const submitted = {
      ...job,
      bookmarklet: true,
      stage: 'submitted',
      baselineTurnId: currentTurnId(baseline),
      submittedAt: Date.now()
    };
    setStoredJob(submitted);

    say('프롬프트 자동 입력 중…');
    await insertPrompt(prompt, job.text);
    await sleep(500);

    const submit = await waitFor('#composer-submit-button,button[data-testid="send-button"]', 10000);
    if (!submit) {
      pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = false;
      fail('전송 버튼을 못 찾았어요.');
      return;
    }

    let attempts = 0;
    while (submit.disabled && attempts++ < 30) await sleep(200);
    if (submit.disabled) {
      pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = false;
      fail('전송 버튼이 활성화되지 않았어요.');
      return;
    }

    say('자동 전송 · 답변 기다리는 중…');
    submit.click();
    watchForAnswer(submitted, say, fail);
  }

  if (isZeta) {
    bootZetaCore();
    return;
  }

  if (isGpt) {
    runGptBridge().catch(error => {
      pageWindow.__AUTO_KILLER_ONECLICK_GPT_RUNNING__ = false;
      console.error('[AUTO_KILLER OneClick] GPT 처리 오류', error);
      alert('AUTO_KILLER GPT 처리 중 오류가 났어요: ' + (error?.message || error));
    });
  }
})();
