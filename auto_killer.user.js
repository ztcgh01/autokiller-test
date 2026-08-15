// ==UserScript==
// @name         AUTO_KILLER
// @namespace    local.zeta.gpt.oneclick.unified
// @version      2.25.3.1
// @description  GitHub의 최신 AUTO_KILLER 통합 코어를 Android와 iPhone에서 자동으로 불러옵니다.
// @downloadURL  https://ztcgh01.github.io/autokiller/auto_killer.user.js
// @updateURL    https://ztcgh01.github.io/autokiller/auto_killer.user.js
// @match        https://*.zeta-ai.io/*
// @match        https://zeta-ai.io/*
// @match        https://chatgpt.com/*
// @match        https://*.chatgpt.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @connect      github.io
// @connect      github.com
// @connect      raw.githubusercontent.com
// @connect      *
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM.info
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  // 설치된 로더와 같은 온라인 폴더의 코어를 자동으로 찾습니다.
  // iPhone Userscripts처럼 설치 주소를 제공하지 않는 환경에서는 배포자가 지정한 주소를 사용합니다.
  const FALLBACK_CORE_URL = 'https://ztcgh01.github.io/autokiller/auto_killer.core.js';
  const CORE_URL = resolveCoreUrl();
  const pageWindow = typeof unsafeWindow === 'object' ? unsafeWindow : window;
  const ANDROID_DEVICE = /Android/i.test(navigator.userAgent);
  const IOS_DEVICE = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const STORAGE_REQUEST_EVENT = '__AUTO_KILLER_GM_REQUEST_V1__';
  const STORAGE_RESPONSE_EVENT = '__AUTO_KILLER_GM_RESPONSE_V1__';

  function resolveCoreUrl() {
    const legacyInfo = typeof GM_info === 'object' && GM_info ? GM_info : null;
    const modernInfo = typeof GM === 'object' && GM && typeof GM.info === 'object' ? GM.info : null;
    const candidates = [
      legacyInfo?.script?.downloadURL,
      legacyInfo?.script?.updateURL,
      legacyInfo?.scriptDownloadURL,
      legacyInfo?.scriptUpdateURL,
      modernInfo?.script?.downloadURL,
      modernInfo?.script?.updateURL,
      modernInfo?.scriptDownloadURL,
      modernInfo?.scriptUpdateURL
    ];

    for (const candidate of candidates) {
      if (!/^https:\/\//i.test(String(candidate || ''))) continue;
      try {
        const url = new URL(candidate);

        // GitHub의 파일 보기 주소로 설치한 경우에도 raw 주소로 바꿉니다.
        if (url.hostname === 'github.com') {
          const parts = url.pathname.split('/').filter(Boolean);
          const blobIndex = parts.indexOf('blob');
          if (blobIndex === 2 && parts.length > 3) {
            url.hostname = 'raw.githubusercontent.com';
            url.pathname = '/' + [parts[0], parts[1], ...parts.slice(3, -1), 'auto_killer.core.js'].join('/');
          } else {
            continue;
          }
        } else {
          url.pathname = url.pathname.replace(/[^/]*$/, 'auto_killer.core.js');
        }

        url.search = '';
        url.hash = '';
        return url.href;
      } catch (error) {}
    }

    return FALLBACK_CORE_URL;
  }

  async function gmSet(key, value) {
    if (typeof GM === 'object' && typeof GM.setValue === 'function') return GM.setValue(key, value);
    if (typeof GM_setValue === 'function') return GM_setValue(key, value);
    throw new Error('GM 저장 기능을 찾지 못했습니다.');
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

  function installStorageBridge() {
    if (pageWindow.__AUTO_KILLER_STORAGE_BRIDGE_INSTALLED__ === true) return;
    pageWindow.__AUTO_KILLER_STORAGE_BRIDGE_INSTALLED__ = true;
    pageWindow.__AUTO_KILLER_STORAGE_BRIDGE__ = true;

    document.addEventListener(STORAGE_REQUEST_EVENT, async event => {
      let request = null;
      try { request = JSON.parse(String(event.detail || '')); } catch (error) {}
      if (!request?.id || !request.operation || !request.key) return;

      const response = { id: request.id, ok: true, value: null };
      try {
        if (request.operation === 'set') response.value = await gmSet(request.key, request.value);
        else if (request.operation === 'get') response.value = await gmGet(request.key, request.fallback);
        else if (request.operation === 'delete') response.value = await gmDelete(request.key);
        else throw new Error(`알 수 없는 저장소 작업: ${request.operation}`);
      } catch (error) {
        response.ok = false;
        response.error = error?.message || String(error);
      }

      document.dispatchEvent(new CustomEvent(STORAGE_RESPONSE_EVENT, {
        detail: JSON.stringify(response)
      }));
    });
  }

  function gmApiForCore() {
    return {
      setValue: gmSet,
      getValue: gmGet,
      deleteValue: gmDelete
    };
  }

  function executeCore(source) {
    if (!source || !source.trim()) throw new Error('GitHub 코어 응답이 비어 있습니다.');
    const run = new Function(
      'window',
      'globalThis',
      'document',
      'GM',
      'GM_info',
      `${source}\n//# sourceURL=${CORE_URL}`
    );
    run.call(
      pageWindow,
      pageWindow,
      pageWindow,
      pageWindow.document,
      gmApiForCore(),
      typeof GM_info === 'object' ? GM_info : null
    );
    if (pageWindow.__AUTO_KILLER_REMOTE_CORE_LOADED__ !== true) {
      throw new Error('코어는 받았지만 실행 확인 신호가 없습니다.');
    }
  }

  function requestViaGm(requestUrl) {
    return new Promise((resolve, reject) => {
      const handleResponse = response => {
        try {
          const status = Number(response?.status || 0);
          const source = response?.responseText || response?.response || '';
          if (status < 200 || status >= 300) throw new Error(`GitHub 코어 응답 오류: HTTP ${status || '없음'}`);
          executeCore(String(source));
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: requestUrl,
          timeout: 15000,
          onload: handleResponse,
          onerror: () => reject(new Error('GM 방식으로 GitHub 코어 연결에 실패했습니다.')),
          ontimeout: () => reject(new Error('GM 방식의 GitHub 코어 연결 시간이 초과됐습니다.'))
        });
        return;
      }

      if (typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function') {
        Promise.resolve(GM.xmlHttpRequest({ method: 'GET', url: requestUrl, timeout: 15000 }))
          .then(handleResponse)
          .catch(reject);
        return;
      }

      fetch(requestUrl, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`GitHub 코어 응답 오류: HTTP ${response.status}`);
          return response.text();
        })
        .then(source => {
          try { executeCore(source); resolve(); }
          catch (error) { reject(error); }
        })
        .catch(reject);
    });
  }

  function requestViaScript(requestUrl) {
    return new Promise((resolve, reject) => {
      try {
        const script = document.createElement('script');
        script.src = requestUrl;
        script.async = false;
        script.dataset.autoKillerRemoteCore = 'true';
        script.onload = () => {
          script.remove();
          if (pageWindow.__AUTO_KILLER_REMOTE_CORE_LOADED__ === true) resolve();
          else reject(new Error('코어는 불러왔지만 실행 확인 신호가 없습니다.'));
        };
        script.onerror = () => {
          script.remove();
          reject(new Error('script 방식으로 GitHub 코어를 불러오지 못했습니다.'));
        };
        (document.head || document.documentElement).appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function boot() {
    if (!/^https:\/\//i.test(CORE_URL)) throw new Error('CORE_URL에는 HTTPS 주소를 넣어주세요.');
    installStorageBridge();
    pageWindow.__AUTO_KILLER_ONECLICK_BRIDGE__ = true;
    pageWindow.__AUTO_KILLER_ONECLICK_IOS__ = IOS_DEVICE;

    const separator = CORE_URL.includes('?') ? '&' : '?';
    const requestUrl = `${CORE_URL}${separator}ak=${Date.now()}`;

    if (ANDROID_DEVICE) {
      try {
        await requestViaScript(requestUrl);
      } catch (firstError) {
        console.warn('[AUTO_KILLER Loader] Android script 방식 실패, GM 방식으로 재시도', firstError);
        await requestViaGm(requestUrl);
      }
      return;
    }

    try {
      await requestViaGm(requestUrl);
    } catch (firstError) {
      console.warn('[AUTO_KILLER Loader] GM 방식 실패, script 방식으로 재시도', firstError);
      await requestViaScript(requestUrl);
    }
  }

  boot().catch(error => {
    console.error('[AUTO_KILLER Loader] 통합 코어 로드 실패', error);
    alert('AUTO_KILLER 통합 코어 로드 실패: ' + (error?.message || error));
  });
})();
