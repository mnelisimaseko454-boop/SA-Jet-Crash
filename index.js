const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.BOT_TOKEN;
console.log('STARTING SA JET CRASH - FINAL...');
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', (e) => console.log('POLLING ERROR:', e.message));

let users = {};
let game = { phase: 'waiting', paused: false, crashPoint: 0, multiplier: 1.00, roundId: 0, bets: {}, messageId: null, chatId: null, timer: null, roundHistory: [1.00, 8.23, 1.44, 8.21, 1.30, 1.14, 4.35], autoPlay: false };

// === 10 COIN PACKS - STARTING 10 STARS ===
const COIN_PACKS = [
  { stars: 10, coins: 500, label: '500 Coins' },
  { stars: 20, coins: 1200, label: '1,200 Coins' },
  { stars: 30, coins: 2000, label: '2,000 Coins' },
  { stars: 50, coins: 5000, label: '5,000 Coins' },
  { stars: 80, coins: 9000, label: '9,000 Coins' },
  { stars: 100, coins: 12000, label: '12,000 Coins' },
  { stars: 150, coins: 20000, label: '20,000 Coins' },
  { stars: 250, coins: 35000, label: '35,000 Coins' },
  { stars: 500, coins: 75000, label: '75,000 Coins' },
  { stars: 1000, coins: 160000, label: '160,000 Coins' },
];

function getUser(id, name) {
  if (!users[id]) users[id] = { coins: 1000, name: name || 'Player', totalWon: 0, games: 0, lastDaily: 0, muted: false };
  return users[id];
}
function getCrashPoint() {
  const r = Math.random();
  let c = 0.97 / (1 - r);
  return Math.floor(Math.min(Math.max(c, 1.00), 100) * 100) / 100;
}
function formatCoins(n) { return Math.floor(n).toLocaleString('en-ZA'); }

function mainKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✈️ OPEN MINI APP - PLAY LIKE AVIATOR', web_app: { url: process.env.APP_URL || 'https://sa-jet-app.onrender.com' } }],
        [{ text: '✈️ PLAY IN BOT', callback_data: 'play' }],
        [{ text: '💰 Bet 10', callback_data: 'bet_10' }, { text: '💰 Bet 50', callback_data: 'bet_50' }, { text: '💰 Bet 100', callback_data: 'bet_100' }],
        [{ text: '💸 🛑 CASH OUT / STOP JET', callback_data: 'cashout' }],
        [{ text: game.paused ? '▶️ RESUME GAME' : '⏸️ PAUSE GAME', callback_data: 'pause' }],
        [{ text: '🔕 STOP NOTIFICATIONS', callback_data: 'stop_notif' }],
        [{ text: '🔔 START NOTIFICATIONS', callback_data: 'start_notif' }],
        [{ text: '🎁 FREE 1000 Coins (Once Daily)', callback_data: 'daily' }, { text: '🏆 Leaderboard', callback_data: 'leaderboard' }],
        [{ text: '📊 Balance', callback_data: 'balance' }, { text: '📖 How To Play', callback_data: 'how' }],
        [{ text: '🪙 Buy Coins — From 10 ⭐', callback_data: 'buy_coins' }],
      ]
    }
  };
}

