// ==UserScript==
// @name         PTA 模拟代码输入
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  模拟代码输入到PTA编辑器，支持暂停和一键清空
// @author       Jimmy
// @match        https://pintia.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // 存储用户预设的代码
  let userCode = ``;

  // === 状态控制变量 ===
  let isTyping = false; // 是否正在输入
  let isPaused = false; // 是否已暂停
  let shouldStop = false; // 是否需要强行终止输入

  // 声明按钮变量，方便全局更新状态
  let executeBtn, pauseBtn, resetBtn;

  // 创建用户界面
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
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      overflow: hidden;
      font-family: Arial, sans-serif;
    `;

    // 标题栏
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
    header.textContent = "PTA 模拟输入 (按住拖动)";
    container.appendChild(header);

    // 拖动功能
    let isDragging = false;
    let offsetX, offsetY;
    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      const rect = container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      header.style.background = "#005a9e";
      container.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      container.style.left = (e.clientX - offsetX) + "px";
      container.style.top = (e.clientY - offsetY) + "px";
      container.style.bottom = "auto";
      container.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.background = "#0078d7";
        container.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      }
    });

    // 内容面板
    const content = document.createElement("div");
    content.style.cssText = `padding: 16px;`;

    // 代码输入区域
    const textarea = document.createElement("textarea");
    textarea.value = userCode;
    textarea.style.cssText = `
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
    textarea.placeholder = "请输入要自动填充的代码...";
    textarea.addEventListener("input", function () {
      userCode = this.value;
    });
    content.appendChild(textarea);

    // === 按钮容器 ===
    const btnContainer = document.createElement("div");
    btnContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      gap: 8px;
    `;

    // 1. 执行按钮
    executeBtn = document.createElement("button");
    executeBtn.textContent = "执行";
    executeBtn.style.cssText = btnBaseStyle("#0078d7");
    executeBtn.addEventListener("click", startAutoInput);

    // 2. 暂停/继续按钮
    pauseBtn = document.createElement("button");
    pauseBtn.textContent = "暂停";
    pauseBtn.style.cssText = btnBaseStyle("#f2a900");
    pauseBtn.disabled = true; // 默认不可用
    pauseBtn.style.opacity = "0.5";
    pauseBtn.addEventListener("click", togglePause);

    // 3. 重置按钮
    resetBtn = document.createElement("button");
    resetBtn.textContent = "清空代码";
    resetBtn.style.cssText = btnBaseStyle("#d83b01");
    resetBtn.addEventListener("click", resetEditorContent);

    btnContainer.appendChild(executeBtn);
    btnContainer.appendChild(pauseBtn);
    btnContainer.appendChild(resetBtn);
    content.appendChild(btnContainer);

    container.appendChild(content);
    document.body.appendChild(container);
  }

  // 按钮基础样式辅助函数
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

// === 突破浏览器后台限制的休眠函数 ===
  let sleepWorker = null;
  try {
    // 创建一个后台线程 Web Worker，它不会因为切换标签页被降速
    const workerCode = `
      self.onmessage = function(e) {
        setTimeout(() => self.postMessage('done'), e.data);
      }
    `;
    const workerBlob = new Blob([workerCode], { type: "application/javascript" });
    sleepWorker = new Worker(URL.createObjectURL(workerBlob));
  } catch (error) {
    console.warn("PTA 的安全策略阻止了 Worker 创建，将回退到普通模式");
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      if (sleepWorker) {
        // 如果 Worker 创建成功，使用后台线程计时
        sleepWorker.onmessage = () => resolve();
        sleepWorker.postMessage(ms);
      } else {
        // 兼容降级方案
        setTimeout(resolve, ms);
      }
    });
  }
  // ==============================================
  // === 核心逻辑 ===

  // 切换暂停/继续状态
  function togglePause() {
    if (!isTyping) return;

    isPaused = !isPaused;
    if (isPaused) {
      pauseBtn.textContent = "继续";
      pauseBtn.style.background = "#107c10"; // 变成绿色提示可继续
      executeBtn.textContent = "已暂停";
    } else {
      pauseBtn.textContent = "暂停";
      pauseBtn.style.background = "#f2a900"; // 恢复橙色
      executeBtn.textContent = "输入中...";
    }
  }

  // 一键清空编辑器代码
  async function resetEditorContent() {
    // 1. 如果正在打字，先强制停止
    if (isTyping) {
      shouldStop = true;
      isPaused = false; // 解除暂停状态以让循环退出
    }

    // 2. 寻找编辑器
    const editor = document.querySelector('.cm-content[contenteditable="true"]');
    if (editor) {
      editor.focus();
      // 模拟全选操作
      document.execCommand("selectAll", false, null);
      await sleep(50);
      // 模拟删除操作
      document.execCommand("delete", false, null);
    } else {
      alert("未找到编辑器框！");
    }
  }

  // 恢复按钮初始状态
  function restoreButtons() {
    isTyping = false;
    isPaused = false;
    shouldStop = false;

    executeBtn.textContent = "执行";
    executeBtn.disabled = false;
    executeBtn.style.background = "#0078d7";

    pauseBtn.textContent = "暂停";
    pauseBtn.disabled = true;
    pauseBtn.style.background = "#f2a900";
    pauseBtn.style.opacity = "0.5";
  }

  // 模拟真实打字
  async function simulateTyping(element, text) {
    isTyping = true;
    isPaused = false;
    shouldStop = false;

    // 设置按钮状态
    pauseBtn.disabled = false;
    pauseBtn.style.opacity = "1";

    element.focus();

    for (let i = 0; i < text.length; i++) {
      // 如果触发了停止（按了清空重置按钮），立刻跳出循环
      if (shouldStop) {
        break;
      }

      // 如果触发了暂停，死循环等待，直到取消暂停或被强行停止
      while (isPaused) {
        await sleep(100);
        if (shouldStop) break;
      }

      if (shouldStop) break; // 二次确认跳出

      element.focus();
      const char = text[i];
      document.execCommand("insertText", false, char);

      // 你保留的0延迟（如果被判作弊，可以适当加到 1~5）
      const delay = Math.floor(Math.random() * 0) + 0;
      await sleep(delay);
    }

    // 输入结束后恢复按钮状态
    restoreButtons();
  }

  // 启动自动输入流程
  async function startAutoInput() {
    if (isTyping) return; // 如果正在输入，防止重复点击

    if (!userCode.trim()) {
      alert("请先输入要填充的代码！");
      return;
    }

    executeBtn.textContent = "准备中...";
    executeBtn.disabled = true;
    executeBtn.style.background = "#555"; // 按钮变灰并不可点

    const editor = document.querySelector('.cm-content[contenteditable="true"]');

    if (editor) {
      executeBtn.textContent = "输入中...";
      await simulateTyping(editor, userCode);
    } else {
      executeBtn.textContent = "请点击代码框";
      executeBtn.style.background = "#f2a900";
      executeBtn.disabled = false;

      const clickHandler = async function (e) {
        const target = e.target.closest('.cm-content') || e.target;

        if (target.isContentEditable) {
          e.preventDefault();
          e.stopPropagation();
          document.body.removeEventListener("click", clickHandler, true);

          executeBtn.textContent = "输入中...";
          executeBtn.disabled = true;
          executeBtn.style.background = "#555";

          await simulateTyping(target, userCode);
        }
      };

      document.body.addEventListener("click", clickHandler, true);
    }
  }

  // 初始化UI
  createUI();
})();
