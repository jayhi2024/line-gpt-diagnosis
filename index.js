const express = require("express");
const { Configuration, OpenAIApi } = require("openai");
const line = require("@line/bot-sdk");
require("dotenv").config();

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

const questions = [
  "誰かと意見が合わなかったとき、自分の考えを伝えられますか？",
  "失敗したとき、「自分はダメだ」と思ってしまうことはありますか？",
  "SNSで他人の投稿を見て、落ち込むことがありますか？",
  "自分の長所を、誰かに話すのは得意ですか？",
  "人にお願いするより、自分一人でなんとかしようとしがちですか？",
  "頑張ってもうまくいかなかった自分を許せますか？",
  "鏡を見たとき、自分に「いいね」って思えることがありますか？",
  "誰かの機嫌が悪いと、自分のせいかも…と感じることはありますか？",
  "悲しい・悔しい気持ちを、ちゃんと自分で受け止めていますか？",
  "今の自分に「これでいい」と言えますか？"
];

const freeQuestions = [
  "最近、嫌な気持ちになった出来事があれば教えてください。",
  "SNSを見ていて嫌な気持ちになるときはありますか？あればどんなときか教えてください。",
  "他人からの評価が気になるときはありますか？あればどんなときか教えてください。",
  "最近、自分のことを誇らしく思ったことがあれば教えてください。",
  "「本当の自分」とはどんな人だと思いますか？"
];

const sessions = {};

app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message") {
      const userId = event.source.userId;
      if (!sessions[userId]) {
        sessions[userId] = { step: 0, score: 0, freeStep: 0, freeScore: 0, phase: "intro" };
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "この診断は一度きりです。診断の正確性とランキングの信頼性のため、慎重にお答えください。"
        });
        await client.pushMessage(userId, createQuestionMessage(0));
        sessions[userId].phase = "select";
      } else {
        const session = sessions[userId];
        if (session.phase === "select") {
          const score = parseInt(event.message.text);
          if (!isNaN(score)) session.score += score;
          session.step++;
          if (session.step < questions.length) {
            await client.replyMessage(event.replyToken, createQuestionMessage(session.step));
          } else {
            session.phase = "free";
            await client.replyMessage(event.replyToken, { type: "text", text: freeQuestions[0] });
          }
        } else if (session.phase === "free") {
          const userInput = event.message.text;
          const gptReply = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "ユーザーの文章から自己肯定感の高さを1〜5点で評価してください。点数だけ返してください。" },
              { role: "user", content: userInput }
            ]
          });
          const score = parseInt(gptReply.data.choices[0].message.content);
          if (!isNaN(score)) session.freeScore += score;
          session.freeStep++;
          if (session.freeStep < freeQuestions.length) {
            await client.replyMessage(event.replyToken, { type: "text", text: freeQuestions[session.freeStep] });
          } else {
            session.phase = "done";
            const totalScore = session.score + session.freeScore;
            const level = Math.min(10, Math.max(1, Math.floor(totalScore / 7.5)));
            await client.replyMessage(event.replyToken, {
              type: "text",
              text: `診断結果：あなたの自己肯定感レベルは10段階中「レベル${level}」です。`
            });
          }
        }
      }
    }
  }
  res.send("OK");
});

function createQuestionMessage(index) {
  return {
    type: "template",
    altText: questions[index],
    template: {
      type: "buttons",
      text: questions[index],
      actions: [
        { type: "message", label: "とてもそう思う", text: "4" },
        { type: "message", label: "少しそう思う", text: "3" },
        { type: "message", label: "あまりそう思わない", text: "2" },
        { type: "message", label: "まったくそう思わない", text: "1" }
      ]
    }
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
