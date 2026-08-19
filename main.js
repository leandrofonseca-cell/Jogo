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
  fighterTitleP1: document.querySelector("#fighter-title-p1"),
  scoreP1: document.querySelector("#score-p1"),
  scoreP2: document.querySelector("#score-p2"),
  scoreLabelP1: document.querySelector("#score-label-p1"),
  scoreLabelP2: document.querySelector("#score-label-p2"),
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
  damageFloat: document.querySelector("#damage-float"),
  roundResult: document.querySelector("#round-result"),
  matchFinish: document.querySelector("#match-finish"),
  tieBreakNotice: document.querySelector("#tie-break-notice"),
  impactSpark: document.querySelector("#impact-spark"),
  soundToggle: document.querySelector("#sound-toggle")
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
  roundResolved: false,
  deckNoticeTimer: null,
  damageSoundRound: null
};

const attributeLabels = {
  ataque: "Poder",
  defesa: "Inteligencia",
  velocidade: "Carisma",
  especial: "Especial"
};

const audio = createAudioDirector();

init();

async function init() {
  bindEvents();
  audio.startAmbient();
  await loadCards();
  renderDecks();
}

function bindEvents() {
  document.addEventListener("pointerdown", () => audio.startAmbient(), { once: true });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => chooseMode(button.dataset.mode));
  });

  document.querySelector("#back-to-start").addEventListener("click", () => {
    showScreen("start");
  });

  elements.soundToggle.addEventListener("click", () => {
    const muted = audio.toggleMute();
    elements.soundToggle.setAttribute("aria-pressed", String(muted));
    elements.soundToggle.textContent = muted ? "Som: desligado" : "Som: ligado";
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button && !button.disabled && button !== elements.soundToggle) audio.effect("click");
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
    const response = await fetch('/cards.json');
    state.cards = await response.json();
    state.cards = state.cards.map((card) => applyBalancedStats({ ...card, nome: portugueseNames[card.id] || card.nome }));
  } catch (error) {
    console.error("Nao foi possivel carregar cards.json. Rode com npm start.", error);
    state.cards = [];
  }

  state.factions = [...new Set(state.cards.map((card) => card.faccao))];
}

function chooseMode(mode) {
  audio.startAmbient();
  audio.announceDeckChoice();
  state.mode = mode;

  resetMatchData();
  state.decks.p2 = mode === "cpu" ? randomItem(state.factions) : null;
  state.localStep = "p1Deck";
  updateDeckInstruction(mode === "cpu" ? "Jogador 1, escolha seu deck." : "Jogador 1, escolha seu deck.");
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
    elements.deckGrid.classList.add("is-waiting");
    updateDeckInstruction("Jogador 2, escolha seu deck.", 360);
    window.setTimeout(() => audio.announceDeckChoice(), 360);
    window.setTimeout(() => elements.deckGrid.classList.remove("is-waiting"), 360);
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
  elements.fighterTitleP1.textContent = state.decks.p1;
  elements.opponentTitle.textContent = state.decks.p2;
  elements.scoreLabelP1.textContent = state.decks.p1;
  elements.scoreLabelP2.textContent = state.decks.p2;
  updateScore();
  updateRoundTitle();
  elements.nextRound.disabled = true;
  toggleAttributeButtons(false);
  showScreen("battle");
}

