import asyncio
import os
import json
import random
import time
import sys
from datetime import datetime
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile

OWNER_ID = 141230163
TOKEN = "8584190260:AAFpwFdaHFBroUeBmS6EszIh-kDAGAMppRE"
SUPPORT_USERNAME = "@g_gggggg_g"
SUPPORT_URL = "https://t.me/BreakLegenda"
CHANNEL_ID = -1003830241596
CHANNEL_URL = "https://t.me/BreakLegenda"
PAY_REQUISITES = "2200702032694320 Т Банк" 
COOLDOWN_TIME = 150 

PRICES = {
    "Base": {"1 day": "99₽", "7 days": "249₽", "30 days": "349₽", "Lifetime": "599₽"},
    "Premium": {"1 day": "149₽", "7 days": "349₽", "30 days": "449₽", "Lifetime": "749₽"}
}

bot = Bot(token=TOKEN)
dp = Dispatcher()

DB_FILE = "database.json"
db = {}

def load_db():
    global db
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                db = {int(k): v for k, v in data.items()}
        except Exception as e:
            print(f"Ошибка загрузки БД: {e}")
            db = {}
    else: db = {}

def save_db():
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Ошибка сохранения БД: {e}")

load_db()

def get_u(user_obj: types.User):
    uid = user_obj.id
    uname = f"@{user_obj.username}" if user_obj.username else "NoName"
    if uid not in db:
        db[uid] = {"username": uname, "sub": "Нет", "active": False, "dur": "", "reg": datetime.now().strftime("%d.%m.%Y"), "state": None, "last_run": 0}
        save_db()
    elif db[uid].get("username") != uname:
        db[uid]["username"] = uname
        save_db()
    return db[uid]

async def check_sub(user_id: int):
    try:
        member = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        return member.status in ["member", "administrator", "creator"]
    except:
        return False

def sub_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 Подписаться на канал", url=CHANNEL_URL)],
        [InlineKeyboardButton(text="🔄 Проверить подписку", callback_data="check_subscription")]
    ])

def main_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👤 Профиль", callback_data="m_profile"),
         InlineKeyboardButton(text="❄️ Запустить", callback_data="m_run")],
        [InlineKeyboardButton(text="💰 Магазин", callback_data="m_shop")],
        [InlineKeyboardButton(text="🆘 Помощь", callback_data="m_help")]
    ])

def admin_kb():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 Рассылка", callback_data="adm_broadcast")],
        [InlineKeyboardButton(text="💎 С сабом (по 20)", callback_data="adm_list_active_0")],
        [InlineKeyboardButton(text="👤 Без саба (по 100)", callback_data="adm_list_noactive_0")],
        [InlineKeyboardButton(text="➕ Выдать саб", callback_data="adm_give_sub"),
         InlineKeyboardButton(text="➖ Забрать саб", callback_data="adm_take_sub")],
        [InlineKeyboardButton(text="⬅️ Меню", callback_data="m_home")]
    ])

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    get_u(message.from_user)
    if not await check_sub(message.from_user.id):
        await message.answer(f"⚠️ <b>Доступ ограничен!</b>\nДля работы подпишитесь: {CHANNEL_URL}", reply_markup=sub_kb(), parse_mode="HTML")
        return
    await message.answer("<b>🌐 TG SNOS SYSTEM</b>", reply_markup=main_kb(), parse_mode="HTML")

@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    if message.from_user.id != OWNER_ID: return
    total = len(db)
    active = sum(1 for u in db.values() if u.get("active"))
    await message.answer(f"⚙️ <b>АДМИН-ПАНЕЛЬ</b>\n\n👥 Юзеров: {total}\n💎 С сабом: {active}", reply_markup=admin_kb(), parse_mode="HTML")


