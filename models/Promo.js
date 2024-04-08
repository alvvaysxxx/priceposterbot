const { model, Schema } = require("mongoose");

const Promo = new Schema({
  days: {
    type: Number,
  },
});

module.exports = model("promo", Promo);