function startLocalPicking() {
  audio.announceRound(state.round);
  state.damageSoundRound = null;
  state.selected = { p1: null, p2: null };
  state.roundResolved = false;
  elements.fighterP1.className = "fighter-slot empty";
  elements.fighterP1.textContent = "Aguardando carta";
  elements.fighterP2.className = "fighter-slot empty";
  elements.fighterP2.textContent = "Aguardando carta";
  elements.roundResult.className = "round-result";
  elements.roundResult.textContent = "";
  elements.matchFinish.className = "match-finish";
  elements.matchFinish.textContent = "";
  if (state.round > 3) showTieBreakNotice();
  document.querySelector(".arena-attributes").classList.remove("is-hidden");

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
      setMessage(`Escolha o atributo antes de revelar a carta da CPU.${insightHint("p1")}`);
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
    <div class="card-inner">
      <div class="card-face card-front">
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
        <button class="flip-card-button" type="button" aria-label="Ver informacoes de ${card.nome}" title="Ver informacoes">+</button>
      </div>
      <div class="card-face card-back">
        <p class="card-back-label">Arquivo historico</p>
        <h3>${card.nome}</h3>
        <div class="lore-block"><strong>Quem foi</strong><p>${cardHistory(card)}</p></div>
        <div class="lore-block"><strong>Conquistas</strong><p>${cardAchievements(card)}</p></div>
        <div class="lore-block"><strong>${card.especial}</strong><p>${specialDescription(card)}</p></div>
        <button class="flip-card-button flip-back" type="button" aria-label="Voltar para a frente de ${card.nome}" title="Voltar para a frente">×</button>
      </div>
    </div>
  `;
  article.querySelectorAll(".flip-card-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      article.classList.toggle("is-flipped");
    });
  });
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
    tieBreak: result.tieBreak,
    score: state.score,
    matchOver: state.round >= 3 && state.score.p1 !== state.score.p2
  });
}

function resolveWinner(cardA, cardB, attribute) {
  const effectA = attribute === "especial" ? specialEffect(cardA) : { attribute, bonus: 0, damage: 0 };
  const effectB = attribute === "especial" ? specialEffect(cardB) : { attribute, bonus: 0, damage: 0 };
  let valueA = specialValue(cardA, cardB, effectA);
  let valueB = specialValue(cardB, cardA, effectB);
  if (attribute === "especial") {
    if (effectA.type === "sabotage") valueB -= 9;
    if (effectB.type === "sabotage") valueA -= 9;
    if (effectA.type === "disarm") valueB -= 6;
    if (effectB.type === "disarm") valueA -= 6;
  }
  if (cardA.id === cardB.id) {
    return { winner: "draw", valueA, valueB, tieBreak: false, damage: 0, sameCard: true };
  }
  // Empates no atributo sao decididos pelo legado total da carta, evitando
  // rodadas inconclusivas e garantindo que a batalha sempre tenha vencedor.
  const tieBreak = valueA === valueB;
  const legacyA = cardA.hp + cardA.ataque + cardA.defesa + cardA.velocidade;
  const legacyB = cardB.hp + cardB.ataque + cardB.defesa + cardB.velocidade;
  const winner = valueA > valueB ? "p1" : valueB > valueA ? "p2" : legacyA !== legacyB ? (legacyA > legacyB ? "p1" : "p2") : (cardA.id < cardB.id ? "p1" : "p2");
  const winnerEffect = winner === "p1" ? effectA : effectB;
  const loserEffect = winner === "p1" ? effectB : effectA;
  const protection = attribute === "especial" && loserEffect.type === "shield" ? 8 : 0;
  return { winner, valueA, valueB, tieBreak, damage: Math.max(1, Math.abs(valueA - valueB) + winnerEffect.damage - protection) };
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
    valueB: result.valueB,
    tieBreak: result.tieBreak
  });

  animateAttack(result);
  updateScore();
  toggleAttributeButtons(false);
  document.querySelector(".arena-attributes").classList.add("is-hidden");
  elements.nextRound.disabled = false;

  const winnerText = result.winner === "draw" ? "EMPATE" : `${winnerDisplayName(state.decks[result.winner])} WINS!`;
  const damage = result.damage ?? Math.max(1, Math.abs(result.valueA - result.valueB));
  elements.roundResult.className = `round-result show${result.attribute === "especial" ? " special-result" : ""}`;
  elements.roundResult.innerHTML = `<strong>${winnerText}</strong><span>${attributeLabels[result.attribute]} · ${result.valueA} × ${result.valueB}${result.tieBreak ? " · desempate por legado" : ""}</span><em>${damage} de dano</em>`;
  setMessage(result.winner === "draw" ? "As duas pessoas escolheram a mesma carta: a rodada terminou empatada." : result.tieBreak ? "Empate no atributo decidido pelo legado historico das cartas." : "Resultado exibido entre as cartas.");

  if (result.matchOver) {
    elements.nextRound.textContent = "Ver resultado";
    elements.nextRound.disabled = true;
    window.setTimeout(() => {
      showMatchFinish();
      window.setTimeout(() => { elements.nextRound.disabled = false; }, 1800);
    }, 700);
  } else if (state.round >= 3 && state.score.p1 === state.score.p2) {
    elements.nextRound.textContent = "Rodada de desempate";
  } else {
    elements.nextRound.textContent = "Proxima rodada";
  }
}

function showMatchFinish() {
  const winner = state.score.p1 > state.score.p2 ? "p1" : state.score.p2 > state.score.p1 ? "p2" : "draw";
  const deck = winner === "p1" ? state.decks.p1 : state.decks.p2;
  const isCpuWin = state.mode === "cpu" && winner === "p2";
  elements.matchFinish.className = `match-finish show${isCpuWin ? " game-over" : ""}`;
  elements.matchFinish.textContent = winner === "draw" ? "EMPATE FINAL" : `K.O. — ${winnerDisplayName(deck)} WINS!`;
  if (winner !== "draw") audio.announceKO(deck);
}

function animateAttack(result) {
  if (result.winner === "draw") {
    elements.damageFloat.textContent = "EMPATE";
    elements.damageFloat.classList.remove("show", "special-hit");
    void elements.damageFloat.offsetWidth;
    elements.damageFloat.classList.add("show");
    return;
  }
  const winnerSlot = result.winner === "p2" ? elements.fighterP2 : elements.fighterP1;
  const loserSlot = result.winner === "p2" ? elements.fighterP1 : elements.fighterP2;
  winnerSlot.querySelector(".game-card")?.classList.add("attacking");
  loserSlot.querySelector(".game-card")?.classList.add(result.attribute === "especial" ? "special-damage" : "damage-hit");
  triggerImpact(result.attribute === "especial");

  const damage = result.damage ?? Math.max(1, Math.abs(result.valueA - result.valueB));
  const hpFill = loserSlot.querySelector(".hp-fill");
  if (hpFill) hpFill.style.setProperty("--hp", `${Math.max(8, 100 - damage * 3)}%`);

  elements.damageFloat.textContent = result.winner === "draw" ? "EMPATE" : `-${damage}`;
  elements.damageFloat.classList.remove("show", "special-hit");
  void elements.damageFloat.offsetWidth;
  elements.damageFloat.classList.add("show");
  if (result.attribute === "especial") elements.damageFloat.classList.add("special-hit");
  if (result.attribute === "especial") {
    playSound("special");
  } else if (state.damageSoundRound !== state.round) {
    state.damageSoundRound = state.round;
    playSound("hit");
  }
}

function nextRound() {
  if (state.round >= 3 && state.score.p1 !== state.score.p2) {
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
  setVictoryBackground(winnerDeck);
  if (winner !== "draw") audio.playVictoryTheme(winnerDeck);
  screens.final.classList.toggle("has-victory", winner !== "draw");
  elements.finalTitle.textContent = winner === "draw" ? "EMPATE" : `${winnerDisplayName(winnerDeck)} WINS!`;
  const tieBreakText = state.history.some((item) => item.round > 3) ? " A batalha teve rodada de desempate." : "";
  elements.finalMessage.textContent = winner === "draw" ? `Placar final: ${state.score.p1} x ${state.score.p2}.${tieBreakText}` : `${winnerDisplayName(winnerDeck)} venceu a batalha por ${state.score.p1} x ${state.score.p2}.${tieBreakText}`;
  elements.roundHistory.innerHTML = state.history.map((item) => {
    const name = item.winner === "draw" ? "Empate" : state.decks[item.winner];
    return `<div>Rodada ${item.round}: ${name} em ${attributeLabels[item.attribute]} (${item.valueA} x ${item.valueB})</div>`;
  }).join("");
  showScreen("final");
}

function setVictoryBackground(deck) {
  const backgrounds = {
    Franca: "/images/victory-franca.jpeg",
    Alemanha: "/images/victory-alemanha.jpeg",
    Grecia: "/images/victory-grecia.jpeg",
    Inglaterra: "/images/victory-inglaterra.jpeg",
    Italia: "/images/victory-italia.jpeg",
    China: "/images/victory-china.jpeg",
    EUA: "/images/victory-eua.jpeg",
    Brasil: "/images/victory-brasil.jpeg"
  };
  screens.final.style.setProperty("--victory-bg", backgrounds[deck] ? `url('${backgrounds[deck]}')` : "none");
}

function restartMatch() {
  resetMatchData();
  screens.final.classList.remove("has-victory");
  audio.startAmbient();
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
  state.damageSoundRound = null;
  elements.nextRound.textContent = "Proxima rodada";
  updateScore();
  updateRoundTitle();
}

function updateScore() {
  elements.scoreP1.textContent = state.score.p1;
  elements.scoreP2.textContent = state.score.p2;
}

function updateRoundTitle() {
  elements.roundTitle.textContent = state.round > 3 ? "Rodada de desempate" : `Rodada ${state.round} de 3`;
}

function showTieBreakNotice() {
  elements.tieBreakNotice.textContent = "RODADA DE DESEMPATE — vença esta rodada para decidir a batalha.";
  elements.tieBreakNotice.classList.remove("show");
  void elements.tieBreakNotice.offsetWidth;
  elements.tieBreakNotice.classList.add("show");
  window.setTimeout(() => elements.tieBreakNotice.classList.remove("show"), 2800);
}

function toggleAttributeButtons(enabled) {
  document.querySelectorAll("[data-attribute]").forEach((button) => {
    button.disabled = !enabled;
  });
}

function setMessage(text) {
  elements.battleMessage.textContent = text;
}

function updateDeckInstruction(text, delay = 0) {
  window.clearTimeout(state.deckNoticeTimer);
  elements.turnInstruction.classList.remove("push-again");
  elements.turnInstruction.classList.add("is-leaving");
  state.deckNoticeTimer = window.setTimeout(() => {
    elements.turnInstruction.textContent = text;
    elements.turnInstruction.classList.remove("is-leaving");
    void elements.turnInstruction.offsetWidth;
    elements.turnInstruction.classList.add("push-again");
  }, delay);
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("is-active"));
  screens[name].classList.add("is-active");
  elements.soundToggle.hidden = name === "final";
  audio.setScreenMix(name);
}

function winnerDisplayName(deck) {
  const names = {
    Alemanha: "GERMANY",
    Brasil: "BRAZIL",
    China: "CHINA",
    EUA: "USA",
    Franca: "FRANCE",
    Grecia: "GREECE",
    Inglaterra: "ENGLAND",
    Italia: "ITALY"
  };
  return names[deck] || String(deck || "").toUpperCase();
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
    setMessage(`${playerName(chooser)}, escolha o atributo antes de revelar as cartas.${insightHint(chooser)}`);
  };

  if (chooser !== state.currentPicker) {
    state.pendingGateAction = enableChoice;
    showPrivacyGate(`Passe para o ${playerName(chooser)} escolher o atributo`);
    return;
  }

  enableChoice();
}

function insightHint(role) {
  const card = state.selected[role];
  const opponent = state.selected[otherRole(role)];
  if (!card || !opponent || specialEffect(card).type !== "insight") return "";
  const attr = strongestAttribute(opponent);
  return ` Analise ativa: o maior atributo adversario e ${attributeLabels[attr]} (${opponent[attr]}).`;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

// Cada personagem conserva sua especialidade historica, com valores proximos
// entre si para que a escolha de carta e atributo continue importante.
function applyBalancedStats(card) {
  const stats = balancedStats[card.id];
  return stats ? { ...card, ...stats } : card;
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cardHistory(card) {
  const data = characterData[card.id];
  return data ? `${data.history} ${data.achievement}` : `${card.nome} foi uma figura marcante da historia de ${card.faccao}.`;
}

function cardAchievements(card) {
  return characterData[card.id]?.achievement || `Destaque de ${attributeLabels[strongestAttribute(card)].toLowerCase()} (${card[strongestAttribute(card)]}).`;
}

function specialDescription(card) {
  const effect = specialEffect(card);
  return `${effect.description} ${abilityRules[effect.type].text} Base: ${attributeLabels[effect.attribute].toLowerCase()} (${card[effect.attribute]}) +${effect.bonus}; dano extra: +${effect.damage}.`;
}

function specialEffect(card) {
  const effect = specialEffects[card.id] || { attribute: strongestAttribute(card), bonus: 8, damage: 2, description: "Canaliza sua principal habilidade." };
  return { ...effect, bonus: Math.min(effect.bonus, 11), damage: Math.min(effect.damage, 5), type: specialTypes[card.id] || "assault" };
}

const portugueseNames = {
  "napoleao-bonaparte": "Napoleão Bonaparte", "joan-of-arc": "Joana d'Arc", "rene-descartes": "René Descartes", "marie-curie": "Marie Curie",
  "alexander-the-great": "Alexandre, o Grande", "socrates": "Sócrates", "plato": "Platão", "aristotle": "Aristóteles", "leonidas-i": "Leônidas I",
  "elizabeth-i": "Isabel I", "michelangelo": "Michelangelo", "machiavelli": "Maquiavel", "galileo-galilei": "Galileu Galilei"
};

const balancedStats = {
  "napoleao-bonaparte": { hp: 85, ataque: 88, defesa: 83, velocidade: 70 },
  "joan-of-arc": { hp: 78, ataque: 76, defesa: 69, velocidade: 86 },
  "rene-descartes": { hp: 69, ataque: 64, defesa: 89, velocidade: 72 },
  "claude-monet": { hp: 68, ataque: 62, defesa: 73, velocidade: 88 },
  "marie-curie": { hp: 68, ataque: 73, defesa: 90, velocidade: 70 },
  "albert-einstein": { hp: 69, ataque: 70, defesa: 92, velocidade: 72 },
  "goethe": { hp: 69, ataque: 64, defesa: 74, velocidade: 88 },
  "bismarck": { hp: 82, ataque: 84, defesa: 86, velocidade: 72 },
  "beethoven": { hp: 69, ataque: 64, defesa: 75, velocidade: 89 },
  "kepler": { hp: 67, ataque: 63, defesa: 90, velocidade: 68 },
  "alexander-the-great": { hp: 86, ataque: 90, defesa: 80, velocidade: 78 },
  "socrates": { hp: 68, ataque: 60, defesa: 90, velocidade: 78 },
  "plato": { hp: 68, ataque: 62, defesa: 89, velocidade: 76 },
  "aristotle": { hp: 70, ataque: 64, defesa: 91, velocidade: 74 },
  "leonidas-i": { hp: 88, ataque: 88, defesa: 82, velocidade: 68 },
  "isaac-newton": { hp: 68, ataque: 65, defesa: 93, velocidade: 68 },
  "shakespeare": { hp: 68, ataque: 61, defesa: 77, velocidade: 91 },
  "alan-turing": { hp: 69, ataque: 66, defesa: 92, velocidade: 72 },
  "elizabeth-i": { hp: 78, ataque: 74, defesa: 85, velocidade: 88 },
  "winston-churchill": { hp: 81, ataque: 77, defesa: 86, velocidade: 83 },
  "leonardo-da-vinci": { hp: 75, ataque: 78, defesa: 91, velocidade: 86 },
  "michelangelo": { hp: 73, ataque: 72, defesa: 80, velocidade: 90 },
  "machiavelli": { hp: 72, ataque: 70, defesa: 91, velocidade: 76 },
  "galileo-galilei": { hp: 68, ataque: 65, defesa: 92, velocidade: 70 },
  "marco-polo": { hp: 74, ataque: 72, defesa: 78, velocidade: 89 },
  "sun-tzu": { hp: 81, ataque: 83, defesa: 92, velocidade: 76 },
  "confucius": { hp: 70, ataque: 63, defesa: 91, velocidade: 84 },
  "qin-shi-huang": { hp: 84, ataque: 88, defesa: 82, velocidade: 71 },
  "zhuge-liang": { hp: 74, ataque: 77, defesa: 93, velocidade: 75 },
  "laozi": { hp: 68, ataque: 60, defesa: 89, velocidade: 83 },
  "george-washington": { hp: 83, ataque: 86, defesa: 80, velocidade: 78 },
  "abraham-lincoln": { hp: 75, ataque: 70, defesa: 86, velocidade: 91 },
  "nikola-tesla": { hp: 69, ataque: 74, defesa: 93, velocidade: 74 },
  "martin-luther-king-jr": { hp: 72, ataque: 62, defesa: 84, velocidade: 94 },
  "thomas-edison": { hp: 72, ataque: 73, defesa: 89, velocidade: 72 },
  "dom-pedro-ii": { hp: 77, ataque: 67, defesa: 90, velocidade: 84 },
  "santos-dumont": { hp: 72, ataque: 74, defesa: 88, velocidade: 91 },
  "machado-de-assis": { hp: 68, ataque: 61, defesa: 87, velocidade: 92 },
  "zumbi-dos-palmares": { hp: 87, ataque: 91, defesa: 76, velocidade: 75 },
  "anita-garibaldi": { hp: 80, ataque: 84, defesa: 76, velocidade: 88 }
};

function specialValue(card, opponent, effect) {
  if (effect.type === "mimic") return opponent[strongestAttribute(opponent)] + effect.bonus;
  if (effect.type === "counter") return card.defesa + effect.bonus + Math.floor(opponent.ataque / 10);
  if (effect.type === "insight") return card[effect.attribute] + effect.bonus + Math.floor(opponent[strongestAttribute(opponent)] / 12);
  return card[effect.attribute] + effect.bonus;
}

const abilityRules = {
  assault: { text: "Investida: potencializa o proprio atributo para atacar." },
  shield: { text: "Escudo: se perder, reduz 8 pontos do dano recebido." },
  sabotage: { text: "Sabotagem: reduz 9 pontos da forca especial do adversario." },
  disarm: { text: "Desarme: enfraquece em 6 pontos a resposta inimiga." },
  mimic: { text: "Adaptacao: copia o melhor atributo do adversario e soma seu bonus." },
  counter: { text: "Contra-ataque: usa defesa e recebe forca extra conforme o ataque rival." },
  insight: { text: "Analise: lê o atributo mais alto inimigo e transforma parte dele em poder." },
  assault_speed: { text: "Investida rapida: usa velocidade para furar a defesa antes da reacao." }
};

const specialTypes = {
  "napoleao-bonaparte":"counter", "joan-of-arc":"counter", "rene-descartes":"sabotage", "claude-monet":"mimic", "marie-curie":"assault",
  "albert-einstein":"insight", "goethe":"sabotage", "bismarck":"disarm", "beethoven":"assault_speed", "kepler":"insight",
  "alexander-the-great":"assault_speed", "socrates":"sabotage", "plato":"mimic", "aristotle":"insight", "leonidas-i":"shield",
  "isaac-newton":"counter", "shakespeare":"sabotage", "alan-turing":"insight", "elizabeth-i":"disarm", "winston-churchill":"shield",
  "leonardo-da-vinci":"mimic", "michelangelo":"counter", "machiavelli":"sabotage", "galileo-galilei":"insight", "marco-polo":"assault_speed",
  "sun-tzu":"disarm", "confucius":"shield", "qin-shi-huang":"assault", "zhuge-liang":"sabotage", "laozi":"shield",
  "george-washington":"counter", "abraham-lincoln":"shield", "nikola-tesla":"assault", "martin-luther-king-jr":"shield", "thomas-edison":"insight",
  "dom-pedro-ii":"insight", "santos-dumont":"assault_speed", "machado-de-assis":"sabotage", "zumbi-dos-palmares":"counter", "anita-garibaldi":"assault_speed"
};

const specialEffects = {
  "napoleao-bonaparte": { attribute:"defesa", bonus:14, damage:5, description:"Estrategia Imperial: forma uma guarda tática e contra-ataca." },
  "joan-of-arc": { attribute:"velocidade", bonus:15, damage:4, description:"Chama da Inspiracao: avanca com uma investida inspiradora." },
  "rene-descartes": { attribute:"ataque", bonus:13, damage:3, description:"Duvida Metodica: encontra a falha logica do oponente." },
  "claude-monet": { attribute:"defesa", bonus:12, damage:3, description:"Impressao Viva: confunde o rival com movimentos imprevisiveis." },
  "marie-curie": { attribute:"ataque", bonus:16, damage:6, description:"Radium Brilhante: libera uma descarga radioativa concentrada." },
  "albert-einstein": { attribute:"ataque", bonus:14, damage:5, description:"Relatividade: calcula a melhor resposta antes do impacto." },
  "goethe": { attribute:"defesa", bonus:12, damage:4, description:"Verso Imortal: usa presenca cultural para desestabilizar o duelo." },
  "bismarck": { attribute:"ataque", bonus:11, damage:6, description:"Politica de Ferro: impõe uma ofensiva direta e sem recuo." },
  "beethoven": { attribute:"velocidade", bonus:13, damage:5, description:"Sinfonia Heroica: cria um ritmo explosivo de ataque." },
  "kepler": { attribute:"defesa", bonus:15, damage:3, description:"Orbitas Perfeitas: prevê a trajetoria do movimento rival." },
  "alexander-the-great": { attribute:"ataque", bonus:17, damage:7, description:"Conquista Relampago: executa uma carga militar devastadora." },
  "socrates": { attribute:"defesa", bonus:14, damage:4, description:"Pergunta Fatal: desmonta a estrategia inimiga com uma provocacao." },
  "plato": { attribute:"ataque", bonus:12, damage:5, description:"Mundo das Ideias: transforma visao abstrata em vantagem ofensiva." },
  "aristotle": { attribute:"defesa", bonus:13, damage:4, description:"Logica Suprema: escolhe a acao com maior eficiencia." },
  "leonidas-i": { attribute:"defesa", bonus:18, damage:5, description:"Escudo de Esparta: bloqueia o choque e responde com disciplina." },
  "isaac-newton": { attribute:"ataque", bonus:16, damage:6, description:"Lei da Gravidade: aplica uma forca inevitavel sobre o rival." },
  "shakespeare": { attribute:"defesa", bonus:15, damage:3, description:"Drama Imortal: conduz o oponente a um erro emocional." },
  "alan-turing": { attribute:"ataque", bonus:14, damage:5, description:"Codigo Quebrado: decifra o padrao de combate adversario." },
  "elizabeth-i": { attribute:"velocidade", bonus:13, damage:5, description:"Era Dourada: ganha impulso com lideranca e confianca." },
  "winston-churchill": { attribute:"defesa", bonus:16, damage:6, description:"Discurso de Guerra: resiste ao ataque e eleva a moral." },
  "leonardo-da-vinci": { attribute:"ataque", bonus:15, damage:6, description:"Genio Universal: combina inventividade e precisao no golpe." },
  "michelangelo": { attribute:"defesa", bonus:13, damage:5, description:"Escultura Divina: aplica forca calculada como um cinzel." },
  "machiavelli": { attribute:"ataque", bonus:14, damage:4, description:"O Principe: antecipa a fraqueza politica do inimigo." },
  "galileo-galilei": { attribute:"ataque", bonus:13, damage:5, description:"Olhar Telescopico: mira o ponto vulneravel com precisao." },
  "marco-polo": { attribute:"velocidade", bonus:14, damage:4, description:"Rota da Seda: usa mobilidade para atacar por uma rota inesperada." },
  "sun-tzu": { attribute:"ataque", bonus:16, damage:5, description:"Arte da Guerra: prepara uma manobra que vence antes do confronto." },
  "confucius": { attribute:"defesa", bonus:15, damage:3, description:"Sabedoria Eterna: mantém equilibrio e pune a imprudencia." },
  "qin-shi-huang": { attribute:"velocidade", bonus:12, damage:7, description:"Imperio Unificado: concentra todo o comando em um golpe decisivo." },
  "zhuge-liang": { attribute:"ataque", bonus:14, damage:6, description:"Plano dos Ventos: aciona uma armadilha estrategica." },
  "laozi": { attribute:"defesa", bonus:16, damage:3, description:"Caminho do Tao: absorve a pressao e responde no momento certo." },
  "george-washington": { attribute:"ataque", bonus:13, damage:5, description:"Fundador da Republica: lidera uma ofensiva coordenada." },
  "abraham-lincoln": { attribute:"velocidade", bonus:12, damage:4, description:"Uniao Preservada: recupera a iniciativa pela persistencia." },
  "nikola-tesla": { attribute:"ataque", bonus:17, damage:7, description:"Corrente Alternada: descarrega energia eletrica em cadeia." },
  "martin-luther-king-jr": { attribute:"defesa", bonus:18, damage:2, description:"Eu Tenho um Sonho: resiste com conviccao e inspiracao." },
  "thomas-edison": { attribute:"defesa", bonus:14, damage:4, description:"Lampada da Invencao: revela uma solucao tecnica no instante final." },
  "dom-pedro-ii": { attribute:"velocidade", bonus:13, damage:4, description:"Imperador Sabio: governa o ritmo da rodada com conhecimento." },
  "santos-dumont": { attribute:"velocidade", bonus:18, damage:6, description:"Voo do 14-Bis: realiza uma passagem aerea extremamente veloz." },
  "machado-de-assis": { attribute:"defesa", bonus:15, damage:5, description:"Ironia Perfeita: induz o rival a uma escolha desfavoravel." },
  "zumbi-dos-palmares": { attribute:"ataque", bonus:15, damage:6, description:"Resistencia Quilombola: responde a pressao com um contra-golpe firme." },
  "anita-garibaldi": { attribute:"velocidade", bonus:16, damage:6, description:"Heroina dos Dois Mundos: ataca em movimento por um flanco aberto." }
};

function triggerImpact(isSpecial) {
  document.body.classList.remove("screen-shake", "screen-shake-special");
  elements.impactSpark.classList.remove("show", "special-spark");
  void elements.impactSpark.offsetWidth;
  document.body.classList.add(isSpecial ? "screen-shake-special" : "screen-shake");
  elements.impactSpark.classList.add("show");
  if (isSpecial) elements.impactSpark.classList.add("special-spark");
  window.setTimeout(() => document.body.classList.remove("screen-shake", "screen-shake-special"), isSpecial ? 680 : 360);
}

const characterData = {
  "napoleao-bonaparte": { history: "Imperador frances e comandante que dominou grande parte da Europa entre 1799 e 1815.", achievement: "Reformou a administracao francesa com o Codigo Napoleonico e venceu batalhas como Austerlitz.", power: "Estrategia Imperial representa manobras rapidas que ampliam a superioridade tática." },
  "joan-of-arc": { history: "Camponesa francesa que liderou tropas na Guerra dos Cem Anos e foi executada em 1431.", achievement: "Sua participacao ajudou a libertar Orleans; foi canonizada pela Igreja Catolica em 1920.", power: "Chama da Inspiracao simboliza a coragem que mobiliza aliados em momentos decisivos." },
  "rene-descartes": { history: "Filosofo e matematico frances do seculo XVII, considerado um dos pais da filosofia moderna.", achievement: "Criou a geometria analitica e formulou o metodo da duvida, associado ao 'penso, logo existo'.", power: "Duvida Metodica transforma analise rigorosa em vantagem intelectual." },
  "claude-monet": { history: "Pintor frances, um dos fundadores do impressionismo.", achievement: "A obra Impressao, Nascer do Sol deu nome ao movimento; sua serie de Nenufares tornou-se iconica.", power: "Impressao Viva usa percepcao e adaptacao para superar o adversario." },
  "marie-curie": { history: "Fisica e quimica polonesa naturalizada francesa, pioneira no estudo da radioatividade.", achievement: "Foi a primeira pessoa a receber dois Premios Nobel, em Fisica e Quimica.", power: "Radium Brilhante representa energia radioativa concentrada em um ataque especial." },
  "albert-einstein": { history: "Fisico nascido na Alemanha, autor da teoria da relatividade.", achievement: "Recebeu o Nobel de Fisica de 1921 pela explicacao do efeito fotoeletrico.", power: "Relatividade muda a leitura do confronto com calculo e previsao." },
  "goethe": { history: "Escritor, poeta e pensador alemao, figura central do movimento Sturm und Drang.", achievement: "Escreveu Fausto e Os Sofrimentos do Jovem Werther, obras fundamentais da literatura alema.", power: "Verso Imortal converte criatividade e influencia cultural em pressao no duelo." },
  "bismarck": { history: "Chanceler prussiano que conduziu a unificacao da Alemanha em 1871.", achievement: "Criou uma rede pioneira de seguros sociais e liderou a diplomacia europeia do seculo XIX.", power: "Politica de Ferro representa controle politico e planejamento sem concessoes." },
  "beethoven": { history: "Compositor alemao cuja obra marcou a transicao do classicismo para o romantismo.", achievement: "Compôs nove sinfonias, incluindo a Nona, mesmo apos perder grande parte da audicao.", power: "Sinfonia Heroica libera uma ofensiva inspirada na forca de sua musica." },
  "kepler": { history: "Astronomo alemao que explicou o movimento dos planetas ao redor do Sol.", achievement: "Formulou as tres leis do movimento planetario, essenciais para a astronomia moderna.", power: "Orbitas Perfeitas usa previsao matematica para encontrar a melhor abertura." },
  "alexander-the-great": { history: "Rei da Macedonia que criou um imperio do Mediterraneo ao noroeste da India.", achievement: "Venceu Dario III e difundiu a cultura helenistica por vastos territorios.", power: "Conquista Relampago representa um avanco veloz antes que o rival reaja." },
  "socrates": { history: "Filosofo ateniense que ensinava por dialogos e perguntas em espacos publicos.", achievement: "Sua abordagem socratica influenciou profundamente Platao e toda a filosofia ocidental.", power: "Pergunta Fatal pressiona o adversario ao explorar falhas de raciocinio." },
  "plato": { history: "Filosofo grego, discipulo de Socrates e fundador da Academia de Atenas.", achievement: "Seus dialogos e a teoria das Formas moldaram filosofia, politica e educacao.", power: "Mundo das Ideias simboliza uma leitura abstrata e superior da batalha." },
  "aristotle": { history: "Filosofo grego, aluno de Platao e tutor de Alexandre, o Grande.", achievement: "Fundou o Liceu e produziu obras decisivas em logica, biologia, etica e politica.", power: "Logica Suprema aplica classificacao e raciocinio para maximizar a vantagem." },
  "leonidas-i": { history: "Rei de Esparta conhecido pela resistencia nas Termopilas contra o Imperio Persa.", achievement: "Sua defesa com os 300 espartanos tornou-se simbolo duradouro de sacrificio militar.", power: "Escudo de Esparta reforca a firmeza defensiva diante de um ataque adversario." },
  "isaac-newton": { history: "Fisico e matematico ingles, um dos principais nomes da revolucao cientifica.", achievement: "Formulou as leis do movimento e a gravitação universal; tambem contribuiu para o calculo.", power: "Lei da Gravidade representa uma forca inevitavel que puxa o duelo a seu favor." },
  "shakespeare": { history: "Dramaturgo e poeta ingles, amplamente reconhecido como um dos maiores autores em lingua inglesa.", achievement: "Escreveu pecas como Hamlet, Macbeth e Romeu e Julieta, encenadas ate hoje.", power: "Drama Imortal usa tensao e carisma para desequilibrar o oponente." },
  "alan-turing": { history: "Matematico ingles pioneiro da ciencia da computacao e da inteligencia artificial.", achievement: "Ajudou a quebrar a cifra Enigma na Segunda Guerra e concebeu a maquina de Turing.", power: "Codigo Quebrado identifica padroes ocultos e encontra a jogada mais eficiente." },
  "elizabeth-i": { history: "Rainha da Inglaterra entre 1558 e 1603, periodo conhecido como Era Elisabetana.", achievement: "Seu governo derrotou a Armada Espanhola e estimulou artes, comercio e exploracao maritima.", power: "Era Dourada combina estabilidade, diplomacia e influencia para dominar a rodada." },
  "winston-churchill": { history: "Politico britanico e primeiro-ministro do Reino Unido durante a Segunda Guerra Mundial.", achievement: "Liderou a resistencia britanica contra a Alemanha nazista e recebeu o Nobel de Literatura em 1953.", power: "Discurso de Guerra representa lideranca que aumenta a pressao em combate." },
  "leonardo-da-vinci": { history: "Artista, inventor e estudioso italiano do Renascimento.", achievement: "Pintou Mona Lisa e A Ultima Ceia, alem de deixar projetos de engenharia e anatomia.", power: "Genio Universal combina arte, ciencia e inventividade na escolha da melhor ofensiva." },
  "michelangelo": { history: "Escultor, pintor e arquiteto italiano do Alto Renascimento.", achievement: "Criou Davi, Pieta e o teto da Capela Sistina.", power: "Escultura Divina representa precisao e forca aplicadas com maestria." },
  "machiavelli": { history: "Diplomata e escritor florentino do Renascimento italiano.", achievement: "Autor de O Principe, obra central do pensamento politico realista.", power: "O Principe usa calculo politico para escolher a vantagem mais segura." },
  "galileo-galilei": { history: "Astronomo e fisico italiano, defensor do heliocentrismo.", achievement: "Suas observacoes telescopicas de luas de Jupiter e fases de Venus transformaram a astronomia.", power: "Olhar Telescopico amplia a leitura do rival e antecipa seus movimentos." },
  "marco-polo": { history: "Mercador e viajante veneziano que percorreu a Asia no seculo XIII.", achievement: "Seu relato popularizou na Europa informacoes sobre a China e a Rota da Seda.", power: "Rota da Seda transforma alcance e conexoes em vantagem estrategica." },
  "sun-tzu": { history: "General e estrategista chines tradicionalmente associado ao periodo Primavera e Outono.", achievement: "A Arte da Guerra e um dos tratados militares mais influentes da historia.", power: "Arte da Guerra representa vencer por planejamento e leitura do inimigo." },
  "confucius": { history: "Filosofo chines cujos ensinamentos enfatizam etica, educacao e harmonia social.", achievement: "O confucionismo influenciou governos e culturas do leste asiatico por mais de dois milenios.", power: "Sabedoria Eterna converte disciplina e julgamento moral em superioridade de campo." },
  "qin-shi-huang": { history: "Primeiro imperador de uma China unificada, reinou de 221 a 210 a.C.", achievement: "Padronizou escrita, moeda e medidas; iniciou grandes obras defensivas ligadas a Muralha da China.", power: "Imperio Unificado concentra recursos e comando para um golpe decisivo." },
  "zhuge-liang": { history: "Chanceler e estrategista do estado de Shu Han no periodo dos Tres Reinos.", achievement: "Tornou-se simbolo de inteligencia militar e administracao habilidosa na cultura chinesa.", power: "Plano dos Ventos representa uma armadilha estrategica cuidadosamente preparada." },
  "laozi": { history: "Sabio chines tradicionalmente ligado a autoria do Tao Te Ching.", achievement: "Seus ensinamentos fundaram uma das principais correntes do taoismo.", power: "Caminho do Tao usa equilibrio e adaptacao para transformar a forca do rival." },
  "george-washington": { history: "Comandante da independencia dos Estados Unidos e primeiro presidente do pais.", achievement: "Conduziu o Exercito Continental a vitoria e estabeleceu precedentes democraticos para a presidencia.", power: "Fundador da Republica representa comando firme e disciplina de lideranca." },
  "abraham-lincoln": { history: "16º presidente dos Estados Unidos durante a Guerra Civil Americana.", achievement: "Preservou a Uniao e proclamou a emancipacao de escravizados em territorios rebeldes.", power: "Uniao Preservada representa resistencia politica e capacidade de manter o time coeso." },
  "nikola-tesla": { history: "Inventor e engenheiro nascido no Imperio Austriaco, naturalizado norte-americano.", achievement: "Desenvolveu sistemas de corrente alternada que impulsionaram a eletrificacao moderna.", power: "Corrente Alternada descarrega energia e imprevisibilidade em uma ofensiva intensa." },
  "martin-luther-king-jr": { history: "Pastor e ativista norte-americano pelos direitos civis.", achievement: "Liderou campanhas nao violentas, fez o discurso 'I Have a Dream' e recebeu o Nobel da Paz em 1964.", power: "Eu Tenho um Sonho transforma inspiracao e persuasao em resistencia extraordinaria." },
  "thomas-edison": { history: "Inventor e empresario norte-americano associado a diversas inovacoes industriais.", achievement: "Aprimorou a lampada incandescente comercial e criou sistemas de distribuicao eletrica.", power: "Lampada da Invencao simboliza uma solucao tecnica que ilumina a melhor jogada." },
  "dom-pedro-ii": { history: "Segundo e ultimo imperador do Brasil, reinou de 1840 a 1889.", achievement: "Apoiou ciencia, educacao e cultura e governou durante a consolidacao do Imperio brasileiro.", power: "Imperador Sabio representa conhecimento e equilibrio para controlar o confronto." },
  "santos-dumont": { history: "Inventor e aviador brasileiro, pioneiro da aviacao no inicio do seculo XX.", achievement: "Realizou em Paris o voo publico do 14-bis, em 1906, reconhecido pelo Aeroclube da Franca.", power: "Voo do 14-Bis usa velocidade e surpresa para atingir antes da defesa rival." },
  "machado-de-assis": { history: "Escritor brasileiro e fundador da Academia Brasileira de Letras.", achievement: "Romances como Memorias Postumas de Bras Cubas e Dom Casmurro marcaram o realismo brasileiro.", power: "Ironia Perfeita explora a leitura psicologica do adversario para virar a rodada." },
  "zumbi-dos-palmares": { history: "Lider do Quilombo dos Palmares no seculo XVII e simbolo da resistencia negra no Brasil.", achievement: "Defendeu comunidades quilombolas contra ofensivas coloniais; 20 de novembro marca o Dia da Consciencia Negra.", power: "Resistencia Quilombola representa persistencia e resposta firme sob pressao." },
  "anita-garibaldi": { history: "Revolucionaria brasileira que lutou na Revolucao Farroupilha e na unificacao italiana.", achievement: "Conhecida como Heroina dos Dois Mundos por sua atuacao militar na America do Sul e Europa.", power: "Heroina dos Dois Mundos combina mobilidade e coragem em um ataque inesperado." }
};

function playSound(type) {
  audio.effect(type);
}

function createAudioDirector() {
  const tracks = {
    ambient: new Audio("/sounds/war-pigs.mpeg"),
    round1: new Audio("/sounds/round-one-fight.mpeg"),
    round2: new Audio("/sounds/round-two-fight.mpeg"),
    round3: new Audio("/sounds/round-three-fight.mpeg"),
    deckChoice: new Audio("/sounds/select-your-destiny.mpeg"),
    hit: new Audio("/sounds/combat-hit.mpeg"),
    special: new Audio("/sounds/special-attack.mpeg")
  };
  const anthems = {
    Brasil: "/sounds/anthem-brazil.mpeg",
    Alemanha: "/sounds/anthem-germany.mpeg",
    Grecia: "/sounds/anthem-greece.mpeg",
    EUA: "/sounds/anthem-usa.mpeg",
    China: "/sounds/anthem-china.mp4?v=4",
    Franca: "/sounds/anthem-france.mp4?v=4",
    Inglaterra: "/sounds/anthem-england.mpeg",
    Italia: "/sounds/anthem-italy.mpeg"
  };
  const anthemTracks = Object.fromEntries(
    Object.entries(anthems).map(([deck, source]) => [deck, new Audio(source)])
  );
  const koByDeck = {
    Alemanha: "/sounds/ko-germany.mpeg",
    Brasil: "/sounds/ko-brazil.mpeg",
    China: "/sounds/ko-china.mpeg?v=2",
    EUA: "/sounds/ko-usa.mpeg",
    Franca: "/sounds/ko-france.mpeg?v=2",
    Grecia: "/sounds/ko-greece.mpeg",
    Inglaterra: "/sounds/ko-england.mpeg",
    Italia: "/sounds/ko-italy.mpeg"
  };
  const koTracks = Object.fromEntries(
    Object.entries(koByDeck).map(([deck, source]) => [deck, new Audio(source)])
  );
  let anthem;
  let anthemReplayTimer;
  let muted = false;
  const activeEffects = new Set();

  tracks.ambient.loop = true;
  tracks.ambient.volume = .18;
  tracks.round1.volume = .44;
  tracks.round2.volume = .44;
  tracks.round3.volume = .44;
  tracks.deckChoice.volume = .48;
  tracks.hit.volume = .48;
  tracks.special.volume = .62;

  Object.values(tracks).forEach((track) => { track.preload = "auto"; });
  Object.values(anthemTracks).forEach((track) => { track.preload = "auto"; });
  Object.values(koTracks).forEach((track) => {
    track.preload = "auto";
    track.volume = .52;
  });

  const play = (track, restart = true) => {
    if (muted || !track) return;
    if (restart) track.currentTime = 0;
    track.play().catch(() => {});
  };

  const playEffect = (track, durationMs = 0, startSeconds = 0) => {
    if (muted || !track) return;
    const effect = track.cloneNode();
    effect.volume = track.volume;
    effect.preload = "auto";
    if (startSeconds) effect.currentTime = startSeconds;
    activeEffects.add(effect);
    const finish = () => {
      effect.pause();
      effect.currentTime = 0;
      activeEffects.delete(effect);
    };
    effect.addEventListener("ended", () => activeEffects.delete(effect), { once: true });
    effect.play().catch(() => activeEffects.delete(effect));
    if (durationMs) window.setTimeout(finish, durationMs);
  };

  const stop = (track) => {
    if (!track) return;
    track.pause();
    track.currentTime = 0;
  };

  const stopAnthem = () => {
    window.clearTimeout(anthemReplayTimer);
    anthemReplayTimer = null;
    stop(anthem);
  };

  const stopEffects = () => {
    activeEffects.forEach(stop);
    activeEffects.clear();
  };

  const playCoinClick = () => {
    if (muted) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.setValueAtTime(.028, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .11);
    gain.connect(context.destination);

    [988, 1319].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + index * .035);
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * .035);
      oscillator.stop(context.currentTime + .12);
    });

    window.setTimeout(() => context.close().catch(() => {}), 180);
  };

  return {
    startAmbient() {
      stopAnthem();
      play(tracks.ambient, false);
    },
    effect(type) {
      if (type === "click" || type === "select") {
        playCoinClick();
        return;
      }
      playEffect(tracks[type], type === "hit" ? 1500 : 0, type === "hit" ? 4.5 : 0);
    },
    announceRound(round) {
      playEffect(round === 1 ? tracks.round1 : round === 2 ? tracks.round2 : tracks.round3);
    },
    announceDeckChoice() {
      playEffect(tracks.deckChoice);
    },
    announceKO(deck) {
      const ko = koTracks[deck];
      if (muted || !ko) return;
      ko.currentTime = 0;
      ko.play().catch(() => {});
    },
    setScreenMix(screen) {
      tracks.ambient.volume = screen === "battle" ? .15 : .18;
    },
    playVictoryTheme(deck) {
      stop(tracks.ambient);
      stopEffects();
      stopAnthem();
      anthem = anthemTracks[deck];
      if (!anthem || muted) return;
      anthem.volume = .24;
      const segmentDuration = deck === "China" || deck === "Franca" ? 35000 : 0;
      const playAnthemSegment = () => {
        if (muted || !anthem) return;
        window.clearTimeout(anthemReplayTimer);
        anthem.currentTime = 0;
        anthem.play().catch(() => {});
        if (segmentDuration) anthemReplayTimer = window.setTimeout(playAnthemSegment, segmentDuration);
      };
      anthem.loop = !segmentDuration;
      anthem.onended = segmentDuration ? playAnthemSegment : null;
      playAnthemSegment();
    },
    toggleMute() {
      muted = !muted;
      if (muted) {
        stop(tracks.ambient);
        stopEffects();
        stopAnthem();
        Object.values(koTracks).forEach(stop);
      } else if (screens.final.classList.contains("is-active")) {
        const winner = state.score.p1 > state.score.p2 ? "p1" : state.score.p2 > state.score.p1 ? "p2" : "draw";
        if (winner !== "draw") this.playVictoryTheme(state.decks[winner]);
      } else {
        this.startAmbient();
      }
      return muted;
    }
  };
}
