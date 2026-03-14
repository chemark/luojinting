(function () {
  'use strict';

  var STORAGE_KEY = 'resume_html_v1';
  var STORAGE_BREAK_Y_KEY = 'resume_break_y_v1';
  var LEGACY_STORAGE_BREAK_INDEX_KEY = 'resume_break_index_v1';
  var MIN_EXPORT_SCALE = 0.5;

  var resume = document.querySelector('[data-resume]');
  var toolbar = document.getElementById('toolbar');
  var imageInput = document.getElementById('imageInput');

  var btnEdit = document.getElementById('btnEdit');
  var btnPreview = document.getElementById('btnPreview');
  var btnBold = document.getElementById('btnBold');
  var btnItalic = document.getElementById('btnItalic');
  var btnUl = document.getElementById('btnUl');
  var btnH2 = document.getElementById('btnH2');
  var btnAddSection = document.getElementById('btnAddSection');
  var btnInsertImage = document.getElementById('btnInsertImage');
  var btnInsertVideo = document.getElementById('btnInsertVideo');
  var btnInsertAudio = document.getElementById('btnInsertAudio');
  var btnSave = document.getElementById('btnSave');
  var btnReset = document.getElementById('btnReset');
  var btnExport = document.getElementById('btnExport');

  var exportOverlay = document.getElementById('exportOverlay');
  var exportPanel = exportOverlay ? exportOverlay.querySelector('.overlay__panel') : null;
  var btnCloseExport = document.getElementById('btnCloseExport');
  var btnDoExport = document.getElementById('btnDoExport');
  var exportHint = document.getElementById('exportHint');
  var tabFlow = document.getElementById('tabFlow');
  var tabPages = document.getElementById('tabPages');

  var flow = document.getElementById('flow');
  var flowPaper = document.getElementById('flowPaper');
  var flowContent = document.getElementById('flowContent');
  var cutLine = document.getElementById('cutLine');

  var page1Content = document.getElementById('page1Content');
  var page2Content = document.getElementById('page2Content');

  var isEditing = false;
  var breakY = null; // y in px within flow content (unscaled)
  var legacyBreakIndex = null;
  var isDraggingCutLine = false;
  var lastExportScale = 1;

  if (!resume || !toolbar) return;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function safeParseInt(value, fallback) {
    var n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeParseFloat(value, fallback) {
    var n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getTopLevelBlocks(root) {
    return Array.prototype.slice.call(root.children).filter(function (el) {
      if (!el || el.nodeType !== 1) return false;
      // Keep header/section/footer, skip script-like or hidden elements.
      if (el.hasAttribute('hidden')) return false;
      return true;
    });
  }

  function setEditing(next) {
    isEditing = !!next;
    resume.setAttribute('data-editing', isEditing ? 'true' : 'false');
    resume.contentEditable = isEditing ? 'true' : 'false';
    btnEdit.setAttribute('aria-pressed', isEditing ? 'true' : 'false');

    var disabled = !isEditing;
    btnBold.disabled = disabled;
    btnItalic.disabled = disabled;
    btnUl.disabled = disabled;
    btnH2.disabled = disabled;
    btnAddSection.disabled = disabled;
    btnInsertImage.disabled = disabled;
    btnInsertVideo.disabled = disabled;
    btnInsertAudio.disabled = disabled;

    if (!isEditing) {
      // Avoid leaving caret artifacts.
      window.getSelection().removeAllRanges();
    }
  }

  function loadSaved() {
    try {
      var html = localStorage.getItem(STORAGE_KEY);
      if (html && typeof html === 'string') {
        resume.innerHTML = html;
      }
      var savedBreakY = safeParseFloat(localStorage.getItem(STORAGE_BREAK_Y_KEY), null);
      breakY = savedBreakY;
      legacyBreakIndex = safeParseInt(localStorage.getItem(LEGACY_STORAGE_BREAK_INDEX_KEY), null);
    } catch (e) {
      // Ignore storage failures (private mode, disabled storage).
    }
  }

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, resume.innerHTML);
      if (breakY != null) localStorage.setItem(STORAGE_BREAK_Y_KEY, String(Math.round(breakY)));
      flashHint('已保存到本地（浏览器 localStorage）。');
    } catch (e) {
      flashHint('保存失败：浏览器可能禁用了本地存储。');
    }
  }

  function resetToDefault() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BREAK_Y_KEY);
      localStorage.removeItem(LEGACY_STORAGE_BREAK_INDEX_KEY);
    } catch (e) {}
    window.location.reload();
  }

  function flashHint(text) {
    if (!exportHint) return;
    exportHint.textContent = text;
  }

  function exec(cmd, value) {
    // Deprecated but still the simplest for a lightweight editor.
    document.execCommand(cmd, false, value);
  }

  function insertNodeAtSelection(node) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      resume.appendChild(node);
      return;
    }
    var range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);

    // Move caret after inserted node.
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function promptForUrl(kind) {
    var label = kind === 'video' ? '视频' : '音频';
    var url = window.prompt('请输入' + label + '链接（http/https）');
    if (!url) return null;
    url = String(url).trim();
    if (!/^https?:\/\//i.test(url)) {
      window.alert('链接格式不正确，请以 http:// 或 https:// 开头。');
      return null;
    }
    return url;
  }

  function makeMediaBlock(kind, url) {
    var figure = document.createElement('figure');
    figure.className = 'media-block';
    figure.setAttribute('data-kind', kind);
    figure.setAttribute('contenteditable', 'false');

    var title = document.createElement('div');
    title.className = 'media-block__kind';
    title.textContent = kind === 'video' ? '视频' : '音频';

    var p = document.createElement('div');
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;

    p.appendChild(document.createTextNode('链接：'));
    p.appendChild(a);

    figure.appendChild(title);
    figure.appendChild(p);

    // In normal web preview, render a playable element. In PDF export preview, CSS hides these.
    if (kind === 'video') {
      var video = document.createElement('video');
      video.controls = true;
      video.src = url;
      video.style.width = '100%';
      video.style.marginTop = '10px';
      figure.appendChild(video);
    } else if (kind === 'audio') {
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;
      audio.style.width = '100%';
      audio.style.marginTop = '10px';
      figure.appendChild(audio);
    }
    return figure;
  }

  function openExport() {
    exportOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (exportPanel) exportPanel.setAttribute('data-view', 'flow');
    if (tabFlow) tabFlow.setAttribute('aria-selected', 'true');
    if (tabPages) tabPages.setAttribute('aria-selected', 'false');
    renderExportFlow();
    window.requestAnimationFrame(function () {
      ensureBreakYInitialized();
      renderExportPages();
      positionCutLineFromBreakY();
    });
    flashHint('提示：PDF 中视频/音频会以链接形式导出。');
  }

  function closeExport() {
    exportOverlay.hidden = true;
    document.body.style.overflow = '';
  }

  function cloneForExport(el) {
    var clone = el.cloneNode(true);
    // In export preview, avoid editable attributes and sticky toolbar behavior.
    clone.removeAttribute('contenteditable');
    clone.removeAttribute('data-editing');
    // Make links visible and safe.
    Array.prototype.forEach.call(clone.querySelectorAll('a'), function (a) {
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('target', '_blank');
    });
    // Force local images to allow html2canvas CORS behavior.
    Array.prototype.forEach.call(clone.querySelectorAll('img'), function (img) {
      if (!img.getAttribute('crossorigin')) img.setAttribute('crossorigin', 'anonymous');
    });
    return clone;
  }

  function renderExportFlow() {
    flowContent.innerHTML = '';
    var blocks = getTopLevelBlocks(resume);
    blocks.forEach(function (block, idx) {
      var clone = cloneForExport(block);
      clone.setAttribute('data-block-index', String(idx));
      flowContent.appendChild(clone);
    });
    // Ensure cutLine is within paper.
    cutLine.style.top = '0px';
  }

  function ensureBreakYInitialized() {
    var totalHeight = flowContent.scrollHeight;
    var pageHeight = page1Content ? page1Content.clientHeight : 0;

    if (!Number.isFinite(totalHeight) || totalHeight <= 0) return;
    if (!Number.isFinite(pageHeight) || pageHeight <= 0) pageHeight = totalHeight;

    if (breakY == null) {
      // Legacy migration: approximate the old "block index" by using that block's bottom edge.
      if (legacyBreakIndex != null) {
        var legacyEl = flowContent.querySelector('[data-block-index="' + legacyBreakIndex + '"]');
        if (legacyEl) {
          var flowRect = flowContent.getBoundingClientRect();
          var rect = legacyEl.getBoundingClientRect();
          breakY = rect.bottom - flowRect.top;
        }
      }
    }

    if (breakY == null) breakY = Math.min(totalHeight, pageHeight);
    breakY = clamp(breakY, 0, totalHeight);
    try {
      localStorage.setItem(STORAGE_BREAK_Y_KEY, String(Math.round(breakY)));
    } catch (e) {}
  }

  function renderExportPages() {
    page1Content.innerHTML = '';
    page2Content.innerHTML = '';

    ensureBreakYInitialized();

    var totalHeight = flowContent.scrollHeight;
    var pageHeight = page1Content.clientHeight;
    breakY = clamp(breakY, 0, totalHeight);

    // Scale down to guarantee both halves fit into one A4 page each.
    var maxPart = Math.max(1, breakY, totalHeight - breakY);
    var scaleNeeded = (pageHeight * 0.99) / maxPart;
    var scale = Math.min(1, Math.max(MIN_EXPORT_SCALE, scaleNeeded));
    lastExportScale = scale;

    // Page 1: full document, but masked after breakY.
    var doc1 = document.createElement('div');
    doc1.className = 'page-doc';
    getTopLevelBlocks(resume).forEach(function (block) {
      doc1.appendChild(cloneForExport(block));
    });
    doc1.style.transformOrigin = 'top left';
    doc1.style.transform = 'scale(' + scale.toFixed(5) + ')';
    page1Content.appendChild(doc1);

    var mask = document.createElement('div');
    mask.className = 'page-mask';
    mask.style.top = Math.max(0, Math.round(breakY * scale)) + 'px';
    page1Content.appendChild(mask);

    // Page 2: same document, translated up by breakY.
    var doc2 = document.createElement('div');
    doc2.className = 'page-doc';
    getTopLevelBlocks(resume).forEach(function (block) {
      doc2.appendChild(cloneForExport(block));
    });
    doc2.style.transformOrigin = 'top left';
    doc2.style.transform = 'translateY(' + (-breakY).toFixed(2) + 'px) scale(' + scale.toFixed(5) + ')';
    page2Content.appendChild(doc2);

    // Hint
    if (scaleNeeded >= 1) {
      flashHint('页面内容已适配 2 页 A4。');
    } else if (scaleNeeded < MIN_EXPORT_SCALE) {
      flashHint('内容过长，已缩放到 ' + Math.round(scale * 100) + '%，仍可能被裁剪。建议精简内容或调整分割线。');
    } else {
      flashHint('内容超出 A4，已自动缩放到 ' + Math.round(scale * 100) + '%。');
    }

    try {
      localStorage.setItem(STORAGE_BREAK_Y_KEY, String(Math.round(breakY)));
    } catch (e) {}
  }

  function positionCutLineFromBreakY() {
    if (breakY == null) return;
    var paperRect = flowPaper.getBoundingClientRect();
    var flowRect = flowContent.getBoundingClientRect();
    var y = (flowRect.top - paperRect.top) + breakY;
    cutLine.style.top = Math.max(0, y) + 'px';
  }

  function setBreakYFromPointer(clientY) {
    ensureBreakYInitialized();
    var flowRect = flowContent.getBoundingClientRect();
    var y = clientY - flowRect.top;
    var totalHeight = flowContent.scrollHeight;
    breakY = clamp(y, 0, totalHeight);
    positionCutLineFromBreakY();
    renderExportPages();
  }

  async function exportPdf() {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      window.alert('PDF 组件加载失败，请稍后刷新页面重试。');
      return;
    }

    btnDoExport.disabled = true;
    btnDoExport.textContent = '生成中...';
    flashHint('正在生成 PDF，请稍等...');

    // Make sure the overlay is visible (for proper rendering).
    exportOverlay.hidden = false;
    document.body.setAttribute('data-exporting', 'true');

    var pageEls = [document.getElementById('page1'), document.getElementById('page2')];
    var canvases = [];
    var isSmallScreen = false;
    try {
      isSmallScreen = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
    } catch (e) {}
    var captureScale = isSmallScreen ? 1.5 : 2;

    try {
      for (var i = 0; i < pageEls.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        var canvas = await window.html2canvas(pageEls[i], {
          scale: captureScale,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        canvases.push(canvas);
      }
    } finally {
      document.body.removeAttribute('data-exporting');
    }

    var pdf = new window.jspdf.jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    canvases.forEach(function (canvas, idx) {
      var imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (idx > 0) pdf.addPage('a4', 'p');
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    });

    pdf.save('resume.pdf');
    flashHint('已开始下载：resume.pdf');
    btnDoExport.disabled = false;
    btnDoExport.textContent = '生成并下载';
  }

  // Wire up events
  loadSaved();
  setEditing(false);

  btnEdit.addEventListener('click', function () {
    setEditing(!isEditing);
  });

  btnPreview.addEventListener('click', function () {
    setEditing(false);
  });

  btnBold.addEventListener('click', function () { exec('bold'); });
  btnItalic.addEventListener('click', function () { exec('italic'); });
  btnUl.addEventListener('click', function () { exec('insertUnorderedList'); });
  btnH2.addEventListener('click', function () { exec('formatBlock', 'h2'); });

  btnAddSection.addEventListener('click', function () {
    if (!isEditing) return;
    var section = document.createElement('section');
    section.innerHTML = '<h2>🧩 新模块</h2><p>在这里输入内容...</p>';
    insertNodeAtSelection(section);
  });

  btnInsertImage.addEventListener('click', function () {
    if (!isEditing) return;
    imageInput.value = '';
    imageInput.click();
  });

  imageInput.addEventListener('change', function () {
    if (!isEditing) return;
    var file = imageInput.files && imageInput.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      window.alert('请选择图片文件。');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = document.createElement('img');
      img.className = 'resume-media';
      img.alt = '插入图片';
      img.src = String(reader.result);
      insertNodeAtSelection(img);
    };
    reader.readAsDataURL(file);
  });

  btnInsertVideo.addEventListener('click', function () {
    if (!isEditing) return;
    var url = promptForUrl('video');
    if (!url) return;
    insertNodeAtSelection(makeMediaBlock('video', url));
  });

  btnInsertAudio.addEventListener('click', function () {
    if (!isEditing) return;
    var url = promptForUrl('audio');
    if (!url) return;
    insertNodeAtSelection(makeMediaBlock('audio', url));
  });

  btnSave.addEventListener('click', function () {
    saveNow();
  });

  btnReset.addEventListener('click', function () {
    var ok = window.confirm('确认重置？会清空本地保存的修改。');
    if (!ok) return;
    resetToDefault();
  });

  btnExport.addEventListener('click', function () {
    setEditing(false);
    openExport();
  });

  btnCloseExport.addEventListener('click', closeExport);
  exportOverlay.addEventListener('click', function (e) {
    var target = e.target;
    if (target && target.getAttribute && target.getAttribute('data-close') === '1') closeExport();
  });

  btnDoExport.addEventListener('click', function () {
    exportPdf().catch(function () {
      flashHint('导出失败：请检查页面是否有跨域图片或网络阻断。');
      btnDoExport.disabled = false;
      btnDoExport.textContent = '生成并下载';
    });
  });

  function setExportView(view) {
    if (!exportPanel) return;
    exportPanel.setAttribute('data-view', view);
    if (tabFlow) tabFlow.setAttribute('aria-selected', view === 'flow' ? 'true' : 'false');
    if (tabPages) tabPages.setAttribute('aria-selected', view === 'pages' ? 'true' : 'false');
  }

  if (tabFlow) {
    tabFlow.addEventListener('click', function () {
      setExportView('flow');
    });
  }

  if (tabPages) {
    tabPages.addEventListener('click', function () {
      setExportView('pages');
    });
  }

  // Cut line dragging
  cutLine.addEventListener('pointerdown', function (e) {
    isDraggingCutLine = true;
    cutLine.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  cutLine.addEventListener('pointermove', function (e) {
    if (!isDraggingCutLine) return;
    setBreakYFromPointer(e.clientY);
  });

  cutLine.addEventListener('pointerup', function () {
    isDraggingCutLine = false;
  });

  cutLine.addEventListener('keydown', function (e) {
    // Keyboard nudge for accessibility.
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    ensureBreakYInitialized();
    var step = 40 / Math.max(0.25, lastExportScale);
    if (e.key === 'ArrowUp') breakY = Math.max(0, breakY - step);
    else breakY = Math.min(flowContent.scrollHeight, breakY + step);
    renderExportPages();
    positionCutLineFromBreakY();
  });
})();
