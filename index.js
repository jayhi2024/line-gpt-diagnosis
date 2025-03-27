const express = require("express");
const { Configuration, OpenAIApi } = require("openai");
const line = require("@line/bot-sdk");
require("dotenv").config();

const app = express();

// LINE Bot設定
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

// 自由記述の質問
const freeQuestions = [
  "① 最近、心がざわついた出来事について教えてください。",
  "② 誰かと比べて落ち込んだ経験があれば教えてください。",
  "③ 自分自身に誇りを感じた瞬間があれば教えてください。",
];

// ユーザーごとのセッション保存
const sessions = {};

// LINEのWebhookエンドポイント（署名検証に必要な生ボディを保持）
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userId = event.source.userId;
    const userText = event.message.text.trim();

    // ✅ 再診断コマンド処理
    if (userText === "再診断") {
      delete sessions[userId];
      sessions[userId] = { step: 0, freeScore: 0 };

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "診断をリセットしました。もう一度はじめましょう！",
      });

      await client.pushMessage(userId, {
        type: "text",
        text: freeQuestions[0],
      });

      continue;
    }

    // 初回スタート
    if (!sessions[userId]) {
      sessions[userId] = { step: 0, freeScore: 0 };

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "自由記述の自己肯定感診断を始めます。3つの質問にご自由にお答えください。",
      });

      await client.pushMessage(userId, {
        type: "text",
        text: freeQuestions[0],
      });

      continue;
    }

    const session = sessions[userId];

    try {
      // GPTで自己肯定感スコアを評価（1〜5点）
      const gptReply = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "この文章から、自己肯定感の高さを1〜5点で評価してください。数字（1〜5）のみを返してください。",
          },
          { role: "user", content: userText },
        ],
      });

      console.log("GPTからの返答:", gptReply.data.choices[0].message.content);
      
      const content = gptReply.data.choices[0].message.content.trim();
      const score = parseInt(content.match(/\d+/)?.[0] || "0", 10);
      session.freeScore += score;
      session.step++;

      if (session.step < freeQuestions.length) {
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: freeQuestions[session.step],
        });
      } else {
        const level = Math.min(
          10,
          Math.max(1, Math.round((session.freeScore / 15) * 10))
        );

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: `診断完了！あなたの自己肯定感レベルは10段階中「レベル${level}」です。\n\n再診断したい場合は「再診断」と入力してください。`,
        });

        // セッションを残す場合は以下をコメントアウト
        // delete sessions[userId];
      }
    } catch (err) {
      console.error("GPTエラー:", err);
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "GPTの分析中にエラーが発生しました。もう一度お試しください。",
      });
    }
  }

  res.status(200).send("OK");
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});
