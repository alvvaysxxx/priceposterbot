const mongoose = require("mongoose");
const { Bot, InlineKeyboard } = require("grammy");
const BotModel = require("./models/Bot");
const User = require("./models/User");
const Post = require("./models/Post");
const Preset = require("./models/Preset");
const schedule = require("node-schedule");
const { ToadScheduler, SimpleIntervalJob, Task } = require("toad-scheduler");
const scheduler = new ToadScheduler();

const enterMessage = require("./handlers/enterMessage");

let maxId = 0;

// ! Production
const uri =
  "mongodb+srv://urionzzz:79464241@cluster0.1ioriuw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

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
    console.log("отправляем пост");
    let now = new Date();
    if (now.getTime() >= endTime) {
      console.log("Пост должен быть удален (длительность)");
      scheduler.stopById(jobid);
      await Post.findByIdAndDelete(id).exec();
      return;
    }

    let post = await Post.findById(id);
    if (!post) {
      scheduler.stopById(jobid);
      console.log("пост не найден");
      return;
    }
    if (post.paused) {
      console.log("пост на паузе");
      return;
    }
    if (!post.active) {
      scheduler.stopById(jobid);
      console.log("пост неактив");
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

      try {
        if (post.smartSend) {
          if (bott.chats[i].messagesBetweenPosts < 20) {
            console.log("не подходит smartsend");
            continue;
          } else {
            console.log(
              "подходит smartSend",
              bott.chats[i].messagesBetweenPosts < 20
            );
          }
        }

        let pinned = await postbot.api.getChat(chats[i].id);

        console.log(`Отправляем пост ${post._id} в ${chats[i].title}`);
        bott.chats[i].messagesBetweenPosts = 0;
        bott.markModified("chats");
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
            keyboard = new InlineKeyboard().url(
              post.buttonTitle,
              post.buttonUrl
            );
          }
        }

        let message;

        if (post.forward) {
          message = await postbot.api.forwardMessage(
            chats[i].id,
            parseInt(post.from_chatid),
            parseInt(post.msg)
          );
        } else {
          if (post.file_id) {
            message = await postbot.api.sendPhoto(chats[i].id, post.file_id, {
              caption: post.msg,
              reply_markup: keyboard,
            });
          } else {
            message = await postbot.api.sendMessage(chats[i].id, post.msg, {
              parse_mode: "HTML",
              reply_markup: keyboard,
              link_preview_options: { is_disabled: true },
            });
          }
        }
        if (
          ("pinned_message" in pinned &&
            Math.floor(Date.now() / 1000) - pinned.pinned_message.date > 3600 &&
            pinned.pinned_message.from.username != bott.username) ||
          !("pinned_message" in pinned)
        ) {
          try {
            await postbot.api.pinChatMessage(chats[i].id, message.message_id);
          } catch (err) {
            console.log("У бота нет прав на закрепление сообщений");
          }
        }
        console.log(`Пост отправлен`);
      } catch (err) {
        console.log(err);
        // Continue to the next iteration
        continue;
      }
    }
  } catch (err) {
    console.log(err);
  }
}

bot.on("message", async (ctx) => {
  try {
    enterMessage(bot, ctx, "new");
    if (ctx.chat.type == "group" || ctx.chat.type == "supergroup") {
      let title = ctx.chat.title;
      let bott = await BotModel.findOne({ token: process.argv[2] });
      for (let i = 0; i < bott.chats.length; i++) {
        if (bott.chats[i].title == title) {
          if (!bott.chats[i].hasOwnProperty("messagesBetweenPosts")) {
            bott.chats[i].messagesBetweenPosts = 20;
          }
          bott.chats[i].messagesBetweenPosts += 1;
        }
      }
      bott.markModified("chats");
      await bott.save();
    }
  } catch (err) {
    console.log(err);
  }
});

