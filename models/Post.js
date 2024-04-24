const { model, Schema } = require("mongoose");
const mongoose = require("mongoose");

const Post = new Schema(
  {
    duration: {
      type: mongoose.Types.Decimal128,
    },
    periodicity: {
      type: mongoose.Types.Decimal128,
    },
    forward: {
      type: Boolean,
    },
    msg: {
      type: String,
    },
    originalMsg: {
      type: String,
    },
    button: {
      type: Boolean,
    },
    buttonTitle: {
      type: String,
    },
    buttonUrl: {
      type: String,
    },
    button2Title: {
      type: String,
    },
    button2Url: {
      type: String,
    },
    button3Title: {
      type: String,
    },
    button3Url: {
      type: String,
    },
    bot: {
      type: String,
    },
    excludedChats: {
      type: Array,
      default: [],
    },
    active: {
      type: Boolean,
      default: false,
    },
    from_chatid: {
      type: String,
    },
    file_id: {
      type: String,
    },
    paused: {
      type: Boolean,
      default: false,
    },
    sentMessages: {
      type: Array,
      default: [], // {date, chat}
    },
    smartSend: {
      type: Boolean,
      default: false,
    },
  },
  { versionKey: false }
);

module.exports = model("post", Post);
