(function () {
  "use strict";

  let nodes;
  const host = document.querySelector("#diagram-host");
  const status = document.querySelector("#diagram-status");
  const diagramHome = document.querySelector("#diagram-home");
  const sheet = document.querySelector("#detail-sheet");
  const sheetClose = document.querySelector("#sheet-close");
  const sheetToggle = document.querySelector("#sheet-toggle");
  const sheetHandle = document.querySelector("#sheet-handle");
  const sheetTop = document.querySelector(".sheet-top");
  const sheetContent = document.querySelector("#sheet-content");
  const sheetMedia = document.querySelector("#sheet-media");
  const diagramScroll = document.querySelector(".diagram-scroll");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const detailName = document.querySelector("#detail-name");
  const detailPeriod = document.querySelector("#detail-period");
  const detailSummary = document.querySelector("#detail-summary");
  const youtubeLink = document.querySelector("#youtube-link");
  const videoFrame = document.querySelector("#video-frame");
  let svg;
  let selectedNodeId = null;
  let expanded = false;
  let videoNodeId = null;
  let sheetGesture = null;
  let diagramGesture = null;
  let suppressDiagramClick = false;
  let suppressSheetClick = false;

  function makeHitArea(group) {
    const box = group.getBBox();
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const padding = 12;
    const matrix = group.getScreenCTM();
    const scaleX = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    const scaleY = matrix ? Math.hypot(matrix.c, matrix.d) : 1;
    const width = Math.max(box.width + padding * 2, 44 / scaleX);
    const height = Math.max(box.height + padding * 2, 44 / scaleY);
    hitArea.setAttribute("x", box.x - (width - box.width) / 2);
    hitArea.setAttribute("y", box.y - (height - box.height) / 2);
    hitArea.setAttribute("width", width);
    hitArea.setAttribute("height", height);
    hitArea.setAttribute("rx", "8");
    hitArea.setAttribute("class", "interactive-hit-area");
    hitArea.setAttribute("aria-hidden", "true");
    group.insertBefore(hitArea, group.firstChild);
  }

  function setVideo(node) {
    videoFrame.replaceChildren();
    if (node.youtubeId) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(node.youtubeId)}`;
      iframe.title = `${node.name}の参考動画`;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      videoFrame.append(iframe);
      return;
    }

    const placeholder = document.createElement("div");
    placeholder.className = "video-placeholder";
    placeholder.textContent = `${node.name}の動画は準備中です`;
    videoFrame.append(placeholder);
  }

  function clearHighlightClasses() {
    if (!svg) return;
    svg.classList.remove("has-selection");
    svg.querySelectorAll(":scope > .is-dimmed, .is-selected, .is-related").forEach((element) => {
      element.classList.remove("is-dimmed", "is-selected", "is-related");
    });
    svg.querySelectorAll(".interactive-node").forEach((element) => {
      element.setAttribute("aria-pressed", "false");
    });
  }

  function setExpanded(value) {
    expanded = value;
    sheet.classList.toggle("is-expanded", value);
    sheetToggle.setAttribute("aria-expanded", String(value));
    sheetHandle.setAttribute("aria-expanded", String(value));
    sheetHandle.setAttribute("aria-label", value ? "詳細パネルを縮小" : "詳細パネルを展開");
    sheetToggle.textContent = value ? "図に戻る ↓" : "詳細を見る ↑";
    sheetMedia.hidden = !value;
    sheetContent.scrollTop = 0;
    // Load only on expansion; remove the iframe on collapse to stop playback.
    if (value && selectedNodeId && videoNodeId !== selectedNodeId) {
      setVideo(nodes[selectedNodeId]);
      videoNodeId = selectedNodeId;
    } else if (!value) {
      videoFrame.replaceChildren();
      videoNodeId = null;
    }
  }

  function keepNodeVisible(group) {
    if (!window.matchMedia("(max-width: 700px)").matches) return;
    const box = group.getBoundingClientRect();
    const viewport = diagramScroll.getBoundingClientRect();
    const behavior = reducedMotion.matches ? "instant" : "smooth";
    // Correct only clipped edges, never recenter the whole diagram.
    let deltaX = 0;
    if (box.left < viewport.left + 16) deltaX = box.left - viewport.left - 16;
    else if (box.right > viewport.right - 16) deltaX = box.right - viewport.right + 16;
    if (deltaX) diagramScroll.scrollBy({ left: deltaX, behavior });
    const sheetHeight = parseFloat(getComputedStyle(sheet).height);
    const visibleBottom = Math.min(viewport.bottom, window.innerHeight - sheetHeight - 16);
    if (box.bottom > visibleBottom && box.top < window.innerHeight) {
      window.scrollBy({ top: Math.min(box.bottom - visibleBottom, window.innerHeight * .35), behavior });
    }
  }

  function selectNode(id) {
    if (selectedNodeId === id) {
      resetSelection();
      return;
    }
    const node = nodes[id];
    clearHighlightClasses();
    svg.classList.add("has-selection");
    Array.from(svg.children).forEach((element) => {
      if (element.tagName.toLowerCase() !== "style") element.classList.add("is-dimmed");
    });

    const selected = svg.querySelector(`#${CSS.escape(id)}`);
    selected.classList.remove("is-dimmed");
    selected.classList.add("is-selected");
    selected.setAttribute("aria-pressed", "true");

    [...(node.relatedNodes || []), ...(node.relatedEdges || [])].forEach((relatedId) => {
      const related = svg.querySelector(`#${CSS.escape(relatedId)}`);
      if (!related) return;
      related.classList.remove("is-dimmed");
      related.classList.add("is-related");
    });

    detailName.textContent = node.name;
    detailPeriod.textContent = node.period;
    detailSummary.textContent = node.summary;
    youtubeLink.href = node.youtubeUrl;
    selectedNodeId = id;
    setExpanded(false);
    sheet.inert = false;
    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("is-open");
    document.body.classList.add("has-sheet");
    status.textContent = `${node.name}を選択しました。関連する項目と矢印を強調しています。画面下に解説を表示しました。`;
    keepNodeVisible(selected);
  }

  function resetSelection() {
    const selected = selectedNodeId && svg.querySelector(`#${CSS.escape(selectedNodeId)}`);
    // Return keyboard focus only when it was inside the closing panel.
    if (sheet.contains(document.activeElement) && selected) selected.focus({ preventScroll: true });
    selectedNodeId = null;
    setExpanded(false);
    sheet.classList.remove("is-open");
    sheet.inert = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-sheet");
    clearHighlightClasses();
    status.textContent = "選択を解除し、系統図全体を表示しました。";
  }

  function prepareInteractiveNode(id, node) {
    const group = svg.querySelector(`#${CSS.escape(id)}`);
    if (!group) {
      console.warn(`SVG node not found: ${id}`);
      return;
    }
    group.classList.add("interactive-node");
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-pressed", "false");
    group.setAttribute("aria-controls", "detail-sheet");
    group.setAttribute("aria-label", `${node.name}の詳細を表示`);
    try {
      makeHitArea(group);
    } catch (error) {
      // getBBox() can fail temporarily in some browsers. The text group itself
      // remains clickable, so this must not prevent the SVG from being shown.
      console.warn(`Could not expand hit area for ${id}`, error);
    }
    group.addEventListener("click", () => selectNode(id));
    group.addEventListener("keydown", (event) => {
      if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectNode(id);
      }
    });
  }

  async function loadDiagram() {
    try {
      const response = await fetch("diagram.svg");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const markup = await response.text();
      const documentNode = new DOMParser().parseFromString(markup, "image/svg+xml");
      const parserError = documentNode.querySelector("parsererror");
      if (parserError) throw new Error("SVG parse error");
      svg = documentNode.documentElement;
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("aria-label", "声明から文楽・歌舞伎・浪曲へ：日本語り芸の系譜");
      svg.setAttribute("role", "group");
      host.replaceChildren(document.importNode(svg, true));
      svg = host.querySelector("svg");
      Object.entries(nodes || {}).forEach(([id, node]) => {
        try {
          prepareInteractiveNode(id, node);
        } catch (error) {
          // A problem with one interactive item should never hide the original
          // diagram. Keep the SVG visible and continue preparing other items.
          console.warn(`Could not prepare SVG node: ${id}`, error);
        }
      });
      status.textContent = "系統図を読み込みました。声明、義太夫節、浪曲を選択できます。";
    } catch (error) {
      host.innerHTML = '<p class="load-error">系統図を読み込めませんでした。ページを再読み込みしてください。</p>';
      status.textContent = "系統図の読み込みに失敗しました。";
      console.error(error);
    }
  }

  diagramHome.addEventListener("click", () => {
    diagramScroll.scrollTo({ left: 0, top: 0, behavior: reducedMotion.matches ? "instant" : "smooth" });
    status.textContent = "系譜図の表示位置を初期位置に戻しました。";
  });
  sheetClose.addEventListener("click", resetSelection);
  [sheetToggle, sheetHandle].forEach((button) => {
    button.addEventListener("click", (event) => {
      if (suppressSheetClick && event.detail !== 0) {
        suppressSheetClick = false;
        return;
      }
      setExpanded(!expanded);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedNodeId) {
      event.preventDefault();
      resetSelection();
    }
  });

  sheet.addEventListener("pointerdown", () => { suppressSheetClick = false; });

  // Gesture area is the header, so reading and video controls scroll normally.
  sheetTop.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest("#sheet-close")) return;
    sheetGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    (event.target.closest("button") || sheetTop).setPointerCapture(event.pointerId);
  });
  sheetTop.addEventListener("pointerup", (event) => {
    if (!sheetGesture || sheetGesture.id !== event.pointerId) return;
    const dx = event.clientX - sheetGesture.x;
    const dy = event.clientY - sheetGesture.y;
    sheetGesture = null;
    if (Math.abs(dy) < 40 || Math.abs(dy) <= Math.abs(dx)) return;
    suppressSheetClick = true;
    if (dy < 0) setExpanded(true);
    else resetSelection();
  });
  sheetTop.addEventListener("pointercancel", () => { sheetGesture = null; });

  // Touch uses native scrolling (including browser pinch zoom). Mouse dragging
  // pans the diagram; a drag must not select a node or reset the selection.
  diagramScroll.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressDiagramClick = false;
    diagramGesture = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      left: diagramScroll.scrollLeft, top: diagramScroll.scrollTop,
      mouse: event.pointerType === "mouse", moved: false
    };
  });
  diagramScroll.addEventListener("pointermove", (event) => {
    if (!diagramGesture || diagramGesture.id !== event.pointerId) return;
    const dx = event.clientX - diagramGesture.x;
    const dy = event.clientY - diagramGesture.y;
    if (Math.hypot(dx, dy) > 8) diagramGesture.moved = true;
    if (!diagramGesture.moved) return;
    suppressDiagramClick = true;
    if (diagramGesture.mouse) {
      diagramScroll.setPointerCapture(event.pointerId);
      diagramScroll.scrollLeft = diagramGesture.left - dx;
      diagramScroll.scrollTop = diagramGesture.top - dy;
      diagramScroll.classList.add("is-dragging");
    }
  });
  function finishDiagramGesture() {
    diagramGesture = null;
    diagramScroll.classList.remove("is-dragging");
  }
  document.addEventListener("pointerup", finishDiagramGesture);
  diagramScroll.addEventListener("pointercancel", finishDiagramGesture);
  diagramScroll.addEventListener("click", (event) => {
    if (suppressDiagramClick && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      suppressDiagramClick = false;
      return;
    }
    if (!event.target.closest(".interactive-node")) resetSelection();
  }, true);
  async function initialize() {
    try {
      nodes = await window.loadKatariData();
    } catch (error) {
      host.innerHTML = '<p class="load-error">データを読み込めませんでした。ページを再読み込みしてください。</p>';
      status.textContent = "データの読み込みに失敗しました。";
      console.error("系譜データのCSV読み込みに失敗しました。", error);
      return;
    }
    await loadDiagram();
  }
  initialize();
}());
