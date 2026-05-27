const screens = {
  start: document.querySelector("#screen-start"),
  decks: document.querySelector("#screen-decks"),
  battle: document.querySelector("#screen-battle"),
  final: document.querySelector("#screen-final")
};

const elements = {
  deckGrid: document.querySelector("#deck-grid"),
  hand: document.querySelector("#player-hand"),
  fighterP1: document.querySelector("#fighter-p1"),
  fighterP2: document.querySelector("#fighter-p2"),
  scoreP1: document.querySelector("#score-p1"),
  scoreP2: document.querySelector("#score-p2"),
  battleMode: document.querySelector("#battle-mode"),
  roundTitle: document.querySelector("#round-title"),
  battleMessage: document.querySelector("#battle-message"),
  nextRound: document.querySelector("#next-round"),
  restart: document.querySelector("#restart-match"),
  playAgain: document.querySelector("#play-again"),
  finalTitle: document.querySelector("#final-title"),
  finalMessage: document.querySelector("#final-message"),
  roundHistory: document.querySelector("#round-history"),
  turnInstruction: document.querySelector("#turn-instruction"),
  privacyGate: document.querySelector("#privacy-gate"),
  privacyTitle: document.querySelector("#privacy-title"),
  revealPicker: document.querySelector("#reveal-picker"),
  pickerLabel: document.querySelector("#picker-label"),
  deckLabel: document.querySelector("#deck-label"),
  opponentTitle: document.querySelector("#opponent-title"),
  damageFloat: document.querySelector("#damage-float")
};

const state = {
  cards: [],
  factions: [],
  mode: "cpu",
  decks: { p1: null, p2: null },
  selected: { p1: null, p2: null },
  used: { p1: [], p2: [] },
  score: { p1: 0, p2: 0 },
  round: 1,
  roundStarters: {},
  history: [],
  localStep: "p1Deck",
  currentPicker: "p1",
  pendingGateAction: null,
  roundResolved: false
};

const attributeLabels = {
  ataque: "Poder",
  defesa: "Inteligencia",
  velocidade: "Carisma",
  especial: "Especial"
};

init();

async function init() {
  bindEvents();
  await loadCards();
  renderDecks();
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => chooseMode(button.dataset.mode));
  });

  document.querySelector("#back-to-start").addEventListener("click", () => {
    showScreen("start");
  });

  elements.revealPicker.addEventListener("click", () => {
    elements.privacyGate.hidden = true;
    if (state.pendingGateAction) {
      const action = state.pendingGateAction;
      state.pendingGateAction = null;
      action();
      return;
    }
    renderHandForCurrentPicker();
  });

  document.querySelectorAll("[data-attribute]").forEach((button) => {
    button.addEventListener("click", () => playAttribute(button.dataset.attribute));
  });

  elements.nextRound.addEventListener("click", nextRound);
  elements.restart.addEventListener("click", restartMatch);
  elements.playAgain.addEventListener("click", restartMatch);
}

async function loadCards() {
  try {
    const response = await fetch("/cards.json");
    state.cards = await response.json();
  } catch (error) {
    console.error("Nao foi possivel carregar cards.json. Rode com npm start.", error);
    state.cards = [];
  }

  state.factions = [...new Set(state.cards.map((card) => card.faccao))];
}

function chooseMode(mode) {
  state.mode = mode;

  resetMatchData();
  state.decks.p2 = mode === "cpu" ? randomItem(state.factions) : null;
  state.localStep = "p1Deck";
  elements.turnInstruction.textContent = mode === "cpu" ? "Escolha sua faccao." : "Jogador 1, escolha sua faccao.";
  showScreen("decks");
}

function renderDecks() {
  elements.deckGrid.innerHTML = "";
  state.factions.forEach((faction) => {
    const cards = getDeck(faction);
    const button = document.createElement("button");
    button.className = "deck-card";
    button.innerHTML = `<strong>${faction}</strong><span>${cards.length} cartas prontas</span>`;
    button.addEventListener("click", () => selectDeck(faction));
    elements.deckGrid.appendChild(button);
  });
}

function selectDeck(faction) {
  if (state.mode === "local" && state.localStep === "p1Deck") {
    state.decks.p1 = faction;
    state.localStep = "p2Deck";
    elements.turnInstruction.textContent = "Jogador 2, escolha sua faccao.";
    return;
  }

  if (state.mode === "local") {
    state.decks.p2 = faction;
  } else {
    state.decks.p1 = faction;
  }

  showBattleScreen();
  startLocalPicking();
}

