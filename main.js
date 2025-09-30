// ==UserScript==
// @name         PTA 模拟代码输入
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  模拟代码输入到PTA编辑器
// @author       Jimmy
// @match        https://pintia.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // 存储用户预设的代码
  let userCode = ``;

  // 创建用户界面
  function createUI() {
    // 创建主容器
    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      width: 250px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      overflow: hidden;
      font-family: Arial, sans-serif;
    `;

    // 创建标题栏（可拖动区域）
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 12px 16px;
      background: #0078d7;
      color: white;
      font-weight: bold;
      cursor: move; /* 显示移动光标 */
      display: flex;
      font-size: 14px;
      justify-content: space-between;
      align-items: center;
      user-select: none; /* 防止拖动时选中文本 */
    `;
    header.textContent = "PTA 模拟输入  (双击PTA输入框)";
    container.appendChild(header);

    // 添加拖动功能
    let isDragging = false;
    let offsetX, offsetY;

    // 鼠标按下时开始拖动
    header.addEventListener("mousedown", function (e) {
      isDragging = true;
      // 计算鼠标相对于容器的位置
      const rect = container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      // 增加视觉反馈
      header.style.background = "#005a9e";
      container.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
    });

    // 鼠标移动时更新位置（允许超出视口）
    document.addEventListener("mousemove", function (e) {
      if (!isDragging) return;

      // 计算新位置（不限制在视口内）
      let newX = e.clientX - offsetX;
      let newY = e.clientY - offsetY;

      // 应用新位置
      container.style.left = newX + "px";
      container.style.top = newY + "px";
      // 清除原来的bottom和right定位
      container.style.bottom = "auto";
      container.style.right = "auto";
    });

    // 鼠标释放时结束拖动
    document.addEventListener("mouseup", function () {
      if (isDragging) {
        isDragging = false;
        // 恢复视觉样式
        header.style.background = "#0078d7";
        container.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
      }
    });

    // 创建内容面板
    const content = document.createElement("div");
    content.id = "pta-auto-input-content";
    content.style.cssText = `
      padding: 16px;
      display: block;
    `;

    // 添加代码输入区域
    const textarea = document.createElement("textarea");
    textarea.id = "pta-code-input";
    textarea.value = userCode;
    textarea.style.cssText = `
      width: 100%;
      height: 200px;
      margin-bottom: 12px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      resize: vertical;
    `;
    textarea.placeholder = "请输入要自动填充的代码...";
    textarea.addEventListener("input", function () {
      userCode = this.value;
    });
    content.appendChild(textarea);

    // 添加执行按钮
    const executeBtn = document.createElement("button");
    executeBtn.textContent = "执行输入";
    executeBtn.style.cssText = `
      background: #0078d7;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      width: 100%;
      transition: background 0.2s;
      margin-top: 12px;
    `;
    executeBtn.addEventListener("mouseover", function () {
      this.style.background = "#005a9e";
    });
    executeBtn.addEventListener("mouseout", function () {
      this.style.background = "#0078d7";
    });
    executeBtn.addEventListener("click", startAutoInput);
    content.appendChild(executeBtn);

    container.appendChild(content);
    document.body.appendChild(container);
  }

  // 查找编辑器
  function findEditor() {
    document.body.addEventListener(
      "click",
      function onFirstClick(e) {
        if (e.target.isContentEditable) {
          simulateTyping(e.target, userCode);
          document.body.removeEventListener("click", onFirstClick);
        }
      },
      { once: true }
    );
    return null;
  }

  // 模拟打字（逐字符 + 触发事件）
  function simulateTyping(element, text) {
    let i = 0;
    const delay = 0; // 每字符间隔（毫秒），模拟人类
    console.warn(element);
    function typeNext() {
      if (i < text.length) {
        const char = text[i];
        element.focus();
        document.execCommand("insertText", false, char);
        i++;
        setTimeout(typeNext, delay + Math.random() * 0);
      }
    }

    setTimeout(typeNext, 1);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // 启动自动输入流程
  async function startAutoInput() {
    if (!userCode.trim()) {
      alert("请先输入要填充的代码！");
      return;
    }

    alert("未自动找到编辑器，请点击目标输入框");
    await sleep(1000);
    const editor = findEditor();
    if (editor) {
      simulateTyping(editor, userCode);
    }
  }

  // 初始化UI
  createUI();
})();
