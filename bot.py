import json
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes

BOT_TOKEN = "8651918666:AAEOrDzbFZPDKbG3I4lmKAfMTosFIh9bXRM"
SELLER_CHAT_ID = 123456789  # Replace with Seller's Telegram Chat ID
WEB_APP_URL = "https://shakhjahan08.github.io/telegram-mini-app/"
"  # HTTPS static web app host

# In-memory database to manage orders
orders_db = {}
order_counter = 1000

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Sends a message with a button to open the Telegram Mini App"""
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="🛒 Open Store Front",
            web_app=WebAppInfo(url=WEB_APP_URL)
        )]
    ])
    await update.message.reply_text(
        "Welcome! Click the button below to browse our storefront and place an order:",
        reply_markup=keyboard
    )

async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Receives order payload sent from tg.sendData() inside the webapp"""
    global order_counter
    buyer = update.message.from_user
    
    # Parse payload sent from JavaScript
    raw_json = update.message.web_app_data.data
    order_data = json.loads(raw_json)
    
    order_id = f"ORD-{order_counter}"
    order_counter += 1

    orders_db[order_id] = {
        "buyer_id": buyer.id,
        "buyer_name": buyer.full_name,
        "items": order_data["items"],
        "total": order_data["totalAmount"],
        "status": "Pending"
    }

    # 1. Format order summary for Buyer
    item_summary = "\n".join([f"• {i['name']} x{i['quantity']} (${i['price']})" for i in order_data["items"]])
    
    await update.message.reply_text(
        f"✅ **Order Placed Successfully!**\n\n"
        f"🆔 **Order ID:** {order_id}\n"
        f"📦 **Items:**\n{item_summary}\n\n"
        f"💰 **Total:** ${order_data['totalAmount']}\n"
        f"Status: *Pending confirmation from seller*",
        parse_mode="Markdown"
    )

    # 2. Dispatch detailed order to Seller dashboard
    seller_keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🚚 Accept & Ship", callback_data=f"ship_{order_id}"),
            InlineKeyboardButton("❌ Reject Order", callback_data=f"reject_{order_id}")
        ]
    ])

    seller_msg = (
        f"🔔 **NEW MULTI-ITEM ORDER RECEIVED!**\n\n"
        f"🆔 **Order ID:** {order_id}\n"
        f"👤 **Customer:** {buyer.full_name} (@{buyer.username or 'N/A'})\n\n"
        f"📦 **Order Items:**\n{item_summary}\n\n"
        f"💵 **Total Amount:** ${order_data['totalAmount']}"
    )

    await context.bot.send_message(
        chat_id=SELLER_CHAT_ID,
        text=seller_msg,
        reply_markup=seller_keyboard,
        parse_mode="Markdown"
    )

async def handle_seller_actions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Processes seller status toggles from inline buttons"""
    query = update.callback_query
    await query.answer()

    action, order_id = query.data.split("_")
    order = orders_db.get(order_id)

    if not order:
        await query.edit_message_text("Order record not found.")
        return

    if action == "ship":
        order["status"] = "Shipped"
        seller_status = f"✅ Order **{order_id}** marked as SHIPPED."
        buyer_status = f"🚚 Update on order **{order_id}**: Your items have been shipped!"
    else:
        order["status"] = "Rejected"
        seller_status = f"❌ Order **{order_id}** REJECTED."
        buyer_status = f"⚠️ Update on order **{order_id}**: Order was declined by the merchant."

    await query.edit_message_text(text=seller_status, parse_mode="Markdown")
    
    # Send status update back to the customer
    await context.bot.send_message(
        chat_id=order["buyer_id"],
        text=buyer_status,
        parse_mode="Markdown"
    )

if __name__ == "__main__":
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    # Handles data sent via tg.sendData()
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    app.add_handler(CallbackQueryHandler(handle_seller_actions, pattern="^(ship|reject)_"))

    print("Bot is listening...")
    app.run_polling()