bot.on("callback_query:data", async (ctx) => {
  try {
    if (
      ctx.callbackQuery.data.includes("start_posting") &&
      !ctx.callbackQuery.data.includes("start_posting_preset")
    ) {
      const id = ctx.callbackQuery.data.split("|")[1];
      let post = await Post.findById(id);
      let bott = await BotModel.findOne({ token: post.bot });
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      let keyboard = new InlineKeyboard()
        .text("➕ Добавить в шаблоны", `addpreset|${post._id}`)
        .url("⬅ В главного бота", `https://t.me/trippleP_bot`);
      await bot.api.sendMessage(
        ctx.chat.id,
        `✔️ Автопостинг успешно начат!\nВы всегда можете остановить его, перейдя в настройки бота в приложении`,
        {
          reply_markup: keyboard,
        }
      );
      bott.chats.messagesBetweenPosts = 21;
      bott.markModified("chats");
      await bott.save();
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
    if (
      ctx.callbackQuery.data.includes("no_posting") &&
      !ctx.callbackQuery.data.includes("no_posting_preset")
    ) {
      const id = ctx.callbackQuery.data.split("|")[1];
      await Post.findByIdAndDelete(id).exec();
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id - 1
      );
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id - 2
      );
    }
    if (
      ctx.callbackQuery.data.includes("cancel") &&
      !ctx.callbackQuery.data.includes("canceledit")
    ) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
    }
    if (ctx.callbackQuery.data.includes("addpreset")) {
      let data = await Post.findById(ctx.callbackQuery.data.split("|")[1]);
      let newPreset = new Preset({
        duration: data.duration,
        periodicity: data.periodicity,
        forward: data.forward,
        msg: data.msg,
        originalMsg: data.originalMsg,
        button: data.button,
        buttonTitle: data.buttonTitle,
        buttonUrl: data.buttonUrl,
        button2Title: data.button2Title,
        button2Url: data.button2Url,
        button3Title: data.button3Title,
        button3Url: data.button3Url,
        bot: data.bot,
        excludedChats: data.excludedChats,
        active: data.active,
        from_chatid: data.from_chatid,
        file_id: data.file_id,
        paused: data.paused,
        sendMessages: data.sentMessages,
        smartSend: data.smartSend,
      });
      await newPreset.save();
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      await bot.api.sendMessage(
        ctx.chat.id,
        "✅ Шаблон успешно добавлен. Просмотреть его вы сможете в меню 'Пресеты' в панели этого бота"
      );
    }

    if (ctx.callbackQuery.data.includes("canceledit")) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      enterMessage(bot, ctx, "rewrite");
    }

    if (ctx.callbackQuery.data.includes("start_posting_preset")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      let preset = await Preset.findById(id);
      let bott = await BotModel.findOne({ token: post.bot });
      let post = new Post({
        duration: preset.duration,
        periodicity: preset.periodicity,
        forward: preset.forward,
        msg: preset.msg,
        originalMsg: preset.originalMsg,
        button: preset.button,
        buttonTitle: preset.buttonTitle,
        buttonUrl: preset.buttonUrl,
        button2Title: preset.button2Title,
        button2Url: preset.button2Url,
        button3Title: preset.button3Title,
        button3Url: preset.button3Url,
        bot: preset.bot,
        excludedChats: preset.excludedChats,
        active: true,
        from_chatid: preset.from_chatid,
        file_id: preset.file_id,
        paused: preset.paused,
        sendMessages: preset.sentMessages,
        smartSend: preset.smartSend,
      });
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
      post.active = true;
      bott.chats.messagesBetweenPosts = 21;
      bott.markModified("chats");
      await bott.save();
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

    if (ctx.callbackQuery.data.includes("no_posting_preset")) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
    }

    if (ctx.callbackQuery.data.includes("edit_post")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      let post = await Post.findById(id);

      const keyboard = new InlineKeyboard().text(
        "🚫 Отменить",
        `canceledit|${post._id}`
      );

      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id - 1
      );
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id - 2
      );
      await bot.api.sendMessage(
        ctx.chat.id,
        `Вы собираетесь отредактировать пост\nПришлите новый текст, который нужно постить <b>в ответ на это сообщение</b>\nПредыдущий текст будет перезаписан`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard,
        }
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
      let { chats } = bott;
      for (let i = 0; i < chats.length; i++) {
        if (chats[i].title == ctx.update.my_chat_member.chat.title) {
          return;
        }
      }

      let user = await User.findById(bott.owner);

      await bot.api.sendPhoto(ctx.chat.id, "https://i.imgur.com/fNAn9qJ.png", {
        parse_mode: "HTML",
        caption: `<a href = "https://t.me/trippleP_bot">Price Poster</a>  - @trippleP_bot\n<blockquote>
      ⚡Самые передовые технологии рекламы в телеграм по самым низким ценам\n 

      ⚡ Забудьте о риске блокировок. Наш бот разработан с учетом всех требований безопасности и антиспам-политик\n
        
      ⚡ Используйте фото, GIF, видео, файлы, премиум стикеры, форматирование текста и кнопки-ссылки\n
        
      ⚡ Есть система умных закрепов без перебивания\n
        
      ⚡ 24/7 антифлуд мониторинг/ночной режим \n
        
      ⚡ Отслеживайте эффективность постов с помощью статистики \n
        
      ⚡ Сохраняйте и редактируйте шаблоны и пресеты для быстрой настройки\n</blockquote>\n
      🔗 <a href = "https://t.me/anubisXmain/8">Зеркало</a> 🔗| @anubisXmain`,
      });

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
        messagesBetweenPosts: 20,
      },
    ];
    await bott.save();
  } catch (err) {
    console.log(err);
  }
});

bot.start();
