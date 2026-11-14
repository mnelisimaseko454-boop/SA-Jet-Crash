const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.BOT_TOKEN;
console.log('STARTING SA JET CRASH - BOT + MINI APP...');
const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', (e) => console.log('POLLING ERROR:', e.message));

// ============================================
// STATE - WITH PAUSE + STOP
// ============================================
let users = {};
let game = {
  phase: 'waiting', // waiting | betting | flying | crashed | paused
  paused: false, // <-- PAUSE SWITCH
  crashPoint: 0,
  multiplier: 1.00,
  roundId: 0,
  bets: {},
  messageId: null,
  chatId: null,
  timer: null,
  roundHistory: [1.00, 8.23, 1.44, 8.21, 1.30, 1.14, 4.35],
  autoPlay: true, // if false, bot stops sending rounds
};

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

// Keyboard with PAUSE / STOP / MINI APP
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
        [{ text: '🎁 FREE 1000 Coins', callback_data: 'daily' }, { text: '🏆 Leaderboard', callback_data: 'leaderboard' }],
        [{ text: '📊 Balance', callback_data: 'balance' }, { text: '📖 How To Play', callback_data: 'how' }],
        [{ text: '🪙 Buy 5000 Coins — 50 ⭐', callback_data: 'buy_coins_5000' }],
      ]
    }
  };
}

function jetVisual(m) {
  const bars = Math.min(Math.floor(m), 10);
  return `✈️${'—'.repeat(bars)} ${m.toFixed(2)}x`;
}

// ============================================
// GAME ENGINE - RESPECTS PAUSE
// ============================================
async function startRound(chatId) {
  if (game.paused) { console.log('Game PAUSED - not starting'); return; }
  if (!game.autoPlay) { console.log('AutoPlay OFF - not starting'); return; }
  if (game.phase === 'betting' || game.phase === 'flying') return;
  const user = users[chatId];
  if (user && user.muted) { console.log('User muted - not starting'); return; }

  game.roundId++;
  game.phase = 'betting';
  game.bets = {};
  game.multiplier = 1.00;
  game.crashPoint = getCrashPoint();
  console.log(`Round ${game.roundId} - Crash ${game.crashPoint}x`);

  try {
    let msg = await bot.sendMessage(chatId,
      `✈️ *JET CRASH - ROUND #${game.roundId}*\n\n` +
      `🛫 *BETTING OPEN - 10 SECONDS!*\n\n` +
      `Last: ${game.roundHistory.slice(-5).map(c => c.toFixed(2) + 'x').join(' | ')}\n\n` +
      `_Play money only. No cash value. 18+_`,
      { parse_mode: 'Markdown', ...mainKeyboard() });
    game.messageId = msg.message_id;
    game.chatId = chatId;
    setTimeout(() => { if (!game.paused) flyJet(chatId); }, 10000);
  } catch (e) { console.log('Send failed', e.message); }
}

async function flyJet(chatId) {
  if (game.paused) return;
  game.phase = 'flying';
  game.multiplier = 1.00;
  game.timer = setInterval(async () => {
    if (game.paused) { clearInterval(game.timer); return; }
    game.multiplier += 0.08 + (game.multiplier * 0.02);
    game.multiplier = Math.floor(game.multiplier * 100) / 100;
    if (game.multiplier >= game.crashPoint) {
      clearInterval(game.timer);
      await crashJet(chatId);
      return;
    }
    try {
      const betCount = Object.keys(game.bets).length;
      await bot.editMessageText(
        `✈️ *JET IS FLYING!*\n\n${jetVisual(game.multiplier)}\n\n*${game.multiplier.toFixed(2)}x* | Players: ${betCount}\n\nTap 🛑 CASH OUT / STOP JET before crash!`,
        { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() }
      );
    } catch (e) {}
  }, 400);
}

