// IRC interface for youknow

/* TODO: - Automatically remove players who either leave the main channel or
 *         disconnect from IRC (in order to detect 'dead' players)
 *       - Let winner or all players know how many points winner got at end of
 *         each round
 */

var interfaceName = 'IRC';

var fs = require('fs'), util = require('util'),
    IrcClient = require('./irc').Client,
    common = require('../../common');

var LOG = common.LOG, CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE;

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
// =============================================================================
var GameInterface = module.exports = function(manager, fnLog) {
  this.name = interfaceName;
  this.manager = manager;
  this.log = (typeof fnLog === 'function' ? fnLog : function() {});
  this.conn = undefined;
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
      conn = this.conn = new IrcClient(this.config.server, this.config.nick, this.config),
      manager = this.manager;
  conn.on('ready', function() {
    self.log('Connected to IRC server', LOG.INFO);
  });
  conn.on('pm', function(from, msg) {
    if (msg.length) {
      var player, ret;
      msg = msg.substring(1).toLowerCase();
      if (msg === 'help') {
        // List commands
      } else if (msg === 'games') {
        var stats = manager.gamesStats();
        conn.say(from, stats[0] + ' game(s) waiting for players and ' + stats[1] + ' game(s) in progress');
      } else if (msg === 'points') {
        if (ret = manager.findPlayer(from, interfaceName))
          conn.say(from, 'You currently have ' + ret.points + ' points');
        else
          conn.say(from, 'You are not currently in a game');
      } else if (msg === 'hand') {
        if (ret = manager.findPlayer(from, interfaceName)) {
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
        ret = manager.findGameNameByOwner(from, interfaceName);
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
        ret = manager.delPlayer(from, interfaceName);
        if (typeof ret === 'string')
          conn.say(from, ret);
        else
          conn.say(from, 'You have left the game');
      } else if (msg === 'draw') {
        // Draw a card from the draw pile
        // Note: this can only be allowed at most once per turn
        ret = manager.draw(from, interfaceName);
        if (typeof ret === 'string')
          conn.say(from, ret);
        else if (ret)
          conn.say(from, 'You drew a:' + formatCard(ret));
      } else if (msg === 'pass') {
        // Passes the turn to the next player
        // Note: this can only be allowed once the user has drawn a card from
        //       the draw pile
        ret = manager.pass(from, interfaceName);
        if (typeof ret === 'string')
          conn.say(from, ret);
      } else {
        var argpos = msg.indexOf(' '), hasArgs = (argpos > -1),
            cmd = (hasArgs ? msg.substring(0, argpos) : msg),
            args = (hasArgs ? msg.substring(argpos+1) : undefined);
        if (cmd === 'create') {
          if (player = manager.findPlayer(from, interfaceName))
            conn.say(from, 'You must leave the game you are currently in first');
          else {
            if (!args) {
              // Create a random game name
              args = 'youknow' + Date.now();
            }
            ret = manager.addGame(args, from);
            if (typeof ret === 'string')
              conn.say(from, ret);
            else {
              ret.on('start', function(startPlayer, topCard, roundWinner) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], (roundWinner ? roundWinner.name +
                                        ' won this round. New round' : 'Game') +
                           ' started. ' + startPlayer.name +
                           ' goes first. Top card:' + formatCard(topCard));
                conn.say(startPlayer.name, 'Your hand: ' + formatHand(startPlayer.hand));
              });
              ret.on('playerjoin', function(player) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], 'Player joined the game: ' + player.name);
              });
              ret.on('playerquit', function(player, newOwner) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], (newOwner ? 'Game Owner' : 'Player') +
                           ' left the game: ' + player.name +
                           (newOwner ? ' (new owner is: ' + newOwner.name + ')' : ''));
              });
              ret.on('play', function(player, card, wildColor) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], player.name + ' has played a:' +
                           formatCard(card) +
                           (typeof wildColor !== 'undefined' ? ' - ' + toColorStr(wildColor)
                                                               : ''));
              });
              ret.on('turn', function(curPlayer) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], 'It is now ' + curPlayer.name +
                           '\'s turn.');
                conn.say(curPlayer.name, 'Your hand: ' + formatHand(curPlayer.hand));
              });
              ret.on('draw', function(player, numCards) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], player.name + ' drew ' + numCards +
                           ' card(s).');
              });
              ret.on('pass', function(player) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], player.name + ' couldn\'t play and decided to pass.');
              });
              ret.on('youknow', function(player) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], player.name + ' has one card left!');
              });
              ret.on('end', function(gameWinner) {
                for (var i=0,players=manager.getPlayerNames(args, interfaceName),len=players.length; i<len; i++)
                  conn.say(players[i], 'Game ended. ' +
                           (gameWinner ? 'Winner: ' + gameWinner.name 
                                         : 'No winner.'));
              });
              conn.say(from, 'You have created and joined a new game session: ' + args);
            }
          }
        } else if (hasArgs) {
          if (cmd === 'join') {
            ret = manager.addPlayer(args, from);
            if (typeof ret === 'string')
              conn.say(from, ret);
            else {
              ret.type = interfaceName;
              conn.say(from, 'Joined game with: ' + manager.getPlayerNames(args, interfaceName, from).join(', '));
            }
          } else if (cmd === 'play') {
            args = args.split(' ');
            var card = parseInt(args[0]), wildColor,
                msg = 'Invalid card';
            if (!isNaN(card)) {
              if (args.length > 1)
                wildColor = args[1];
              ret = manager.play(from, interfaceName, card-1, wildColor);
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