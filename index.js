const express = require("express");
const line = require("@line/bot-sdk");
require("dotenv").config();

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// LINE botの設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// ユーザーごとの会話状態を保存するオブジェクト
const sessions = {};

// LINE Webhookエンドポイント
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (!event.source || !event.source.userId) continue;

    const userId = event.source.userId;

    // 友だち追加時の対応
    if (event.type === "follow") {
      sessions[userId] = { step: 0 };

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "あなたにピッタリのバランスボールを一緒に選びます。まずは何に使いたいのか教えてください。",
      });
      continue;
    }

    // テキストメッセージ以外は無視
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userText = event.message.text.trim();

    // セッションがなければ新規作成
    if (!sessions[userId]) {
      sessions[userId] = { step: 0 };
    }

    const session = sessions[userId];

    if (session.step === 0) {
      // ステップ1：「けしからん！」→次の質問
      session.step++;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "そういう用途に使うなんてけしからん！まずはほのぼのサロンに入りなさい！",
      });
      await client.pushMessage(userId, {
        type: "text",
        text: "どうしてもバランスボールがほしいの？",
      });
      continue;
    }

    if (session.step === 1) {
      // ステップ2：ユーモアな返し＋勧誘
      session.step++;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: `えぇ〜！あなた、バランスボールに恋してるの？💘\n\n…でも、まずは心のバランスから整えなさい。\n\n私のほのぼのサロンに入りなさい！`,
      });
      continue;
    }

    // ステップ3以降のデフォルト対応（必要に応じて拡張可能）
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "あなたはもう、立派なほのぼのサロン予備軍です🌿",
    });
  }

  res.status(200).send("OK");
});

// サーバー起動
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
