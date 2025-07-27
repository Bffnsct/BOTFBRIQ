const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const axios = require('axios');
const XLSX = require('xlsx');
const cloudinary = require('cloudinary').v2;
const notifiedUsers = new Set();
const { PDFDocument, StandardFonts } = require('pdf-lib');

async function downloadTemplateBuffer(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return response.data; // Buffer с данными шаблона
  } catch (error) {
    console.error("Ошибка при загрузке шаблона с URL:", url, error);
    throw error;
  }
}
async function createTrustDoc(chatId, trustInput) {
  try {
    // Определяем номер новой доверенности (если записей нет – номер 1)
    const lastTrust = await Trust.findOne({}).sort({ createdAt: -1 });
    const newNumber = lastTrust ? lastTrust.number + 1 : 1;
    const currentDate = new Date().toLocaleDateString('ru-RU');

    // Загружаем шаблон доверенности
    const content = await downloadTemplateBuffer(templateTrustUrl);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // Передаем данные в шаблон. Имена ключей должны совпадать с плейсхолдерами в файле (например, {Дата}, {Номер}, {ФИО}, {Паспорт}, {Выдан}, {Дата выдачи})
    doc.setData({
      "Дата": currentDate,
      "Номер": newNumber,
      "ФИО": trustInput.fio,
      "Паспорт": trustInput.passport,
      "Выдан": trustInput.issued,
      "Дата выдачи": trustInput.issueDate
    });

    try {
      doc.render();
    } catch (error) {
      console.error("Ошибка при рендеринге шаблона доверенности:", error);
      return bot.sendMessage(chatId, "Ошибка при формировании доверенности.");
    }

    const buf = doc.getZip().generate({ type: "nodebuffer" });

    // Сохраняем доверенность в базу
    const newTrust = new Trust({
      number: newNumber,
      file: buf,
      fio: trustInput.fio,
      passport: trustInput.passport,
      issued: trustInput.issued,
      issueDate: trustInput.issueDate
    });
    await newTrust.save();

    // Отправляем документ пользователю
    await bot.sendDocument(chatId, buf, {}, { filename: `Доверенность_${newNumber}.docx` });
    bot.sendMessage(chatId, `Доверенность №${newNumber} успешно создана.`);
  } catch (error) {
    console.error("Ошибка при создании доверенности:", error);
    bot.sendMessage(chatId, "Ошибка при создании доверенности: " + error.message);
  }
}

/**
 * Функция для получения списка нескрытых листов из Apps Script.
 * Ожидается, что веб‑приложение поддерживает GET‑запрос с параметром action=getSheets.
 * Переменная окружения APPS_SCRIPT_URL должна быть настроена в файле .env.
 */
async function getVisibleSheetsFromAppsScript() {
  const url = process.env.APPS_SCRIPT_URL;
  try {
    const response = await axios.get(url, {
      params: { action: "getSheets" },
      responseType: 'json',
      timeout: 10000  // таймаут 10 секунд
    });
    console.log('Статус ответа:', response.status);
    console.log('Ответ:', response.data);
    return response.data.sheets;
  } catch (error) {
    console.error("Ошибка получения листов из Apps Script:", error);
    throw error;
  }
}



// Загрузка переменных окружения из файла .env
require('dotenv').config();
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const NOTIFY_CHAT_ID = process.env.NOTIFY_CHAT_ID; // ID чата для уведомлений о новых пользователях

// старые пути:
// const templateContractPath = path.join(__dirname, 'ШаблонДоговораСПлейсхолдерами.docx');
// const templateApplicationPath = path.join(__dirname, 'ШаблонПриложения.docx');

// URL‑шаблонов из Asset Manager:
const templateApplicationUrl = 'https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%98%D0%9F%20%D0%9A%D0%B8%D1%80%D0%B5%D0%B8%D1%87%D0%B5%D0%B2%20%D0%A8%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F.docx?v=1741026776980';
const templateContractUrl = 'https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%A8%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%D0%B0%D0%A1%D0%9F%D0%BB%D0%B5%D0%B8%CC%86%D1%81%D1%85%D0%BE%D0%BB%D0%B4%D0%B5%D1%80%D0%B0%D0%BC%D0%B8.docx?v=1739522260354';
const templateTTNUrl = 'https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%A8%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD%20%D0%A2%D0%A2%D0%9D%20%D0%90%D0%9A%D0%A2.docx?v=1740857599879';
const templateTrustUrl = 'https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%94%D0%BE%D0%B2%D0%B5%D1%80%D0%B5%D0%BD%D0%BD%D0%BE%D1%81%D1%82%D1%8C%20%D0%98%D0%9F1.docx?v=1743101016250';

// Конфигурация Cloudinary:
cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret
});

// Объект для хранения состояний пользователей (например, ожидание загрузки Excel/ссылки или ввода дополнительных данных)
const userState = {};
// ID группы
const GROUP_CHAT_ID = "504596459";



