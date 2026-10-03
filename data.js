/*
 * 編集するデータは data/nodes.csv、data/edges.csv、data/media.csv で管理する。
 * CSVを読み込み、既存の表示処理が使う形式へ変換する。関係の自動推測は行わない。
 */
(function () {
  "use strict";

  function parseCSV(source) {
    const text = source.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let closedQuote = false;

    function finishField() {
      row.push(field);
      field = "";
      closedQuote = false;
    }

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            quoted = false;
            closedQuote = true;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === ",") {
        finishField();
      } else if (char === "\n" || char === "\r") {
        finishField();
        rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i += 1;
      } else if (closedQuote) {
        if (char !== " " && char !== "\t") {
          throw new Error(`CSVの${rows.length + 1}行目: 閉じた引用符の後に不正な文字があります。`);
        }
      } else if (char === '"') {
        if (field !== "") throw new Error(`CSVの${rows.length + 1}行目: 引用符の位置が不正です。`);
        quoted = true;
      } else {
        field += char;
      }
    }

    if (quoted) throw new Error("CSVの引用符が閉じられていません。");
    if (row.length || field !== "" || closedQuote) {
      finishField();
      rows.push(row);
    }
    return rows;
  }

  async function readCSV(path, requiredColumns) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseCSV(await response.text()).filter((row) => row.some((value) => value !== ""));
      const headers = (rows.shift() || []).map((value) => value.trim());
      if (new Set(headers).size !== headers.length) throw new Error("列名が重複しています。");
      for (const name of requiredColumns) {
        if (!headers.includes(name)) throw new Error(`必須列 ${name} がありません。`);
      }
      return rows.map((values, index) => {
        if (values.length !== headers.length) throw new Error(`${index + 2}行目の列数が一致しません。`);
        return Object.fromEntries(headers.map((name, column) => [name, values[column]]));
      });
    } catch (error) {
      throw new Error(`${path}: ${error.message}`);
    }
  }

  window.loadKatariData = async function () {
    const [nodeRows, edgeRows, mediaRows] = await Promise.all([
      readCSV("./data/nodes.csv", ["id", "name", "period", "summary"]),
      readCSV("./data/edges.csv", ["selection_id", "target_type", "target_id"]),
      readCSV("./data/media.csv", ["node_id", "service", "video_id", "url"])
    ]);
    const nodes = Object.create(null);
    const aliases = new Map();
    if (!nodeRows.length) throw new Error("data/nodes.csv: 項目がありません。");
    for (const row of nodeRows) {
      if (!row.id || (!row.name && !row.data_id) || nodes[row.id]) throw new Error(`data/nodes.csv: IDまたは名前が空、またはIDが重複しています (${row.id})。`);
      if (row.data_id) {
        if (row.name || row.period || row.summary) throw new Error(`data/nodes.csv: aliasの内容は参照先だけで管理してください (${row.id})。`);
        aliases.set(row.id, row.data_id);
      }
      nodes[row.id] = {
        name: row.name,
        period: row.period,
        summary: row.summary,
        youtubeId: "",
        youtubeUrl: "",
        relatedNodes: [],
        relatedEdges: []
      };
    }
    for (const row of edgeRows) {
      const node = nodes[row.selection_id];
      if (!node || !row.target_id || !["node", "edge"].includes(row.target_type)) {
        throw new Error(`data/edges.csv: 不正な関連データです (${row.selection_id}, ${row.target_type}, ${row.target_id})。`);
      }
      node[row.target_type === "node" ? "relatedNodes" : "relatedEdges"].push(row.target_id);
    }
    for (const row of mediaRows) {
      const node = nodes[row.node_id];
      if (!node || aliases.has(row.node_id) || row.service !== "youtube" || !row.video_id || !row.url || node.youtubeId) {
        throw new Error(`data/media.csv: 不正または重複した動画データです (${row.node_id})。`);
      }
      node.youtubeId = row.video_id;
      node.youtubeUrl = row.url;
    }
    function resolveDataId(id, visited = new Set()) {
      if (!nodes[id]) throw new Error(`data/nodes.csv: aliasの参照先がありません (${id})。`);
      if (visited.has(id)) throw new Error(`data/nodes.csv: aliasが循環しています (${id})。`);
      if (!aliases.has(id)) return id;
      visited.add(id);
      return resolveDataId(aliases.get(id), visited);
    }
    aliases.forEach((target, id) => {
      const dataId = resolveDataId(id);
      Object.defineProperty(nodes[id], "dataId", { value: dataId, enumerable: true });
      // Share content by reference; highlight arrays remain owned by the SVG ID.
      ["name", "period", "summary", "youtubeId", "youtubeUrl"].forEach((field) => {
        Object.defineProperty(nodes[id], field, { get: () => nodes[dataId][field], enumerable: true });
      });
    });
    window.KATARI_NODES = nodes;
    return nodes;
  };
}());