function showBattleScreen() {
  elements.battleMode.textContent = state.mode === "cpu" ? "Modo CPU" : "Multiplayer local";
  elements.opponentTitle.textContent = state.mode === "cpu" ? "CPU" : "Jogador 2";
  updateScore();
  updateRoundTitle();
  elements.nextRound.disabled = true;
  toggleAttributeButtons(false);
  showScreen("battle");
}

function startLocalPicking() {
  state.selected = { p1: null, p2: null };
  state.roundResolved = false;
  elements.fighterP1.className = "fighter-slot empty";
  elements.fighterP1.textContent = "Aguardando carta";
  elements.fighterP2.className = "fighter-slot empty";
  elements.fighterP2.textContent = "Aguardando carta";

  if (state.mode === "cpu") {
    state.currentPicker = "p1";
    renderHandForCurrentPicker();
    setMessage(starterRole() === "p1" ? "Escolha uma carta. Depois escolha o atributo antes da revelacao." : "Escolha uma carta. Nesta rodada a CPU escolhe o atributo.");
    return;
  }

  state.currentPicker = starterRole();
  showPrivacyGate(`Passe para o ${playerName(state.currentPicker)}`);
}

function showPrivacyGate(title) {
  elements.hand.innerHTML = "";
  elements.privacyTitle.textContent = title;
  elements.privacyGate.hidden = false;
}

function renderHandForCurrentPicker() {
  const role = state.currentPicker;
  const deckName = state.decks[role];
  const deck = getAvailableDeck(role);
  elements.hand.innerHTML = "";
  elements.pickerLabel.textContent = `${role === "p1" ? "Jogador 1" : "Jogador 2"}, escolha sua carta`;
  elements.deckLabel.textContent = deckName || "Deck";

  if (!deck.length) {
    elements.hand.innerHTML = `<div class="notice">Todas as cartas deste deck ja foram usadas.</div>`;
    return;
  }

  deck.forEach((card) => {
    const node = createCard(card, { compact: false });
    node.addEventListener("click", () => selectCard(card));
    elements.hand.appendChild(node);
  });
}

function selectCard(card) {
  if (state.used[state.currentPicker].includes(card.id)) {
    setMessage("Essa carta ja foi usada nesta partida.");
    return;
  }

  state.selected[state.currentPicker] = card;
  addUsedCard(state.currentPicker, card.id);
  playSound("select");

  if (state.mode === "cpu") {
    const cpuDeck = getAvailableDeck("p2");
    state.selected.p2 = randomItem(cpuDeck);
    addUsedCard("p2", state.selected.p2.id);
    renderFighters(false);
    if (starterRole() === "p1") {
      toggleAttributeButtons(true);
      setMessage("Escolha o atributo antes de revelar a carta da CPU.");
    } else {
      const cpuAttribute = randomItem(["ataque", "defesa", "velocidade", "especial"]);
      setMessage(`CPU escolheu ${attributeLabels[cpuAttribute]}. Revelando cartas...`);
      window.setTimeout(() => playAttribute(cpuAttribute), 650);
    }
    return;
  }

  const nextPicker = otherRole(state.currentPicker);
  if (!state.selected[nextPicker]) {
    renderFighters(false);
    const currentName = playerName(state.currentPicker);
    state.currentPicker = nextPicker;
    showPrivacyGate(`Passe para o ${playerName(state.currentPicker)}`);
    setMessage(`${currentName} escolheu. Aguardando ${playerName(state.currentPicker)}.`);
    return;
  }

  elements.hand.innerHTML = "";
  renderFighters(false);
  prepareAttributeChoice();
}

function renderFighters(revealBoth) {
  elements.fighterP1.className = "fighter-slot";
  elements.fighterP2.className = "fighter-slot";

  if (state.selected.p1 && (revealBoth || state.mode === "cpu")) {
    elements.fighterP1.replaceChildren(createCard(state.selected.p1, { battle: true }));
  } else if (state.selected.p1) {
    elements.fighterP1.innerHTML = cardBack("Jogador 1 pronto");
  } else {
    elements.fighterP1.className = "fighter-slot empty";
    elements.fighterP1.textContent = "Aguardando carta";
  }

  if (state.selected.p2 && revealBoth) {
    elements.fighterP2.replaceChildren(createCard(state.selected.p2, { battle: true }));
  } else if (state.selected.p2) {
    elements.fighterP2.innerHTML = cardBack("Jogador 2 pronto");
  } else {
    elements.fighterP2.className = "fighter-slot empty";
    elements.fighterP2.textContent = "Aguardando carta";
  }
}