function buyCoinsKeyboard() {
  const rows = [];
  for (let i = 0; i < COIN_PACKS.length; i += 2) {
    const a = COIN_PACKS[i];
    const b = COIN_PACKS[i + 1];
    const row = [{ text: `🪙 ${a.label} — ${a.stars} ⭐`, callback_data: `buy_${a.stars}` }];
    if (b) row.push({ text: `🪙 ${b.label} — ${b.stars} ⭐`, callback_data: `buy_${b.stars}` });
    rows.push(row);
  }
  rows.push([{ text: '⬅️ Back', callback_data: 'back_main' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function jetVisual(m) {
  const bars = Math.min(Math.floor(m), 10);
  return `✈️${'—'.repeat(bars)} ${m.toFixed(2)}x`;
}

async function startRound(chatId) {
  if (game.paused || !game.autoPlay) return;
  if (game.phase === 'betting' || game.phase === 'flying') return;
  if (users[chatId]?.muted) return;
  game.roundId++; game.phase = 'betting'; game.bets = {}; game.multiplier = 1.00; game.crashPoint = getCrashPoint();
  try {
    let msg = await bot.sendMessage(chatId, `✈️ *JET CRASH - ROUND #${game.roundId}*\n\n🛫 *BETTING OPEN - 10 SECONDS!*\n\nLast: ${game.roundHistory.slice(-5).map(c => c.toFixed(2) + 'x').join(' | ')}\n\n_Play money only. No cash value. 18+_`, { parse_mode: 'Markdown', ...mainKeyboard() });
    game.messageId = msg.message_id; game.chatId = chatId;
    setTimeout(() => { if (!game.paused) flyJet(chatId); }, 10000);
  } catch (e) {}
}
async function flyJet(chatId) {
  if (game.paused) return;
  game.phase = 'flying'; game.multiplier = 1.00;
  game.timer = setInterval(async () => {
    if (game.paused) { clearInterval(game.timer); return; }
    game.multiplier += 0.08 + (game.multiplier * 0.02);
    game.multiplier = Math.floor(game.multiplier * 100) / 100;
    if (game.multiplier >= game.crashPoint) { clearInterval(game.timer); await crashJet(chatId); return; }
    try {
      await bot.editMessageText(`✈️ *JET IS FLYING!*\n\n${jetVisual(game.multiplier)}\n\n*${game.multiplier.toFixed(2)}x*\n\nTap 🛑 CASH OUT before crash!`, { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() });
    } catch (e) {}
  }, 400);
}
async function crashJet(chatId) {
  game.phase = 'crashed'; game.roundHistory.push(game.crashPoint);
  if (game.roundHistory.length > 12) game.roundHistory.shift();
  let losers = 0; for (const [uid, bet] of Object.entries(game.bets)) { if (!bet.cashedOut) { losers++; if (users[uid]) users[uid].games++; } }
  let winnersList = []; for (const [uid, bet] of Object.entries(game.bets)) { if (bet.cashedOut) winnersList.push(`${users[uid]?.name || 'Player'} won ${formatCoins(bet.win)} @ ${bet.cashoutAt.toFixed(2)}x`); }
  const shouldContinue = !game.paused && game.autoPlay && !users[chatId]?.muted;
  try {
    await bot.editMessageText(`💥 *CRASHED at ${game.crashPoint.toFixed(2)}x*\n\n${winnersList.length ? '🏆 Winners:\n' + winnersList.join('\n') + '\n\n' : ''}${losers ? `💔 ${losers} didn't cash out.\n\n` : ''}${shouldContinue ? 'Next round in 5 sec... ✈️' : '⏸️ PAUSED / STOPPED. Tap ▶️ RESUME.'}\n\n_Play money only._`, { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() });
  } catch (e) {}
  if (shouldContinue) setTimeout(() => { if (game.chatId) startRound(game.chatId); }, 5000);
}

app.get('/api/state', (req, res) => res.json({ history: game.roundHistory, roundId: game.roundId, phase: game.phase, paused: game.paused, packs: COIN_PACKS }));

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id; const user = getUser(id, msg.from.first_name); user.muted = false;
  bot.sendMessage(id, `✈️ *WELCOME TO SA JET CRASH*\n\n*Balance:* ${formatCoins(user.coins)} coins\n\n🤖 Auto Bet + Auto Cashout in Mini App\n🎁 FREE 1000 daily (once a day)\n🪙 Buy coins from 10 ⭐\n🛑 CASH OUT = Stop jet\n⏸️ PAUSE = Stop rounds\n\n_Play money only. No cash value. 18+_`, { parse_mode: 'Markdown', ...mainKeyboard() });
});
bot.onText(/\/stop/, (msg) => {
  const id = msg.chat.id; const user = getUser(id, msg.from.first_name);
  user.muted = true; game.autoPlay = false; game.paused = true; if (game.timer) clearInterval(game.timer);
  bot.sendMessage(id, `🔕 *STOPPED!* No more rounds. Tap ▶️ RESUME or /start.`, { parse_mode: 'Markdown', ...mainKeyboard() });
});
bot.onText(/\/pause/, (msg) => { game.paused = true; if (game.timer) clearInterval(game.timer); bot.sendMessage(msg.chat.id, `⏸️ *PAUSED*`, { parse_mode: 'Markdown', ...mainKeyboard() }); });
bot.onText(/\/play/, (msg) => {
  const id = msg.chat.id; getUser(id, msg.from.first_name); game.paused = false; game.autoPlay = true;
  if (game.phase === 'waiting' || game.phase === 'crashed') startRound(id);
  else bot.sendMessage(id, `✈️ Running! ${game.multiplier.toFixed(2)}x`, mainKeyboard());
});

bot.on('callback_query', async (q) => {
  const id = q.message.chat.id; const user = getUser(id, q.from.first_name); const data = q.data;
  bot.answerCallbackQuery(q.id).catch(() => {});
  if (data === 'back_main') { bot.sendMessage(id, `✈️ *SA JET CRASH*\n\nBalance: ${formatCoins(user.coins)} coins`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  if (data === 'pause') {
    game.paused = !game.paused; if (game.paused && game.timer) clearInterval(game.timer);
    bot.sendMessage(id, game.paused ? `⏸️ *PAUSED*` : `▶️ *RESUMED!*`, { parse_mode: 'Markdown', ...mainKeyboard() });
    if (!game.paused && game.chatId) startRound(id); return;
  }
  if (data === 'stop_notif') { user.muted = true; game.autoPlay = false; game.paused = true; if (game.timer) clearInterval(game.timer); bot.sendMessage(id, `🔕 *NOTIFICATIONS OFF*`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  if (data === 'start_notif') { user.muted = false; game.autoPlay = true; game.paused = false; bot.sendMessage(id, `🔔 *NOTIFICATIONS ON*`, { parse_mode: 'Markdown', ...mainKeyboard() }); startRound(id); return; }
  if (data === 'play') { game.paused = false; game.autoPlay = true; user.muted = false; if (game.phase === 'waiting' || game.phase === 'crashed') startRound(id); else bot.sendMessage(id, `✈️ Running! ${game.multiplier.toFixed(2)}x`, mainKeyboard()); return; }
  if (data === 'how') { bot.sendMessage(id, `📖 *HOW TO PLAY*\n\n✈️ Jet 1.00x → 100x\n🤖 Auto Bet + Auto Cashout in Mini App\n💸 Tap 🛑 CASH OUT\n💥 Crash = Lose bet\n⏸️ PAUSE = Stop\n🎁 FREE 1000 once daily\n\n_Play money only. 18+_`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  // === DAILY - ONCE A DAY ===
  if (data === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 24 * 60 * 60 * 1000 && user.lastDaily !== 0) {
      const left = 24 * 60 * 60 * 1000 - (now - user.lastDaily);
      const h = Math.floor(left / 3600000); const m = Math.floor((left % 3600000) / 60000);
      bot.sendMessage(id, `🎁 Already claimed today! Come back in ${h}h ${m}m. Balance: ${formatCoins(user.coins)}`, mainKeyboard()); return;
    }
    user.lastDaily = now; user.coins += 1000;
    bot.sendMessage(id, `🎁 *+1000 COINS!* Balance: ${formatCoins(user.coins)} — Next claim in 24h`, { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  if (data === 'balance') { bot.sendMessage(id, `💰 Balance: ${formatCoins(user.coins)} | Won: ${formatCoins(user.totalWon)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  if (data === 'leaderboard') {
    let sorted = Object.entries(users).sort((a, b) => b[1].totalWon - a[1].totalWon).slice(0, 10);
    let text = `🏆 *LEADERBOARD*\n\n`; sorted.forEach(([uid, u], i) => { text += `${i + 1}. ${u.name} — ${formatCoins(u.totalWon)} won\n`; });
    bot.sendMessage(id, text || 'No players', { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  // === BUY COINS MENU ===
  if (data === 'buy_coins') {
    let txt = `🪙 *BUY COINS — 10 PACKS*\n\nPlay money only. Coins have NO cash value, cannot be withdrawn.\n\nChoose a pack:`;
    bot.sendMessage(id, txt, { parse_mode: 'Markdown', ...buyCoinsKeyboard() }); return;
  }
  if (data.startsWith('buy_')) {
    const stars = parseInt(data.replace('buy_', ''));
    const pack = COIN_PACKS.find(p => p.stars === stars);
    if (!pack) return;
    bot.sendInvoice(id, `${formatCoins(pack.coins)} Jet Coins`, `${formatCoins(pack.coins)} play coins for Jet Crash. Coins have no cash value, cannot be withdrawn.`, `jet_${pack.stars}_${Date.now()}`, '', 'XTR', [{ label: `${formatCoins(pack.coins)} Coins`, amount: pack.stars }]);
    return;
  }
  if (data.startsWith('bet_')) {
    const amount = parseInt(data.replace('bet_', ''));
    if (game.phase !== 'betting') { bot.sendMessage(id, `⏳ Betting closed! Phase: ${game.phase}`, mainKeyboard()); return; }
    if (game.bets[id]) { bot.sendMessage(id, `Already bet ${formatCoins(game.bets[id].amount)}`, mainKeyboard()); return; }
    if (user.coins < amount) { bot.sendMessage(id, `❌ Not enough coins! Balance: ${formatCoins(user.coins)}`, mainKeyboard()); return; }
    user.coins -= amount; game.bets[id] = { amount, cashedOut: false, cashoutAt: 0, win: 0 };
    bot.sendMessage(id, `✅ *Bet ${formatCoins(amount)}* Balance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  if (data === 'cashout') {
    if (game.phase !== 'flying') { bot.sendMessage(id, `⏳ Jet not flying. Phase: ${game.phase}`, mainKeyboard()); return; }
    const bet = game.bets[id];
    if (!bet) { bot.sendMessage(id, `❌ You didn't bet!`, mainKeyboard()); return; }
    if (bet.cashedOut) { bot.sendMessage(id, `✅ Already cashed out at ${bet.cashoutAt.toFixed(2)}x`, mainKeyboard()); return; }
    const win = Math.floor(bet.amount * game.multiplier);
    bet.cashedOut = true; bet.cashoutAt = game.multiplier; bet.win = win;
    user.coins += win; user.totalWon += win; user.games++;
    bot.sendMessage(id, `🛑💸 *CASHED OUT!* At ${game.multiplier.toFixed(2)}x — Won ${formatCoins(win)} — Balance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));
bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    const user = getUser(msg.chat.id, msg.from.first_name);
    const payload = msg.successful_payment.invoice_payload || '';
    // payload is jet_10_..., jet_20_... etc
    const stars = parseInt(payload.split('_')[1] || '0');
    const pack = COIN_PACKS.find(p => p.stars === stars);
    const coins = pack ? pack.coins : 500;
    user.coins += coins;
    bot.sendMessage(msg.chat.id, `🪙 *+${formatCoins(coins)} COINS!* Balance: ${formatCoins(user.coins)}\n\n_Play money only. No cash value._`, { parse_mode: 'Markdown', ...mainKeyboard() });
  }
});
setInterval(() => { if (game.phase === 'waiting' && game.chatId && !game.paused && game.autoPlay && !users[game.chatId]?.muted) startRound(game.chatId); }, 30000);
app.get('/', (req, res) => res.send('JET CRASH - FINAL AWAKE'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
