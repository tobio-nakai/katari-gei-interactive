(function () {
  "use strict";

  const nodes = window.KATARI_NODES;
  const host = document.querySelector("#diagram-host");
  const status = document.querySelector("#diagram-status");
  const resetButton = document.querySelector("#reset-button");
  const detailDialog = document.querySelector("#detail-dialog");
  const dialogClose = document.querySelector("#dialog-close");
  const selectionCard = document.querySelector("#selection-card");
  const selectionCardName = document.querySelector("#selection-card-name");
  const selectionCardPeriod = document.querySelector("#selection-card-period");
  const openDetailButton = document.querySelector("#open-detail-button");
  const detailPanel = document.querySelector("#detail-panel");
  const detailName = document.querySelector("#detail-name");
  const detailPeriod = document.querySelector("#detail-period");
  const detailSummary = document.querySelector("#detail-summary");
  const youtubeLink = document.querySelector("#youtube-link");
  const videoFrame = document.querySelector("#video-frame");
  let svg;
  let selectedNodeId = null;

  function makeHitArea(group) {
    const box = group.getBBox();
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const padding = 12;
    hitArea.setAttribute("x", box.x - padding);
    hitArea.setAttribute("y", box.y - padding);
    hitArea.setAttribute("width", box.width + padding * 2);
    hitArea.setAttribute("height", box.height + padding * 2);
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
    placeholder.innerHTML = `<span aria-hidden="true">▶</span><p>${node.name}の動画は準備中です</p>`;
    videoFrame.append(placeholder);
  }

  function clearHighlightClasses() {
    svg.classList.remove("has-selection");
    svg.querySelectorAll(":scope > .is-dimmed, .is-selected, .is-related").forEach((element) => {
      element.classList.remove("is-dimmed", "is-selected", "is-related");
    });
  }

  function selectNode(id) {
    const node = nodes[id];
    clearHighlightClasses();
    svg.classList.add("has-selection");
    Array.from(svg.children).forEach((element) => {
      if (element.tagName.toLowerCase() !== "style") element.classList.add("is-dimmed");
    });

    const selected = svg.querySelector(`#${CSS.escape(id)}`);
    selected.classList.remove("is-dimmed");
    selected.classList.add("is-selected");

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
    youtubeLink.classList.remove("is-disabled");
    youtubeLink.removeAttribute("aria-disabled");
    selectedNodeId = id;
    selectionCardName.textContent = node.name;
    selectionCardPeriod.textContent = node.period;
    selectionCard.hidden = false;
    resetButton.disabled = false;
    status.textContent = `${node.name}を選択しました。関連する項目と矢印を強調しています。動画と解説も開けます。`;
  }

  function resetSelection() {
    selectedNodeId = null;
    if (detailDialog.open) detailDialog.close();
    selectionCard.hidden = true;
    clearHighlightClasses();
    detailName.textContent = "項目を選択";
    detailPeriod.textContent = "—";
    detailSummary.textContent = "声明・義太夫節・浪曲のいずれかを選ぶと、ここに動画と解説が表示されます。";
    youtubeLink.href = "#";
    youtubeLink.classList.add("is-disabled");
    youtubeLink.setAttribute("aria-disabled", "true");
    videoFrame.innerHTML = '<div class="video-placeholder"><span aria-hidden="true">▶</span><p>系統図から項目を選択してください</p></div>';
    resetButton.disabled = true;
    status.textContent = "選択を解除し、系統図全体を表示しました。";
  }

  function closeDetails() {
    if (detailDialog.open) {
      detailDialog.close();
    }
  }

  function openDetails() {
    if (!selectedNodeId) return;
    setVideo(nodes[selectedNodeId]);
    selectionCard.hidden = true;
    detailDialog.showModal();
  }

  function handleDialogClosed() {
    videoFrame.innerHTML = '<div class="video-placeholder"><span aria-hidden="true">▶</span><p>系統図から項目を選択してください</p></div>';
    if (selectedNodeId) {
      selectionCard.hidden = false;
      status.textContent = `${nodes[selectedNodeId].name}の詳細を閉じました。系統図の強調表示は継続しています。`;
    }
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
      if (event.key === "Enter" || event.key === " ") {
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

  resetButton.addEventListener("click", resetSelection);
  dialogClose.addEventListener("click", closeDetails);
  openDetailButton.addEventListener("click", openDetails);
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) closeDetails();
  });
  detailDialog.addEventListener("close", handleDialogClosed);
  loadDiagram();
}());
