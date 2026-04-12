// ==UserScript==
// @name         Pintia Paste Optimized
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  拦截 Pintia 编辑器中的粘贴并改为模拟逐字输入（推荐）
// @author       Jimmy
// @match        https://pintia.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // 全局运行状态：避免粘贴过程中重复触发，造成文本交错写入。
  let isTyping = false;

  // 分块插入配置：单次插入少量字符，在保持格式稳定的同时尽量模拟人工输入节奏。
  const CHUNK_SIZE = 5;
  const DELAY_MS = 10;

  // 判断当前节点是否为 Pintia 代码编辑器实际承载输入的 contenteditable 区域。
  function isEditorElement(element) {
    return Boolean(
      element &&
      element.matches &&
      element.matches('.cm-content[contenteditable="true"]'),
    );
  }

  // 从事件源向上查找最近的编辑器节点，兼容点击到编辑器内部子节点的情况。
  function getEditorFromTarget(target) {
    if (!target) return null;
    if (isEditorElement(target)) return target;
    return target.closest?.('.cm-content[contenteditable="true"]') ?? null;
  }

  // 兜底获取当前激活的编辑器，保证粘贴事件目标不精确时仍可继续处理。
  function getActiveEditor() {
    return getEditorFromTarget(document.activeElement);
  }

  // 统一换行符为 LF，避免 Windows 剪贴板中的 CRLF 导致额外空行。
  function normalizeText(text) {
    return text.replace(/\r\n?/g, "\n");
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
    console.warn("PTA worker creation failed, fallback to setTimeout.", error);
  }

  // 通过 Worker 提供更平滑的异步等待；若环境受限则自动退化为 setTimeout。
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

  // 确保光标真实落在目标编辑器内；若当前选区无效，则将光标移动到末尾后再执行插入。
  function ensureSelectionAtCursor(targetElement) {
    targetElement.focus();

    const selection = window.getSelection();
    if (!selection) return;

    if (
      selection.rangeCount > 0 &&
      targetElement.contains(selection.anchorNode) &&
      targetElement.contains(selection.focusNode)
    ) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(targetElement);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 优先使用浏览器原生 insertText 维持编辑器对缩进、换行和高亮的正常处理。
  // 若当前环境不支持，则回退到直接操作 Range，保证最基本的文本写入能力。
  function insertChunk(targetElement, chunk) {
    ensureSelectionAtCursor(targetElement);

    const inserted = document.execCommand("insertText", false, chunk);
    if (inserted) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(chunk);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // 按固定分块逐步写入文本，既模拟人工输入，也尽量保持和原始粘贴一致的格式表现。
  async function simulateTyping(element, text) {
    if (!element || typeof text !== "string" || isTyping) return;

    isTyping = true;

    const normalizedText = normalizeText(text);

    try {
      for (let index = 0; index < normalizedText.length; index += CHUNK_SIZE) {
        const chunk = normalizedText.slice(index, index + CHUNK_SIZE);
        insertChunk(element, chunk);
        await sleep(DELAY_MS);
      }
    } finally {
      isTyping = false;
    }
  }

  // 优先从当前 paste 事件中直接读取纯文本，失败时再降级到 Clipboard API。
  async function readClipboardText(event) {
    const directText = event.clipboardData?.getData("text/plain");
    if (directText) return normalizeText(directText);

    if (!navigator.clipboard?.readText) {
      return "";
    }

    try {
      return normalizeText(await navigator.clipboard.readText());
    } catch (error) {
      console.warn("PTA clipboard read failed.", error);
      return "";
    }
  }

  // 接管默认粘贴行为：仅在代码编辑器内生效，并将原始粘贴改为模拟输入。
  async function handlePaste(event) {
    if (isTyping) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const editor = getEditorFromTarget(event.target) || getActiveEditor();
    if (!editor) return;

    event.preventDefault();
    event.stopPropagation();

    const text = await readClipboardText(event);
    if (!text) return;

    await simulateTyping(editor, text);
  }

  document.addEventListener(
    "paste",
    (event) => {
      void handlePaste(event);
    },
    true,
  );
})();
