var interfaceName = 'Web';

var fs = require('fs'),
    grappler = require('./grappler/lib/grappler'),
    grappler.common = require('./grappler/lib/common'),
    common = require('../../common');

var localFiles = {}, config, port,
    LOG = common.LOG, CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE;

var GameInterface = module.exports = function(manager, fnLog) {
  this.name = interfaceName;
  this.manager = manager;
  this.log = (typeof fnLog === 'function' ? fnLog : function() {});
  this.server = undefined;

  // Load assets
  try {
    localFiles['index.htm'] = fs.readFileSync(__dirname + '/public/index.htm');
    localFiles['flashws.js'] = fs.readFileSync(__dirname + '/public/flashws.js');
    localFiles['transport.js'] = fs.readFileSync(__dirname + '/public/transport.js');
    localFiles['WebSocketMain.swf'] = fs.readFileSync(__dirname + '/public/WebSocketMain.swf');
    config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

    // Game card art
    localFiles['images/back.png'] = fs.readFileSync(__dirname + '/public/images/back.png');
    localFiles['images/wild.png'] = fs.readFileSync(__dirname + '/public/images/wild.png');
    localFiles['images/wild_draw4.png'] = fs.readFileSync(__dirname + '/public/images/wild_draw4.png');
    ['red', 'blue', 'yellow', 'green'].forEach(function(color) {
      for (var i=0; i<10; ++i)
        localFiles['images/' + color + '_' + i + '.png'] = fs.readFileSync(__dirname + '/public/images/' + color + '_' + i + '.png');
      localFiles['images/' + color + '_draw2.png'] = fs.readFileSync(__dirname + '/public/images/' + color + '_draw2.png');
      localFiles['images/' + color + '_skip.png'] = fs.readFileSync(__dirname + '/public/images/' + color + '_skip.png');
      localFiles['images/' + color + '_reverse.png'] = fs.readFileSync(__dirname + '/public/images/' + color + '_reverse.png');
    });
  } catch (err) {
    throw new Error('An error occurred while reading assets: ' + err);
  }

  if (!this.config.port)
    throw new Error('You must specify a port for the Grappler server');
};

