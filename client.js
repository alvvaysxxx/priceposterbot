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
  "mongodb+srv://urionzzz:79464241@cluster1.4etfnvi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1";

// ! Development
//const uri =
//  "mongodb+srv://urionzzz:79464241Ru!@cluster0.u09fzh7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

process.on("uncaughtException", function (err) {
  console.log(err, process.argv[2]);
  console.log("Node NOT Exiting...");
});

async function run() {
  // Create a Mongoose client with a MongoClientOptions object to set the Stable API version
  await mongoose.connect(uri, { maxPoolSize: 2 });
  await mongoose.connection.db.admin().command({ ping: 1 });
}
run().catch(console.dir);

(async () => {
  console.log("Загрузка постов бота...");
  let dbposts = await Post.find({ bot: process.argv[2], active: true });

  for (let i = 0; i < dbposts.length; i++) {
    const startTime = new Date();
    const endTime = new Date(
      startTime.getTime() + dbposts[i].duration * 60 * 60 * 1000
    ); // duration hours after start
    ++maxId;
    const task = new Task("bot task", () => {
      handleAutoPosting(dbposts[i].id, endTime, maxId);
    });

    const job = new SimpleIntervalJob(
      { seconds: dbposts[i].periodicity * 60 * 60 },
      task,
      {
        id: maxId,
      }
    );
    scheduler.addSimpleIntervalJob(job);
    console.log("запустил автопостинг по данным из БД", dbposts[i]._id);
  }
})();

const bot = new Bot(process.argv[2]);
const mainbot = new Bot("6548429406:AAEKot9_x9kJfu_0tw41Evg43AsohnIp7So");

async function handleAutoPosting(id, endTime, jobid) {
  try {
    let post = await Post.findById(id);
    console.log(id);
    console.log("отправляем пост");
    let now = new Date();
    if (now.getTime() >= endTime) {
      console.log("Пост должен быть удален (длительность)");
      scheduler.removeById(jobid);
      await Post.findByIdAndDelete(id).exec();
      return;
    }

    if (!post) {
      scheduler.removeById(jobid);
      console.log("пост не найден");
      return;
    }
    if (post.paused) {
      console.log("пост на паузе");
      return;
    }
    if (!post.active) {
      scheduler.removeById(jobid);
      console.log("пост неактив");
      return;
    }

    // Получаем текущую дату и время
    const currentDate = new Date();

    // Устанавливаем временную зону на Восточную Европу (UTC+2)
    currentDate.toLocaleString("en-US", { timeZone: "Europe/Moscow" });

    // Получаем текущий час
    const currentHour = currentDate.getHours();

    // Проверяем, находимся ли мы в периоде от 12 ночи до 6 утра
    const isNight =
      currentHour >= post.nightModeValue[0] &&
      currentHour < post.nightModeValue[1];

    // Записываем результат в переменную
    const isNightTime = isNight ? true : false;

    if (post.nightMode && isNightTime) {
      console.log("Сейчас ночь!");
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
        let pinned = await postbot.api.getChat(chats[i].id);
        await new Promise((r) => setTimeout(r, 1000));
        console.log(`Отправляем пост ${post._id} в ${chats[i].title}`);
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
          if (post.isGif) {
            message = await postbot.api.sendAnimation(
              chats[i].id,
              post.file_id,
              {
                caption: post.msg,
                reply_markup: keyboard,
                parse_mode: "HTML",
              }
            );
          }
          if (post.file_id && !post.isGif) {
            message = await postbot.api.sendPhoto(chats[i].id, post.file_id, {
              caption: post.msg,
              reply_markup: keyboard,
              parse_mode: "HTML",
            });
          } else if (!post.isGif) {
            message = await postbot.api.sendMessage(chats[i].id, post.msg, {
              parse_mode: "HTML",
              reply_markup: keyboard,
              link_preview_options: { is_disabled: true },
            });
          }
        }
        console.log("Проверяем на закреп");
        if (
          pinned.pinned_message &&
          Math.floor(Date.now() / 1000) - pinned.pinned_message.date > 3600
        ) {
          await bot.api.pinChatMessage(chats[i].id, message.message_id);
        }

        console.log(`Пост отправлен`);
      } catch (err) {
        await mainbot.api.sendMessage(806166779, `${err} - ${bott.username}`);
      }
    }
  } catch (err) {
    await mainbot.api.sendMessage(806166779, `${err} - ${bott.username}`);
  }
}

