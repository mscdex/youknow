// IRC interface for youknow

/* TODO: - Automatically remove players who either leave the main channel or
 *         disconnect from IRC (in order to detect 'dead' players)?
 *       - Let winner or all players know how many points winner got at end of
 *         each round
 */

var interfaceName = 'IRC';

var fs = require('fs'), util = require('util'),
    common = require('../../common'),
    IrcClient = require('./irc').Client,
    conn;

var LOG = common.LOG, CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE;

var IRCPlayer = function(name, game) {
  common.Player.call(this, name, game);
  this.type = interfaceName;
};
util.inherits(IRCPlayer, common.Player);
IRCPlayer.prototype.handleEvent = function(event, arg1, arg2, arg3) {
  var msg = '';
  if (event === 'start') {
    //ret.on('start', function(startPlayer, topCard, roundWinner) {
    if (arg3)
      msg += arg3.name + ' won this round. New round';
    else
      msg += 'Game';
    msg += ' started. ' + arg1.name + ' goes first. Top card:'
        + formatCard(arg2);
  } else if (event === 'start_after') {
    //ret.on('start_after', function(startPlayer, topCard, roundWinner) {
    if (arg1 instanceof IRCPlayer)
      conn.say(arg1.name, 'Your hand: ' + formatHand(arg1.hand));
    return;
  } else if (event === 'playerjoin') {
    //ret.on('playerjoin', function(player) {
    msg += 'Player joined the game: ' + arg1.name;
  } else if (event === 'playerquit') {
    //ret.on('playerquit', function(player, newOwner) {
    if (arg2)
      msg += 'Game owner';
    else
      msg += 'Player';
    msg += ' left the game: ' + arg1.name;
    if (arg2)
      msg += ' (new owner is: ' + arg2.name + ')';
  } else if (event === 'play') {
    //ret.on('play', function(player, card, wildColor) {
    msg += arg1.name + ' has played a:' + formatCard(card);
    if (typeof wildColor !== 'undefined')
      msg += ' - ' + toColorStr(wildColor);
  } else if (event === 'turn') {
    //ret.on('turn', function(curPlayer) {
    msg += 'It is now ' + arg1.name + '\'s turn.'
  } else if (event === 'turn_after') {
    //ret.on('turn_after', function(curPlayer) {
    if (arg1 instanceof IRCPlayer) {
      conn.say(arg1.name, 'Your hand: ' + formatHand(arg1.hand));
    }
    return;
  } else if (event === 'draw') {
    //ret.on('draw', function(player, numCards) {
    msg += arg1.name + ' drew ' + arg2 + ' card(s).';
  } else if (event === 'pass') {
    //ret.on('pass', function(player) {
    msg += arg1.name + ' couldn\'t play and decided to pass.';
  } else if (event === 'youknow') {
    //ret.on('youknow', function(player) {
    msg += arg1.name + ' has one card left!';
  } else if (event === 'end') {
    //ret.on('end', function(gameWinner) {
    msg += 'Game ended. ';
    if (arg1)
      msg += 'Winner: ' + arg1.name;
    else
      msg += 'No winner';
  } else
    return;

  conn.say(this.name, msg);
};
// =============================================================================
var GameInterface = module.exports = function(manager, fnLog) {
  this.name = interfaceName;
  this.manager = manager;
  this.log = (typeof fnLog === 'function' ? fnLog : function() {});
  this.config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
  if (!this.config.server)
    throw new Error('You must specify an IRC server');
  if (!this.config.nick)
    throw new Error('You must specify an IRC nick');

  this.config.server += '';
  this.config.nick += '';
};
GameInterface.prototype.init = function() {
  var self = this,
      manager = this.manager;

  conn = new IrcClient(this.config.server, this.config.nick, this.config)
  conn.on('ready', function() {
    self.log('Connected to IRC server', LOG.INFO);
  });
  conn.on('error', function(err) {
    if (err.rawCommand === '401') {
      // Player disconnected?
      manager.delPlayer(err.args[1], IRCPlayer);
    } else
      self.log('IRC Error: ' + util.inspect(err));
  });
  conn.on('pm', function(from, msg) {
    if (msg.length) {
      var player, ret;
      msg = msg.substring(1).toLowerCase();
      if (msg === 'help') {
        // List commands
      } else if (msg === 'games') {
        var stats = manager.gamesStats();
        conn.say(from, stats[0] + ' game(s) waiting for players and ' + stats[1]
                       + ' game(s) in progress');
      } else if (msg === 'points') {
        if (ret = manager.findPlayer(from, IRCPlayer))
          conn.say(from, 'You currently have ' + ret.points + ' points');
        else
          conn.say(from, 'You are not currently in a game');
      } else if (msg === 'hand') {
        if (ret = manager.findPlayer(from, IRCPlayer)) {
          if (ret.hand)
            conn.say(from, 'Your hand: ' + formatHand(ret.hand));
          else
            conn.say(from, 'The game hasn\'t started yet');
        } else
          conn.say(from, 'You are not currently in a game');
      } else if (msg === 'autojoin') {
        // Join the first game that has an empty spot
      } else if (msg === 'start') {
        // Start the waiting game
        ret = manager.findGameNameByOwner(from, IRCPlayer);
        if (!ret)
          conn.say(from, 'You cannot start a game that you aren\'t the owner of');
        else {
          ret = manager.startGame(ret);
          if (typeof ret === 'string')
            conn.say(from, ret);
          else if (!ret)
            conn.say(from, 'You need at least 2 people to start the game');
        }
      } else if (msg === 'leave' || msg === 'quit' || msg === 'exit') {
        ret = manager.delPlayer(from, IRCPlayer);
        if (typeof ret === 'string')
          conn.say(from, ret);
        else
          conn.say(from, 'You have left the game');
      } else if (msg === 'draw') {
        // Draw a card from the draw pile
        // Note: this can only be allowed at most once per turn
        ret = manager.draw(from, IRCPlayer);
        if (typeof ret === 'string')
          conn.say(from, ret);
        else if (ret)
          conn.say(from, 'You drew a:' + formatCard(ret));
      } else if (msg === 'pass') {
        // Passes the turn to the next player
        // Note: this can only be allowed once the user has drawn a card from
        //       the draw pile
        ret = manager.pass(from, IRCPlayer);
        if (typeof ret === 'string')
          conn.say(from, ret);
      } else {
        var argpos = msg.indexOf(' '), hasArgs = (argpos > -1),
            cmd = (hasArgs ? msg.substring(0, argpos) : msg),
            args = (hasArgs ? msg.substring(argpos+1) : undefined);
        if (cmd === 'create') {
          if (player = manager.findPlayer(from, IRCPlayer))
            conn.say(from, 'You must leave the game you are currently in first');
          else {
            if (!args) {
              // Create a random game name
              args = 'youknow' + Date.now();
            }
            ret = manager.addGame(args, from, IRCPlayer);
            if (typeof ret === 'string')
              conn.say(from, ret);
            else
              conn.say(from, 'You have created and joined a new game session: '
                             + args);
          }
        } else if (hasArgs) {
          if (cmd === 'join') {
            ret = manager.addPlayer(args, from, IRCPlayer);
            if (typeof ret === 'string')
              conn.say(from, ret);
            else {
              var names = manager.getPlayerNames(args, undefined, from).join(', ');
              ret.userData = conn;
              conn.say(from, 'Joined game with: ' + names);
            }
          } else if (cmd === 'play') {
            args = args.split(' ');
            var card = parseInt(args[0]), wildColor,
                msg = 'Invalid card';
            if (!isNaN(card)) {
              if (args.length > 1)
                wildColor = args[1];
              ret = manager.play(from, IRCPlayer, card-1, wildColor);
              if (typeof ret === 'string')
                msg = ret;
              else
                return;
            }
            conn.say(from, msg);
          }
        }
      }
    }
  });
  conn.on('error', function(msg) {
    self.log('Connection error: ' + util.inspect(msg, false, 4), LOG.ERROR);
  });
};
// =============================================================================
function formatCard(card) {
  var ret = '';
  if (card[0] === CARD_TYPE.BLUE)
    ret += String.fromCharCode(2) + String.fromCharCode(3) + '12 ';
  else if (card[0] === CARD_TYPE.GREEN)
    ret += String.fromCharCode(2) + String.fromCharCode(3) + '3 ';
  else if (card[0] === CARD_TYPE.RED)
    ret += String.fromCharCode(2) + String.fromCharCode(3) + '4 ';
  else if (card[0] === CARD_TYPE.YELLOW)
    ret += String.fromCharCode(2) + String.fromCharCode(3) + '8 ';
  else
    ret += String.fromCharCode(2) + ' ';

  if (card.length > 1) {
    if (card[1] < 10)
      ret += card[1];
    else if (card[1] === CARD_VALUE.DRAW2)
      ret += 'D2';
    else if (card[1] === CARD_VALUE.REVERSE)
      ret += 'R';
    else if (card[1] === CARD_VALUE.SKIP)
      ret += 'S';
  } else if (card[0] === CARD_TYPE.WILD)
    ret += 'W';
  else if (card[0] === CARD_TYPE.WILD4)
    ret += 'W4';

  return ret;
}
function toColorStr(color) {
  var ret = 'Unknown';
  if (color === CARD_TYPE.BLUE)
    ret = String.fromCharCode(2) + String.fromCharCode(3) + 'Blue';
  else if (color === CARD_TYPE.GREEN)
    ret = String.fromCharCode(2) + String.fromCharCode(3) + 'Green';
  else if (color === CARD_TYPE.RED)
    ret = String.fromCharCode(2) + String.fromCharCode(3) + 'Red';
  else if (color === CARD_TYPE.YELLOW)
    ret = String.fromCharCode(2) + String.fromCharCode(3) + 'Yellow';
  return ret;
}
function formatHand(cards) {
  var ret = '';
  for (var i=0,len=cards.length; i<len; i++) {
    ret += (i+1) + ':' + formatCard(cards[i]);
    if (i+1 < len)
      ret += String.fromCharCode(15) + '|';
  }
  return ret;
}