function cardBack(text) {
  return `<div class="game-card"><div class="card-image"></div><h3>${text}</h3><p class="card-meta">Carta escondida</p></div>`;
}

function createCard(card) {
  const rarityClass = normalize(card.raridade);
  const article = document.createElement("article");
  article.className = `game-card ${rarityClass}`;
  article.innerHTML = `
    <img class="card-image" src="${card.imagem}" alt="${card.nome}" onerror="this.style.opacity=.25">
    <div class="card-title-row">
      <h3>${card.nome}</h3>
      <span class="badge">${card.raridade}</span>
    </div>
    <div class="card-meta">${card.faccao}</div>
    <div class="hp-bar" title="HP ${card.hp}">
      <div class="hp-fill" style="--hp: 100%"></div>
    </div>
    <div class="stats">
      <div class="stat"><small>Pow</small><strong>${card.ataque}</strong></div>
      <div class="stat"><small>Int</small><strong>${card.defesa}</strong></div>
      <div class="stat"><small>Cha</small><strong>${card.velocidade}</strong></div>
    </div>
    <p class="special-name">${card.especial}</p>
  `;
  return article;
}

function playAttribute(attribute) {
  if (!state.selected.p1 || !state.selected.p2 || state.roundResolved) return;
  renderFighters(true);
  const result = resolveWinner(state.selected.p1, state.selected.p2, attribute);
  if (result.winner !== "draw") state.score[result.winner] += 1;

  applyRoundResult({
    round: state.round,
    attribute,
    p1: state.selected.p1.nome,
    p2: state.selected.p2.nome,
    winner: result.winner,
    valueA: result.valueA,
    valueB: result.valueB,
    score: state.score,
    matchOver: state.round >= 3
  });
}

function resolveWinner(cardA, cardB, attribute) {
  const attr = attribute === "especial" ? strongestAttribute(cardA) : attribute;
  const bonusA = attribute === "especial" ? 8 : 0;
  const bonusB = attribute === "especial" ? 5 : 0;
  const valueA = cardA[attr] + bonusA;
  const valueB = cardB[attr] + bonusB;

  if (valueA > valueB) return { winner: "p1", valueA, valueB };
  if (valueB > valueA) return { winner: "p2", valueA, valueB };
  return { winner: "draw", valueA, valueB };
}

function strongestAttribute(card) {
  return ["ataque", "defesa", "velocidade"].sort((a, b) => card[b] - card[a])[0];
}

function applyRoundResult(result) {
  if (result.p1Card && result.p2Card) {
    state.selected.p1 = result.p1Card;
    state.selected.p2 = result.p2Card;
    renderFighters(true);
  }

  state.roundResolved = true;
  state.score = result.score;
  state.history.push({
    round: result.round,
    attribute: result.attribute,
    p1: result.p1,
    p2: result.p2,
    winner: result.winner,
    valueA: result.valueA,
    valueB: result.valueB
  });

  animateAttack(result);
  updateScore();
  toggleAttributeButtons(false);
  elements.nextRound.disabled = false;

  const winnerText = result.winner === "draw" ? "Empate" : result.winner === "p1" ? "Jogador 1 venceu" : "Jogador 2 venceu";
  setMessage(`${winnerText} a rodada com ${attributeLabels[result.attribute]}: ${result.valueA} x ${result.valueB}.`);

  if (result.matchOver) {
    elements.nextRound.textContent = "Ver resultado";
  } else {
    elements.nextRound.textContent = "Proxima rodada";
  }
}

function animateAttack(result) {
  const winnerSlot = result.winner === "p2" ? elements.fighterP2 : elements.fighterP1;
  const loserSlot = result.winner === "p2" ? elements.fighterP1 : elements.fighterP2;
  winnerSlot.querySelector(".game-card")?.classList.add("attacking");

  const damage = Math.max(1, Math.abs(result.valueA - result.valueB));
  const hpFill = loserSlot.querySelector(".hp-fill");
  if (hpFill) hpFill.style.setProperty("--hp", `${Math.max(8, 100 - damage * 3)}%`);

  elements.damageFloat.textContent = result.winner === "draw" ? "EMPATE" : `-${damage}`;
  elements.damageFloat.classList.remove("show");
  void elements.damageFloat.offsetWidth;
  elements.damageFloat.classList.add("show");
  playSound(result.attribute === "especial" ? "special" : "hit");
}

