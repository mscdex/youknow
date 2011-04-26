/* TODO: - Handle scenario where everyone always draws a card and never plays
 *         until all drawpile cards are gone, then a player plays a draw2 or
 *         wild4.
 *       - Implement computer player (difficulty levels?)
 */

var util = require('util'), EventEmitter = require('events').EventEmitter,
    common = require('./common');

var MAX_POINTS = 500,
    MAX_GAME_NAME_LEN = 20,
    MAX_PLAYER_NAME_LEN = 30,
    NUM_CARDS_START = 7,
    CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE,
    CARD_POINTS = common.CARD_POINTS;

function makeDeck() {
  var cards = new Array(108),
      c = 0;

  // Add colored cards
  for (var i=0; i<CARD_TYPE.WILD; ++i) {
    cards[c++] = new Array(i, 0);
    for (var val=1; val<10; ++val)
      cards[c++] = new Array(i, val);
    for (var val=1; val<10; ++val)
      cards[c++] = new Array(i, val);
    for (var j=0; j<2; ++j) {
      cards[c++] = new Array(i, CARD_VALUE.DRAW2);
      cards[c++] = new Array(i, CARD_VALUE.REVERSE);
      cards[c++] = new Array(i, CARD_VALUE.SKIP);
    }
  }

  // Wild cards
  for (var i=0; i<4; ++i) {
    cards[c] = new Array();
    cards[c++].push(CARD_TYPE.WILD);
    cards[c] = new Array();
    cards[c++].push(CARD_TYPE.WILD4);
  }

  shuffle(cards);
  return cards;
}

function shuffle(arr) {
  arr.sort(function() {return 0.5 - Math.random()});
}

