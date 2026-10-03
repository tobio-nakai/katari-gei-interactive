const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../data.js"), "utf8");
const fixtures = {
  "./data/nodes.csv": 'id,name,period,summary\na,芸能,古代〜,紹介文\n',
  "./data/edges.csv": 'selection_id,target_type,target_id\na,node,b\na,edge,a-b\n',
  "./data/media.csv": 'node_id,service,video_id,url\na,youtube,video-id,https://example.com/video\n'
};

function loader(files = fixtures, fetchOverride) {
  const context = { window: {}, fetch: fetchOverride || (async (path) => ({ ok: true, text: async () => files[path] })) };
  vm.runInNewContext(source, context);
  return context.window.loadKatariData;
}

test("joins the three CSVs without inferring relationships", async () => {
  const nodes = await loader()();
  assert.deepEqual(JSON.parse(JSON.stringify(nodes.a)), {
    name: "芸能", period: "古代〜", summary: "紹介文",
    youtubeId: "video-id", youtubeUrl: "https://example.com/video",
    relatedNodes: ["b"], relatedEdges: ["a-b"]
  });
});

test("preserves Japanese, commas, escaped quotes, CRLF and multiline fields", async () => {
  const summary = '日本語, "引用"\r\n次の行';
  const nodes = await loader({ ...fixtures,
    "./data/nodes.csv": '\uFEFFid,name,period,summary\r\na,"芸能",古代〜,"日本語, ""引用""\r\n次の行"\r\n\r\n'
  })();
  assert.equal(nodes.a.summary, summary);
});

test("accepts quoted empty values and a final record without a newline", async () => {
  const nodes = await loader({ ...fixtures, "./data/nodes.csv": 'id,name,period,summary\na,芸能,"",""' })();
  assert.equal(nodes.a.summary, "");
  assert.equal(nodes.a.period, "");
});

test("aliases share live content and media while keeping SVG relationships separate", async () => {
  const files = { ...fixtures,
    "./data/nodes.csv": 'id,name,period,summary,data_id\na,芸能,古代〜,紹介文,\nalias,,,,a\nchain,,,,alias\n',
    "./data/edges.csv": fixtures["./data/edges.csv"] + 'alias,edge,alias-edge\n'
  };
  const nodes = await loader(files)();
  assert.equal(nodes.alias.dataId, "a");
  assert.equal(nodes.chain.dataId, "a");
  assert.equal(nodes.alias.name, nodes.a.name);
  assert.equal(nodes.alias.youtubeId, nodes.a.youtubeId);
  assert.deepEqual(Array.from(nodes.alias.relatedEdges), ["alias-edge"]);
  assert.deepEqual(Array.from(nodes.a.relatedEdges), ["a-b"]);
  assert.deepEqual(Array.from(nodes.chain.relatedEdges), []);
  nodes.a.summary = "更新した紹介文";
  nodes.a.youtubeUrl = "https://example.com/replacement";
  assert.equal(nodes.alias.summary, nodes.a.summary);
  assert.equal(nodes.chain.youtubeUrl, nodes.a.youtubeUrl);
});

test("rejects missing or cyclic aliases and duplicated content or media", async () => {
  for (const rows of ['alias,,,,missing\n', 'alias,,,,chain\nchain,,,,alias\n', 'alias,重複,年代,文,a\n']) {
    await assert.rejects(loader({ ...fixtures,
      "./data/nodes.csv": 'id,name,period,summary,data_id\na,芸能,古代〜,紹介文,\n' + rows
    })(), /nodes\.csv/);
  }
  await assert.rejects(loader({ ...fixtures,
    "./data/nodes.csv": 'id,name,period,summary,data_id\na,芸能,古代〜,紹介文,\nalias,,,,a\n',
    "./data/media.csv": fixtures["./data/media.csv"] + 'alias,youtube,id,url\n'
  })(), /media\.csv/);
});

test("rejects malformed CSV and reports the source file", async () => {
  for (const csv of ['id,name,period,summary\na,芸能,古代〜,"未完', 'id,name,period,summary\na,芸能,古代〜,"文章"x', 'id,name,period,summary\na,芸能,古代〜,文"章', 'id,name,period,summary\na,芸能,古代〜,文章,余分']) {
    await assert.rejects(loader({ ...fixtures, "./data/nodes.csv": csv })(), /nodes\.csv/);
  }
});

test("rejects missing columns, duplicate IDs and invalid join rows", async () => {
  for (const [path, csv] of [
    ["./data/nodes.csv", 'id,name,period\na,芸能,古代〜'],
    ["./data/nodes.csv", fixtures["./data/nodes.csv"] + 'a,別名,年代,文\n'],
    ["./data/edges.csv", 'selection_id,target_type,target_id\nmissing,node,b'],
    ["./data/edges.csv", 'selection_id,target_type,target_id\na,unknown,b'],
    ["./data/media.csv", 'node_id,service,video_id,url\nmissing,youtube,id,url'],
    ["./data/media.csv", fixtures["./data/media.csv"] + 'a,youtube,another,url\n']
  ]) await assert.rejects(loader({ ...fixtures, [path]: csv })());
});

test("reports HTTP failures and does not return partial data", async () => {
  await assert.rejects(loader(fixtures, async () => ({ ok: false, status: 404 }))(), /\.\/data\/nodes\.csv: HTTP 404/);
});

test("waits for asynchronous CSV responses before building the data", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const load = loader(fixtures, async path => { await gate; return { ok: true, text: async () => fixtures[path] }; });
  let finished = false;
  const result = load().then(nodes => { finished = true; return nodes; });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  assert.equal((await result).a.name, "芸能");
});
