const express = require("express");
const { Configuration, OpenAIApi } = require("openai");
const line = require("@line/bot-sdk");
require("dotenv").config();

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }));

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

// 診断の質問（自由記述）
const freeQuestions = [
  "① 最近「自分に自信が持てなかった」と感じた出来事があれば教えてください。",
  "② SNSや周囲の人と比べて落ち込んだ経験があれば教えてください。",
  "③ 誰にも言っていないけど、実は少し誇らしかったことがあれば教えてください。",
  "④ 「もっとこうすればよかった」と自分を責めたことが最近あれば教えてください。",
  "⑤ 最近、誰かに助けられたり、優しくされた出来事があれば教えてください。",
  "⑥ 「これが自分らしさかも」と思えた瞬間があれば教えてください。",
  "⑦ 今のあなたが、本当はもっと大切にしたいと思っている自分の部分があれば教えてください。",
];

const sessions = {};

app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    
    // ✅ ここが追加ポイント！友だち追加のとき
    if (event.type === "follow") {
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "友だち追加ありがとうございます！診断を始めるには「スタート」と入力してください。",
      });
      continue; // ← 他の処理をスキップするために必要！
    }
    if (event.type !== "message" || event.message.type !== "text") continue;

    const userId = event.source.userId;
    const userText = event.message.text.trim();

    // ✅ 「再診断」コマンド処理
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

    // ✅ 初回スタート
    if (!sessions[userId]) {
      sessions[userId] = { step: 0, freeScore: 0 };

      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "自由記述の自己肯定感診断を始めます。7つの質問にご自由にお答えください。",
      });

      await client.pushMessage(userId, {
        type: "text",
        text: freeQuestions[0],
      });
      continue;
    }

    const session = sessions[userId];

    try {
  if (userText.length < 100) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "ありがとうございます！よければ、もう少し具体的に教えていただけますか？\n（体験や気持ちなど、自由な形で大丈夫です）",
    });
    return; // GPTへ送信しないで終了
  }
      
      const gptReply = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
      content: "以下の文章が、実質的に『答えがない』『わからない』と判断される場合は「スキップ」と返してください。それ以外は自己肯定感の高さを1〜5点で評価し、数字（1〜5）のみを返してください。",
    },
    {
      role: "user",
            content: userText,
          },
        ],
      });

      const content = gptReply.data.choices[0].message.content.trim();
      console.log("GPTからの返答:", content);

if (content.includes("スキップ")) {
  session.step++;

  if (session.step < freeQuestions.length) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: freeQuestions[session.step],
    });
  } else {
    const level = Math.min(10, Math.max(1, Math.floor((session.freeScore / 35) * 10)));
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: `診断完了！あなたの自己肯定感レベルは10段階中「レベル${level}」です。\n\n再診断したい場合は「再診断」と入力してください。`,
    });
  }

  return; // スコア処理せず終了
}

      const match = content.match(/\d+/);
      const score = match ? parseInt(match[0]) : 0;

      session.freeScore += score;
      session.step++;

      if (session.step < freeQuestions.length) {
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: freeQuestions[session.step],
        });
      } else {
        const level = Math.min(10, Math.max(1, Math.floor((session.freeScore / 35) * 10)));

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: `診断完了！あなたの自己肯定感レベルは10段階中「レベル${level}」です。\n\n再診断したい場合は「再診断」と入力してください。`,
        });

        // セッション保持したまま（繰り返し防止）
        // セッション削除したい場合は下記を使ってください：
        // delete sessions[userId];
      }

    } catch (error) {
      console.error("GPTエラー:", error);
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "GPTの分析中にエラーが発生しました。もう一度お試しください。",
      });
    }
  }

  res.status(200).send("OK");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