function calcPoints(hand) {
  var points = 0;
  for (var i=0,len=hand.length; i<len; ++i) {
    if (hand[i].length === 1) { // Wild
      points += CARD_POINTS[hand[i][0]];
    } else if (hand[i][0] < CARD_TYPE.WILD && hand[i][1] <= 9) { // Colored 0-9
      points += hand[i][1];
    } else {// Colored action card
      points += CARD_POINTS[hand[i][1]];
    }
  }
  return points;
}
// =============================================================================
var Game = function(name) {
  this.name = name;
  this.players = new Array();
  this.owner = undefined;
  this.drawpile = undefined;
  this.discard = undefined;
  this.tsStart = undefined;
  this.tsCreate = Date.now();

  this.dir = 1;
  this.curPlayer = undefined;
  this.curPlayerDrew = false;
  this.curColor = undefined;

  this.state = 'pregame';
};
util.inherits(Game, EventEmitter);
Game.prototype.start = function(winner) {
  if (this.players.length < 2)
    return false;

  if (this.state === 'pregame') {
    this.tsStart = Date.now();
    this.drawpile = makeDeck();
    this.discard = new Array();
  }
  for (var i=0,len=this.players.length; i<len; ++i) {
    this.players[i].hand = new Array();
    for (var j=0; j<NUM_CARDS_START; ++j)
      this.players[i].hand.push(this.drawpile.shift());
  }

  // TODO: implement ability to have action cards turned up at beginning of game
  while (true) {
    this.discard.unshift(this.drawpile.shift());
    if (this.discard[0][0] < CARD_TYPE.WILD && this.discard[0][1] < 10) {
      this.curColor = this.discard[0][0];
      break;
    }
  }

  this.curPlayer = Math.floor(Math.random() * this.players.length);
  this.curPlayerDrew = false;

  if (this.state === 'pregame') {
    this.state = 'round';
    //this.emit('start', this.players[this.curPlayer], this.discard[0], false);
  }/* else if (this.state === 'round')
    this.emit('start', this.players[this.curPlayer], this.discard[0], true);*/
  this.emit('start', this.players[this.curPlayer], this.discard[0], winner);
  return true;
};
Game.prototype._advance = function(numMove) {
  this.curPlayer += numMove;
  if (this.curPlayer < 0)
    this.curPlayer = this.players.length + this.curPlayer;
  else if (this.curPlayer >= this.players.length)
    this.curPlayer = this.curPlayer - this.players.length;
};
Game.prototype.play = function(card, color) {
  var numDraw = 0,
      numMove = this.dir,
      curPlayer = this.players[this.curPlayer],
      wildColor,
      winner;

  if (card < 0 || card >= curPlayer.hand.length)
    return 'Invalid card';

  if (curPlayer.hand[card][0] >= CARD_TYPE.WILD) {
    if (typeof color !== 'number' || color < 0 || color > CARD_TYPE.YELLOW)
      return 'Invalid color for Wild card';
    this.curColor = wildColor = color;
    if (curPlayer.hand[card][0] === CARD_TYPE.WILD4)
      numDraw = 4;
  } else {
    if (this.discard[0].length > 1 && curPlayer.hand[card][1] === this.discard[0][1])
      this.curColor = curPlayer.hand[card][0];
    else if (curPlayer.hand[card][0] !== this.curColor)
      return 'You cannot play that card';

    if (curPlayer.hand[card][1] === CARD_VALUE.DRAW2)
      numDraw = 2;
    else if (curPlayer.hand[card][1] === CARD_VALUE.SKIP)
      numMove *= 2;
    else if (curPlayer.hand[card][1] === CARD_VALUE.REVERSE) {
      this.dir *= -1;
      numMove = this.dir;
      // If there are only two players, skips and reverse always return play to
      // the person playing the card. The math for skip already works without
      // any intervention, but the math for reverse does not, so we perform a
      // check here.
      if (this.players.length === 2)
        numMove *= 2;
    }
  }

  this.emit('play', curPlayer, curPlayer.hand[card], wildColor);

  this.discard.unshift(curPlayer.hand.splice(card, 1)[0]);
  if (curPlayer.hand.length === 0) {
    this.state = 'end';
    winner = curPlayer;
  } else if (curPlayer.hand.length === 1)
    this.emit('youknow', curPlayer);

  if (this.discard[0][0] === CARD_TYPE.WILD ||
      (typeof this.discard[0][1] !== 'undefined' &&
       this.discard[0][1] !== CARD_VALUE.DRAW2)) {
    this._advance(numMove);
    curPlayer = this.players[this.curPlayer];
  }

  if (numDraw) {
    this._advance(this.dir);
    for (var i=0; i<numDraw; ++i)
      this._giveCard(this.players[this.curPlayer]);
    this.emit('draw', this.players[this.curPlayer], numDraw);
    this._advance(this.dir);
    curPlayer = this.players[this.curPlayer];
  }

  if (this.state === 'end') {
    this.reset();
    if (this.discard.length) {
      this.discard.unshift(0, 0);
      this.drawpile.splice.apply(this.drawpile, this.discard);
    }
    for (var i=0,len=this.players.length; i<len; ++i) {
      if (winner === this.players[i])
        continue;
      winner.points += calcPoints(this.players[i].hand);
      this.players[i].hand.unshift(0, 0);
      this.drawpile.splice.apply(this.drawpile, this.players[i].hand);
      this.players[i].hand = undefined;
    }
    if (winner.points >= MAX_POINTS) {
      // Game over!
      this.emit('end', winner);
    } else {
      shuffle(this.drawpile);
      this.state = 'round';
      this.start(winner);
    }
  } else {
    this.curPlayerDrew = false;
    this.emit('turn', curPlayer);
  }

  return true;
};
Game.prototype.reset = function() {
  this.dir = -1;
  this.curPlayer = undefined;
  this.curColor = undefined;
};
Game.prototype.addPlayer = function(name, type, userData, id) {
  var ret;
  if (this.state !== 'pregame')
    ret = 'Players cannot be added once a game has started';
  else if (this.players.length === 10)
    ret = 'Cannot add more than 10 players per game';
  /*else if (this.players.indexOf(player) !== -1)
    ret = 'That player is already playing in this game';*/
  else if (name.length === 0)
    ret = 'Player name must contain at least one character';
  else {
    ret = new (type)(name, this);
    if (userData)
      ret.userData = userData;
    if (!id) {
      id = Math.floor(Math.random()*1e5).toString()
           + (new Date()).getTime().toString();
    }
    ret.id = ret.type + id;
    ret.tsJoin = Date.now();
    this.players.push(ret);
    if (!this.owner)
      this.owner = ret;
    else
      this.emit('playerjoin', ret);
  }
  return ret;
};
Game.prototype.delPlayer = function(player) {
  var ret = true, pos = this.players.indexOf(player);
  if (pos > -1) {
    // Return cards to the deck
    if (player.hand && player.hand.length) {
      player.hand.unshift(0, 0);
      this.drawpile.splice.apply(this.drawpile, player.hand);
    }

    var gonePlayer = this.players.splice(pos, 1)[0];
    if (gonePlayer === this.owner) {
      // Assign a new owner
      this.owner = this.players[0];
      this.emit('playerquit', gonePlayer, this.owner);
    } else
      this.emit('playerquit', gonePlayer);

    // Automatically reset/"end" the game if there is nobody else to play with
    if (this.players.length === 1 && this.state !== 'pregame') {
      // TODO: Assume last player left is winner since others forfeited?
      this.emit('end'); // no game winner
    } else if (this.state === 'round' && this.curPlayer === pos) {
      // If it was the turn of the player that left, move play to the next person
      this._advance(this.dir);
      this.emit('turn', this.players[this.curPlayer]);
    }
  } else
    ret = 'Cannot remove player. They are not in this game.';
  return ret;
};
Game.prototype._giveCard = function(player) {
  if (this.drawpile.length === 0) {
    this.drawpile = this.discard.splice(1, this.discard.length-1);
    shuffle(this.drawpile);
  }
  var card = this.drawpile.shift();
  player.hand.push(card);
  return card;
};
Game.prototype.draw = function() {
  if (this.state === 'round' && !this.curPlayerDrew) {
    var card = this._giveCard(this.players[this.curPlayer]);
    this.curPlayerDrew = true;
    this.emit('draw', this.players[this.curPlayer], 1);
    return card;
  }
  return false;
};
Game.prototype.pass = function() {
  if (this.state === 'round' && this.curPlayerDrew) {
    this.curPlayerDrew = false;
    this.emit('pass', this.players[this.curPlayer]);
    this._advance(this.dir);
    this.emit('turn', this.players[this.curPlayer]);
    return true;
  }
  return false;
};
// =============================================================================
var Manager = module.exports = function() {
  this.games = new Object();
};
Manager.prototype.addGame = function(gameName, ownerName, ownerType, userData, id) {
  // TODO: check gameName for unwanted characters
  var self = this, ret;
  if (typeof this.games[gameName.toLowerCase()] !== 'undefined')
    return 'A game with that name already exists';
  else if (typeof (ret = this.validateGameName(gameName)) === 'string')
    return ret;
  var game = this.games[gameName.toLowerCase()] = new Game(gameName);
  game.on('start', function(startPlayer, topCard, roundWinner) {
    var foundTypes = [];
    for (var i=0,players=game.players,len=players.length; i<len; ++i) {
      if (foundTypes.indexOf(players[i].constructor) === -1)
        foundTypes.push(players[i].constructor);
      players[i].handleEvent('start', startPlayer, topCard, roundWinner);
    }
    for (var i=0,len=foundTypes.length; i<len; ++i)
      foundTypes[i].prototype.handleEvent('start_after', startPlayer, topCard, roundWinner);
  });
  game.on('playerjoin', function(player) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      if (players[i] !== player)
        players[i].handleEvent('playerjoin', player);
  });
  game.on('playerquit', function(player, newOwner) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      players[i].handleEvent('playerquit', player, newOwner);
  });
  game.on('play', function(player, card, wildColor) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      if (players[i] !== player)
        players[i].handleEvent('play', player, card, wildColor);
  });
  game.on('turn', function(curPlayer) {
    var foundTypes = [];
    for (var i=0,players=game.players,len=players.length; i<len; ++i) {
      if (foundTypes.indexOf(players[i].constructor) === -1)
        foundTypes.push(players[i].constructor);
      players[i].handleEvent('turn', curPlayer);
    }
    for (var i=0,len=foundTypes.length; i<len; ++i)
      foundTypes[i].prototype.handleEvent('turn_after', curPlayer);
  });
  game.on('draw', function(player, numCards) {
    var foundTypes = [];
    for (var i=0,players=game.players,len=players.length; i<len; ++i) {
      if (foundTypes.indexOf(players[i].constructor) === -1)
        foundTypes.push(players[i].constructor);
      players[i].handleEvent('draw', player, numCards);
    }
    for (var i=0,len=foundTypes.length; i<len; ++i)
      foundTypes[i].prototype.handleEvent('draw_after', player, numCards);
  });
  game.on('pass', function(player) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      if (players[i] !== player)
        players[i].handleEvent('pass', player);
  });
  game.on('youknow', function(player) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      if (players[i] !== player)
        players[i].handleEvent('youknow', player);
  });
  game.on('end', function(gameWinner) {
    for (var i=0,players=game.players,len=players.length; i<len; ++i)
      players[i].handleEvent('end', gameWinner);
    delete self.games[gameName];
  });

  game.addPlayer(ownerName, ownerType, userData, id);

  return game;
};
Manager.prototype.startGame = function(name) {
  name = name.toLowerCase();
  if (typeof this.games[name] === 'undefined')
    return 'A game with that name doesn\'t exist';
  return this.games[name].start();
};
Manager.prototype.findGameNameByOwner = function(ownerName, type) {
  var ret = this.findPlayer(ownerName, type);
  if (typeof ret !== 'boolean') {
    if (ret.game.owner === ret)
      ret = ret.game.name;
    else
      ret = false;
  }
  return ret;
};
Manager.prototype.findGameNameByPlayer = function(playerName, type) {
  var ret = this.findPlayer(playerName, type);
  if (typeof ret !== 'boolean')
    ret = ret.game.name;
  return ret;
};
Manager.prototype.isGameOwner = function(gameName, playerName) {
  if (typeof playerName === 'undefined') {
    playerName = gameName;
    var ret = false, games = Object.keys(this.games);
    for (var i=0,players,len=games.length; i<len; ++i) {
      if (this.games[games[i]].owner.name === playerName) {
        ret = true;
        break;
      }
    }
    return ret;
  } else {
    gameName = gameName.toLowerCase();
    if (typeof this.games[gameName] === 'undefined')
      return 'A game with that name doesn\'t exist';
    return (this.games[gameName].owner.name === playerName);
  }
};
/*Manager.prototype.gamesList = function() {
  var ret = new Array();
  for (var i=0,games=Object.keys(this.games),len=games.length; i<len; ++i)
    ret.push([this.games[games[i]].name, this.games[games[i]].players.length]);
  return ret;
};*/
Manager.prototype.gamesStats = function() {
  var waiting = 0, playing = 0;
  for (var i=0,games=Object.keys(this.games),len=games.length; i<len; ++i) {
    if (this.games[games[i]].state === 'pregame')
      ++waiting;
    else if (this.games[games[i]].state === 'round')
      ++playing;
  }
  return new Array(waiting, playing);
};
Manager.prototype.addPlayer = function(gameName, playerName, type, userData, id) {
  var ret;
  gameName = gameName.toLowerCase();
  if (typeof this.games[gameName] === 'undefined')
    return 'A game with that name doesn\'t exist';
  else if (typeof (ret = this.validatePlayerName(playerName)) === 'string')
    return ret;

  return this.games[gameName].addPlayer(playerName, type, userData, id);
};
Manager.prototype.delPlayer = function(playerName, type) {
  var player = this.findPlayer(playerName, type), isLast = false, gameName, ret;
  if (!player)
    ret = 'You are not currently in a game';
  else {
    isLast = (player.game.players.length === 1);
    gameName = player.game.name;
    ret = player.game.delPlayer(player);
    if (isLast && typeof ret === 'boolean' && ret)
      delete this.games[gameName];
  }
  return ret;
};
Manager.prototype.findPlayer = function(playerName, type) {
  var ret = false, games = Object.keys(this.games), found = false,
      check = function(player) { return player.name === playerName; };
  if (typeof playerName === 'function')
    check = playerName;
  for (var i=0,players,len=games.length; i<len; ++i) {
    players = this.games[games[i]].players;
    for (var j=0,plen=players.length; j<plen; ++j) {
      if (players[j] instanceof type && check(players[j])) {
        ret = players[j];
        found = true;
        break;
      }
    }
    if (found)
      break;
  }
  return ret;
};
Manager.prototype.play = function(playerName, type, card, color) {
  var ret;
  if (typeof color === 'string') {
    var num = parseInt(color);
    if (isNaN(num)) {
      if (color === 'blue')
        color = CARD_TYPE.BLUE;
      else if (color === 'green')
        color = CARD_TYPE.GREEN;
      else if (color === 'red')
        color = CARD_TYPE.RED;
      else if (color === 'yellow')
        color = CARD_TYPE.YELLOW;
      else
        color = -1;
    } else
      color = num;
  } else
    color = undefined;
  ret = this.findPlayer(playerName, type);
  if (typeof ret !== 'boolean') {
    if (ret.game.curPlayer === ret.game.players.indexOf(ret))
      ret = ret.game.play(card, color);
    else
      ret = 'It is not your turn yet';
  } else
    ret = 'You are not in a game';
  return ret;
};
Manager.prototype.getPlayerNames = function(gameName, type, except) {
  gameName = gameName.toLowerCase();
  if (typeof this.games[gameName] === 'undefined')
    return 'A game with that name doesn\'t exist';
  var players = this.games[gameName].players, ret = new Array(),
      check = function(player) { return player !== except && player.name !== except; };
  if (typeof except === 'function')
    check = except;
  for (var i=0,len=players.length; i<len; ++i)
    if ((!type || players[i] instanceof type) && (!except || check(players[i])))
      ret.push(players[i].name);
  return ret;
};
Manager.prototype.getPlayers = function(gameName, type, except) {
  gameName = gameName.toLowerCase();
  if (typeof this.games[gameName] === 'undefined')
    return 'A game with that name doesn\'t exist';
  var players = this.games[gameName].players, ret = new Array(),
      check = function(player) { return player !== except && player.name !== except; };
  if (typeof except === 'function')
    check = except;
  for (var i=0,len=players.length; i<len; ++i)
    if ((!type || players[i] instanceof type) && (!except || check(players[i])))
      ret.push(players[i]);
  return ret;
};
Manager.prototype.draw = function(playerName, type) {
  var ret = 'You are not in a game', p, game;
  p = this.findPlayer(playerName, type);
  if (typeof p !== 'boolean') {
    game = p.game;
    if (game.players[game.curPlayer] !== p)
      ret = 'It is not your turn yet';
    else if (game.curPlayerDrew)
      ret = 'You can only draw once, you must now play or pass';
    else
      ret = game.draw();
  } else
    ret = 'You are not in a game';
  return ret;
};
Manager.prototype.pass = function(playerName, type) {
  var ret = 'You are not in a game', p, game;
  p = this.findPlayer(playerName, type);
  if (typeof p !== 'boolean') {
    game = p.game;
    if (game.players[game.curPlayer] !== p)
      ret = 'It is not your turn yet';
    else if (!game.curPlayerDrew)
      ret = 'You cannot pass unless you have drawn a card';
    else
      ret = game.pass();
  } else
    ret = 'You are not in a game';
  return ret;
};
Manager.prototype.validatePlayerName = function(name) {
  // TODO: check name for unwanted characters
  if (name.length > MAX_PLAYER_NAME_LEN)
    return 'Player names must be <= ' + MAX_PLAYER_NAME_LEN + ' characters';
  else
    return true;
};
Manager.prototype.validateGameName = function(name) {
  // TODO: check gameName for unwanted characters
  if (name.length > MAX_GAME_NAME_LEN)
    return 'Game names must be <= ' + MAX_GAME_NAME_LEN + ' characters';
  else
    return true;
};