@dp.message(F.text)
async def handle_text(message: types.Message):
    uid = message.from_user.id
    u = get_u(message.from_user)
    if not await check_sub(uid): return

    state = u.get("state")
    if state == "adm_wait_msg":
        u["state"] = None
        save_db()
        for user_id in db:
            try: await bot.send_message(user_id, f"📢 <b>РАССЫЛКА:</b>\n\n{message.text}", parse_mode="HTML")
            except: pass
        await message.answer("✅ Готово.")
    elif state == "adm_wait_uid_give":
        u["state"] = None
        try:
            tid = int(message.text)
            db[tid].update({"active": True, "sub": "Premium", "dur": "Навсегда"})
            save_db()
            await message.answer("✅ Выдано.")
        except: await message.answer("❌ Ошибка.")
    elif state == "adm_wait_uid_take":
        u["state"] = None
        try:
            tid = int(message.text)
            db[tid].update({"active": False, "sub": "Нет", "dur": ""})
            save_db()
            await message.answer("➖ Снято.")
        except: await message.answer("❌ Ошибка.")
    elif state in ["wait_target_user", "wait_target_id"]:
        target = message.text
        u["state"] = None
        u["last_run"] = time.time()
        save_db()
        m = await message.answer("🚀 Запуск...")
        await asyncio.sleep(2)
        await m.edit_text(f"✅ <b>{target}</b> обработан!")

