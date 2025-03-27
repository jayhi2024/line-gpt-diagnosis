<script>
const express = require("express");
const { Configuration, OpenAIApi } = require("openai");
const line = require("@line/bot-sdk");
require("dotenv").config();

const app = express();

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

app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const userMessage = event.message.text;

      const gptReply = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "あなたは診断をしてくれるカウンセラーです。" },
          { role: "user", content: userMessage },
        ],
      });

      const replyText = gptReply.data.choices[0].message.content;
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText,
      });
    }
  }
  res.send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
</script>