async function crashJet(chatId) {
  game.phase = 'crashed';
  game.roundHistory.push(game.crashPoint);
  if (game.roundHistory.length > 12) game.roundHistory.shift();
  let losers = 0;
  for (const [uid, bet] of Object.entries(game.bets)) {
    if (bet.cashedOut) continue;
    losers++;
    if (users[uid]) users[uid].games++;
  }
  let winnersList = [];
  for (const [uid, bet] of Object.entries(game.bets)) {
    if (bet.cashedOut) winnersList.push(`${users[uid]?.name || 'Player'} won ${formatCoins(bet.win)} @ ${bet.cashoutAt.toFixed(2)}x`);
  }
  const user = users[chatId];
  // DON'T auto-start if paused / muted / autoplay off
  const shouldContinue = !game.paused && game.autoPlay && !(user && user.muted);
  try {
    await bot.editMessageText(
      `💥 *CRASHED at ${game.crashPoint.toFixed(2)}x*\n\n` +
      `${winnersList.length ? '🏆 Winners:\n' + winnersList.join('\n') + '\n\n' : ''}` +
      `${losers ? `💔 ${losers} didn't cash out.\n\n` : ''}` +
      `${shouldContinue ? 'Next round in 5 sec... ✈️' : '⏸️ Game PAUSED / STOPPED. Tap ▶️ RESUME to continue.'}\n\n` +
      `_Play money only._`,
      { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() }
    );
  } catch (e) {}
  if (shouldContinue) setTimeout(() => { if (game.chatId) startRound(game.chatId); }, 5000);
}

// API for Mini App - so Mini App and Bot share same balance/history
app.get('/api/state', (req, res) => {
  res.json({ history: game.roundHistory, roundId: game.roundId, phase: game.phase, paused: game.paused });
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ============================================
// BOT HANDLERS
// ============================================
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const user = getUser(id, msg.from.first_name);
  user.muted = false; // unmute on start
  bot.sendMessage(id,
    `✈️ *WELCOME TO SA JET CRASH*\n\n` +
    `Play in Mini App (like Aviator) OR in Bot.\n\n` +
    `*Balance:* ${formatCoins(user.coins)} coins\n\n` +
    `🛑 *CASH OUT* = Stop jet and take your win\n` +
    `⏸️ *PAUSE* = Stop all rounds & notifications\n` +
    `🔕 *STOP NOTIFICATIONS* = Bot will not DM you\n\n` +
    `_Play money only. No cash value. 18+_`,
    { parse_mode: 'Markdown', ...mainKeyboard() });
});

bot.onText(/\/stop/, (msg) => {
  const id = msg.chat.id;
  const user = getUser(id, msg.from.first_name);
  user.muted = true; game.autoPlay = false; game.paused = true;
  if (game.timer) clearInterval(game.timer);
  bot.sendMessage(id, `🔕 *STOPPED!*\n\nBot will NOT send you any more rounds.\n\nTap ▶️ RESUME or /start to start again.`, { parse_mode: 'Markdown', ...mainKeyboard() });
});

bot.onText(/\/pause/, (msg) => {
  game.paused = true; if (game.timer) clearInterval(game.timer);
  bot.sendMessage(msg.chat.id, `⏸️ *GAME PAUSED*\n\nJet stopped. No more rounds.\nTap ▶️ RESUME to continue.`, { parse_mode: 'Markdown', ...mainKeyboard() });
});

bot.onText(/\/play/, (msg) => {
  const id = msg.chat.id;
  getUser(id, msg.from.first_name);
  game.paused = false; game.autoPlay = true;
  if (game.phase === 'waiting' || game.phase === 'crashed') startRound(id);
  else bot.sendMessage(id, `✈️ Game running! ${game.multiplier.toFixed(2)}x`, mainKeyboard());
});