function nextRound() {
  if (state.round >= 3) {
    showFinal();
    return;
  }

  state.round += 1;
  updateRoundTitle();
  showBattleScreen();
  startLocalPicking();
}

function showFinal() {
  const winner = state.score.p1 > state.score.p2 ? "p1" : state.score.p2 > state.score.p1 ? "p2" : "draw";
  const winnerDeck = winner === "p1" ? state.decks.p1 : winner === "p2" ? state.decks.p2 : "Empate";
  elements.finalTitle.textContent = winner === "draw" ? "Empate final" : `${winner === "p1" ? "Jogador 1" : "Jogador 2"} venceu`;
  elements.finalMessage.textContent = `Placar final: ${state.score.p1} x ${state.score.p2}. Deck campeao: ${winnerDeck}.`;
  elements.roundHistory.innerHTML = state.history.map((item) => {
    const name = item.winner === "draw" ? "Empate" : item.winner === "p1" ? "Jogador 1" : "Jogador 2";
    return `<div>Rodada ${item.round}: ${name} em ${attributeLabels[item.attribute]} (${item.valueA} x ${item.valueB})</div>`;
  }).join("");
  showScreen("final");
}

function restartMatch() {
  resetMatchData();
  showScreen("start");
}

function resetMatchData() {
  state.decks = { p1: null, p2: null };
  state.selected = { p1: null, p2: null };
  state.used = { p1: [], p2: [] };
  state.score = { p1: 0, p2: 0 };
  state.round = 1;
  state.roundStarters = createRoundStarters();
  state.history = [];
  state.localStep = "p1Deck";
  state.currentPicker = "p1";
  state.pendingGateAction = null;
  state.roundResolved = false;
  elements.nextRound.textContent = "Proxima rodada";
  updateScore();
  updateRoundTitle();
}

function updateScore() {
  elements.scoreP1.textContent = state.score.p1;
  elements.scoreP2.textContent = state.score.p2;
}

function updateRoundTitle() {
  elements.roundTitle.textContent = `Rodada ${state.round} de 3`;
}

function toggleAttributeButtons(enabled) {
  document.querySelectorAll("[data-attribute]").forEach((button) => {
    button.disabled = !enabled;
  });
}

function setMessage(text) {
  elements.battleMessage.textContent = text;
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("is-active"));
  screens[name].classList.add("is-active");
}

function getDeck(faction) {
  return state.cards.filter((card) => card.faccao === faction);
}

function getAvailableDeck(role) {
  const usedIds = state.used[role] || [];
  return getDeck(state.decks[role]).filter((card) => !usedIds.includes(card.id));
}

function addUsedCard(role, cardId) {
  if (!state.used[role].includes(cardId)) {
    state.used[role].push(cardId);
  }
}

function createRoundStarters() {
  return {
    1: "p1",
    2: "p2",
    3: Math.random() < 0.5 ? "p1" : "p2"
  };
}

function starterRole() {
  return state.roundStarters[state.round] || (state.round % 2 === 1 ? "p1" : "p2");
}

function otherRole(role) {
  return role === "p1" ? "p2" : "p1";
}

function playerName(role) {
  if (role === "p1") return "Jogador 1";
  return state.mode === "cpu" ? "CPU" : "Jogador 2";
}

function prepareAttributeChoice() {
  const chooser = starterRole();
  const enableChoice = () => {
    toggleAttributeButtons(true);
    setMessage(`${playerName(chooser)}, escolha o atributo antes de revelar as cartas.`);
  };

  if (chooser !== state.currentPicker) {
    state.pendingGateAction = enableChoice;
    showPrivacyGate(`Passe para o ${playerName(chooser)} escolher o atributo`);
    return;
  }

  enableChoice();
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function playSound(type) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies = { select: 420, hit: 160, special: 760 };

  oscillator.frequency.value = frequencies[type] || 300;
  oscillator.type = type === "special" ? "sawtooth" : "square";
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}
