const { model, Schema } = require("mongoose");

const User = new Schema({
  username: {
    type: String,
  },
  chatid: {
    type: String,
  },
  subscription: {
    type: Boolean,
    default: false,
  },
  ActiveUntil: {
    type: Date,
  },
});

module.exports = model("user", User);
