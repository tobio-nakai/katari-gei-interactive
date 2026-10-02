/*
 * プロトタイプ用データ。正式な動画URLと解説を受領後、ここだけを差し替える。
 * relatedNodes / relatedEdges は系譜上の関係を自動推測せず、明示的に管理する。
 */
window.KATARI_NODES = {
  shomyo: {
    name: "声明",
    period: "年代情報（仮）",
    summary: "仮の解説文です。正式な解説をご提供いただいた後、この欄を約100字の内容へ差し替えます。現在は画面構成と選択時の操作感をご確認ください。",
    youtubeId: "",
    youtubeUrl: "https://www.youtube.com/results?search_query=%E5%A3%B0%E6%98%8E+%E8%8A%B8%E8%83%BD",
    relatedNodes: ["saimon", "hoyo-biwa"],
    relatedEdges: ["solid-shomyo-saimon-trunk", "solid-shomyo-hoyo-biwa-branch"]
  },
  gidayu: {
    name: "義太夫節",
    period: "17世紀後半〜",
    summary: "仮の解説文です。正式な解説をご提供いただいた後、この欄を約100字の内容へ差し替えます。現在は画面構成と選択時の操作感をご確認ください。",
    youtubeId: "",
    youtubeUrl: "https://www.youtube.com/results?search_query=%E7%BE%A9%E5%A4%AA%E5%A4%AB%E7%AF%80",
    relatedNodes: ["kojoruri", "takemoto", "bunraku"],
    relatedEdges: ["solid-kojoruri-gidayu", "solid-kojoruri-gidayu-arrow", "dash-gidayu-takemoto-branch", "solid-gidayu-bunraku-junction"]
  },
  rokyoku: {
    name: "浪花節・浪曲",
    period: "年代情報（仮）",
    summary: "仮の解説文です。正式な解説をご提供いただいた後、この欄を約100字の内容へ差し替えます。現在は画面構成と選択時の操作感をご確認ください。",
    youtubeId: "",
    youtubeUrl: "https://www.youtube.com/results?search_query=%E6%B5%AA%E8%8A%B1%E7%AF%80+%E6%B5%AA%E6%9B%B2",
    relatedNodes: ["kadotsuke-saimon"],
    relatedEdges: ["solid-kadotsuke-rokyoku"]
  }
};
