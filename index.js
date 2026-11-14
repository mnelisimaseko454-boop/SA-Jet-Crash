const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const app = express();
app.use(express.json());

const TOKEN = process.env.BOT_TOKEN;
console.log('STARTING SA JET CRASH...');
console.log('BOT_TOKEN exists:', !!TOKEN);

const bot = new TelegramBot(TOKEN, { polling: true });
bot.on('polling_error', (e) => console.log('POLLING ERROR:', e.message));

let users = {};
let leaderboard = {};

let game = {
  phase: 'waiting',
  crashPoint: 0,
  multiplier: 1.00,
  roundId: 0,
  bets: {},
  messageId: null,
  chatId: null,
  timer: null,
  roundHistory: []
};

function getUser(id, name) {
  if (!users[id]) {
    users[id] = { coins: 1000, name: name || 'Player', totalWon: 0, games: 0, lastDaily: 0 };
  }
  return users[id];
}

function getCrashPoint() {
  const r = Math.random();
  let crash = 0.97 / (1 - r);
  crash = Math.min(crash, 100);
  crash = Math.max(crash, 1.00);
  return Math.floor(crash * 100) / 100;
}

function formatCoins(n) { return Math.floor(n).toLocaleString('en-ZA'); }

function mainKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✈️ PLAY JET', callback_data: 'play' }],
        [{ text: '💰 Bet 10', callback_data: 'bet_10' }, { text: '💰 Bet 50', callback_data: 'bet_50' }, { text: '💰 Bet 100', callback_data: 'bet_100' }],
        [{ text: '💰 Bet 500', callback_data: 'bet_500' }, { text: '💰 Bet 1000', callback_data: 'bet_1000' }],
        [{ text: '💸 CASH OUT NOW!', callback_data: 'cashout' }],
        [{ text: '🎁 FREE 1000 Daily Coins', callback_data: 'daily' }],
        [{ text: '🏆 Leaderboard', callback_data: 'leaderboard' }],
        [{ text: '📊 My Balance', callback_data: 'balance' }],
        [{ text: '🪙 Buy 5000 Coins — 50 ⭐', callback_data: 'buy_coins_5000' }],
        [{ text: '🪙 Buy 20000 Coins — 150 ⭐', callback_data: 'buy_coins_20000' }],
        [{ text: '📖 How To Play', callback_data: 'how' }],
      ]
    }
  };
}

function jetVisual(multiplier) {
  const bars = Math.min(Math.floor(multiplier), 10);
  const trail = '—'.repeat(bars);
  if (multiplier < 2) return `✈️${trail} ${multiplier.toFixed(2)}x`;
  if (multiplier < 5) return `✈️${trail} 🔥 ${multiplier.toFixed(2)}x`;
  return `✈️${trail} 🚀🔥 ${multiplier.toFixed(2)}x`;
}

async function startRound(chatId) {
  if (game.phase === 'betting' || game.phase === 'flying') return;
  game.roundId++;
  game.phase = 'betting';
  game.bets = {};
  game.multiplier = 1.00;
  game.crashPoint = getCrashPoint();
  console.log(`Round ${game.roundId} - Crash at ${game.crashPoint}x`);

  let msg = await bot.sendMessage(chatId,
    `✈️ *JET CRASH - ROUND #${game.roundId}*\n\n` +
    `🛫 *BETTING OPEN - 10 SECONDS!*\n\n` +
    `Place your bet below!\nJet will fly soon... cash out before it crashes!\n\n` +
    `Last crashes: ${game.roundHistory.slice(-5).map(c => c.toFixed(2) + 'x').join(' | ') || 'None yet'}\n\n` +
    `_Play money only. Coins have no cash value. 18+_`,
    { parse_mode: 'Markdown', ...mainKeyboard() });
  game.messageId = msg.message_id;
  game.chatId = chatId;
  setTimeout(() => flyJet(chatId), 10000);
}

async function flyJet(chatId) {
  game.phase = 'flying';
  game.multiplier = 1.00;
  game.timer = setInterval(async () => {
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
        `✈️ *JET IS FLYING!*\n\n` +
        `${jetVisual(game.multiplier)}\n\n` +
        `*Multiplier: ${game.multiplier.toFixed(2)}x*\n` +
        `Players in: ${betCount}\n\n` +
        `Tap CASH OUT NOW before it crashes! 💸`,
        { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() }
      );
    } catch (e) {}
  }, 400);
}

