const { model, Schema } = require("mongoose");
const mongoose = require("mongoose");

const Post = new Schema({
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
  button: {
    type: Boolean,
  },
  buttonTitle: {
    type: String,
  },
  buttonUrl: {
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
});

module.exports = model("post", Post);
