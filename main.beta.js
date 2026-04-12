// ==UserScript==
// @name         PTA 模拟代码输入
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  绕过 PTA 粘贴限制，支持模拟输入、暂停继续和停止重来
// @author       Jimmy
// @match        https://pintia.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  let userCode = ``;

  let isTyping = false;
  let isPaused = false;
  let shouldStop = false;
  let activeTypingTask = null;
  let pendingEditorClickHandler = null;

  let executeBtn;
  let pauseBtn;
  let resetBtn;
  let textareaEl;

  function createUI() {
    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      width: 280px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      font-family: Arial, sans-serif;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 12px 16px;
      background: #0078d7;
      color: white;
      font-weight: bold;
      cursor: move;
      display: flex;
      font-size: 14px;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    `;
    header.textContent = "PTA 模拟输入（按住拖动）";
    container.appendChild(header);

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (event) => {
      isDragging = true;
      const rect = container.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      header.style.background = "#005a9e";
      container.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
    });

    document.addEventListener("mousemove", (event) => {
      if (!isDragging) return;
      container.style.left = `${event.clientX - offsetX}px`;
      container.style.top = `${event.clientY - offsetY}px`;
      container.style.bottom = "auto";
      container.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      header.style.background = "#0078d7";
      container.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });

    const content = document.createElement("div");
    content.style.cssText = `padding: 16px;`;

    textareaEl = document.createElement("textarea");
    textareaEl.value = userCode;
    textareaEl.style.cssText = `
      width: 100%;
      height: 180px;
      margin-bottom: 12px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      resize: vertical;
      box-sizing: border-box;
    `;
    textareaEl.placeholder = "请输入要自动填充的代码...";
    textareaEl.addEventListener("input", function () {
      userCode = this.value;
    });
    content.appendChild(textareaEl);

    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      gap: 8px;
    `;

    executeBtn = document.createElement("button");
    executeBtn.textContent = "执行";
    executeBtn.style.cssText = btnBaseStyle("#0078d7");
    executeBtn.addEventListener("click", startAutoInput);

    pauseBtn = document.createElement("button");
    pauseBtn.textContent = "暂停";
    pauseBtn.style.cssText = btnBaseStyle("#f2a900");
    pauseBtn.disabled = true;
    pauseBtn.style.opacity = "0.5";
    pauseBtn.addEventListener("click", togglePause);

    resetBtn = document.createElement("button");
    resetBtn.textContent = "清空代码";
    resetBtn.style.cssText = btnBaseStyle("#d83b01");
    resetBtn.addEventListener("click", handleResetAction);

    btnContainer.appendChild(executeBtn);
    btnContainer.appendChild(pauseBtn);
    btnContainer.appendChild(resetBtn);
    content.appendChild(btnContainer);

    container.appendChild(content);
    document.body.appendChild(container);
  }

  function btnBaseStyle(color) {
    return `
      background: ${color};
      color: white;
      border: none;
      padding: 8px 0;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      flex: 1;
      transition: all 0.2s;
    `;
  }

  function setTextareaLocked(locked) {
    if (!textareaEl) return;
    textareaEl.disabled = locked;
    textareaEl.style.opacity = locked ? "0.65" : "1";
    textareaEl.style.cursor = locked ? "not-allowed" : "text";
  }

  function setResetButtonMode(isRunning) {
    if (!resetBtn) return;
    resetBtn.textContent = isRunning ? "停止重来" : "清空代码";
    resetBtn.style.background = isRunning ? "#a4262c" : "#d83b01";
  }

  function removePendingEditorClickHandler() {
    if (!pendingEditorClickHandler) return;
    document.body.removeEventListener("click", pendingEditorClickHandler, true);
    pendingEditorClickHandler = null;
  }

  function getEditor() {
    return document.querySelector('.cm-content[contenteditable="true"]');
  }

  let sleepWorker = null;
  try {
    const workerCode = `
      self.onmessage = function (event) {
        setTimeout(() => self.postMessage("done"), event.data);
      };
    `;
    const workerBlob = new Blob([workerCode], {
      type: "application/javascript",
    });
    sleepWorker = new Worker(URL.createObjectURL(workerBlob));
  } catch (error) {
    console.warn("PTA 的安全策略阻止了 Worker 创建，将回退到普通模式。", error);
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      if (sleepWorker) {
        sleepWorker.onmessage = () => resolve();
        sleepWorker.postMessage(ms);
      } else {
        setTimeout(resolve, ms);
      }
    });
  }

  function togglePause() {
    if (!isTyping) return;

    isPaused = !isPaused;
    if (isPaused) {
      pauseBtn.textContent = "继续";
      pauseBtn.style.background = "#107c10";
      executeBtn.textContent = "已暂停";
    } else {
      pauseBtn.textContent = "暂停";
      pauseBtn.style.background = "#f2a900";
      executeBtn.textContent = "输入中...";
    }
  }

  async function clearEditorContent(showMissingAlert = true) {
    const editor = getEditor();
    if (!editor) {
      if (showMissingAlert) {
        alert("未找到代码编辑器！");
      }
      return false;
    }

    editor.focus();
    document.execCommand("selectAll", false, null);
    await sleep(50);
    document.execCommand("delete", false, null);
    return true;
  }

  async function stopCurrentTask() {
    if (!isTyping && !pendingEditorClickHandler) return;

    shouldStop = true;
    isPaused = false;
    removePendingEditorClickHandler();

    executeBtn.textContent = "停止中...";
    executeBtn.disabled = true;
    executeBtn.style.background = "#555";

    pauseBtn.textContent = "暂停";
    pauseBtn.disabled = true;
    pauseBtn.style.background = "#f2a900";
    pauseBtn.style.opacity = "0.5";

    if (activeTypingTask) {
      await activeTypingTask;
      return;
    }

    restoreButtons();
  }

  async function handleResetAction() {
    if (isTyping) {
      await stopCurrentTask();
      await clearEditorContent(false);
      return;
    }

    if (pendingEditorClickHandler) {
      await stopCurrentTask();
      return;
    }

    await clearEditorContent(true);
  }

  function restoreButtons() {
    isTyping = false;
    isPaused = false;
    shouldStop = false;
    activeTypingTask = null;

    removePendingEditorClickHandler();

    executeBtn.textContent = "执行";
    executeBtn.disabled = false;
    executeBtn.style.background = "#0078d7";

    pauseBtn.textContent = "暂停";
    pauseBtn.disabled = true;
    pauseBtn.style.background = "#f2a900";
    pauseBtn.style.opacity = "0.5";

    setTextareaLocked(false);
    setResetButtonMode(false);
  }

  async function simulateTyping(element, text) {
    isTyping = true;
    isPaused = false;
    shouldStop = false;

    pauseBtn.disabled = false;
    pauseBtn.style.opacity = "1";
    setTextareaLocked(true);
    setResetButtonMode(true);

    element.focus();

    try {
      for (let index = 0; index < text.length; index += 1) {
        if (shouldStop) break;

        while (isPaused) {
          await sleep(100);
          if (shouldStop) break;
        }

        if (shouldStop) break;

        element.focus();
        document.execCommand("insertText", false, text[index]);

        const delay = 0;
        await sleep(delay);
      }
    } finally {
      restoreButtons();
    }
  }

  async function startTypingOnTarget(target) {
    executeBtn.textContent = "输入中...";
    executeBtn.disabled = true;
    executeBtn.style.background = "#555";

    activeTypingTask = simulateTyping(target, userCode);
    await activeTypingTask;
  }

  async function startAutoInput() {
    if (isTyping || pendingEditorClickHandler) return;

    if (!userCode.trim()) {
      alert("请先输入要填充的代码！");
      return;
    }

    executeBtn.textContent = "准备中...";
    executeBtn.disabled = true;
    executeBtn.style.background = "#555";
    setTextareaLocked(true);
    setResetButtonMode(true);

    const editor = getEditor();
    if (editor) {
      await startTypingOnTarget(editor);
      return;
    }

    executeBtn.textContent = "请点击代码框";
    executeBtn.style.background = "#f2a900";
    executeBtn.disabled = true;

    pendingEditorClickHandler = async function (event) {
      const target = event.target.closest(".cm-content") || event.target;
      if (!target || !target.isContentEditable) return;

      event.preventDefault();
      event.stopPropagation();
      removePendingEditorClickHandler();

      await startTypingOnTarget(target);
    };

    document.body.addEventListener("click", pendingEditorClickHandler, true);
  }

  createUI();
})();
