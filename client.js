const mongoose = require("mongoose");
const { Bot, InlineKeyboard } = require("grammy");
const BotModel = require("./models/Bot");
const User = require("./models/User");
const Post = require("./models/Post");
const schedule = require("node-schedule");
const { ToadScheduler, SimpleIntervalJob, Task } = require("toad-scheduler");
const scheduler = new ToadScheduler();

let maxId = 0;

// ! Production
const uri = "mongodb+srv://urionzzz:79464241@cluster0.1ioriuw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// ! Development
//const uri =
//  "mongodb+srv://urionzzz:79464241Ru!@cluster0.u09fzh7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};

process.on("uncaughtException", function (err) {
  console.log(err, process.argv[2]);
  console.log("Node NOT Exiting...");
});

async function run() {
  // Create a Mongoose client with a MongoClientOptions object to set the Stable API version
  await mongoose.connect(uri, clientOptions);
  await mongoose.connection.db.admin().command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
}
run().catch(console.dir);

const bot = new Bot(process.argv[2]);

async function handleAutoPosting(id, endTime, jobid) {
  try {
    let now = new Date();
    console.log(now.getTime(), endTime);
    if (now.getTime() >= endTime) {
      console.log("should be deleted");
      scheduler.stopById(jobid);
      await Post.findByIdAndDelete(id).exec();
      return;
    }

    console.log(id);
    let post = await Post.findById(id);
    if (post.paused) {
      return;
    }
    if (!post) {
      scheduler.stopById(jobid);
      return;
    }
    if (!post.active) {
      scheduler.stopById(jobid);
      return;
    }
    let bott = await BotModel.findOne({ token: post.bot });

    let postbot = new Bot(bott.token);

    let { chats } = bott;
    for (let i = 0; i < chats.length; i++) {
      for (let j = 0; j < post.excludedChats.length; j++) {
        if (chats[i].id === post.excludedChats[j]) {
          console.log(chats[i], ": excluded chat");
          ++i;
        }
      }

      bott.sentMessages.push({ date: Date.now(), chat: chats[i] });
      post.sentMessages.push({ date: Date.now(), chat: chats[i] });

      await bott.save();
      await post.save();
      let keyboard = null;
      if (post.button) {
        if (post.button3Title && post.button2Title && post.buttonTitle) {
          keyboard = new InlineKeyboard()
            .url(post.buttonTitle, post.buttonUrl)
            .url(post.button2Title, post.button2Url)
            .row()
            .url(post.button3Title, post.button3Url);
        }
        if (post.button2Title && post.buttonTitle && !post.button3Title) {
          keyboard = new InlineKeyboard()
            .url(post.buttonTitle, post.buttonUrl)
            .url(post.button2Title, post.button2Url);
        }
        if (!post.button3Title && !post.button2Title && post.buttonTitle) {
          keyboard = new InlineKeyboard().url(post.buttonTitle, post.buttonUrl);
        }
      }
      if (post.forward) {
        console.log(chats[i].id, post.from_chatid, parseInt(post.msg));
        await postbot.api.forwardMessage(
          chats[i].id,
          parseInt(post.from_chatid),
          parseInt(post.msg)
        );
      } else {
        console.log(post.file_id);
        if (post.file_id) {
          await postbot.api.sendPhoto(chats[i].id, post.file_id, {
            caption: post.msg,
            reply_markup: keyboard,
          });
        } else {
          await postbot.api.sendMessage(chats[i].id, post.msg, {
            parse_mode: "HTML",
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          });
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
}

const parseTelegramMessage = (telegramData) => {
  const text = telegramData.message.text || telegramData.message.caption;
  const entities =
    telegramData.message.entities || telegramData.message.caption_entities;

  if (!entities) {
    return text;
  }

  let tags = [];

  entities.forEach((entity) => {
    const startTag = getTag(entity, text);
    let searchTag = tags.filter((tag) => tag.index === entity.offset);
    if (searchTag.length > 0) searchTag[0].tag += startTag;
    else
      tags.push({
        index: entity.offset,
        tag: startTag,
      });

    const closeTag =
      startTag.indexOf("<a ") === 0 ? "</a>" : "</" + startTag.slice(1);
    searchTag = tags.filter(
      (tag) => tag.index === entity.offset + entity.length
    );
    if (searchTag.length > 0) searchTag[0].tag = closeTag + searchTag[0].tag;
    else
      tags.push({
        index: entity.offset + entity.length,
        tag: closeTag,
      });
  });
  let html = "";
  for (let i = 0; i < text.length; i++) {
    const tag = tags.filter((tag) => tag.index === i);
    tags = tags.filter((tag) => tag.index !== i);
    if (tag.length > 0) html += tag[0].tag;
    html += text[i];
  }
  if (tags.length > 0) html += tags[0].tag;

  return html;
};

const getTag = (entity, text) => {
  const entityText = text.slice(entity.offset, entity.offset + entity.length);

  switch (entity.type) {
    case "bold":
      return `<strong>`;
    case "text_link":
      return `<a href="${entity.url}" target="_blank">`;
    case "url":
      return `<a href="${entityText}" target="_blank">`;
    case "italic":
      return `<em>`;
    case "code":
      return `<code>`;
    case "strikethrough":
      return `<s>`;
    case "underline":
      return `<u>`;
    case "pre":
      return `<pre>`;
    case "mention":
      return `<a href="https://t.me/${entityText.replace(
        "@",
        ""
      )}" target="_blank">`;
    case "email":
      return `<a href="mailto:${entityText}">`;
    case "phone_number":
      return `<a href="tel:${entityText}">`;
  }
};

bot.on("message", async (ctx) => {
  try {
    if (ctx.chat.type != "private") {
      return;
    }

    // Проверка на существование reply_to_message и reply_markup в update.message
    if (
      ctx.message.reply_to_message !== undefined &&
      ctx.message.reply_to_message.reply_markup !== undefined &&
      ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.includes(
        "cancel"
      )
    ) {
      let id =
        ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.split(
          "|"
        )[1];
      let post = await Post.findById(id);
      let postbot = new Bot(post.bot);
      console.log(ctx.message);
      if (post.forward) {
        await postbot.api.sendMessage(ctx.chat.id, "Предпросмотр сообщения:");
        await postbot.api.forwardMessage(
          ctx.chat.id,
          ctx.chat.id,
          ctx.message.message_id
        );
        let keyboard = new InlineKeyboard()
          .text("✅ Начать", `start_posting|${post._id}`)
          .text("⛔ Отменить", `no_posting|${post._id}`);
        await bot.api.sendMessage(
          ctx.chat.id,
          `Вы уверены, что хотите запустить этот автопостинг с текущими настройками?\n\nТекущие настройки:\n\nПродолжительность : ${post.duration} часов\nПериодичность: ${post.periodicity} часов`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );
        post.msg = ctx.message.message_id;
        await post.save();
      } else {
        await bot.api.sendMessage(ctx.chat.id, `Предпросмотр сообщения:`);
        let keyboard = null;
        if (post.button) {
          if (post.button3Title && post.button2Title && post.buttonTitle) {
            keyboard = new InlineKeyboard()
              .url(post.buttonTitle, post.buttonUrl)
              .url(post.button2Title, post.button2Url)
              .row()
              .url(post.button3Title, post.button3Url);
          }
          if (post.button2Title && post.buttonTitle && !post.button3Title) {
            keyboard = new InlineKeyboard()
              .url(post.buttonTitle, post.buttonUrl)
              .url(post.button2Title, post.button2Url);
          }
          if (!post.button3Title && !post.button2Title && post.buttonTitle) {
            keyboard = new InlineKeyboard().url(
              post.buttonTitle,
              post.buttonUrl
            );
          }
        }
        if (ctx.message.photo) {
          await bot.api.sendPhoto(
            ctx.chat.id,
            ctx.message.photo[ctx.message.photo.length - 1].file_id,
            {
              caption: parseTelegramMessage(ctx),
              parse_mode: "HTML",
              reply_markup: keyboard,
            }
          );
          post.file_id =
            ctx.message.photo[ctx.message.photo.length - 1].file_id;
          post.msg = parseTelegramMessage(ctx);
        } else {
          await bot.api.sendMessage(ctx.chat.id, parseTelegramMessage(ctx), {
            parse_mode: "HTML",
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          });
        }
        keyboard = new InlineKeyboard()
          .text("✅ Начать", `start_posting|${post._id}`)
          .text("⛔ Отменить", `no_posting|${post._id}`);
        await bot.api.sendMessage(
          ctx.chat.id,
          `Вы уверены, что хотите запустить этот автопостинг с текущими настройками?\n\nТекущие настройки:\n\n<b>Продолжительность:</b> ${post.duration} часов\n<b>Периодичность:</b> ${post.periodicity} часов`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          }
        );
        post.msg = parseTelegramMessage(ctx);
        await post.save();
      }
    }
  } catch (err) {
    console.log(err);
  }
});

bot.on("callback_query:data", async (ctx) => {
  try {
    if (ctx.callbackQuery.data.includes("start_posting")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      let keyboard = new InlineKeyboard().url(
        "⬅ В главного бота",
        `https://t.me/trippleP_bot`
      );
      await bot.api.sendMessage(
        ctx.chat.id,
        `✔️ Автопостинг успешно начат!\nВы всегда можете остановить его, перейдя в настройки бота в приложении`,
        {
          reply_markup: keyboard,
        }
      );
      let post = await Post.findById(id);
      post.active = true;
      await post.save();
      // Configure the scheduling task
      const startTime = new Date();
      const endTime = new Date(
        startTime.getTime() + post.duration * 60 * 60 * 1000
      ); // duration hours after start
      ++maxId;
      const task = new Task("bot task", () => {
        console.log("hey");
        handleAutoPosting(post.id, endTime, maxId);
      });
      const job = new SimpleIntervalJob(
        { seconds: post.periodicity * 60 * 60 },
        task,
        {
          id: maxId,
        }
      );
      scheduler.addSimpleIntervalJob(job);
      console.log("starting posting");
      handleAutoPosting(post.id, endTime, maxId);
    }
    if (ctx.callbackQuery.data.includes("no_posting")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      await Post.findByIdAndDelete(id).exec();
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
    }
    if (ctx.callbackQuery.data.includes("cancel")) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
    }
  } catch (err) {
    console.log(err);
  }
});

bot.on("my_chat_member", async (ctx) => {
  try {
    if (
      ctx.update.my_chat_member.new_chat_member.status == "left" ||
      ctx.update.my_chat_member.new_chat_member.status == "kicked"
    ) {
      return;
    }
    let bott;
    if (ctx.update.my_chat_member.new_chat_member.status === "administrator") {
      bott = await BotModel.findOne({ token: process.argv[2] });
      let user = await User.findById(bott.owner);

      await bot.api.sendMessage(
        user.chatid,
        `Этот бот был успешно добавлен в чат ${ctx.update.my_chat_member.chat.title}`
      );
    }

    bott.chats = [
      ...bott.chats,
      {
        id: ctx.update.my_chat_member.chat.id,
        title: ctx.update.my_chat_member.chat.title,
      },
    ];
    await bott.save();
  } catch (err) {
    console.log(err);
  }
});

bot.start();