@dp.callback_query()
async def callbacks_handler(call: types.CallbackQuery):
    u = get_u(call.from_user)
    
    if call.data == "check_subscription":
        if await check_sub(call.from_user.id):
            await call.message.edit_text("<b>🌐 TG SNOS SYSTEM</b>", reply_markup=main_kb(), parse_mode="HTML")
        else:
            await call.answer("❌ Нет подписки!", show_alert=True)
        return

    if not await check_sub(call.from_user.id): return

    # ЛОГИКА ПАГИНАЦИИ С РАЗНЫМИ ЛИМИТАМИ
    if call.data.startswith("adm_list_"):
        if call.from_user.id != OWNER_ID: return
        parts = call.data.split("_")
        list_type = parts[2]
        page = int(parts[3])
        
        if list_type == "active":
            filtered = [(k, v) for k, v in db.items() if v['active']]
            items_per_page = 20  # Лимит 20 для сабов
            title = "💎 С ПОДПИСКОЙ"
        else:
            filtered = [(k, v) for k, v in db.items() if not v['active']]
            items_per_page = 100 # Лимит 100 для обычных
            title = "👤 БЕЗ ПОДПИСКИ"
        
        start_idx = page * items_per_page
        end_idx = start_idx + items_per_page
        current_list = filtered[start_idx:end_idx]
        
        text = f"<b>{title}</b>\n Стр. {page + 1} | Всего: {len(filtered)}\n\n"
        
        if not current_list:
            text += "Тут пусто."
        else:
            for i, (uid, data) in enumerate(current_list, start=start_idx + 1):
                text += f"{i}. <code>{uid}</code> | {data.get('username')}\n"
        
        nav_btns = []
        if page > 0:
            nav_btns.append(InlineKeyboardButton(text="⬅️ Назад", callback_data=f"adm_list_{list_type}_{page-1}"))
        if end_idx < len(filtered):
            nav_btns.append(InlineKeyboardButton(text="Вперед ➡️", callback_data=f"adm_list_{list_type}_{page+1}"))
        
        kb = [nav_btns] if nav_btns else []
        kb.append([InlineKeyboardButton(text="⬅️ В админку", callback_data="adm_back")])
        
        await call.message.edit_text(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), parse_mode="HTML")

    elif call.data == "adm_back":
        total = len(db)
        active = sum(1 for u in db.values() if u.get("active"))
        await call.message.edit_text(f"⚙️ <b>АДМИН-ПАНЕЛЬ</b>\n\n👥 Юзеров: {total}\n💎 С сабом: {active}", reply_markup=admin_kb(), parse_mode="HTML")


    elif call.data == "m_home":
        await call.message.edit_text("<b>🌐 TG SNOS SYSTEM</b>", reply_markup=main_kb(), parse_mode="HTML")
    elif call.data == "m_profile":
        stat = f"✅ {u['sub']}" if u["active"] else "❌ Нет"
        await call.message.edit_text(f"<b>👤 ПРОФИЛЬ</b>\n🆔 ID: <code>{call.from_user.id}</code>\n🎫 Саб: {stat}", reply_markup=main_kb(), parse_mode="HTML")
    elif call.data == "m_run":
        if not u["active"]:
            await call.answer("⚠️ Нужна подписка!", show_alert=True)
            return
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="👤 Юзернейм", callback_data="run_type_user"), InlineKeyboardButton(text="🆔 ID", callback_data="run_type_id")],[InlineKeyboardButton(text="⬅️ Назад", callback_data="m_home")]])
        await call.message.edit_text("🎯 Тип цели:", reply_markup=kb, parse_mode="HTML")
    elif call.data.startswith("run_type_"):
        u["state"] = f"wait_target_{call.data.split('_')[2]}"
        save_db()
        await call.message.edit_text("📝 Введите данные:")
    elif call.data == "m_shop":
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🛒 Base", callback_data="sh_t_Base"), InlineKeyboardButton(text="💎 Premium", callback_data="sh_t_Premium")],[InlineKeyboardButton(text="⬅️ Назад", callback_data="m_home")]])
        await call.message.edit_text("<b>💰 МАГАЗИН</b>", reply_markup=kb, parse_mode="HTML")
    elif call.data.startswith("sh_t_"):
        tier = call.data.split("_")[2]
        btns = [[InlineKeyboardButton(text=f"{d} — {p}", callback_data=f"pay_{tier}_{d}")] for d, p in PRICES[tier].items()]
        btns.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="m_shop")])
        await call.message.edit_text(f"💳 Тариф {tier}:", reply_markup=InlineKeyboardMarkup(inline_keyboard=btns))
    elif call.data.startswith("pay_"):
        parts = call.data.split("_")
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Оплатил", callback_data=f"req_{parts[1]}_{parts[2]}")], [InlineKeyboardButton(text="❌ Отмена", callback_data="m_shop")]])
        await call.message.edit_text(f"💳 ОПЛАТА\nКарта: <code>{PAY_REQUISITES}</code>", reply_markup=kb, parse_mode="HTML")
    elif call.data.startswith("req_"):
        parts = call.data.split("_")
        await call.message.edit_text("✅ Отправлено!")
        akb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ ОК", callback_data=f"confirm_y_{call.from_user.id}_{parts[1]}_{parts[2]}")],[InlineKeyboardButton(text="❌ NO", callback_data=f"confirm_n_{call.from_user.id}")]])
        await bot.send_message(OWNER_ID, f"💰 ОПЛАТА от {call.from_user.id}", reply_markup=akb)
    elif call.data.startswith("confirm_y_"):
        if call.from_user.id != OWNER_ID: return
        p = call.data.split("_")
        db[int(p[2])].update({"active": True, "sub": p[3], "dur": p[4]})
        save_db()
        await call.message.edit_text("✅ Принято.")
        try: await bot.send_message(int(p[2]), "🎁 Подписка активна!")
        except: pass
    elif call.data.startswith("confirm_n_"):
        if call.from_user.id != OWNER_ID: return
        uid = call.data.split("_")[2]
        await call.message.edit_text("❌ Отклонено.")
        try: await bot.send_message(int(uid), "❌ Заявка отклонена.")
        except: pass
    elif call.data.startswith("adm_"):
        if call.from_user.id != OWNER_ID: return
        action = call.data.split("_")[1]
        if action == "broadcast": u["state"] = "adm_wait_msg"
        elif action == "give": u["state"] = "adm_wait_uid_give"
        elif action == "take": u["state"] = "adm_wait_uid_take"
        save_db()
        await call.message.answer("📝 Введите данные:")
    elif call.data == "m_help":
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="👨‍💻 Support", url=SUPPORT_URL)],[InlineKeyboardButton(text="⬅️ Назад", callback_data="m_home")]])
        await call.message.edit_text(f"🆘 Support: {SUPPORT_USERNAME}", reply_markup=kb)

async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())