/* --------------------- Вспомогательные функции --------------------- */
// Функция для загрузки файла в Cloudinary с организацией по папкам
async function uploadFile(filePath, projectName, options = {}) {
  const uploadOptions = {
    folder: `projects/${projectName}`,
    ...options
  };

  try {
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    console.log(`Файл ${filePath} успешно загружен: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error(`Ошибка загрузки файла ${filePath}:`, error);
    return null;
  }
}

// Функция для загрузки данных проекта (фото и описание)
async function uploadProjectData(projectName, photoPaths, descriptionFilePath) {
  // Загрузим фотографии
  const photoUrls = [];
  for (const photoPath of photoPaths) {
    const url = await uploadFile(photoPath, projectName);
    if (url) {
      photoUrls.push(url);
    }
  }

  // Загрузим файл с описанием как raw-ресурс (для текстовых файлов)
  const descriptionUrl = await uploadFile(descriptionFilePath, projectName, { resource_type: "raw" });

  console.log(`Данные проекта "${projectName}" успешно загружены:`);
  console.log("Фото:", photoUrls);
  console.log("Описание:", descriptionUrl);

  return {
    photos: photoUrls,
    descriptionUrl: descriptionUrl
  };
}

/**
 * Преобразует число от 0 до 999 в текст (номинатив) на русском языке.
 */
function convertHundreds(n) {
  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  let words = "";
  if (n >= 100) {
    words += hundreds[Math.floor(n / 100)] + " ";
    n %= 100;
  }
  if (n >= 20) {
    words += tens[Math.floor(n / 10)] + " ";
    n %= 10;
  } else if (n >= 10) {
    words += teens[n - 10] + " ";
    n = 0;
  }
  if (n > 0) {
    words += ones[n] + " ";
  }
  return words.trim();
}

/**
 * Для чисел от 1 до 999 для тысяч с учетом женского рода.
 */
function convertThousands(n) {
  let words = convertHundreds(n);
  if (n < 10) {
    if (n === 1) return "одна";
    if (n === 2) return "две";
  }
  return words;
}

/**
 * Выбирает правильную форму слова "тысяча" для числа n.
 */
function getThousandWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "тысяча";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "тысячи";
  return "тысяч";
}

/**
 * Выбирает правильную форму слова "миллион" для числа m.
 */
function getMillionWord(m) {
  if (m % 10 === 1 && m % 100 !== 11) return "миллион";
  if ([2, 3, 4].includes(m % 10) && ![12, 13, 14].includes(m % 100)) return "миллиона";
  return "миллионов";
}

/**
 * Преобразует число в текстовое представление (поддержка миллионов и тысяч).
 */
function numberToWordsRu(n) {
  if (n === 0) return "ноль";
  let words = "";
  if (n >= 1000000) {
    let millions = Math.floor(n / 1000000);
    words += convertHundreds(millions) + " " + getMillionWord(millions) + " ";
    n %= 1000000;
  }
  if (n >= 1000) {
    let thousands = Math.floor(n / 1000);
    words += convertThousands(thousands) + " " + getThousandWord(thousands) + " ";
    n %= 1000;
  }
  words += convertHundreds(n);
  return words.trim();
}

/**
 * Форматирует число в строку с тысячными разделителями и добавляет " руб.".
 * Если значение не число, возвращает его как есть.
 */
function formatRubles(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " руб.";
}

/**
 * Функция, которая добавляет рублевое окончание к числу, возвращая строку с рублевым окончанием.
 */
function currencyInWords(n) {
  const rubles = Math.floor(n);
  const kopecks = Math.round((n - rubles) * 100);

  // Преобразуем рубли в слова (только целая часть)
  const words = numberToWordsRu(rubles);

  // Склонение слова "рубль"
  let lastDigit = rubles % 10;
  let lastTwo = rubles % 100;
  let rublesWord;
  if (lastDigit === 1 && lastTwo !== 11) {
    rublesWord = "рубль";
  } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwo)) {
    rublesWord = "рубля";
  } else {
    rublesWord = "рублей";
  }

  // Склонение слова "копейка"
  let kopLastDigit = kopecks % 10;
  let kopLastTwo = kopecks % 100;
  let kopecksWord;
  if (kopLastDigit === 1 && kopLastTwo !== 11) {
    kopecksWord = "копейка";
  } else if ([2, 3, 4].includes(kopLastDigit) && ![12, 13, 14].includes(kopLastTwo)) {
    kopecksWord = "копейки";
  } else {
    kopecksWord = "копеек";
  }

  // Итоговая строка
  return `${words} ${rublesWord} (${kopecks} ${kopecksWord})`;
}
/**
 * Простейшая функция преобразования текста в родительный падеж.
 * Например, "устав" -> "устава". Для остальных значений просто добавляет "а".
 */
function toGenitive(text) {
  if (!text) return "";
  if (text.toLowerCase() === "устав") return "устава";
  return text + "а";
}


// Продвинутая функция преобразования фразы в родительный падеж
function toGenitivePhrase(phrase) {
  if (!phrase) return "";
  
  // Если слово "ОГРНИП" (без учета регистра), возвращаем без изменений
  if (phrase.trim().toUpperCase() === "ОГРНИП") return phrase;
  
   // Если фраза равна "ИП" (без учета регистра и пробелов), оставляем без изменений
  if (phrase.trim().toUpperCase() === "ИП") {
    return phrase;
  }
  
  // Разбиваем фразу на отдельные слова
  let words = phrase.split(" ");
  
  let result = words.map(word => {
    // Если слово состоит только из цифр или знаков препинания, возвращаем как есть
    if (/^[\d.,;:!?]+$/.test(word)) return word;
    
    // Обработка прилагательных: "ый", "ий", "ой" -> "ого"
    if (/(ый|ой)$/.test(word)) {
      return word.replace(/(ый|ой)$/i, "ого");
    }
    // Обработка прилагательных: "ый", "ий", "ой" -> "ого"
    if (/(ий)$/.test(word)) {
      return word.replace(/(ий)$/i, "ия");
    }
    // Если слово заканчивается на "ая" -> "ой"
    if (/(ая)$/.test(word)) {
      return word.replace(/(ая)$/i, "ой");
    }
    // Если слово заканчивается на "яя" -> "ей"
    if (/(яя)$/.test(word)) {
      return word.replace(/(яя)$/i, "ей");
    }
    
    // Обработка существительных:
    // Если слово заканчивается на "о" (например, "окно") -> "окна"
    if (word.endsWith("о")) {
      return word.slice(0, -1) + "о";
    }
    // Если слово заканчивается на "а" (например, "улица")
    if (word.endsWith("а")) {
      // Если предпоследняя буква – одна из: г, к, х, ж, ч, ш, щ – то правило "и", иначе "ы"
      let penultimate = word[word.length - 2];
      if (/[гкхжчшщ]/i.test(penultimate)) {
        return word.slice(0, -1) + "и";
      } else {
        return word.slice(0, -1) + "ы";
      }
    }
    // Если слово заканчивается на "я" (например, "неделя") -> "недели"
    if (word.endsWith("я")) {
      return word.slice(0, -1) + "и";
    }
    // Если слово заканчивается на мягкий знак "ь" (например, "конь") -> "коня"
    if (word.endsWith("ь")) {
      return word.slice(0, -1) + "я";
    }
    // Если слово заканчивается на согласную (например, "стол") -> "стола"
    if (/[бвгджзклмнпрстфхцчшщ]$/i.test(word)) {
      return word + "а";
    }
    
    // Если не подошло ни одно правило – возвращаем слово без изменений
    return word;
  });
  
  return result.join(" ");
}


/**
 * Преобразует полное ФИО в формат "Фамилия И.О.".
 */
function getLastNameAndInitials(fullName) {
  if (!fullName) return "";
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  const lastName = parts[0];
  let initials = "";
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].length > 0) {
      initials += parts[i].charAt(0) + ".";
    }
  }
  return lastName + " " + initials;
}
/**
 * Получает список проектов из папки projects.
 */
function getProjectsList() {
  const projectsDir = path.join(__dirname, 'projects');
  if (!fs.existsSync(projectsDir)) {
    console.error("Папка projects не найдена!");
    return [];
  }
  return fs.readdirSync(projectsDir).filter(item => {
    const itemPath = path.join(projectsDir, item);
    return fs.statSync(itemPath).isDirectory();
  });
}

/**
 * Получает фотографии и описание для конкретного проекта.
 */
function getProjectDetails(projectName) {
  const projectDir = path.join(__dirname, 'projects', projectName);
  const descriptionPath = path.join(projectDir, 'description.rtf');
  const photos = fs.readdirSync(projectDir).filter(file => {
    return file.endsWith('.jpg') || file.endsWith('.png');
  }).map(file => path.join(projectDir, file));

  let description = "Описание отсутствует.";
  if (fs.existsSync(descriptionPath)) {
    description = fs.readFileSync(descriptionPath, 'utf8');
  }

  return { photos, description };
}
// Функция для работы с проектами (получение списка проектов из базы)
async function getAllProjects() {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    return projects;
  } catch (err) {
    console.error("Ошибка получения проектов:", err);
    return [];
  }
}

/* --------------------- Подключение к MongoDB --------------------- */
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on("error", console.error.bind(console, "Ошибка подключения к MongoDB:"));
db.once("open", () => console.log("Подключение к MongoDB установлено"));

/* --------------------- Схемы --------------------- */
const contractSchema = new mongoose.Schema({
  number: Number,
  file: Buffer, // Для хранения бинарных данных файла
  createdAt: { type: Date, default: Date.now }
});

const applicationSchema = new mongoose.Schema({
  number: Number,
  file: Buffer,
  createdAt: { type: Date, default: Date.now },
  contractNumber: Number
});

const trustSchema = new mongoose.Schema({
  number: Number,           // номер доверенности
  file: Buffer,             // сгенерированный DOCX файл
  createdAt: { type: Date, default: Date.now },
  fio: String,              // ФИО доверенного лица
  passport: String,         // серия и номер паспорта
  issued: String,           // кем выдан паспорт
  issueDate: String         // дата выдачи паспорта
});
const Trust = mongoose.model("Trust", trustSchema);

const contractorSchema = new mongoose.Schema({
  name: String,
  innKpp: String,         // Формат "ИНН/КПП"
  legalAddress: String,
  ogrn: String,
  positionLPR: String,
  fioLPR: String,
  basis: String,
  bank: { type: String, default: "Не указан" },
  bik: { type: String, default: "Не указан" },
  rs: { type: String, default: "Не указан" },
  ks: { type: String, default: "Не указан" },
  contracts: [contractSchema],       // Каждый договор – объект { number, file, createdAt }
  applications: [applicationSchema]  // Каждое приложение – объект { number, file, createdAt, contractNumber }
});

const Contractor = mongoose.model("Contractor", contractorSchema);

const userSchema = new mongoose.Schema({
  userId: String,
  role: { type: String, enum: ["visitor", "manager", "admin"], default: "visitor" }
});
const User = mongoose.model("User", userSchema);
// Добавляем схему для проектов
const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  photos: [String],
  descriptionUrl: String, // если загружено через документ
  description: String,    // если введено текстовое описание
  createdAt: { type: Date, default: Date.now }
});
const Project = mongoose.model("Project", projectSchema);

/* --------------------- Настройки Telegram-бота --------------------- */
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
bot.on('message', (msg) => {
  console.log("Получено сообщение. Chat ID:", msg.chat.id);
});


/* --------------------- Основной код бота --------------------- */
  bot.onText(/\/add_expense/, async (msg) => {
  const chatId = msg.chat.id;
  // Инициализируем состояние для добавления расхода
  userState[chatId] = { action: 'awaiting_expense_sheet' };

  // Для простоты можно задать имя листа по умолчанию или спросить у пользователя.
  // Здесь мы сразу задаём, например, "Расходы" или "Лист1"
  userState[chatId].sheetName = "Лист1"; // можно заменить на нужное имя
  userState[chatId].action = 'awaiting_contractor_name_for_expense';
  bot.sendMessage(chatId, `Используем вкладку "${userState[chatId].sheetName}". Введите название контрагента:`);
});
// Глобальное множество для хранения ID пользователей, которым уже отправлено уведомление
// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  let user = await User.findOne({ userId: chatId.toString() });
  if (!user) {
    user = new User({ userId: chatId.toString(), role: "visitor" });
    await user.save();
  }
  // Отправляем уведомление в отдельный чат для уведомлений, только если еще не было отправлено для этого пользователя
  if (!notifiedUsers.has(msg.from.id)) {
    const userInfo = `@${msg.from.username || msg.from.first_name} нажал(а) /start. ID: ${msg.from.id}`;
    bot.sendMessage(NOTIFY_CHAT_ID, userInfo);
    notifiedUsers.add(msg.from.id);
  }
  
  let options = {
    parse_mode: "Markdown", // Включаем Markdown-разметку
    reply_markup: {
      inline_keyboard: [
        [{ text: "Кейсы проектов", callback_data: "projects" }],
        [{ text: "О нас", callback_data: "about" }],
        [{ text: "Связаться с нами", callback_data: "contact" }],
        [{ text: "Скачать Презентацию (PDF)", callback_data: "download_presentation" }]
      ]
    }
  };

  if (user.role === "manager" || user.role === "admin") {
    options.reply_markup.inline_keyboard.push(
      [{ text: "💰 Внести расход", callback_data: "add_expense_main" }],
      [{ text: "📋 Список контрагентов", callback_data: "contractors" }],
      [{ text: "➕ Добавить контрагента", callback_data: "add_contractor" }],
      [{ text: "➕ Загрузить проект", callback_data: "upload_project" }],
      [{ text: "🚚 Создать ТН", callback_data: "create_ttn" }],
      [{ text: "📄 Карточка ИП Киреичев", callback_data: "download_ipcard" }],
      [{ text: "📄 Карточка ИП Фадеев", callback_data: "download_ipcard2" }],
      [{ text: "📝 Доверенность Киреичев", callback_data: "trust_menu" }]
    );
  }
  if (user.role === "admin") {
    options.reply_markup.inline_keyboard.push(
      [{ text: "⚙️ Управление менеджерами", callback_data: "manage_managers" }]
    );
  }

  // В этом примере название компании обёрнуто в звездочки, чтобы отобразиться жирным
  bot.sendMessage(
    chatId,
    "🔥 *idea Qartel - ваш надежный партнер в мире прочных решений и впечатляющих конструкций. Добро пожаловать.* 🔥",
    options
  );
});

// Обработка callback-запросов
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const user = await User.findOne({ userId: chatId.toString() });
  await bot.answerCallbackQuery(query.id);
  
 
  if (query.data === "trust_menu") {
    userState[chatId] = { action: "trust_menu" };
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Создать доверенность", callback_data: "create_trust" }],
          [{ text: "Показать доверенности", callback_data: "show_trusts" }],
          [{ text: "В главное меню", callback_data: "main_menu" }]
        ]
      }
    };
    return bot.sendMessage(chatId, "Ну че там?:", options);
  }

  // Если выбран пункт "Создать доверенность"
  if (query.data === "create_trust") {
    userState[chatId] = { action: "awaiting_trust_fio" };
    return bot.sendMessage(chatId, "ФИО в родительном падеже, сэр:");
  }

  // Если выбран пункт "Показать доверенности"
  if (query.data === "show_trusts") {
    try {
      const trusts = await Trust.find().sort({ createdAt: -1 });
      if (!trusts || trusts.length === 0) {
        return bot.sendMessage(chatId, "Доверенности отсутствуют.");
      }
      const buttons = trusts.map(trust => {
        return [{ text: `Доверенность №${trust.number}`, callback_data: `download_trust_${trust._id}` }];
      });
      buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
      return bot.sendMessage(chatId, "Выберите доверенность для скачивания:", {
        reply_markup: { inline_keyboard: buttons }
      });
    } catch (error) {
      console.error("Ошибка при получении доверенностей:", error);
      return bot.sendMessage(chatId, "Ошибка при получении доверенностей.");
    }
  }

  // Если нажата кнопка для скачивания доверенности
  if (query.data.startsWith("download_trust_")) {
    const trustId = query.data.replace("download_trust_", "");
    const trust = await Trust.findById(trustId);
    if (!trust) return bot.sendMessage(chatId, "Доверенность не найдена.");
    return bot.sendDocument(chatId, trust.file, {}, { filename: `Доверенность_${trust.number}.docx` });
  }
  
  if (query.data === "add_expense_main") {
    try {
      // Сначала отправляем сообщение о загрузке
      await bot.sendMessage(chatId, "⏳ Загружаю список листов, это надолго...");

      const sheets = await getVisibleSheetsFromAppsScript();
      if (!sheets || sheets.length === 0) {
        bot.answerCallbackQuery(query.id, { text: "Нет видимых листов в таблице." });
        return;
      }

      // Фильтруем листы, исключая "Шаблон" и "Сводка"
      const filteredSheets = sheets.filter(sheet => 
        sheet !== "Шаблон" && sheet !== "Сводка"
      );

      // Формируем inline‑клавиатуру с названием каждого листа
 // Фильтруем листы, исключая "Шаблон" и "Сводка"
      
const availableSheets = filteredSheets.filter(sheet => sheet !== "Шаблон" && sheet !== "Сводка");
      if (!userState[chatId]) {
  userState[chatId] = {};
}
userState[chatId].availableSheets = availableSheets; // сохраняем массив листов в состоянии
sendSheetSelectionKeyboard(chatId, 0);  // отправляем клавиатуру с первой страницей
bot.answerCallbackQuery(query.id);
    } catch (error) {
      bot.answerCallbackQuery(query.id, { text: "Ошибка при получении листов." });
      return;
    }
  }
  function sendSheetSelectionKeyboard(chatId, page = 0) {
  const pageSize = 3; // количество кнопок на страницу
  const availableSheets = userState[chatId].availableSheets; // массив листов, сохранённый ранее
  const totalPages = Math.ceil(availableSheets.length / pageSize);
  
  // Получаем листы для текущей страницы
  const pageSheets = availableSheets.slice(page * pageSize, page * pageSize + pageSize);
  
  // Формируем кнопки: callback_data содержит индекс листа
  const buttons = pageSheets.map((sheet, i) => {
    const realIndex = page * pageSize + i;
    return [{
      text: sheet,
      callback_data: "expense_sheet_" + realIndex
    }];
  });
  
  // Добавляем кнопки навигации, если есть несколько страниц
  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: "⬅️ Назад", callback_data: "sheet_page_" + (page - 1) });
  }
  if (page < totalPages - 1) {
    navButtons.push({ text: "➡️ Вперёд", callback_data: "sheet_page_" + (page + 1) });
  }
  if (navButtons.length > 0) {
    buttons.push(navButtons);
  }
  
  // Добавляем кнопку возврата в главное меню
  buttons.push([{ 
    text: "🔙 Вернуться в главное меню", 
    callback_data: "main_menu" 
  }]);
  
  // Сохраняем текущую страницу в состоянии
  userState[chatId].sheetPage = page;
  
  bot.sendMessage(chatId, "Выберите лист:", {
    reply_markup: { inline_keyboard: buttons }
  })
  .then(() => console.log("Сообщение с клавиатурой отправлено"))
  .catch(err => console.error("Ошибка отправки клавиатуры:", err));
}
  
  if (query.data === "create_ttn") {
  // Инициализируем состояние для создания ТТН
  userState[chatId] = { action: "awaiting_ttn_date", ttnData: {} };
  return bot.sendMessage(chatId, "Дату для ТН,сэр (например, 01.03.2025):");
}
  // Обработка выбора грузоотправителя
if(query.data === "ttn_sender_kireichev") {
  userState[chatId].ttnData.sender = "ИП Киреичев А.С. ИНН:772411254376";
  userState[chatId].action = "awaiting_ttn_receiver_choice";
  const receiverButtons = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "ИП Киреичев А.С.", callback_data: "ttn_receiver_kireichev" }],
        [{ text: "ИП Фадеев А.Д.", callback_data: "ttn_receiver_fadeev" }],
        [{ text: "Добавить свое", callback_data: "ttn_receiver_custom" }]
      ]
    }
  };
  return bot.sendMessage(chatId, "Выберите грузополучателя:", receiverButtons);
}

if(query.data === "ttn_sender_fadeev") {
  userState[chatId].ttnData.sender = "ИП Фадеев А.Д. ИНН: Добавим позже";
  userState[chatId].action = "awaiting_ttn_receiver_choice";
  const receiverButtons = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "ИП Киреичев А.С.", callback_data: "ttn_receiver_kireichev" }],
        [{ text: "ИП Фадеев А.Д.", callback_data: "ttn_receiver_fadeev" }],
        [{ text: "Добавить свое", callback_data: "ttn_receiver_custom" }]
      ]
    }
  };
  return bot.sendMessage(chatId, "Выберите грузополучателя:", receiverButtons);
}

if(query.data === "ttn_receiver_kireichev") {
  userState[chatId].ttnData.receiver = "ИП Киреичев А.С. ИНН:772411254376";
  userState[chatId].action = "awaiting_ttn_delivery_address";
  return bot.sendMessage(chatId, "Введите адрес выгрузки:");
}

if(query.data === "ttn_receiver_fadeev") {
  userState[chatId].ttnData.receiver = "ИП Фадеев А.Д. ИНН: добавлю позже";
  userState[chatId].action = "awaiting_ttn_delivery_address";
  return bot.sendMessage(chatId, "Введите адрес выгрузки:");
}

if(query.data === "ttn_receiver_custom") {
  userState[chatId].action = "awaiting_ttn_receiver_input";
  return bot.sendMessage(chatId, "Введите грузополучателя:");
}
  
  // Обработка выбора конкретного листа:
// [NEW CODE: Обработка выбора листа]
if (query.data.startsWith('expense_sheet_')) {
  const index = parseInt(query.data.replace('expense_sheet_', ''), 10);
  const availableSheets = userState[chatId].availableSheets;
  const sheetName = availableSheets[index];

  userState[chatId].sheetName = sheetName;
  bot.answerCallbackQuery(query.id);

  // Если выбран лист "Траты с личных карт и наличка"
  if (sheetName === "Траты с личных карт и наличка") {
    // Устанавливаем новое действие для выбора имени через кнопки
    userState[chatId].action = "awaiting_contractor_choice";

    // Формируем inline‑клавиатуру с вариантами имени: "Артем" и "Саня"
    const contractorButtons = [
      [{ text: "Артем", callback_data: "contractor_choice_Артем" }],
      [{ text: "Саня", callback_data: "contractor_choice_Саня" }],
      [{ text: "🔙 Вернуться в главное меню", callback_data: "main_menu" }]
    ];

    return bot.sendMessage(chatId, `Вкладка "${sheetName}" выбрана. Выберите имя для столбца A:`, {
      reply_markup: { inline_keyboard: contractorButtons }
    });
  } else {
    // Для остальных листов продолжаем обычную логику с текстовым вводом
    userState[chatId].action = "awaiting_contractor_name_for_expense";
    return bot.sendMessage(chatId, `Вкладка "${sheetName}" выбрана. Назовите контрагента, сэр:`);
  }
}
  if (query.data.startsWith("contractor_choice_")) {
  const chosenName = query.data.replace("contractor_choice_", "");
  userState[chatId].contractorName = chosenName;
  // Переходим к следующему шагу: ввод наименования расхода
  userState[chatId].action = "awaiting_expense_name";
  bot.answerCallbackQuery(query.id);
  return bot.sendMessage(chatId, `Имя "${chosenName}" выбрано. Наименование расхода, сэр:`);
}
  if (query.data.startsWith("sheet_page_")) {
    const newPage = parseInt(query.data.replace("sheet_page_", ""), 10);
    console.log("Нажата кнопка 'Вперёд/Назад', номер страницы:", newPage);

    // Закрываем всплывающее окошко у пользователя
    bot.answerCallbackQuery(query.id);

    // Тут вы либо редактируете старое сообщение, либо отправляете новое
    // Например, редактируем клавиатуру, убирая старые кнопки:
    bot.editMessageReplyMarkup(
      { inline_keyboard: [] }, // очищаем кнопки
      { chat_id: chatId, message_id: query.message.message_id }
    )
    .then(() => {
      // Затем вызываем функцию, которая заново отрисует клавиатуру для страницы newPage
      sendSheetSelectionKeyboard(chatId, newPage);
    })
    .catch(err => console.error("Ошибка при редактировании клавиатуры:", err));

    return; // не забывайте делать return
  }
  
  if (query.data === "back_to_projects") {
    const projects = await getAllProjects();
    if (projects.length === 0) {
      return bot.sendMessage(chatId, "Кейсы проектов отсутствуют.");
    }
    let buttons = projects.map(p => [{ text: p.name, callback_data: `view_project_${p._id}` }]);
    buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
    return bot.sendMessage(chatId, "Выберите проект:", { reply_markup: { inline_keyboard: buttons } });
  }
  if (query.data === "download_ipcard") {
  // Укажите правильный URL вашего PDF из Glitch Assets
  const ipCardUrl = "https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/Карточка ИП Киреичев?v=1742892466906";
  try {
    const response = await axios.get(ipCardUrl, { responseType: 'arraybuffer' });
    const buffer = response.data;
    return bot.sendDocument(chatId, buffer, {}, { filename: "Карточка_ИП_Киреичев" });
  } catch (error) {
    console.error("Ошибка при скачивании карточки ИП Киреичев:", error);
    return bot.sendMessage(chatId, "Не удалось скачать карточку ИП Киреичев.");
  }
}
  if (query.data === "download_ipcard2") {
  // Укажите правильный URL вашего PDF из Glitch Assets
  const ipCardUrl = "https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%9A%D0%B0%D1%80%D1%82%D0%BE%D1%87%D0%BA%D0%B0%20%D0%98%D0%9F%20%D0%A4%D0%B0%D0%B4%D0%B5%D0%B5%D0%B2%202025.pdf?v=1742894962620";
  try {
    const response = await axios.get(ipCardUrl, { responseType: 'arraybuffer' });
    const buffer = response.data;
    return bot.sendDocument(chatId, buffer, {}, { filename: "Карточка_ИП_Фадеев" });
  } catch (error) {
    console.error("Ошибка при скачивании карточки ИП Фадеев:", error);
    return bot.sendMessage(chatId, "Не удалось скачать карточку ИП Фадеев.");
  }
}
  // Обработка кнопки "Презентация (PDF)"
 if (query.data === "download_presentation") {
  const presentationUrl = "https://cdn.glitch.global/d311b9cf-9f41-4712-bffc-37d9b94d4758/%D0%A1%D1%82%D1%83%D0%B4%D0%B8%D1%8F%20%D0%B4%D0%B5%D0%BA%D0%BE%D1%80%D0%B0%20FBRiQ.pdf?v=1742900118250";
  try {
    const response = await axios.get(presentationUrl, { responseType: 'arraybuffer' });
    const buffer = response.data;
    return bot.sendDocument(chatId, buffer, {}, { filename: "idea Qartel" });
  } catch (error) {
    console.error("Ошибка при скачивании презентации:", error);
    return bot.sendMessage(chatId, "Не удалось скачать презентацию.");
  }
}
  
  if (query.data === "projects") {
    const projects = await getAllProjects();
    if (projects.length === 0) {
      return bot.sendMessage(chatId, "Кейсы проектов отсутствуют.");
    }
    let buttons = projects.map(p => [{ text: p.name, callback_data: `view_project_${p._id}` }]);
    buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
    bot.sendMessage(chatId, "Выберите проект:", { reply_markup: { inline_keyboard: buttons } });
    
 } else if (query.data.startsWith("view_project_")) {
    const projectId = query.data.replace("view_project_", "");
    const project = await Project.findById(projectId);
    if (!project) {
      return bot.sendMessage(chatId, "Проект не найден.");
    }
    
    // Сохраняем выбранный проект в userState (на случай дальнейших действий)
    userState[chatId] = { project: project, currentIndex: 0 };

    // Формируем медиа-группу: первый элемент с подписью, остальные без подписи
    const mediaGroup = project.photos.map((photoUrl, index) => ({
      type: 'photo',
      media: photoUrl,
      caption: index === 0
        ? `Проект: ${project.name}\nОписание: ${project.description || project.descriptionUrl || "Нет описания"}`
        : ''
    }));
    
    // Отправляем медиа-группу
    await bot.sendMediaGroup(chatId, mediaGroup)
      .then(() => console.log("Медиа-группа отправлена"))
      .catch(err => {
        console.error("Ошибка при отправке медиа-группы:", err);
        return bot.sendMessage(chatId, "Произошла ошибка при отправке фотографий проекта.");
      });
      
    // Отправляем отдельное сообщение с inline-кнопками
    let inlineButtons;
    if (user.role === "admin") {
      inlineButtons = [
        [{ text: "В главное меню", callback_data: "main_menu" }],
        [{ text: "Назад к кейсам", callback_data: "back_to_projects" }],
        [{ text: "🗑 Удалить проект", callback_data: `delete_project_${project._id}` }]
      ];
    } else {
      inlineButtons = [
        [{ text: "Назад к кейсам", callback_data: "back_to_projects" }],
        [{ text: "В главное меню", callback_data: "main_menu" }]
      ];
    }
    return bot.sendMessage(chatId, "Выберите дальнейшее действие:", { reply_markup: { inline_keyboard: inlineButtons } });
    
  } else if (query.data.startsWith("delete_project_") && user.role === "admin") {
    // Получаем ID проекта из callback_data, например, "delete_project_60a7d8f8e5e4f916c0a5f3b2"
    const projectId = query.data.replace("delete_project_", "");
  
    try {
      // Находим проект по ID
      const project = await Project.findById(projectId);
      if (!project) {
        return bot.sendMessage(chatId, "Проект не найден.");
      }
  
      // Удаляем файлы проекта из Cloudinary по префиксу "projects/<имя проекта>/"
      cloudinary.api.delete_resources_by_prefix(`projects/${project.name}/`, (cloudErr, cloudResult) => {
        if (cloudErr) {
          console.error("Ошибка при удалении файлов в Cloudinary:", cloudErr);
        } else {
          console.log("Файлы Cloudinary удалены:", cloudResult);
        }
      });
  
      // Удаляем запись проекта из базы данных
      await Project.findByIdAndDelete(projectId);
      return bot.sendMessage(chatId, `Проект "${project.name}" успешно удалён.`);
    } catch (err) {
      console.error("Ошибка при удалении проекта:", err);
      return bot.sendMessage(chatId, "Произошла ошибка при удалении проекта.");
    }
  } else if (query.data === "main_menu") {
    // Обработка главного меню: сбрасываем состояние и отправляем меню
    delete userState[chatId];
    let options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Кейсы проектов", callback_data: "projects" }],
          [{ text: "О нас", callback_data: "about" }],
          [{ text: "Связаться с нами", callback_data: "contact" }],
          [{ text: "Скачать Презентацию (PDF)", callback_data: "download_presentation" }]
        ]
      }
    };
    if (user.role === "manager" || user.role === "admin") {
      options.reply_markup.inline_keyboard.push(
        [{ text: "💰 Внести расход", callback_data: "add_expense_main" }],
        [{ text: "📋 Список контрагентов", callback_data: "contractors" }],
        [{ text: "➕ Добавить контрагента", callback_data: "add_contractor" }],
        [{ text: "➕ Загрузить проект", callback_data: "upload_project" }],
        [{ text: "🚚 Создать ТН", callback_data: "create_ttn" }],
        [{ text: "📄 Карточка ИП Киреичев", callback_data: "download_ipcard" }],
        [{ text: "📄 Карточка ИП Фадеев", callback_data: "download_ipcard2" }],
        [{ text: "📝 Доверенность Киреичев", callback_data: "trust_menu" }]
      );
    }
    if (user.role === "admin") {
      options.reply_markup.inline_keyboard.push(
        [{ text: "⚙️ Управление менеджерами", callback_data: "manage_managers" }]
      );
    }
    bot.sendMessage(chatId, "Главное меню:", options);
  
  } else if (query.data === "about") {
  const aboutText = `*idea Qartel* — это команда профессионалов, создающих впечатляющие конструкции и декорации для бизнеса, рекламы и ивентов. Мы воплощаем смелые идеи, превращая пространство в эффектные и запоминающиеся локации.

🔹 Временные рекламные стенды  
🔹 Оформление мероприятий  
🔹 Нестандартные пространственные решения  
🔹 Любые креативные задумки – от концепции до монтажа

🎯 Преимущества:

✅ Полный цикл производства – от идеи до монтажа.  
✅ Собственное производство в Москве (Мытищи) с ЧПУ, сварочным и покрасочным цехами.  
✅ Качественные материалы и передовые технологии – гарантия надежности.  
✅ Быстрая реализация проектов и гибкость под любой бюджет.  
✅ Работаем с крупнейшими ивент-агентствами и брендами.

💡 Мы создаем проекты, которые невозможно забыть!  
Готовы воплотить вашу идею в жизнь? Свяжитесь с нами прямо сейчас!`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
//       [
//       { text: "Наш канал", url: "https://t.me/harddecorru" }
//     ],
        [
          { text: "Контакты", callback_data: "contact" }
        ],
        [
          { text: "В главное меню", callback_data: "main_menu" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, aboutText, options);
} else if (query.data === "contact") {
    const contactButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📞 Артем Киреичев: +7 (926) 079-53-62",
              url: "tg://resolve?phone=79260795362", 
            },
          ],
          [
          {
             text: "📞 Александр Фадеев: +7 (916) 176-26-97",
              url: "tg://resolve?phone=79161762697", 
            },
          ],
//          [
//            {
//              text: "📞 Фуад Джаббаров: +7 (926) 653-66-22",
//              url: "tg://resolve?phone=79266536622", // Ссылка на чат с Фуадом
//            },
// /         ],
          [
            {
              text: "✉️ Написать сообщение",
              callback_data: "send_message_to_team", // Кнопка для отправки сообщения
            },
          ],
          [
            {
              text: "В главное меню",
              callback_data: "main_menu", // Кнопка возврата в главное меню
            },
          ],
        ],
      },
    };
    bot.sendMessage(
      chatId,
      "📞 *Свяжитесь с нами напрямую*\n или напишите сообщение прямо сюда:",
      { parse_mode: "Markdown", reply_markup: contactButtons.reply_markup }
    );
  } else if (query.data === "send_message_to_team") {
    userState[chatId] = {
      action: "awaiting_message_to_team", // Устанавливаем состояние ожидания сообщения
    };
    bot.sendMessage(
      chatId,
      "Напишите ваше сообщение, и оно будет передано нашей команде:"
    );
  }
// Управление менеджерами – только для админа
else if (query.data === "manage_managers" && user.role === "admin") {
  const users = await User.find({ role: { $ne: "admin" } });
  if (users.length === 0) {
    return bot.sendMessage(chatId, "Нет пользователей для управления.");
  }
  let buttons = users.map(u => {
    return [
      { text: `Назначить менеджером (${u.userId})`, callback_data: `promote_manager_${u.userId}` },
      { text: `Уволить (${u.userId})`, callback_data: `demote_manager_${u.userId}` }
    ];
  });
  bot.sendMessage(chatId, "Выберите пользователя для управления:", { reply_markup: { inline_keyboard: buttons } });
}
// Повышение роли до менеджера
else if (query.data.startsWith("promote_manager_") && user.role === "admin") {
  const targetUserId = query.data.replace("promote_manager_", "");
  const targetUser = await User.findOne({ userId: targetUserId });
  if (!targetUser) {
    return bot.sendMessage(chatId, "Пользователь не найден.");
  }
  targetUser.role = "manager";
  await targetUser.save();
  bot.sendMessage(chatId, `Пользователь ${targetUserId} назначен менеджером.`);
}
// Понижение роли до посетителя (увольнение)
else if (query.data.startsWith("demote_manager_") && user.role === "admin") {
  const targetUserId = query.data.replace("demote_manager_", "");
  const targetUser = await User.findOne({ userId: targetUserId });
  if (!targetUser) {
    return bot.sendMessage(chatId, "Пользователь не найден.");
  }
  targetUser.role = "visitor";
  await targetUser.save();
  bot.sendMessage(chatId, `Пользователь ${targetUserId} теперь имеет роль посетителя.`);
}
else if (query.data === "upload_project" && (user.role === "manager" || user.role === "admin")) {
  // Инициализируем состояние для загрузки проекта
  userState[chatId] = { action: "awaiting_project_name", projectData: {} };
  bot.sendMessage(chatId, "Введите название проекта:");
}
  // Вывод списка контрагентов
  else if (query.data === "contractors" && (user.role === "manager" || user.role === "admin")) {
    const contractors = await Contractor.find();
    if (contractors.length === 0) {
      return bot.sendMessage(chatId, "Список контрагентов пуст.");
    }
    let buttons = contractors.map(c => [{ text: c.name, callback_data: `contractor_${c._id}` }]);
    bot.sendMessage(chatId, "📋 Список контрагентов:", { reply_markup: { inline_keyboard: buttons } });
  }
  // Выбор контрагента
  else if (query.data.startsWith("contractor_")) {
    const contractorId = query.data.replace("contractor_", "");
    const contractor = await Contractor.findById(contractorId);
    if (contractor) {
      let message =
`📌 Контрагент: ${contractor.name}
ИНН/КПП: ${contractor.innKpp}
Юр. адрес: ${contractor.legalAddress}
ОГРН: ${contractor.ogrn}
ЛПР: ${contractor.fioLPR || "Не указано"} (${contractor.positionLPR || "Не указано"})
Основание: ${contractor.basis || "Не указано"}

📄 Договоров: ${contractor.contracts ? contractor.contracts.length : 0}
📌 Приложений: ${contractor.applications ? contractor.applications.length : 0}`;
      
      let buttons = [
        [{ text: "📄 Создать договор", callback_data: `create_contract_${contractor._id}` }],
        [{ text: "📌 Создать приложение", callback_data: `create_application_${contractor._id}` }],
        [{ text: "Показать все договоры", callback_data: `show_contracts_${contractor._id}` }],
        [{ text: "Показать все приложения", callback_data: `show_applications_${contractor._id}` }]
      ];
       buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
      bot.sendMessage(chatId, message, { reply_markup: { inline_keyboard: buttons } });
    } else {
      bot.sendMessage(chatId, "Ошибка: контрагент не найден.");
    }
  }
  // Создание договора
  else if (query.data.startsWith("create_contract_")) {
    const contractorId = query.data.replace("create_contract_", "");
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) {
      return bot.sendMessage(chatId, "Контрагент не найден.");
    }

    const parts = (contractor.innKpp || "").split("/");
const inn = parts[0] ? parts[0].trim() : "Не указан";
const kpp = parts[1] ? parts[1].trim() : "Не указан";

const newContractNumber = contractor.contracts && contractor.contracts.length ? contractor.contracts.length + 1 : 1;
const contractData = {
  "дата": new Date().toLocaleDateString('ru-RU'),
  "НазваниеКонтрагента": contractor.name,
  "ИНН": inn,
  "КПП": kpp,
  "Должность ЛПР_Род": toGenitivePhrase(contractor.positionLPR || "Не указано"),
  "Должность ЛПР_Им": contractor.positionLPR || "Не указано",
  "ФИОЛПР_Род": toGenitivePhrase(contractor.fioLPR || "Не указано"),
  "ФИОЛПР_Им": getLastNameAndInitials(contractor.fioLPR || "Не указано"),
  "Основание(устав/ОГРНИП)": toGenitivePhrase(contractor.basis || "Не указано"),
  "Адрес": contractor.legalAddress || "",
  "Банк": contractor.bank || "Не указан",
  "Р/С": contractor.rs || "Не указан",
  "К/С": contractor.ks || "Не указан",
  "БИК": contractor.bik || "Не указан",
  "ОГРН/ОГРНИП": contractor.ogrn || "Не указан",
  "№": newContractNumber
};

try {
    // Скачиваем шаблон договора по URL
    const content = await downloadTemplateBuffer(templateContractUrl);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.setData(contractData);
    try {
      doc.render();
    } catch (error) {
      console.error("Ошибка при рендеринге шаблона:", error);
      return bot.sendMessage(chatId, "Ошибка при формировании договора.");
    }
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const newContract = { number: newContractNumber, file: buf, createdAt: new Date() };
    contractor.contracts = contractor.contracts || [];
    contractor.contracts.push(newContract);
    await contractor.save();
    bot.sendDocument(chatId, buf, {}, { filename: `Договор_${newContractNumber}.docx` });
    bot.sendMessage(chatId, `Договор №${newContractNumber} успешно создан для контрагента ${contractor.name}.`);
  } catch (err) {
    console.error("Ошибка при создании договора:", err);
    bot.sendMessage(chatId, "Произошла ошибка при создании договора.");
  }
}
  // Создание приложения – перевод в режим ожидания Excel/ссылки
  else if (query.data.startsWith("create_application_")) {
    const contractorId = query.data.replace("create_application_", "");
    const contractor = await Contractor.findById(contractorId);
    if (!contractor) return bot.sendMessage(chatId, "Контрагент не найден.");
    if (!contractor.contracts || contractor.contracts.length === 0) {
      return bot.sendMessage(chatId, "Сначала необходимо создать договор, чтобы привязать к нему приложение.");
    }
    const newApplicationNumber = contractor.applications && contractor.applications.length ? contractor.applications.length + 1 : 1;
    const lastContract = contractor.contracts[contractor.contracts.length - 1];
    userState[chatId] = {
      action: 'awaiting_excel_for_application',
      contractorId: contractor._id,
      applicationNumber: newApplicationNumber,
      contractNumber: lastContract.number
    };
    bot.sendMessage(chatId, "Excel‑файл со сметой, сэр");
  }
 else if (query.data.startsWith("show_contracts_")) {
  // Новый вариант: список договоров с кнопками для выбора
  const contractorId = query.data.replace("show_contracts_", "");
  const contractor = await Contractor.findById(contractorId);
  if (!contractor || !contractor.contracts || contractor.contracts.length === 0) {
    return bot.sendMessage(chatId, "Нет созданных договоров для этого контрагента.");
  }
  let buttons = contractor.contracts.map(contract => {
    return [{ text: `Договор №${contract.number}`, callback_data: `select_contract_${contractorId}_${contract.number}` }];
  });
  // Добавляем кнопку для загрузки нового договора
  buttons.push([{ text: "Загрузить новый договор", callback_data: `upload_contract_${contractorId}` }]);
  buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
  return bot.sendMessage(chatId, "Выберите договор для дальнейших действий:", { reply_markup: { inline_keyboard: buttons } });
}

// Новый блок – выбор существующего договора
else if (query.data.startsWith("select_contract_")) {
  // Формат: "select_contract_<contractorId>_<contractNumber>"
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const contractNumber = parts[3];
  const buttons = [
    [{ text: "Заменить договор", callback_data: `replace_contract_${contractorId}_${contractNumber}` }],
    [{ text: "Скачать договор", callback_data: `download_contract_${contractorId}_${contractNumber}` }],
    [{ text: "Удалить договор", callback_data: `delete_contract_${contractorId}_${contractNumber}` }],
    [{ text: "Назад", callback_data: `show_contracts_${contractorId}` }]
  ];
  return bot.sendMessage(chatId, `Договор №${contractNumber}. Выберите действие:`, { reply_markup: { inline_keyboard: buttons } });
}

// Обработка загрузки нового договора (с экрана "Показать все договоры")
else if (query.data.startsWith("upload_contract_") && query.data.split("_").length === 2) {
  // Формат: "upload_contract_<contractorId>"
  const contractorId = query.data.split("_")[1];
  userState[chatId] = {
    action: "awaiting_new_contract_file",
    contractorId
  };
  return bot.sendMessage(chatId, "Отправьте файл нового договора для загрузки.");
}
if (query.data.startsWith("download_contract_")) {
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const contractNumber = parseInt(parts[3], 10);
  const contractor = await Contractor.findById(contractorId);
  if (!contractor) {
    return bot.sendMessage(chatId, "Контрагент не найден.");
  }
  const contract = contractor.contracts.find(c => c.number === contractNumber);
  if (!contract) {
    return bot.sendMessage(chatId, "Договор не найден.");
  }
  console.log("Проверка файла договора:", contract.file ? "есть данные" : "нет данных");
  console.log("Тип contract.file:", typeof contract.file);

  // Преобразуем в Buffer, если это необходимо:
  const fileBuffer = Buffer.isBuffer(contract.file)
    ? contract.file
    : Buffer.from(contract.file);

  return bot.sendDocument(chatId, fileBuffer, {}, { filename: `Договор_${contract.number}.docx` });
}
else if (query.data.startsWith("replace_contract_")) {
  // Формат: "replace_contract_<contractorId>_<contractNumber>"
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const contractNumber = parseInt(parts[3]);
  userState[chatId] = {
    action: "awaiting_replacement_contract_file",
    contractorId,
    contractNumber
  };
  return bot.sendMessage(chatId, "Отправьте новый файл для замены договора.");
}

  // Показать все приложения – список кнопок для скачивания
 // Изменённая ветка для отображения приложений
else if (query.data.startsWith("show_applications_")) {
  const contractorId = query.data.replace("show_applications_", "");
  const contractor = await Contractor.findById(contractorId);
  if (!contractor || !contractor.applications || contractor.applications.length === 0) {
    return bot.sendMessage(chatId, "Нет созданных приложений для этого контрагента.");
  }
  let buttons = contractor.applications.map(app => {
    return [{ text: `Приложение №${app.number}`, callback_data: `select_application_${contractorId}_${app.number}` }];
  });
  buttons.push([{ text: "Загрузить новое приложение", callback_data: `upload_application_${contractorId}` }]);
  buttons.push([{ text: "В главное меню", callback_data: "main_menu" }]);
  return bot.sendMessage(chatId, "Выберите приложение для дальнейших действий:", { reply_markup: { inline_keyboard: buttons } });
}

// Новый блок – выбор существующего приложения
else if (query.data.startsWith("select_application_")) {
  // Формат: "select_application_<contractorId>_<applicationNumber>"
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const appNumber = parts[3];
  const buttons = [
    [{ text: "Заменить приложение", callback_data: `replace_application_${contractorId}_${appNumber}` }],
    [{ text: "Скачать приложение", callback_data: `download_application_${contractorId}_${appNumber}` }],
    [{ text: "Удалить приложение", callback_data: `delete_application_${contractorId}_${appNumber}` }],
    [{ text: "Назад", callback_data: `show_applications_${contractorId}` }]
  ];
  return bot.sendMessage(chatId, `Приложение №${appNumber}. Выберите действие:`, { reply_markup: { inline_keyboard: buttons } });
}

else if (query.data.startsWith("upload_application_") && query.data.split("_").length === 2) {
  // Формат: "upload_application_<contractorId>"
  const contractorId = query.data.split("_")[1];
  userState[chatId] = {
    action: "awaiting_new_application_file",
    contractorId
  };
  return bot.sendMessage(chatId, "Отправьте файл нового приложения для загрузки.");
}

else if (query.data.startsWith("replace_application_")) {
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const appNumber = parseInt(parts[3]);
  userState[chatId] = {
    action: "awaiting_replacement_application_file",
    contractorId,
    appNumber
  };
  return bot.sendMessage(chatId, "Отправьте новый файл для замены приложения.");
}

else if (query.data.startsWith("download_application_")) {
  const parts = query.data.split("_");
  const contractorId = parts[2];
  const appNumber = parseInt(parts[3]);
  const contractor = await Contractor.findById(contractorId);
  if (!contractor) return bot.sendMessage(chatId, "Контрагент не найден.");
  const app = contractor.applications.find(a => a.number === appNumber);
  if (!app) return bot.sendMessage(chatId, "Приложение не найдено.");
  bot.sendDocument(chatId, app.file, {}, { filename: `Приложение_${app.number}.docx` });
}

  // Удаление договора
if (query.data.startsWith("delete_contract_") && (user.role === "manager" || user.role === "admin")) {
  const parts = query.data.split("_");
  // Ожидаемый формат: "delete_contract_<contractorId>_<contractNumber>"
  if (parts.length < 4) {
    return bot.sendMessage(chatId, "Некорректные данные для удаления договора.");
  }
  const contractorId = parts[2];
  const contractNumber = parseInt(parts[3]);
  const contractor = await Contractor.findById(contractorId);
  if (!contractor) {
    return bot.sendMessage(chatId, "Контрагент не найден.");
  }
  const index = contractor.contracts.findIndex(c => c.number === contractNumber);
  if (index === -1) {
    return bot.sendMessage(chatId, "Договор не найден.");
  }
  contractor.contracts.splice(index, 1);
  await contractor.save();
  return bot.sendMessage(chatId, `Договор №${contractNumber} успешно удалён.`);
}

// Удаление приложения
if (query.data.startsWith("delete_application_") && (user.role === "manager" || user.role === "admin")) {
  const parts = query.data.split("_");
  // Ожидаемый формат: "delete_application_<contractorId>_<applicationNumber>"
  if (parts.length < 4) {
    return bot.sendMessage(chatId, "Некорректные данные для удаления приложения.");
  }
  const contractorId = parts[2];
  const appNumber = parseInt(parts[3]);
  const contractor = await Contractor.findById(contractorId);
  if (!contractor) {
    return bot.sendMessage(chatId, "Контрагент не найден.");
  }
  const index = contractor.applications.findIndex(a => a.number === appNumber);
  if (index === -1) {
    return bot.sendMessage(chatId, "Приложение не найдено.");
  }
  contractor.applications.splice(index, 1);
  await contractor.save();
  return bot.sendMessage(chatId, `Приложение №${appNumber} успешно удалено.`);
}
 // Добавление контрагента – начало процесса
  else if (query.data === "add_contractor" && (user.role === "manager" || user.role === "admin")) {
    userState[chatId] = {
      action: 'awaiting_contractor_name',
      contractorData: {}
    };
    bot.sendMessage(chatId, "Введите название контрагента:");
  }
});
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return; // если нет ожидания, выходим

  // Обработка состояния создания ТТН
  if (state.action && state.action.startsWith("awaiting_ttn_")) {
    switch (state.action) {
      case "awaiting_ttn_date":
        state.ttnData.date = msg.text;
        state.action = "awaiting_ttn_constructions";
        return bot.sendMessage(chatId, "Введите конструкции:");
      
      case "awaiting_ttn_constructions":
        state.ttnData.constructions = msg.text;
        state.action = "awaiting_ttn_weight";
        return bot.sendMessage(chatId, "Введите вес:");
      
      case "awaiting_ttn_weight":
        state.ttnData.weight = msg.text;
        // Переходим к выбору грузоотправителя с инлайн‑кнопками
        state.action = "awaiting_ttn_sender_choice";
        const senderButtons = {
          reply_markup: {
            inline_keyboard: [
              [{ text: "ИП Киреичев А.С.", callback_data: "ttn_sender_kireichev" }],
              [{ text: "ИП Фадеев А.Д.", callback_data: "ttn_sender_fadeev" }]
            ]
          }
        };
        return bot.sendMessage(chatId, "Выберите грузоотправителя:", senderButtons);
      
      case "awaiting_ttn_receiver_input":
        state.ttnData.receiver = msg.text;
        state.action = "awaiting_ttn_delivery_address";
        return bot.sendMessage(chatId, "Введите адрес выгрузки:");
      
      case "awaiting_ttn_delivery_address":
        state.ttnData.deliveryAddress = msg.text;
        state.action = "awaiting_ttn_car_brand";
        return bot.sendMessage(chatId, "Введите марку автомобиля:");
      
      case "awaiting_ttn_car_brand":
        state.ttnData.carBrand = msg.text;
        state.action = "awaiting_ttn_car_number";
        return bot.sendMessage(chatId, "Введите гос.номер автомобиля:");
      
      case "awaiting_ttn_car_number":
        state.ttnData.carNumber = msg.text;
        state.action = "awaiting_ttn_cargo_places";
        return bot.sendMessage(chatId, "Введите количество грузовых мест:");
      
      case "awaiting_ttn_cargo_places":
        state.ttnData.cargoPlaces = msg.text;
        state.action = "awaiting_ttn_driver";
        return bot.sendMessage(chatId, "Введите ФИО водителя:");
      
      case "awaiting_ttn_driver":
        state.ttnData.driver = msg.text;
        // Все данные получены – создаём ТТН
        createTTNDOCX(chatId, state.ttnData);
        delete userState[chatId];
        break;
    }
  }
});
// Обработка входящих сообщений
// Обработка пошагового ввода для загрузки проекта
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return; // если нет ожидания – выходим
  
  // Шаг 1: Название проекта
  if (state.action === "awaiting_project_name") {
    state.projectData.name = msg.text;
    state.action = "awaiting_project_photos";
    // Предлагаем менеджеру загрузить фото (можно попросить загрузить по одному или как пакет)
    return bot.sendMessage(chatId, "Фото проекта по одному, сэр. После загрузки всех фотографий напиши 'готово'.");
  }
  
  // Шаг 2: Загрузка фотографий
  else if (state.action === "awaiting_project_photos") {
    // Если менеджер отправил текст "готово", переходим к описанию
    if (msg.text && msg.text.toLowerCase() === "готово") {
      state.action = "awaiting_project_description";
      return bot.sendMessage(chatId, "Файл с описанием проекта или текстовое описание, сэр.");
    }
    // Если сообщение содержит документ или фото
    if (msg.photo || msg.document) {
      // Сохраняем файл локально или сразу загружаем в Cloudinary
      // Предположим, что мы сразу загружаем файл; определим путь к временному файлу:
      let fileId;
      if (msg.photo) {
        // Выбираем самое большое фото (последний в массиве)
        fileId = msg.photo[msg.photo.length - 1].file_id;
      } else {
        fileId = msg.document.file_id;
      }
      // Получаем путь к файлу от Telegram
      const fileUrl = await bot.getFileLink(fileId);
      // Можно скачать файл в локальное временное хранилище или напрямую передать URL в Cloudinary (Cloudinary может загружать по URL)
      // Здесь мы воспользуемся Cloudinary для загрузки по URL:
      try {
        // Используем Cloudinary uploader с указанием URL (если у вас настроена возможность загрузки по URL)
        const result = await cloudinary.uploader.upload(fileUrl, { folder: `projects/${state.projectData.name}` });
        console.log(`Фото загружено: ${result.secure_url}`);
        state.projectData.photos = state.projectData.photos || [];
        state.projectData.photos.push(result.secure_url);
        return bot.sendMessage(chatId, "Фото загружено. Отправьте следующее фото или введите 'готово'.");
      } catch (error) {
        console.error("Ошибка при загрузке фото:", error);
        return bot.sendMessage(chatId, "Ошибка при загрузке фото. Попробуйте ещё раз.");
      }
    }
  }
  
  // Шаг 3: Загрузка описания проекта
  else if (state.action === "awaiting_project_description") {
  // Если отправлен документ – сохраняем в descriptionUrl
  if (msg.document) {
    try {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const result = await cloudinary.uploader.upload(fileUrl, { folder: `projects/${state.projectData.name}`, resource_type: "raw" });
      state.projectData.descriptionUrl = result.secure_url;
      state.action = "upload_project_done";
      return bot.sendMessage(chatId, "Описание проекта загружено.");
    } catch (error) {
      console.error("Ошибка при загрузке описания:", error);
      return bot.sendMessage(chatId, "Ошибка при загрузке описания. Попробуйте ещё раз.");
    }
  }
  // Если отправлен текст – сохраняем в поле description
  else if (msg.text) {
    state.projectData.description = msg.text;
    state.action = "upload_project_done";
    return bot.sendMessage(chatId, "Описание проекта получено.Напиши слово требуха");
  }
}
  
  // Финальный шаг: Сохраняем данные в базу (MongoDB)
  if (state.action === "upload_project_done") {
    // Создаем новый проект в базе
    const newProject = new Project(state.projectData);
    try {
      await newProject.save();
      bot.sendMessage(chatId, "Проект успешно добавлен в базу данных!");
    } catch (err) {
      console.error("Ошибка при сохранении проекта:", err);
      bot.sendMessage(chatId, "Ошибка при сохранении проекта.");
    }
    delete userState[chatId];
  }
});
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const state = userState[chatId];
  if (!state) return;

  // Шаг 1: ФИО доверенного лица
  if (state.action === "awaiting_trust_fio") {
    state.trustData = { fio: msg.text };
    state.action = "awaiting_trust_passport";
    return bot.sendMessage(chatId, "Серия и номер паспорта, сэр:");
  }
  // Шаг 2: Серия и номер паспорта
  if (state.action === "awaiting_trust_passport") {
    state.trustData.passport = msg.text;
    state.action = "awaiting_trust_issued";
    return bot.sendMessage(chatId, "Кем же он выдан, сэр?:");
  }
  // Шаг 3: Кем выдан паспорт
  if (state.action === "awaiting_trust_issued") {
    state.trustData.issued = msg.text;
    state.action = "awaiting_trust_issueDate";
    return bot.sendMessage(chatId, "Дата выдачи, сэр:");
  }
  // Шаг 4: Дата выдачи паспорта
  if (state.action === "awaiting_trust_issueDate") {
    state.trustData.issueDate = msg.text;
    // После сбора всех данных создаём доверенность – дата и номер ставятся автоматически
    await createTrustDoc(chatId, state.trustData);
    delete userState[chatId];
    return;
  }
});
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Если ожидается сообщение для команды
  if (userState[chatId] && userState[chatId].action === "awaiting_message_to_team") {
    const messageText = msg.text;

    if (!messageText) {
      return bot.sendMessage(chatId, "Пожалуйста, напишите текстовое сообщение.");
    }

    // Пересылаем сообщение в группу
    try {
      await bot.forwardMessage(GROUP_CHAT_ID, chatId, msg.message_id);
      bot.sendMessage(chatId, "Ваше сообщение успешно отправлено нашей команде! 🚀");
    } catch (error) {
      console.error("Ошибка при пересылке сообщения:", error);
      bot.sendMessage(chatId, "Произошла ошибка при отправке сообщения. Пожалуйста, попробуйте позже.");
    }

    // Очищаем состояние пользователя
    delete userState[chatId];
  }
});


// Функция отправки главного меню
async function sendMainMenu(chatId) {
  try {
    const user = await User.findOne({ userId: chatId.toString() });
    let buttons = [
      [{ text: "Кейсы проектов", callback_data: "projects" }],
      [{ text: "О нас", callback_data: "about" }],
      [{ text: "Связаться с нами", callback_data: "contact" }],
      [{ text: "Скачать Презентацию (PDF)", callback_data: "download_presentation" }]
    ];

    if (user && (user.role === "manager" || user.role === "admin")) {
      buttons.push(
        [{ text: "📋 Список контрагентов", callback_data: "contractors" }],
        [{ text: "➕ Добавить контрагента", callback_data: "add_contractor" }],
        [{ text: "💰 Внести расход", callback_data: "add_expense_main" }] 
      );
    }

  } catch (error) {
    console.error('Ошибка при отправке главного меню:', error);
    await bot.sendMessage(chatId, "Произошла ошибка при загрузке меню. Попробуйте позже.");
  }
}

// ... existing code ...

// Обработка входящих сообщений для пошагового добавления контрагента
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Если ожидается название контрагента
  if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_name') {
    userState[chatId].contractorData.name = msg.text;
    userState[chatId].action = 'awaiting_contractor_inn_kpp';
    return bot.sendMessage(chatId, "Введите ИНН/КПП контрагента (формат: ИНН/КПП):");
  }

  // Если ожидается ИНН/КПП контрагента
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_inn_kpp') {
    userState[chatId].contractorData.innKpp = msg.text;
    userState[chatId].action = 'awaiting_contractor_legal_address';
    return bot.sendMessage(chatId, "Введите юридический адрес контрагента:");
  }

  // Если ожидается юридический адрес контрагента
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_legal_address') {
    userState[chatId].contractorData.legalAddress = msg.text;
    userState[chatId].action = 'awaiting_contractor_ogrn';
    return bot.sendMessage(chatId, "Введите ОГРН контрагента:");
  }

  // Если ожидается ОГРН контрагента
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_ogrn') {
    userState[chatId].contractorData.ogrn = msg.text;
    userState[chatId].action = 'awaiting_contractor_position_lpr';
    return bot.sendMessage(chatId, "Введите должность лица, подписывающего договор (ЛПР):");
  }

  // Если ожидается должность ЛПР
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_position_lpr') {
    userState[chatId].contractorData.positionLPR = msg.text;
    userState[chatId].action = 'awaiting_contractor_fio_lpr';
    return bot.sendMessage(chatId, "Введите ФИО лица, подписывающего договор (ЛПР):");
  }

  // Если ожидается ФИО ЛПР
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_fio_lpr') {
    userState[chatId].contractorData.fioLPR = msg.text;
    userState[chatId].action = 'awaiting_contractor_basis';
    return bot.sendMessage(chatId, "Введите основание подписания договора (например, Устав):");
  }

  // Если ожидается основание подписания договора
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_basis') {
    userState[chatId].contractorData.basis = msg.text;
    userState[chatId].action = 'awaiting_contractor_bank';
    return bot.sendMessage(chatId, "Введите название банка контрагента (или отправьте 'пропустить', чтобы оставить поле пустым):");
  }

  // Если ожидается название банка
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_bank') {
    if (msg.text.toLowerCase() !== 'пропустить') {
      userState[chatId].contractorData.bank = msg.text;
    }
    userState[chatId].action = 'awaiting_contractor_bik';
    return bot.sendMessage(chatId, "Введите БИК банка контрагента (или отправьте 'пропустить', чтобы оставить поле пустым):");
  }

  // Если ожидается БИК банка
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_bik') {
    if (msg.text.toLowerCase() !== 'пропустить') {
      userState[chatId].contractorData.bik = msg.text;
    }
    userState[chatId].action = 'awaiting_contractor_rs';
    return bot.sendMessage(chatId, "Введите расчетный счет контрагента (или отправьте 'пропустить', чтобы оставить поле пустым):");
  }

  // Если ожидается расчетный счет
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_rs') {
    if (msg.text.toLowerCase() !== 'пропустить') {
      userState[chatId].contractorData.rs = msg.text;
    }
    userState[chatId].action = 'awaiting_contractor_ks';
    return bot.sendMessage(chatId, "Введите корреспондентский счет контрагента (или отправьте 'пропустить', чтобы оставить поле пустым):");
  }

  // Если ожидается корреспондентский счет
  else if (userState[chatId] && userState[chatId].action === 'awaiting_contractor_ks') {
    if (msg.text.toLowerCase() !== 'пропустить') {
      userState[chatId].contractorData.ks = msg.text;
    }

    // Все данные собраны – сохраняем контрагента в базу данных
    const contractorData = userState[chatId].contractorData;
    const newContractor = new Contractor(contractorData);
    try {
      await newContractor.save();
      bot.sendMessage(chatId, "Контрагент успешно добавлен в базу данных!");
    } catch (err) {
      console.error("Ошибка при сохранении контрагента:", err);
      bot.sendMessage(chatId, "Произошла ошибка при добавлении контрагента.");
    }
    delete userState[chatId]; // Очищаем состояние пользователя
  }
});
// Функция форматирования чисел в формат "валюта рубли"
function formatCurrency(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " руб.";
}
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId]) return;
  const state = userState[chatId];

  // Обработка замены договора
  if (state.action === "awaiting_replacement_contract_file" && msg.document) {
    try {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const contractor = await Contractor.findById(state.contractorId);
      if (!contractor) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Контрагент не найден.");
      }
      const index = contractor.contracts.findIndex(c => c.number === state.contractNumber);
      if (index === -1) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Договор не найден.");
      }
      contractor.contracts[index].file = response.data;
      contractor.contracts[index].createdAt = new Date();
      await contractor.save();
      bot.sendMessage(chatId, `Договор №${state.contractNumber} успешно заменён.`);
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Ошибка при замене договора.");
    }
    delete userState[chatId];
    return;
  }

  // Обработка загрузки нового договора
  if (state.action === "awaiting_new_contract_file" && msg.document) {
    try {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const contractor = await Contractor.findById(state.contractorId);
      if (!contractor) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Контрагент не найден.");
      }
      const newContractNumber = contractor.contracts.length + 1;
      contractor.contracts.push({
        number: newContractNumber,
        file: response.data,
        createdAt: new Date()
      });
      await contractor.save();
      bot.sendMessage(chatId, `Новый договор №${newContractNumber} успешно загружен.`);
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Ошибка при загрузке нового договора.");
    }
    delete userState[chatId];
    return;
  }

  // Аналогичная обработка для приложений
  if (state.action === "awaiting_replacement_application_file" && msg.document) {
    try {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const contractor = await Contractor.findById(state.contractorId);
      if (!contractor) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Контрагент не найден.");
      }
      const index = contractor.applications.findIndex(a => a.number === state.appNumber);
      if (index === -1) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Приложение не найдено.");
      }
      contractor.applications[index].file = response.data;
      contractor.applications[index].createdAt = new Date();
      await contractor.save();
      bot.sendMessage(chatId, `Приложение №${state.appNumber} успешно заменено.`);
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Ошибка при замене приложения.");
    }
    delete userState[chatId];
    return;
  }

  if (state.action === "awaiting_new_application_file" && msg.document) {
    try {
      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const contractor = await Contractor.findById(state.contractorId);
      if (!contractor) {
        delete userState[chatId];
        return bot.sendMessage(chatId, "Контрагент не найден.");
      }
      const newAppNumber = contractor.applications.length + 1;
      contractor.applications.push({
        number: newAppNumber,
        file: response.data,
        createdAt: new Date()
      });
      await contractor.save();
      bot.sendMessage(chatId, `Новое приложение №${newAppNumber} успешно загружено.`);
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "Ошибка при загрузке нового приложения.");
    }
    delete userState[chatId];
    return;
  }
});

// Обработка входящих сообщений для Excel‑файла/ссылки и последующего ввода дополнительных переменных

bot.on('message', async (msg) => {
  
  const chatId = msg.chat.id;
  

  if (userState[chatId] && userState[chatId].action === 'awaiting_excel_for_application') {
  let tableData = [];
  let totalSumNumber = 0;
  let totalSumWords = "";

  try {
    if (msg.document) {
      const mime = msg.document.mime_type;
      if (!mime || (!mime.includes("excel") && !mime.includes("spreadsheet"))) {
        return bot.sendMessage(chatId, "Excel‑файл, сэр.");
      }

      const fileId = msg.document.file_id;
      const fileUrl = await bot.getFileLink(fileId);
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const workbook = XLSX.read(response.data, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    let currentServiceDescription = "";

for (let i = 2; i < rows.length; i++) {
  const row = rows[i];

  // Если в графе F (индекс 5) указано "вкл"
  if (row[5] && row[5].toString().trim().toLowerCase() === "вкл") {
    const nextRow = rows[i + 1];
    if (nextRow && nextRow[0]) {
      currentServiceDescription = nextRow[0].toString().trim();
    } else {
      currentServiceDescription = "Услуга без названия";
    }
  }

  // Обработка строки с "Монтажный блок"
  if (row[0] && row[0].toString().trim().toLowerCase() === "монтажный блок") {
    currentServiceDescription = "Предоставление услуг логистики, монтажа и демонтажа";
  }

  // Если встретили "итого стоимость позиции:"
  if (row[0] && row[0].toString().trim().toLowerCase() === "итого стоимость позиции:") {
    const totalValue = parseFloat(row[6]);
    if (!isNaN(totalValue) && totalValue > 0) {    // <--- фильтр по нулю
      tableData.push({
        A: currentServiceDescription,
        B: "Услуга",
        F: "1",
        H: formatRubles(totalValue),
        J: formatRubles(totalValue)
      });
    }
    currentServiceDescription = ""; 
  }
}

      // Общая сумма (последняя строка со значением в G)
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][6] && rows[i][6] !== "") {
          totalSumNumber = parseFloat(rows[i][6]);
          break;
        }
      }

      totalSumWords = totalSumNumber ? numberToWordsRu(totalSumNumber) : "0";
      const vatNumber = totalSumNumber * 20 / 120;
      const vatWords = currencyInWords(vatNumber);

      userState[chatId].tableData = tableData;
      userState[chatId].totalSumNumber = totalSumNumber;
      userState[chatId].totalSumWords = totalSumWords;
      userState[chatId].vatNumber = vatNumber;
      userState[chatId].vatWords = vatWords;

      userState[chatId].action = 'awaiting_service_period';
      return bot.sendMessage(chatId, "Срок предоставления услуг, сэр:");
    } else if (msg.text && /docs\.google\.com\/spreadsheets/.test(msg.text)) {
      userState[chatId].tableData = msg.text;
      userState[chatId].totalSumNumber = 0;
      userState[chatId].totalSumWords = "0";
      userState[chatId].vatNumber = 0;
      userState[chatId].vatWords = "0";
      userState[chatId].action = 'awaiting_service_period';
      return bot.sendMessage(chatId, "Срок предоставления услуг, сэр:");
    } else {
      return bot.sendMessage(chatId, "Не удалось распознать файл или ссылку. Увы.");
    }
  } catch (error) {
    console.error("Ошибка при обработке Excel/ссылки:", error);
    return bot.sendMessage(chatId, "Ошибка при обработке файла. Увы.");
  }
}

  // Если ожидается ввод срока предоставления услуг
  else if (userState[chatId] && userState[chatId].action === 'awaiting_service_period') {
    userState[chatId].servicePeriod = msg.text;
    userState[chatId].action = 'awaiting_service_address';
    return bot.sendMessage(chatId, "Адрес предоставления услуг, сэр:");
  }
  // Если ожидается ввод адреса предоставления услуг
  else if (userState[chatId] && userState[chatId].action === 'awaiting_service_address') {
    userState[chatId].serviceAddress = msg.text;
    // Все данные собраны – формируем приложение
    const state = userState[chatId];
    const contractor = await Contractor.findById(state.contractorId);
    if (!contractor) {
      delete userState[chatId];
      return bot.sendMessage(chatId, "Контрагент не найден.");
    }
    let inn = "Не указан";
    let kpp = "Не указан";
    if (contractor.innKpp) {
      const parts = contractor.innKpp.split("/");
      inn = parts[0] ? parts[0].trim() : "Не указан";
      kpp = parts[1] ? parts[1].trim() : "Не указан";
    }
    const lastContract = contractor.contracts[contractor.contracts.length - 1];
    const positionLPR = contractor.positionLPR || "Не указано";
    const fioLPR = contractor.fioLPR || "Не указано";
    
    const applicationData = {
      "номерприложения": state.applicationNumber,
      "датаприложения": new Date().toLocaleDateString('ru-RU'),
      "Номердоговора": state.contractNumber,
      "Датадоговор": lastContract.createdAt ? new Date(lastContract.createdAt).toLocaleDateString('ru-RU') : "Не указан",
      "НазваниеКонтрагента": contractor.name,
      "ИНН": inn,
      "КПП": kpp,
      // Для "в лице" – все в родительном падеже
      "Должность ЛПР_Род": toGenitivePhrase(positionLPR),
      "Должность ЛПР_Им": getLastNameAndInitials(contractor.positionLPR || "Не указано"),
      "ФИОЛПР_Род": toGenitivePhrase(fioLPR),
      // Для реквизитов – только фамилия и инициалы
      "ФИОЛПР_Им": getLastNameAndInitials(fioLPR),
      // Основание – в родительном падеже
      "Основание(устав/ОГРНИП)": toGenitivePhrase(contractor.basis || ""),
      "ТаблицаУслуг": state.tableData,
      "период": state.servicePeriod,
      "адресмонтажа": "Не указан",
      "Адрес": contractor.legalAddress || "",
      "Банк": contractor.bank || "Не указан",
      "Р/С": contractor.rs || "Не указан",
      "К/С": contractor.ks || "Не указан",
      "БИК": contractor.bik || "Не указан",
      "ОГРН/ОГРНИП": contractor.ogrn || "Не указан",
      "ИтогоКОплатеЦифрой": formatCurrency(state.totalSumNumber),
      "ИтогоКОплатеТекстом": currencyInWords(state.totalSumNumber),
      "НДС_Цифрой": formatCurrency(state.vatNumber),
      "НДС_Текстом": currencyInWords(state.vatNumber),
      "срокпредоставленияуслуг": state.servicePeriod,
      "Адреспредоставленияуслуг": state.serviceAddress
    };
    
   try {
  // Скачиваем шаблон приложения по URL
  const content = await downloadTemplateBuffer(templateApplicationUrl);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.setData(applicationData);
  try {
    doc.render();
  } catch (error) {
    console.error("Ошибка при рендеринге шаблона приложения:", error);
    delete userState[chatId];
    return bot.sendMessage(chatId, "Ошибка при формировании приложения.");
  }
  const buf = doc.getZip().generate({ type: "nodebuffer" });
  const newApplication = {
    number: state.applicationNumber,
    file: buf,
    createdAt: new Date(),
    contractNumber: state.contractNumber
  };
  contractor.applications = contractor.applications || [];
  contractor.applications.push(newApplication);
  await contractor.save();
  bot.sendDocument(chatId, buf, {}, { filename: `Приложение_${state.applicationNumber}.docx` });
  bot.sendMessage(chatId, `Приложение №${state.applicationNumber} успешно создано для контрагента ${contractor.name}.`);
} catch (err) {
  console.error("Ошибка при создании приложения:", err);
  bot.sendMessage(chatId, "Произошла ошибка при создании приложения.");
}
delete userState[chatId];
  }
});
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId]) return; // если нет состояния, выходим

  const state = userState[chatId];
  const text = msg.text;

  try {
    // Шаг 1: Ожидаем название контрагента
    if (state.action === 'awaiting_contractor_name_for_expense') {
      state.contractorName = text;
      state.action = 'awaiting_expense_name';
      await bot.sendMessage(chatId, 'Наименование, сэр:');
      return;
    }

    // Шаг 2: Ожидаем наименование расхода
    if (state.action === 'awaiting_expense_name') {
      state.expenseName = text;
      state.action = 'awaiting_expense_amount';
      await bot.sendMessage(chatId, 'Сумма, сэр:');
      return;
    }

    // Шаг 3: Ожидаем сумму расхода
    if (state.action === 'awaiting_expense_amount') {
      const amount = parseFloat(text.replace(/[^\d.-]/g, ''));
      if (isNaN(amount)) {
        await bot.sendMessage(chatId, "Пожалуйста, введите корректную сумму.");
        return;
      }

      const result = await sendExpenseToAppsScript(
        state.sheetName,
        state.contractorName,
        state.expenseName,
        amount
      );

      if (result.result === 'success') {
        const buttons = [
          [{ text: "➕ Добавить еще расход", callback_data: "add_expense_main" }],
          [{ text: "🔙 Вернуться в главное меню", callback_data: "main_menu" }]
        ];

        await bot.sendMessage(chatId, "✅ Все получилось! Гениально!", {
          reply_markup: { inline_keyboard: buttons }
        });
      } else {
        throw new Error(result.message || 'Не удалось внести расход');
      }

      delete userState[chatId];
    }
  } catch (error) {
    console.error('Ошибка при обработке расхода:', error);
    await bot.sendMessage(chatId, `Ошибка: ${error.message}`);
    delete userState[chatId];
  }
});

console.log("Бот запущен!");

/* --------------------- Дополнительные функции --------------------- */

/**
 * Отправляет фотографию проекта с кнопками навигации.
 */
function sendProjectPhoto(chatId, projectName, photoIndex, photos, description) {
  const photoPath = photos[photoIndex];
  const caption = `Проект: ${projectName}\nОписание: ${description}\nФото ${photoIndex + 1} из ${photos.length}`;
  const buttons = [
    [{ text: "⬅️ Назад", callback_data: "prev_photo" }, { text: "➡️ Вперед", callback_data: "next_photo" }],
    [{ text: "В главное меню", callback_data: "main_menu" }]
  ];
  bot.sendPhoto(chatId, fs.readFileSync(photoPath), {
    caption: caption,
    reply_markup: { inline_keyboard: buttons }
  });
}

/**
 * Отправляет данные расхода на веб‑сервис (Apps Script).
 * Данные отправляются методом POST.
 * Переменная окружения APPS_SCRIPT_URL должна содержать URL вашего веб‑приложения.
 */
async function sendExpenseToAppsScript(sheetName, contractor, expense, amount) {
  const url = process.env.APPS_SCRIPT_URL;
  
  if (!url) {
    throw new Error('URL для Apps Script не настроен');
  }

  try {
    console.log('Отправка данных в Apps Script:', {
      sheetName,
      contractor,
      expense,
      amount
    });

    // Изменяем формат отправляемых данных
    const response = await axios.post(url, {
      action: "addExpense",
      sheetName: sheetName,
      contractor: contractor,
      expense: expense,
      amount: amount,
      date: new Date().toLocaleDateString('ru-RU')
    }, {
      timeout: 10000
    });

    console.log('Ответ от Apps Script:', response.data);

    // Проверяем ответ от сервера
    if (!response.data) {
      throw new Error('Нет ответа от сервера');
    }

    if (response.data.result === 'error') {
      throw new Error(response.data.message || 'Ошибка... Се ля ви');
    }

    return {
      result: "success",
      message: response.data.message || 'Все пучком'
    };
  } catch (error) {
    console.error("Ошибка при отправке данных в Apps Script:", error);
    
    // Формируем понятное сообщение об ошибке
    let errorMessage = 'Ошибка при добавлении расхода';
    
    if (error.response) {
      // Ошибка от сервера
      errorMessage = error.response.data?.message || error.response.data?.error || errorMessage;
    } else if (error.request) {
      // Ошибка сети
      errorMessage = 'Не удалось связаться с сервером. Проверьте подключение.';
    } else {
      // Другие ошибки
      errorMessage = error.message || errorMessage;
    }

    return {
      result: "error",
      message: errorMessage
    };
  }
}
async function createTTNDOCX(chatId, ttnData) {
  try {
    console.log("ttnData:", ttnData);
    // Загружаем шаблон DOCX
    const content = await downloadTemplateBuffer(templateTTNUrl);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    
    // Заполняем шаблон данными. Названия ключей должны совпадать с плейсхолдерами в шаблоне.
    doc.setData({
      "Дата": ttnData.date,
      "Конструкции": ttnData.constructions,
      "Вес": ttnData.weight,
      "Грузоотправитель": ttnData.sender,
      "Грузополучатель": ttnData.receiver,
      "Адрес_выгрузки": ttnData.deliveryAddress,
      "Автомобиль_марка": ttnData.carBrand,
      "Автомобиль_номер": ttnData.carNumber,
      "Количество_грузовых_мест": ttnData.cargoPlaces,
      "ФИО_водителя": ttnData.driver
    });
    
    try {
      doc.render();
    } catch (error) {
      console.error("Ошибка при рендеринге шаблона ТН:", error);
      return bot.sendMessage(chatId, "Ошибка при формировании ТН: " + error.message);
    }
    
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    await bot.sendDocument(chatId, buf, {}, { filename: "ТН.docx" });
    const mainMenuButton = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Главное меню", callback_data: "main_menu" }]
        ]
      }
    };
    bot.sendMessage(chatId, "Транспортная накладная успешно создана!", mainMenuButton);
  } catch (error) {
    console.error("Ошибка при создании ТН:", error);
    bot.sendMessage(chatId, "Произошла ошибка при создании ТН: " + error.message);
  }
}

