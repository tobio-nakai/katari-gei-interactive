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
  const yearHeader = document.querySelector("#year-header");
  let yearLabels = [];
  let yearFrame = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const detailName = document.querySelector("#detail-name");
  const detailPeriod = document.querySelector("#detail-period");
  const detailSummary = document.querySelector("#detail-summary");
  const youtubeLink = document.querySelector("#youtube-link");
  const videoFrame = document.querySelector("#video-frame");
  let svg;
  let fitView = false;
  let zoomScale = null;
  const touchPointers = new Map();
  let pinchGesture = null;
  let pinchSequence = false;
  let normalViewportHeight = 0;
  let normalScrollPosition = null;
  let selectedNodeId = null;
  let selectedNodeGroup = null;
  const nodeGroups = new Map();
  const hitBounds = new WeakMap();
  const categories = new Map();
  let selectedCategory = null;
  let expanded = false;
  let videoNodeId = null;
  let sheetGesture = null;
  let diagramGesture = null;
  let suppressDiagramClick = false;
  let wheelClickUntil = 0;
  let suppressSheetClick = false;

  function syncYearHeader() {
    yearFrame = null;
    const headerLeft = yearHeader.getBoundingClientRect().left + yearHeader.clientLeft;
    let previousRight = -Infinity;
    yearLabels.forEach(({ source, grid, label }) => {
      const anchor = grid || source;
      const matrix = anchor.getScreenCTM();
      if (!matrix) return;
      const box = grid ? null : source.getBBox();
      const x = grid ? grid.x1.baseVal.value : box.x + box.width / 2;
      const point = new DOMPoint(x, grid ? grid.y1.baseVal.value : box.y).matrixTransform(matrix);
      const left = point.x - headerLeft;
      label.style.left = `${left}px`;
      const halfWidth = label.offsetWidth / 2;
      // Thin only overlapping labels; each remaining label keeps its grid position.
      const visible = left + halfWidth >= 0 && left - halfWidth <= yearHeader.clientWidth
        && left - halfWidth >= previousRight + 5;
      label.style.visibility = visible ? "visible" : "hidden";
      if (visible) previousRight = left + halfWidth;
    });
  }

  function scheduleYearHeader() {
    if (yearLabels.length && yearFrame === null) yearFrame = requestAnimationFrame(syncYearHeader);
  }

  function prepareYearHeader() {
    yearLabels = [...svg.querySelectorAll('text[id^="year-"]')].flatMap((source) => {
      const match = source.id.match(/^year-(\d+)(?:_|$)/);
      if (!match) return [];
      const label = document.createElement("span");
      label.className = "year-label";
      label.textContent = source.textContent.trim();
      const grid = svg.querySelector(`line[id^="grid-${match[1]}_"]`) || svg.querySelector(`#grid-${match[1]}`);
      return [{ source, grid, label, year: Number(match[1]) }];
    }).sort((a, b) => a.year - b.year);
    yearHeader.replaceChildren(...yearLabels.map(({ label }) => label));
    yearHeader.hidden = !yearLabels.length;
    if (yearLabels.length) {
      svg.classList.add("has-year-header");
      yearLabels.forEach(({ source }) => source.setAttribute("aria-hidden", "true"));
      scheduleYearHeader();
    }
  }

  diagramScroll.addEventListener("scroll", scheduleYearHeader, { passive: true });

  function updateFitView() {
    if (!fitView || !svg) return;
    const viewportTop = Math.max(0, diagramScroll.getBoundingClientRect().top);
    const sheetHeight = selectedNodeId ? sheet.getBoundingClientRect().height : 0;
    const height = Math.max(80, Math.min(normalViewportHeight, window.innerHeight * .68, window.innerHeight - viewportTop - sheetHeight - 16));
    diagramScroll.style.height = `${height}px`;
    const viewBox = svg.viewBox.baseVal;
    const scale = Math.min(diagramScroll.clientWidth / viewBox.width, diagramScroll.clientHeight / viewBox.height);
    svg.style.width = `${viewBox.width * scale}px`;
    svg.style.height = `${viewBox.height * scale}px`;
    scheduleYearHeader();
  }

  function enterFitView() {
    if (!svg) return;
    zoomScale = null;
    diagramScroll.classList.remove("is-zoomed");
    host.style.removeProperty("width");
    host.style.removeProperty("height");
    if (!fitView) {
      normalViewportHeight = diagramScroll.getBoundingClientRect().height;
      normalScrollPosition = { left: diagramScroll.scrollLeft, top: diagramScroll.scrollTop };
    }
    fitView = true;
    diagramScroll.classList.add("is-fit");
    diagramHome.setAttribute("aria-pressed", "true");
    diagramScroll.scrollTo({ left: 0, top: 0, behavior: "instant" });
    updateFitView();
    diagramScroll.scrollIntoView({ block: "nearest", behavior: "instant" });
    updateFitView();
    status.textContent = "系譜図全体を表示領域に合わせて表示しました。ピンチで拡大できます。";
  }

  function leaveFitView(group) {
    if (!fitView) return;
    fitView = false;
    diagramScroll.classList.remove("is-fit");
    diagramScroll.style.removeProperty("height");
    svg.style.removeProperty("width");
    svg.style.removeProperty("height");
    diagramHome.setAttribute("aria-pressed", "false");
    if (group) {
      const box = group.getBoundingClientRect();
      const viewport = diagramScroll.getBoundingClientRect();
      diagramScroll.scrollTo({
        left: diagramScroll.scrollLeft + box.left + box.width / 2 - viewport.left - diagramScroll.clientWidth / 2,
        top: diagramScroll.scrollTop + box.top + box.height / 2 - viewport.top - diagramScroll.clientHeight / 2,
        behavior: "instant"
      });
    } else if (normalScrollPosition) {
      diagramScroll.scrollTo({ ...normalScrollPosition, behavior: "instant" });
    }
    scheduleYearHeader();
  }

  function zoomLimits() {
    const box = svg.viewBox.baseVal;
    const minimum = Math.min(diagramScroll.clientWidth / box.width, diagramScroll.clientHeight / box.height);
    const normalWidth = Math.max(diagramScroll.clientWidth, window.matchMedia("(max-width: 700px)").matches ? 980 : 1000);
    return { minimum, maximum: Math.max(minimum * 4, normalWidth / box.width) };
  }

  function zoomAt(scale, world, center) {
    const limits = zoomLimits();
    zoomScale = Math.max(limits.minimum, Math.min(limits.maximum, scale));
    fitView = false;
    diagramScroll.classList.remove("is-fit");
    diagramScroll.classList.add("is-zoomed");
    diagramHome.setAttribute("aria-pressed", "false");
    const box = svg.viewBox.baseVal;
    const width = box.width * zoomScale;
    const height = box.height * zoomScale;
    const hostWidth = Math.max(width, diagramScroll.clientWidth);
    const hostHeight = Math.max(height, diagramScroll.clientHeight);
    host.style.width = `${hostWidth}px`;
    host.style.height = `${hostHeight}px`;
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    const viewport = diagramScroll.getBoundingClientRect();
    diagramScroll.scrollTo({
      left: (hostWidth - width) / 2 + world.x * zoomScale - (center.x - viewport.left - diagramScroll.clientLeft),
      top: (hostHeight - height) / 2 + world.y * zoomScale - (center.y - viewport.top - diagramScroll.clientTop),
      behavior: "instant"
    });
    scheduleYearHeader();
  }

  function zoomAnchor(center) {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / svg.viewBox.baseVal.width;
    return { scale, world: { x: (center.x - rect.left) / scale, y: (center.y - rect.top) / scale } };
  }

  function pinchPoints() {
    const [a, b] = [...touchPointers.values()];
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function startPinch() {
    const points = pinchPoints();
    pinchGesture = { ...zoomAnchor(points.center), distance: Math.max(1, points.distance) };
    diagramScroll.style.height = `${diagramScroll.getBoundingClientRect().height}px`;
    pinchSequence = true;
    suppressDiagramClick = true;
    diagramGesture = null;
  }

  function updateViewport() {
    updateFitView();
    if (zoomScale !== null && svg && !pinchGesture) {
      const viewport = diagramScroll.getBoundingClientRect();
      const center = { x: viewport.left + diagramScroll.clientWidth / 2, y: viewport.top + diagramScroll.clientHeight / 2 };
      const anchor = zoomAnchor(center);
      zoomAt(zoomScale, anchor.world, center);
    }
    scheduleYearHeader();
  }
  new ResizeObserver(updateViewport).observe(diagramScroll);
  window.addEventListener("resize", updateViewport);

  function hitRectangle(group, minimumSize = 44) {
    const box = group.getBBox();
    const padding = 12;
    const matrix = group.getScreenCTM();
    const scaleX = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
    const scaleY = matrix ? Math.hypot(matrix.c, matrix.d) : 1;
    const width = Math.max(box.width + padding * 2, minimumSize / scaleX);
    const height = Math.max(box.height + padding * 2, minimumSize / scaleY);
    const bounds = hitBounds.get(group) || {};
    const left = Math.max(box.x - (width - box.width) / 2, bounds.left ?? -Infinity);
    const top = Math.max(box.y - (height - box.height) / 2, bounds.top ?? -Infinity);
    const right = Math.min(box.x + (box.width + width) / 2, bounds.right ?? Infinity);
    const bottom = Math.min(box.y + (box.height + height) / 2, bounds.bottom ?? Infinity);
    return { left, top, right, bottom };
  }

  function makeHitArea(group, minimumSize = 44) {
    const { left, top, right, bottom } = hitRectangle(group, minimumSize);
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hitArea.setAttribute("x", left);
    hitArea.setAttribute("y", top);
    hitArea.setAttribute("width", right - left);
    hitArea.setAttribute("height", bottom - top);
    hitArea.setAttribute("rx", "8");
    hitArea.setAttribute("class", "interactive-hit-area");
    hitArea.setAttribute("aria-hidden", "true");
    group.insertBefore(hitArea, group.firstChild);
  }

  function clearCategorySelection() {
    if (!selectedCategory) return;
    selectedCategory.group.classList.remove("is-category-selected");
    selectedCategory.group.setAttribute("aria-pressed", "false");
    selectedCategory.outline.classList.remove("is-category-outline");
    selectedCategory = null;
  }

  function selectCategory(category) {
    const sameCategory = selectedCategory === category;
    resetSelection();
    if (sameCategory) {
      status.textContent = "分類の選択を解除しました。";
      return;
    }
    selectedCategory = category;
    category.group.classList.add("is-category-selected");
    category.group.setAttribute("aria-pressed", "true");
    category.outline.classList.add("is-category-outline");
    status.textContent = `${category.name}の範囲を枠線で強調しています。`;
  }

  function prepareCategories() {
    // Explicit mappings from the existing artwork, not inferred relationships.
    const definitions = [
      ["buddhist", "仏教芸能", 'path[id^="buddhist-region-shape_"]'],
      ["puppet", "人形芝居の展開", ":scope > path.st1"],
      ["joruri", "浄瑠璃", 'path[id^="joruri-region-shape_"]'],
      ["kabuki", "歌舞伎音楽", 'path[id^="kabuki-music-region-shape_"]'],
      ["narrative", "語り物の成立", 'path[id^="blind-music-region-shape_"]'],
      ["rokyoku", "浪曲・浪花節", ":scope > path.st0"]
    ];
    definitions.forEach(([id, name, selector]) => {
      const text = [...svg.querySelectorAll(":scope > text")].find((element) =>
        element.textContent.trim().replace(/〉$/, "") === `〈${name}`);
      const region = svg.querySelector(selector);
      if (!text || !region) {
        console.warn(`SVG category heading or region not found: ${name}`);
        return;
      }
      const closing = !text.textContent.trim().endsWith("〉") && text.nextElementSibling;
      const group = document.createElementNS(svg.namespaceURI, "g");
      group.id = `category-${id}`;
      group.classList.add("interactive-category");
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-pressed", "false");
      group.setAttribute("aria-label", `${name}の範囲を強調`);
      text.before(group);
      group.append(text);
      if (closing && closing.tagName.toLowerCase() === "text" && closing.textContent.trim() === "〉") group.append(closing);

      const outline = document.createElementNS(svg.namespaceURI, "path");
      const path = region.getAttribute("d").trim();
      // SVG fills implicitly close open paths; explicitly close the stroke too.
      outline.setAttribute("d", /[zZ]$/.test(path) ? path : `${path} Z`);
      const matrix = svg.getCTM().inverse().multiply(region.getCTM());
      outline.setAttribute("transform", `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);
      outline.classList.add("category-outline");
      outline.setAttribute("aria-hidden", "true");
      svg.append(outline);
      const category = { id, name, group, region, outline };
      categories.set(id, category);
      group.addEventListener("click", () => selectCategory(category));
      group.addEventListener("keydown", (event) => {
        if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          selectCategory(category);
        }
      });
    });
  }

  function separateInactiveLabelHitAreas() {
    const labels = [...svg.querySelectorAll(":scope > g")].filter((group) =>
      !nodes[group.id] && !group.classList.contains("interactive-category") && group.querySelector("text"));
    Object.keys(nodes).forEach((id) => {
      const group = svg.querySelector(`#${CSS.escape(id)}`);
      if (!group) return;
      const box = group.getBBox();
      labels.forEach((label) => {
        const other = label.getBBox();
        const area = hitRectangle(group);
        if (area.right <= other.x || area.left >= other.x + other.width
          || area.bottom <= other.y || area.top >= other.y + other.height) return;
        const bounds = hitBounds.get(group) || {};
        // Protect noninteractive labels without moving or clipping visible node text.
        if (box.y + box.height <= other.y) {
          bounds.bottom = Math.min(bounds.bottom ?? Infinity, (box.y + box.height + other.y) / 2);
        } else if (box.y >= other.y + other.height) {
          bounds.top = Math.max(bounds.top ?? -Infinity, (other.y + other.height + box.y) / 2);
        } else if (box.x + box.width <= other.x) {
          bounds.right = Math.min(bounds.right ?? Infinity, (box.x + box.width + other.x) / 2);
        } else if (box.x >= other.x + other.width) {
          bounds.left = Math.max(bounds.left ?? -Infinity, (other.x + other.width + box.x) / 2);
        }
        hitBounds.set(group, bounds);
      });
    });
  }

  function separateHitAreas(group, node, minimumSize = 44) {
    const firstBox = group.getBBox();
    const a = hitRectangle(group, minimumSize);
    const b = hitRectangle(node);
    if (a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top) return;
    const nodeBox = node.getBBox();
    const firstBounds = hitBounds.get(group) || {};
    const nodeBounds = hitBounds.get(node) || {};
    // Partition only overlapping padding, keeping both visible labels intact.
    if (firstBox.y + firstBox.height <= nodeBox.y) {
      const edge = (firstBox.y + firstBox.height + nodeBox.y) / 2;
      firstBounds.bottom = Math.min(firstBounds.bottom ?? Infinity, edge);
      nodeBounds.top = Math.max(nodeBounds.top ?? -Infinity, edge);
    } else if (nodeBox.y + nodeBox.height <= firstBox.y) {
      const edge = (nodeBox.y + nodeBox.height + firstBox.y) / 2;
      firstBounds.top = Math.max(firstBounds.top ?? -Infinity, edge);
      nodeBounds.bottom = Math.min(nodeBounds.bottom ?? Infinity, edge);
    } else if (firstBox.x + firstBox.width <= nodeBox.x) {
      const edge = (firstBox.x + firstBox.width + nodeBox.x) / 2;
      firstBounds.right = Math.min(firstBounds.right ?? Infinity, edge);
      nodeBounds.left = Math.max(nodeBounds.left ?? -Infinity, edge);
    } else if (nodeBox.x + nodeBox.width <= firstBox.x) {
      const edge = (nodeBox.x + nodeBox.width + firstBox.x) / 2;
      firstBounds.left = Math.max(firstBounds.left ?? -Infinity, edge);
      nodeBounds.right = Math.min(nodeBounds.right ?? Infinity, edge);
    }
    hitBounds.set(group, firstBounds);
    hitBounds.set(node, nodeBounds);
  }

  function separateNodeHitAreas() {
    const groups = Object.keys(nodes).map((id) => svg.querySelector(`#${CSS.escape(id)}`)).filter(Boolean);
    groups.forEach((group, index) => {
      groups.slice(index + 1).forEach((other) => separateHitAreas(group, other));
    });
  }

  function separateCategoryHitAreas() {
    const groups = Object.keys(nodes).map((id) => svg.querySelector(`#${CSS.escape(id)}`)).filter(Boolean);
    categories.forEach(({ group }) => {
      groups.forEach((node) => separateHitAreas(group, node, 0));
      makeHitArea(group, 0);
    });
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

  function keepNodeVisible(group, fromFitView = false) {
    if (!fromFitView && !window.matchMedia("(max-width: 700px)").matches) return;
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

  function selectNode(id, selected = nodeGroups.get(id)?.[0]) {
    clearCategorySelection();
    const fromFitView = fitView;
    leaveFitView(selected);
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

    nodeGroups.get(id).forEach((group) => {
      group.classList.remove("is-dimmed");
      group.classList.add("is-selected");
      group.setAttribute("aria-pressed", "true");
    });

    [...(node.relatedNodes || []), ...(node.relatedEdges || [])].forEach((relatedId) => {
      const groups = nodeGroups.get(relatedId) || [svg.querySelector(`#${CSS.escape(relatedId)}`)];
      groups.filter(Boolean).forEach((related) => {
        related.classList.remove("is-dimmed");
        related.classList.add("is-related");
      });
    });

    detailName.textContent = node.name;
    detailPeriod.textContent = node.period;
    detailSummary.textContent = node.summary;
    youtubeLink.href = node.youtubeUrl;
    selectedNodeId = id;
    selectedNodeGroup = selected;
    setExpanded(false);
    sheet.inert = false;
    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("is-open");
    document.body.classList.add("has-sheet");
    status.textContent = `${node.name}を選択しました。関連する項目と矢印を強調しています。画面下に解説を表示しました。`;
    keepNodeVisible(selected, fromFitView);
  }

  function resetSelection() {
    clearCategorySelection();
    const selected = selectedNodeGroup;
    // Return keyboard focus only when it was inside the closing panel.
    if (sheet.contains(document.activeElement) && selected) selected.focus({ preventScroll: true });
    selectedNodeId = null;
    selectedNodeGroup = null;
    setExpanded(false);
    sheet.classList.remove("is-open");
    sheet.inert = true;
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-sheet");
    clearHighlightClasses();
    status.textContent = "選択を解除し、系統図全体を表示しました。";
  }

  function prepareInteractiveNode(id, node, group = svg.querySelector(`#${CSS.escape(id)}`)) {
    if (!group) {
      console.warn(`SVG node not found: ${id}`);
      return;
    }
    group.classList.add("interactive-node");
    group.dataset.nodeId = id;
    if (!nodeGroups.has(id)) nodeGroups.set(id, []);
    nodeGroups.get(id).push(group);
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
    group.addEventListener("click", () => selectNode(id, group));
    group.addEventListener("keydown", (event) => {
      if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectNode(id, group);
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
      prepareYearHeader();
      prepareCategories();
      separateInactiveLabelHitAreas();
      separateNodeHitAreas();
      separateCategoryHitAreas();
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

  diagramHome.addEventListener("click", enterFitView);
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
    if (event.key === "Escape" && (selectedNodeId || selectedCategory)) {
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

  // Pointer capture keeps drags and pinches inside the diagram's coordinate space.
  diagramScroll.addEventListener("pointerdown", (event) => {
    if (!svg || event.button !== 0) return;
    if (event.pointerType === "touch") {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // Capture on the original target so a stationary tap still reaches its node.
      event.target.setPointerCapture(event.pointerId);
      if (touchPointers.size >= 2) {
        startPinch();
        return;
      }
    }
    if (!event.isPrimary) return;
    if (!pinchSequence) suppressDiagramClick = false;
    diagramGesture = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      left: diagramScroll.scrollLeft, top: diagramScroll.scrollTop, moved: false
    };
  });
  diagramScroll.addEventListener("pointermove", (event) => {
    if (touchPointers.has(event.pointerId)) {
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2 && pinchGesture) {
        const points = pinchPoints();
        zoomAt(pinchGesture.scale * points.distance / pinchGesture.distance, pinchGesture.world, points.center);
        return;
      }
    }
    if (!diagramGesture || diagramGesture.id !== event.pointerId) return;
    const dx = event.clientX - diagramGesture.x;
    const dy = event.clientY - diagramGesture.y;
    if (Math.hypot(dx, dy) > 8) diagramGesture.moved = true;
    if (!diagramGesture.moved) return;
    if (fitView) {
      leaveFitView();
      diagramGesture.left = diagramScroll.scrollLeft;
      diagramGesture.top = diagramScroll.scrollTop;
    }
    suppressDiagramClick = true;
    diagramScroll.setPointerCapture(event.pointerId);
    diagramScroll.scrollLeft = diagramGesture.left - dx;
    diagramScroll.scrollTop = diagramGesture.top - dy;
    diagramScroll.classList.add("is-dragging");
  });
  function finishDiagramGesture(event) {
    touchPointers.delete(event.pointerId);
    if (touchPointers.size < 2) pinchGesture = null;
    if (touchPointers.size === 1 && pinchSequence) {
      const [id, point] = [...touchPointers.entries()][0];
      diagramGesture = { id, ...point, left: diagramScroll.scrollLeft, top: diagramScroll.scrollTop, moved: true };
    } else {
      diagramGesture = null;
    }
    if (!touchPointers.size) pinchSequence = false;
    diagramScroll.classList.remove("is-dragging");
  }
  document.addEventListener("pointerup", finishDiagramGesture);
  diagramScroll.addEventListener("pointercancel", finishDiagramGesture);
  diagramScroll.addEventListener("wheel", (event) => {
    const modified = event.ctrlKey || event.metaKey;
    if (!svg || !svg.contains(event.target) || !event.deltaY || touchPointers.size) return;
    if (!modified && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? diagramScroll.clientHeight : 1;
    const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
    const center = { x: event.clientX, y: event.clientY };
    const anchor = zoomAnchor(center);
    diagramScroll.style.height = `${diagramScroll.getBoundingClientRect().height}px`;
    zoomAt(anchor.scale * Math.exp(-delta * (modified ? .01 : .0015)), anchor.world, center);
    wheelClickUntil = performance.now() + 160;
  }, { passive: false });
  diagramScroll.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(event.key)) leaveFitView();
  });
  diagramScroll.addEventListener("click", (event) => {
    if ((suppressDiagramClick || pinchSequence || pinchGesture || performance.now() < wheelClickUntil) && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event.target.closest(".interactive-node, .interactive-category")) resetSelection();
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
