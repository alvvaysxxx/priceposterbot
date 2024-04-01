const mongoose = require("mongoose");
const { Bot, InlineKeyboard } = require("grammy");
const BotModel = require("./models/Bot");
const User = require("./models/User");
const Post = require("./models/Post");
const schedule = require("node-schedule");
const { ToadScheduler, SimpleIntervalJob, Task } = require("toad-scheduler");
const scheduler = new ToadScheduler();

const { exec, spawn } = require("child_process");

process.on("uncaughtException", function (err) {
  console.error(err);
  console.log("Node NOT Exiting...");
});

const uri =
  "mongodb+srv://urionzzz:79464241@cluster0.1ioriuw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};

async function run() {
  // Create a Mongoose client with a MongoClientOptions object to set the Stable API version
  await mongoose.connect(uri, clientOptions);
  await mongoose.connection.db.admin().command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
}
run().catch(console.dir);

// Create an instance of the `Bot` class and pass your bot token to it.
const bot = new Bot("6548429406:AAEKot9_x9kJfu_0tw41Evg43AsohnIp7So"); // <-- put your bot token between the ""

// You can now register listeners on your bot object `bot`.
// grammY will call the listeners when users send messages to your bot.

// Handle the /start command.
let bots = [];

const task = new Task("simple task", () => handleClientBots());
const job = new SimpleIntervalJob({ seconds: 10 }, task);

scheduler.addSimpleIntervalJob(job);

function findArrayDifference(arr1, arr2) {
  // Создаем копии массивов для безопасной манипуляции
  const copyArr1 = [...arr1];
  const copyArr2 = [...arr2];

  // Удаляем из первой копии элементы, которые есть во второй копии
  for (let i = 0; i < copyArr1.length; i++) {
    const indexInArr2 = copyArr2.indexOf(copyArr1[i]);
    if (indexInArr2 !== -1) {
      copyArr1.splice(i, 1);
      copyArr2.splice(indexInArr2, 1);
      i--; // Уменьшаем счетчик, чтобы не пропустить следующий элемент после удаления
    }
  }

  // Объединяем оставшиеся элементы из обеих копий
  const diffArray = copyArr1.concat(copyArr2);

  return diffArray;
}

// Добавляем слушатели к  ботам клиентов
async function handleClientBots() {
  try {
    let dbBots = await BotModel.find();
    if (bots.length == 0) {
      bots = dbBots;
      console.log("assigned");
    } else {
      if (bots.length == dbBots.length) {
        console.log("новых ботов не найдено");
        return;
      }
      if (bots.length > dbBots.length) {
        bots = dbBots;
        return;
      }
      console.log("найдены новые боты, присваиваем слушатели");
      bots = findArrayDifference(bots, dbBots);
    }
    for (let i = 0; i < bots.length; i++) {
      const childProcess = spawn("node", ["client.js", bots[i].token]);

      // Обработка события вывода данных из процесса
      childProcess.stdout.on("data", (data) => {
        console.log(`Данные из процесса: ${data}`);
      });

      // Обработка события ошибок
      childProcess.on("error", (error) => {
        console.error(`Ошибка запуска процесса: ${error.message}`);
      });

      // Обработка события завершения процесса
      childProcess.on("exit", (code, signal) => {
        console.log(
          `Процесс завершил работу с кодом ${code} и сигналом ${signal}`
        );
      });
    }
  } catch (err) {
    console.error(err);
  }
}

bot.command("start", async (ctx) => {
  try {
    await bot.api.sendMessage(
      ctx.chat.id,
      `👋 <b>Добро пожаловать, ${ctx.chat.first_name}!</b>\n\nPrice Poster - это платформа, позволяющая настраивать сложный автопостинг в несколько кликов.\nДля добавления чатов и настройки автопостинга перейдите в панель`,
      { parse_mode: "HTML" }
    );
    let candidate = await User.findOne({ chatid: ctx.chat.id });
    if (!candidate) {
      let user = new User({
        chatid: ctx.chat.id,
        username: ctx.chat.username,
      });
      await bot.api.sendMessage(
        ctx.chat.id,
        `🎁 Как новому пользователю мы предоставили вам <b>2 дня пробного периода</b>, чтобы вы могли протестировать наш функционал\n\nПосле окончания бесплатного доступа, вам придется оплачивать работу сервиса:\n2$ - 2 дня\n8$ - 7 дней\n26$ - 30 дней\n43$ - 60 дней\n70$ - 90 дней`,
        { parse_mode: "HTML" }
      );
      user.ActiveUntil = Date.now() + 2 * 24 * 60 * 60 * 1000;
      user.subscription = true;

      await user.save();
    }
  } catch (err) {
    console.error(err);
  }
});

bot.start();
