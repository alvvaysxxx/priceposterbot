const { model, Schema } = require("mongoose");

const Bot = new Schema(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
    },
    token: {
      type: String,
    },
    status: {
      type: String,
      default: "inactive",
    },
    owner: {
      type: String,
    },
    update: {
      type: Number,
      default: 0,
    },
    chats: {
      type: Array,
      default: [],
    },
    sentMessages: {
      type: Array,
      default: [], // [{date, chat}, {date, chat}, ...]
    },
  },
  { versionKey: false }
);

module.exports = model("bot", Bot);