async function crashJet(chatId) {
  game.phase = 'crashed';
  game.roundHistory.push(game.crashPoint);
  if (game.roundHistory.length > 10) game.roundHistory.shift();
  let losers = 0;
  for (const [uid, bet] of Object.entries(game.bets)) {
    if (bet.cashedOut) continue;
    losers++;
    const u = users[uid];
    if (u) u.games++;
  }
  let winnersList = [];
  for (const [uid, bet] of Object.entries(game.bets)) {
    if (bet.cashedOut) {
      const u = users[uid];
      winnersList.push(`${u ? u.name : 'Player'} won ${formatCoins(bet.win)} @ ${bet.cashoutAt.toFixed(2)}x`);
    }
  }
  try {
    await bot.editMessageText(
      `💥 *CRASHED!*\n\n` +
      `✈️💥 Jet crashed at *${game.crashPoint.toFixed(2)}x*\n\n` +
      `${winnersList.length > 0 ? '🏆 *Winners:*\n' + winnersList.join('\n') + '\n\n' : ''}` +
      `${losers > 0 ? `💔 ${losers} players didn't cash out in time.\n\n` : ''}` +
      `Next round in 5 seconds... Get ready! ✈️\n\n` +
      `_Play money only. Coins have no cash value._`,
      { chat_id: chatId, message_id: game.messageId, parse_mode: 'Markdown', ...mainKeyboard() }
    );
  } catch (e) {}
  setTimeout(() => { if (game.chatId) startRound(game.chatId); }, 5000);
}

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const user = getUser(id, msg.from.first_name);
  bot.sendMessage(id,
    `✈️ *WELCOME TO SA JET CRASH*\n\n` +
    `The jet flies, multiplier goes UP... cash out before it CRASHES! 💥\n\n` +
    `*Your Balance:* ${formatCoins(user.coins)} coins\n\n` +
    `*HOW TO PLAY:*\n` +
    `1️⃣ Tap PLAY JET\n` +
    `2️⃣ Bet coins (10 - 1000)\n` +
    `3️⃣ Jet flies 1.00x → 2x → 10x → 100x\n` +
    `4️⃣ Tap CASH OUT before crash = You win bet x multiplier\n` +
    `5️⃣ Don't cash out = You lose bet\n\n` +
    `*FREE:* 1000 coins daily + 1000 to start!\n\n` +
    `_Play money only. Coins have NO cash value, cannot be withdrawn. For fun only. 18+_`,
    { parse_mode: 'Markdown', ...mainKeyboard() });
});

bot.onText(/\/play/, (msg) => {
  const id = msg.chat.id;
  getUser(id, msg.from.first_name);
  if (game.phase === 'waiting') startRound(id);
  else bot.sendMessage(id, `✈️ Game is already running! Multiplier: ${game.multiplier.toFixed(2)}x — Phase: ${game.phase}`, mainKeyboard());
});

