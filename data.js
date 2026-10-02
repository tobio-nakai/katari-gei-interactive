/*
 * 項目ごとの動画・解説データ。内容を更新する場合はこのファイルを編集する。
 * relatedNodes / relatedEdges は系譜上の関係を自動推測せず、明示的に管理する。
 */
window.KATARI_NODES = {
  shomyo: {
    name: "声明",
    period: "古代〜",
    summary: "僧侶が経典や讃文を、旋律や独特の節回しで唱える仏教音楽。日本では古代から伝承され、講式や説教などを通じて、後世の平家琵琶や浄瑠璃など語り物の形成にも影響を与えた。",
    youtubeId: "hB6D4boGX-I",
    youtubeUrl: "https://youtu.be/hB6D4boGX-I",
    relatedNodes: ["saimon", "hoyo-biwa"],
    relatedEdges: ["solid-shomyo-saimon-trunk", "solid-shomyo-hoyo-biwa-branch"]
  },
  gidayu: {
    name: "義太夫節",
    period: "17世紀後半〜",
    summary: "17世紀後半、竹本義太夫がそれまでの浄瑠璃を集大成して大成した語り物。太夫が人物の台詞や情景を語り、太棹三味線が支える。現在は文楽の中心的な音楽で、歌舞伎では「竹本」として演奏される。",
    youtubeId: "BY-jRqf5D3k",
    youtubeUrl: "https://www.youtube.com/watch?v=BY-jRqf5D3k",
    relatedNodes: ["kojoruri", "takemoto", "bunraku"],
    relatedEdges: ["solid-kojoruri-gidayu", "solid-kojoruri-gidayu-arrow", "dash-gidayu-takemoto-branch", "solid-gidayu-bunraku-junction"]
  },
  rokyoku: {
    name: "浪花節・浪曲",
    period: "幕末〜明治初期",
    summary: "幕末に説経節や貝祭文など複数の語り芸を取り込み成立した芸能。三味線を伴い、節と歯切れのよい啖呵で物語を語る。浪花節として広まり、明治以降に大衆芸能として大きく発展した。",
    youtubeId: "UJE7YYShCNM",
    youtubeUrl: "https://www.youtube.com/watch?v=UJE7YYShCNM",
    relatedNodes: ["kadotsuke-saimon"],
    relatedEdges: ["solid-kadotsuke-rokyoku"]
  }
};
