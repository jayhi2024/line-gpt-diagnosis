const express = require("express");
const line = require("@line/bot-sdk");
const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// OpenAI設定
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// ユーザーごとの会話ステップを保持
const sessions = {};

app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (!event.source || !event.source.userId) continue;
    const userId = event.source.userId;

    // 友だち追加時
    if (event.type === "follow") {
      sessions[userId] = { step: 0 };

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "あなたにピッタリのバランスボールを一緒に選びます。まずは何に使いたいのか教えてください。",
      });
      continue;
    }

    // テキスト以外のメッセージは無視
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userText = event.message.text.trim();

    // セッションがなければ作成
    if (!sessions[userId]) {
      sessions[userId] = { step: 0 };
    }

    const session = sessions[userId];

    if (session.step === 0) {
      // ステップ0：最初の返答に対して
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
      // ステップ1：2回目の返事に対して
      session.step++;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: `えぇ〜！あなた、バランスボールに恋してるの？💘\n\n…でも、まずは心のバランスから整えなさい。\n\n私のほのぼのサロンに入りなさい！`,
      });
      continue;
    }

    // ステップ2以降：GPTで自動返答
    try {
      const gptReply = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "あなたは『ほのぼのサロン』の主です。やさしく、ちょっとユーモラスなキャラクターとして、ユーザーに寄り添った会話をしてください。ほのぼのサロンへの勧誘も自然に入れてください。",
          },
          {
            role: "user",
            content: userText,
          },
        ],
      });

      const replyText = gptReply.data.choices[0].message.content.trim();

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText,
      });
    } catch (err) {
      console.error("GPTエラー:", err);
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "ほのぼのの神がちょっとお昼寝中でした…もう一度話しかけてみてください🌞",
      });
    }
  }

  res.status(200).send("OK");
});

// サーバー起動
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