bot.on('callback_query', async (q) => {
  const id = q.message.chat.id;
  const user = getUser(id, q.from.first_name);
  const data = q.data;
  bot.answerCallbackQuery(q.id).catch(() => {});

  if (data === 'play') {
    if (game.phase === 'waiting') startRound(id);
    else bot.sendMessage(id, `✈️ Game running! Current: ${game.multiplier.toFixed(2)}x — ${game.phase}. Place a bet for next round or cash out!`, mainKeyboard());
    return;
  }
  if (data === 'how') {
    bot.sendMessage(id, `📖 *HOW TO PLAY JET CRASH*\n\n✈️ Jet takes off at 1.00x\n📈 Multiplier rises every second\n💸 Tap CASH OUT anytime to lock your win\n💥 If jet crashes before you cash out, you lose your bet\n\n*Example:*\nBet 100 coins, cash out at 2.50x = Win 250 coins (150 profit)\nBet 100 coins, jet crashes at 1.80x before you cash out = Lose 100\n\n_Play money only. No real money. 18+_`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'daily') {
    const now = Date.now();
    if (now - user.lastDaily < 24 * 60 * 60 * 1000 && user.lastDaily !== 0) {
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - (now - user.lastDaily)) / (60 * 60 * 1000));
      bot.sendMessage(id, `🎁 You already claimed today. Come back in ${hoursLeft}h. Balance: ${formatCoins(user.coins)}`, mainKeyboard());
      return;
    }
    user.lastDaily = now;
    user.coins += 1000;
    bot.sendMessage(id, `🎁 *+1000 FREE COINS!*\n\nNew Balance: ${formatCoins(user.coins)} coins\n\nGood luck! ✈️`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'balance') {
    bot.sendMessage(id, `💰 *YOUR BALANCE*\n\nCoins: ${formatCoins(user.coins)}\nTotal Won: ${formatCoins(user.totalWon)}\nGames Played: ${user.games}\n\n${user.coins < 10 ? '⚠️ Low on coins! Claim FREE daily 1000.' : 'Ready to fly? ✈️'}`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'leaderboard') {
    let sorted = Object.entries(users).sort((a, b) => b[1].totalWon - a[1].totalWon).slice(0, 10);
    let text = `🏆 *LEADERBOARD - TOP WINNERS*\n\n`;
    if (sorted.length === 0) text += 'No players yet. Be the first!';
    sorted.forEach(([uid, u], i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} ${u.name} — ${formatCoins(u.totalWon)} won | ${formatCoins(u.coins)} coins\n`;
    });
    text += `\n_Last crashes: ${game.roundHistory.slice(-5).map(c => c.toFixed(2) + 'x').join(' | ')}_`;
    bot.sendMessage(id, text, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data.startsWith('bet_')) {
    const amount = parseInt(data.replace('bet_', ''));
    if (game.phase !== 'betting') { bot.sendMessage(id, `⏳ Betting closed! Jet is ${game.phase}. Wait for next round.`, mainKeyboard()); return; }
    if (game.bets[id]) { bot.sendMessage(id, `You already bet ${formatCoins(game.bets[id].amount)} this round.`, mainKeyboard()); return; }
    if (user.coins < amount) { bot.sendMessage(id, `❌ Not enough coins! Balance: ${formatCoins(user.coins)}. Claim FREE daily coins.`, mainKeyboard()); return; }
    user.coins -= amount;
    game.bets[id] = { amount, cashedOut: false, cashoutAt: 0, win: 0 };
    bot.sendMessage(id, `✅ *Bet Placed: ${formatCoins(amount)} coins*\n\nBalance left: ${formatCoins(user.coins)}\nJet takes off soon... Get ready to CASH OUT! ✈️`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'cashout') {
    if (game.phase !== 'flying') { bot.sendMessage(id, `⏳ Jet is not flying right now. Phase: ${game.phase}.`, mainKeyboard()); return; }
    const bet = game.bets[id];
    if (!bet) { bot.sendMessage(id, `❌ You didn't bet this round! Bet in next round.`, mainKeyboard()); return; }
    if (bet.cashedOut) { bot.sendMessage(id, `✅ You already cashed out at ${bet.cashoutAt.toFixed(2)}x for ${formatCoins(bet.win)} coins!`, mainKeyboard()); return; }
    const win = Math.floor(bet.amount * game.multiplier);
    bet.cashedOut = true;
    bet.cashoutAt = game.multiplier;
    bet.win = win;
    user.coins += win;
    user.totalWon += win;
    user.games++;
    leaderboard[id] = (leaderboard[id] || 0) + win;
    bot.sendMessage(id, `💸 *CASHED OUT!*\n\nAt: *${game.multiplier.toFixed(2)}x*\nBet: ${formatCoins(bet.amount)}\nWon: *${formatCoins(win)} coins* 🎉\nProfit: +${formatCoins(win - bet.amount)}\nNew Balance: ${formatCoins(user.coins)}\n\n_Play money only. No cash value._`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
  if (data === 'buy_coins_5000') {
    bot.sendInvoice(id, '5000 Jet Coins', '5000 play coins for Jet Crash. Coins have no cash value, cannot be withdrawn.', `jet_${Date.now()}`, '', 'XTR', [{ label: '5000 Coins', amount: 50 }]);
    return;
  }
  if (data === 'buy_coins_20000') {
    bot.sendInvoice(id, '20000 Jet Coins', '20000 play coins for Jet Crash. Coins have no cash value, cannot be withdrawn.', `jet_${Date.now()}`, '', 'XTR', [{ label: '20000 Coins', amount: 150 }]);
    return;
  }
});

bot.on('pre_checkout_query', (q) => bot.answerPreCheckoutQuery(q.id, true));

bot.on('message', async (msg) => {
  if (!msg.text) return;
  const id = msg.chat.id;
  if (msg.successful_payment) {
    const user = getUser(id, msg.from.first_name);
    const stars = msg.successful_payment.total_amount;
    let coins = 5000;
    if (stars >= 150) coins = 20000;
    user.coins += coins;
    bot.sendMessage(id, `🪙 *+${formatCoins(coins)} COINS ADDED!*\n\nNew Balance: ${formatCoins(user.coins)}\n\nGood luck! ✈️\n\n_Play money only. Coins have no cash value._`, { parse_mode: 'Markdown', ...mainKeyboard() });
    return;
  }
});

setInterval(() => {
  if (game.phase === 'waiting' && game.chatId) startRound(game.chatId);
}, 30000);

app.get('/', (req, res) => res.send('JET CRASH AWAKE - PLAY MONEY'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Jet running on ' + PORT));