GameInterface.prototype.init = function() {
  var self = this, manager = this.manager;
  // Create a new instance of a grappler server
  this.server = new grappler.Server({ logger: self.log }, function(req, res) {
    // We don't care to filter WebSocket connections (e.g. check validity of cookies, etc)
    if (req.headers.upgrade)
      return;

    var file = req.url.substr(1),
        ext = file.substr(file.lastIndexOf('.')+1),
        type = 'application/octet-stream';
    if (localFiles[file]) {
      if (ext === 'js')
        type = 'text/javascript';
      else if (ext === 'swf')
        type = 'application/x-shockwave-flash';
      else if (ext === 'htm')
        type = 'text/html';
      else if (ext === 'png')
        type = 'image/png';

      res.writeHead(200, {
        'Connection': 'close',
        'Content-Type': type,
        'Content-Length': localFiles[file].length
      });
      res.end(localFiles[file]);
    } else if (file.length) {
      res.writeHead(404, { 'Connection': 'close' });
      res.end();
    }
  });

  // Listen for an incoming connection
  this.server.on('connection', function(client) {
    var type;
    if (client.state & grappler.common.STATE.PROTO_WEBSOCKET)
      type = "WebSocket";
    else if (client.state & grappler.common.STATE.PROTO_HTTP)
      type = "HTTP";
    else
      type = "Unknown";

    self.log(type + ' client connected from ' + client.remoteAddress, LOG.DEBUG);

    client.on('message', function(msg) {
      var text = '';
      msg.on('data', function(data) {
        text += data;
      });
      msg.on('end', function() {
        var cmd, args = '', argpos = text.indexOf(' '), ret, res = new Object();
        if (argpos > -1) {
          cmd = text.substring(0, argpos);
          args = text.substring(argpos+1);
        } else
          cmd = text;

        if (cmd === 'register' && args.length) {
          // Assign user name
          if (!client.nick) {
            ret = manager.validatePlayerName(args);
            if (typeof ret === 'string')
              res.error = ret;
            else if (typeof ret === 'boolean' && ret)
              client.nick = args;
          } else
            res.error = 'You have already selected a user name: ' + client.nick;
        } else if (client.nick) {
          if (cmd === 'start') {
            // Start owned game
            ret = manager.findGameNameByOwner(function(p) {
                    return p.userData === client;
                  }, interfaceName);
            if (!ret)
              res.error = 'You cannot start a game that you aren\'t the owner of';
            else {
              ret = manager.startGame(ret);
              if (typeof ret === 'string')
                res.error = ret;
              else if (!ret)
                res.error = 'You need at least 2 people to start the game';
            }
          } else if (cmd === 'leave') {
            // Leave current game
            ret = manager.delPlayer(function(p) {
                    return p.userData === client;
                  }, interfaceName);
            if (typeof ret === 'string')
              res.error = ret;
            else
              ret = true;
          } else if (cmd === 'draw') {
            // Draw a card from draw pile
            ret = manager.draw(function(p) { return p.userData === client; },
                               interfaceName);
            if (typeof ret === 'string')
              res.error = ret;
            else if (!ret)
              res.error = 'You cannot draw while not in a game';
          } else if (cmd === 'pass') {
            // Pass after drawing a card
            ret = manager.pass(function(p) { return p.userData === client; },
                               interfaceName);
            if (typeof ret === 'string')
              res.error = ret;
            else if (!ret)
              res.error = 'You cannot pass while not in a game';
          } else if (cmd === 'create') {
            if (!args.length) {
              // Create a random game name
              args = 'youknow' + Date.now();
            }
            ret = manager.addGame(args, from);
            if (typeof ret === 'string')
              res.error = ret;
            else {
              ret.on('start', function(startPlayer, topCard, roundWinner) {
                var msg = new Object();
                msg.event = 'start';
                if (roundWinner)
                  msg.roundWinner = { name: roundWinner.name, type: roundWinner.type };
                msg.startPlayer = { name: startPlayer.name, type: startPlayer.type };
                msg.topCard = topCard;
                for (var i=0,players=manager.getPlayers(args, interfaceName),len=players.length; i<len; i++) {
                  msg.hand = players[i].hand;
                  players[i].userData.write(JSON.stringify(msg));
                }
                if (curPlayer.type === interfaceName) {
                  // Just a helpful notification in case multiple users have the same name
                  msg = new Object();
                  msg.go = true;
                  msg = JSON.stringify(msg);
                  startPlayer.userData.write(msg);
                }
              });
              ret.on('playerjoin', function(player) {
                var msg = new Object();
                msg.event = 'playerjoin';
                msg.player = { name: player.name, type: player.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName, player),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret.on('playerquit', function(player, newOwner) {
                var msg = new Object();
                msg.event = 'playerquit';
                msg.player = { name: player.name, type: player.type };
                if (newOwner)
                  msg.newOwner = { name: newOwner.name, type: newOwner.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret.on('play', function(player, card, wildColor) {
                var msg = new Object();
                msg.event = 'play';
                msg.player = { name: player.name, type: player.type };
                msg.card = card;
                if (typeof wildColor !== 'undefined')
                  msg.wildColor = wildColor;
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName, player),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret.on('turn', function(curPlayer) {
                var msg = new Object();
                msg.event = 'turn';
                msg.player = { name: player.name, type: player.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
                if (curPlayer.type === interfaceName) {
                  // Just a helpful notification in case multiple users have the same name
                  msg = new Object();
                  msg.go = true;
                  msg = JSON.stringify(msg);
                  curPlayer.userData.write(msg);
                }
              });
              ret.on('draw', function(player, numCards) {
                var msg = new Object();
                msg.event = 'draw';
                msg.player = { name: player.name, type: player.type };
                msg.numCards = numCards;
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName, player),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
                if (player.type === interfaceName) {
                  // Let the user know what cards they got
                  msg = new Object();
                  // Drawn cards are always added to the end
                  msg.drawnCards = player.hand.slice(-1 * numCards);
                  msg = JSON.stringify(msg);
                  player.userData.write(msg);
                }
              });
              ret.on('pass', function(player) {
                var msg = new Object();
                msg.event = 'pass';
                msg.player = { name: player.name, type: player.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName, player),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret.on('youknow', function(player) {
                var msg = new Object();
                msg.event = 'youknow';
                msg.player = { name: player.name, type: player.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName, player),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret.on('end', function(gameWinner) {
                var msg = new Object();
                msg.event = 'end';
                msg.player = { name: gameWinner.name, type: gameWinner.type };
                msg = JSON.stringify(msg);
                for (var i=0,players=manager.getPlayers(args, interfaceName),len=players.length; i<len; i++)
                  players[i].userData.write(msg);
              });
              ret = args;
            }
          } else if (cmd === 'join' && args.length) {
            ret = manager.addPlayer(args, client.nick);
            if (typeof ret === 'string')
              res.error = ret;
            else {
              ret.type = interfaceName;
              ret.userData = client;
              ret = 'Joined game with: ' +
                    manager.getPlayerNames(args, interfaceName, function(p) {
                      return p.userData !== client;
                    }).join(', ');
            }
          } else if (cmd === 'play' && args.length) {
            args = args.split(' ');
            var card = parseInt(args[0]), wildColor;
            if (!isNaN(card)) {
              if (args.length > 1)
                wildColor = args[1];
              ret = manager.play(function(p) {
                      return p.userData === client;
                    }, interfaceName, card-1, wildColor);
              if (typeof ret === 'string')
                res.error = ret;
              else
                return;
            } else
              res.error = 'Invalid card';
          } else {
            // Invalid command
            res.error = 'Invalid command';
          }
        } else
          res.error = 'You must register a user name first';

        if (typeof res.error === 'undefined')
          res.ret = ret;
        client.write(JSON.stringify(res));
      });
    });
    client.on('end', function() {
      self.log(type + ' client disconnected from ' + client.remoteAddress, LOG.DEBUG);
      manager.delPlayer(function(p) { return p.userData === client; }, interfaceName);
    });
  });

  this.server.listen(this.config.port);
  this.log('Grappler server listening on port ' + this.config.port, LOG.INFO);
};