bot.on("message", async (ctx) => {
  try {
    if (
      ctx.message !== undefined &&
      ctx.message.reply_to_message !== undefined &&
      ctx.message.reply_to_message.reply_markup !== undefined &&
      ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.includes(
        "canceleditpreset"
      )
    ) {
      let preset = await Preset.findById(
        ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.split(
          "|"
        )[1]
      );
      if (preset.forward) {
        preset.msg = ctx.message.message_id;
        preset.originalMsg = ctx.message.text;
      } else {
        preset.msg = ctx.message.text;
        preset.originalMsg = ctx.message.text;
      }

      await preset.save();
      let keyboard = new InlineKeyboard()
        .text("🖊️ Редактировать", `edit_preset|${preset._id}`)
        .row()
        .text("✅ Начать", `start_posting_preset|${preset._id}`)
        .text("⛔ Отменить", `no_posting_preset|${preset._id}`);
      await bot.api.sendMessage(
        ctx.chat.id,
        `Вы уверены, что хотите запустить этот автопостинг с текущим шаблоном?\n\nТекущие настройки:\n\n<b>Продолжительность:</b> ${preset.duration} часов\n<b>Периодичность:</b> ${preset.periodicity} часов`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        }
      );
      return;
    }
    enterMessage(bot, ctx, "new");
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
      console.log("старт постинга");
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
      console.log("начал работу");
      scheduler.addSimpleIntervalJob(job);
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
        nightMode: data.nightMode,
        nightModeValue: data.nightModeValue,
        isGif: data.isGif,
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

    if (
      ctx.callbackQuery.data.includes("canceledit") &&
      !ctx.callbackQuery.data.includes("canceleditpreset")
    ) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      enterMessage(bot, ctx, "rewrite");
    }

    if (ctx.callbackQuery.data.includes("canceleditpreset")) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      let preset = await Preset.findById(ctx.callbackQuery.data.split("|")[1]);
      let keyboard = new InlineKeyboard()
        .text("🖊️ Редактировать", `edit_preset|${preset._id}`)
        .row()
        .text("✅ Начать", `start_posting_preset|${preset._id}`)
        .text("⛔ Отменить", `no_posting_preset|${preset._id}`);
      await bot.api.sendMessage(
        ctx.chat.id,
        `Вы уверены, что хотите запустить этот автопостинг с текущим шаблоном?\n\nТекущие настройки:\n\n<b>Продолжительность:</b> ${preset.duration} часов\n<b>Периодичность:</b> ${preset.periodicity} часов`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        }
      );
    }

    if (ctx.callbackQuery.data.includes("start_posting_preset")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      let preset = await Preset.findById(id);
      let bott = await BotModel.findOne({ token: preset.bot });
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
        nightMode: preset.nightMode,
        nightModeValue: preset.nightModeValue,
        isGif: preset.isGif,
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

    if (ctx.callbackQuery.data.includes("edit_preset")) {
      const id = ctx.callbackQuery.data.split("|")[1];
      let preset = await Preset.findById(id);

      const keyboard = new InlineKeyboard().text(
        "🚫 Отменить",
        `canceleditpreset|${preset._id}`
      );

      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.callbackQuery.message.message_id
      );
      await bot.api.sendMessage(
        ctx.chat.id,
        `Вы собираетесь отредактировать шаблон\nПришлите новый текст, который нужно постить <b>в ответ на это сообщение</b>\nПредыдущий текст будет перезаписан. Отредактирован будет ТОЛЬКО ТЕКСТ`,
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
    bott.markModified("chats");
    await bott.save();
  } catch (err) {
    console.log(err);
  }
});

bot.start();
