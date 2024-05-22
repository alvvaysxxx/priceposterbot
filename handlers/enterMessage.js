const mongoose = require("mongoose");
const { Bot, InlineKeyboard } = require("grammy");
const BotModel = require("../models/Bot");
const User = require("../models/User");
const Post = require("../models/Post");
const Preset = require("../models/Preset");
const schedule = require("node-schedule");
const { ToadScheduler, SimpleIntervalJob, Task } = require("toad-scheduler");
const scheduler = new ToadScheduler();
const axios = require("axios");

const parseTelegramMessage = require("./parseTelegramMessage");

process.on("uncaughtException", function (err) {
  console.log(err, process.argv[2]);
  console.log("Node NOT Exiting...");
});

async function enterMessage(bot, ctx, mode) {
  try {
    if (ctx.chat.type != "private") {
      return;
    }
    let id;

    if (
      (ctx.message !== undefined &&
        ctx.message.reply_to_message !== undefined &&
        ctx.message.reply_to_message.reply_markup !== undefined &&
        ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.includes(
          "cancel"
        )) ||
      ctx.callbackQuery.data.includes("canceledit")
    ) {
      await bot.api.deleteMessage(
        ctx.chat.id,
        ctx.message.reply_to_message.message_id
      );
      if (mode == "new") {
        id =
          ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.split(
            "|"
          )[1];
      } else {
        id = ctx.callbackQuery.data.split("|")[1];
      }
      let post = await Post.findById(id);
      let bott = await BotModel.findOne({ token: post.bot });
      let postbot = new Bot(post.bot);
      console.log(ctx.message);
      if (post.forward) {
        await postbot.api.sendMessage(ctx.chat.id, "Предпросмотр сообщения:");

        await postbot.api.forwardMessage(
          ctx.chat.id,
          ctx.chat.id,
          mode == "new" ? ctx.message.message_id : post.msg
        );
        let chatsString = "";
        for (let i = 0; i < bott.chats.length; i++) {
          let isExcluded = false;
          for (let j = 0; j < post.excludedChats.length; j++) {
            if (post.excludedChats[j] === bott.chats[i].id) {
              isExcluded = true;
              break;
            }
          }
          if (!isExcluded) {
            chatsString += ` - ${bott.chats[i].title}\n`; // Добавляем .id, чтобы получить id чата
          }
        }

        let keyboard = new InlineKeyboard()
          .text("🖊️ Редактировать", `edit_post|${post._id}`)
          .row()
          .text("✅ Начать", `start_posting|${post._id}`)
          .text("⛔ Отменить", `no_posting|${post._id}`);
        await bot.api.sendMessage(
          ctx.chat.id,
          `Вы уверены, что хотите запустить этот автопостинг с текущими настройками?\n\nТекущие настройки:\n\n<b>Тип:</b> ${
            post.forward ? "Пересылка" : "Сообщением"
          }\n<b>Продолжительность:</b> ${
            post.duration
          } часов\n<b>Периодичность:</b> ${
            post.periodicity
          } часов\n<b>Режим сна:</b> ${
            post.nightMode ? "Вкл." : "Выкл"
          }\n\nПостинг будет произведен в следующие чаты:\n${chatsString}`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          }
        );
        if (mode == "new") {
          post.msg = ctx.message.message_id;
          post.originalMsg = ctx.message.text || ctx.message.caption;
        }
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
          console.log(post.file_id);
          post.msg = parseTelegramMessage(ctx);
          post.originalMsg = ctx.message.caption;
        } else if (ctx.message.animation) {
          await bot.api.sendAnimation(
            ctx.chat.id,
            ctx.message.animation.file_id,
            {
              caption: parseTelegramMessage(ctx),
              parse_mode: "HTML",
              reply_markup: keyboard,
            }
          );
          post.file_id = ctx.message.animation.file_id;
          post.originalMsg = ctx.message.caption;
          post.isGif = true;
        } else {
          await bot.api.sendMessage(ctx.chat.id, parseTelegramMessage(ctx), {
            parse_mode: "HTML",
            reply_markup: keyboard,
            link_preview_options: { is_disabled: true },
          });
        }
        keyboard = new InlineKeyboard()
          .text("🖊️ Редактировать", `edit_post|${post._id}`)
          .row()
          .text("✅ Начать", `start_posting|${post._id}`)
          .text("⛔ Отменить", `no_posting|${post._id}`);
        let chatsString = "";
        for (let i = 0; i < bott.chats.length; i++) {
          let isExcluded = false;
          for (let j = 0; j < post.excludedChats.length; j++) {
            if (post.excludedChats[j] === bott.chats[i].id) {
              isExcluded = true;
              break;
            }
          }
          if (!isExcluded) {
            chatsString += ` - ${bott.chats[i].title}\n`; // Добавляем .id, чтобы получить id чата
          }
        }
        await bot.api.sendMessage(
          ctx.chat.id,
          `Вы уверены, что хотите запустить этот автопостинг с текущими настройками?\n\nТекущие настройки:\n\n<b>Тип</b>: ${
            post.forward ? "Пересылка" : "Сообщением"
          }\n<b>Продолжительность:</b> ${
            post.duration
          } часов\n<b>Периодичность:</b> ${
            post.periodicity
          } часов\n<b>Смарт-отправка:</b> ${
            post.smartSend ? "Вкл." : "Выкл"
          }\n <b>Режим сна: ${
            post.nightMode ? "Вкл." : "Выкл"
          } </b>\n\nПостинг будет произведен в следующие чаты:\n${chatsString}`,
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
}

module.exports = enterMessage;