bot.on('callback_query', async (q) => {
  const id = q.message.chat.id;
  const user = getUser(id, q.from.first_name);
  const data = q.data;
  bot.answerCallbackQuery(q.id).catch(() => {});

  // === PAUSE / RESUME ===
  if (data === 'pause') {
    game.paused = !game.paused;
    if (game.paused && game.timer) clearInterval(game.timer);
    bot.sendMessage(id, game.paused ? `⏸️ *PAUSED*\n\nAll rounds stopped. Tap ▶️ RESUME to continue.` : `▶️ *RESUMED!*\n\nGame will continue.`, { parse_mode: 'Markdown', ...mainKeyboard() });
    if (!game.paused && game.chatId) startRound(id);
    return;
  }
  // === STOP NOTIFICATIONS ===
  if (data === 'stop_notif') {
    user.muted = true; game.autoPlay = false; game.paused = true;
    if (game.timer) clearInterval(game.timer);
    bot.sendMessage(id, `🔕 *NOTIFICATIONS OFF*\n\nYou will NOT get any more round messages.\n\nTap 🔔 START NOTIFICATIONS or /start to turn back on.`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'start_notif') {
    user.muted = false; game.autoPlay = true; game.paused = false;
    bot.sendMessage(id, `🔔 *NOTIFICATIONS ON*\n\nRounds will start again.`, { parse_mode: 'Markdown', ...mainKeyboard() });
    startRound(id);
    return;
  }

  if (data === 'play') {
    game.paused = false; game.autoPlay = false; // Play in bot = single session, not spam
    user.muted = false;
    if (game.phase === 'waiting' || game.phase === 'crashed') startRound(id);
    else bot.sendMessage(id, `✈️ Game running! ${game.multiplier.toFixed(2)}x`, mainKeyboard());
    return;
  }
  if (data === 'how') { bot.sendMessage(id, `📖 *HOW TO PLAY*\n\n✈️ Jet flies 1.00x → 100x\n💸 Tap 🛑 CASH OUT to take win\n💥 Crash before cash out = Lose bet\n⏸️ PAUSE = Stop game\n🔕 STOP = Stop notifications\n\n_Play money only. 18+_`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  if (data === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 24*60*60*1000 && user.lastDaily!==0) { bot.sendMessage(id, `🎁 Already claimed. Balance: ${formatCoins(user.coins)}`, mainKeyboard()); return; }
    user.lastDaily = now; user.coins += 1000;
    bot.sendMessage(id, `🎁 *+1000 COINS!* Balance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  if (data === 'balance') { bot.sendMessage(id, `💰 Balance: ${formatCoins(user.coins)} | Won: ${formatCoins(user.totalWon)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return; }
  if (data === 'leaderboard') {
    let sorted = Object.entries(users).sort((a,b)=>b[1].totalWon-a[1].totalWon).slice(0,10);
    let text = `🏆 *LEADERBOARD*\n\n`;
    sorted.forEach(([uid,u],i)=>{ text += `${i+1}. ${u.name} — ${formatCoins(u.totalWon)} won\n`; });
    bot.sendMessage(id, text || 'No players yet', { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  if (data.startsWith('bet_')) {
    const amount = parseInt(data.replace('bet_',''));
    if (game.phase !== 'betting') { bot.sendMessage(id, `⏳ Betting closed! Phase: ${game.phase}`, mainKeyboard()); return; }
    if (game.bets[id]) { bot.sendMessage(id, `Already bet ${formatCoins(game.bets[id].amount)}`, mainKeyboard()); return; }
    if (user.coins < amount) { bot.sendMessage(id, `❌ Not enough coins! Balance: ${formatCoins(user.coins)}`, mainKeyboard()); return; }
    user.coins -= amount; game.bets[id] = { amount, cashedOut:false, cashoutAt:0, win:0 };
    bot.sendMessage(id, `✅ *Bet ${formatCoins(amount)}* Balance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() }); return;
  }
  // === CASH OUT / STOP JET ===
  if (data === 'cashout') {
    if (game.phase !== 'flying') { bot.sendMessage(id, `⏳ Jet not flying. Phase: ${game.phase}. Tap PLAY to start.`, mainKeyboard()); return; }
    const bet = game.bets[id];
    if (!bet) { bot.sendMessage(id, `❌ You didn't bet this round!`, mainKeyboard()); return; }
    if (bet.cashedOut) { bot.sendMessage(id, `✅ Already cashed out at ${bet.cashoutAt.toFixed(2)}x`, mainKeyboard()); return; }
    const win = Math.floor(bet.amount * game.multiplier);
    bet.cashedOut = true; bet.cashoutAt = game.multiplier; bet.win = win;
    user.coins += win; user.totalWon += win; user.games++;
    bot.sendMessage(id, `🛑💸 *CASHED OUT / STOPPED JET!*\n\nAt: *${game.multiplier.toFixed(2)}x*\nBet: ${formatCoins(bet.amount)}\nWon: *${formatCoins(win)}* 🎉\nBalance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'buy_coins_5000') { bot.sendInvoice(id, '5000 Jet Coins', '5000 play coins. No cash value.', `jet_${Date.now()}`, '', 'XTR', [{ label: '5000 Coins', amount: 50 }]); return; }
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));
bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    const user = getUser(msg.chat.id, msg.from.first_name);
    user.coins += 5000;
    bot.sendMessage(msg.chat.id, `🪙 *+5000 COINS!* Balance: ${formatCoins(user.coins)}`, { parse_mode: 'Markdown', ...mainKeyboard() });
  }
});

// Auto-loop - but RESPECTS pause/mute
setInterval(() => {
  if (game.phase === 'waiting' && game.chatId && !game.paused && game.autoPlay && !users[game.chatId]?.muted) startRound(game.chatId);
}, 30000);

app.get('/', (req, res) => res.send('JET CRASH - BOT + MINI APP AWAKE'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
